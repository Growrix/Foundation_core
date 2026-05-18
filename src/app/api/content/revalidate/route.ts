import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getRuntimeEnv } from "@/server/config/env";
import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import {
  getSupportedRevalidationEvents,
  getRevalidationPaths,
  isSupportedRevalidationEvent,
  parseRevalidationPayload,
  validateRevalidationSignature,
} from "@/server/modules/content/revalidation.service";
import { notifyLark } from "@/server/modules/ops/lark-notifier.service";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

export async function POST(request: Request) {
  const requestId = createRequestId();
  const env = getRuntimeEnv();

  if (!env.SANITY_WEBHOOK_SECRET) {
    logWarn("revalidation.not_configured", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      reason: "SANITY_WEBHOOK_SECRET missing",
    });

    return NextResponse.json(
      failure(requestId, "REVALIDATION_NOT_CONFIGURED", "SANITY_WEBHOOK_SECRET is not configured."),
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get("x-foundation-signature") ?? request.headers.get("x-sanity-signature");

  if (!validateRevalidationSignature(rawBody, signatureHeader, env.SANITY_WEBHOOK_SECRET)) {
    await notifyLark("content.revalidate_signature_failed", {
      requestId,
      hasSignature: Boolean(signatureHeader),
      source: "sanity",
    });

    logWarn("revalidation.signature_invalid", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      hasSignature: Boolean(signatureHeader),
    });

    await captureBackendError("revalidation.signature_invalid", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      hasSignature: Boolean(signatureHeader),
    });

    return NextResponse.json(
      failure(requestId, "REVALIDATION_SIGNATURE_INVALID", "Webhook signature is invalid."),
      { status: 400 },
    );
  }

  try {
    const payload = parseRevalidationPayload(rawBody);

    if (!isSupportedRevalidationEvent(payload.event)) {
      logInfo("revalidation.event_ignored", {
        requestId,
        route: "/api/content/revalidate",
      }, {
        event: payload.event,
      });

      return NextResponse.json(
        success(requestId, {
          accepted: false,
          ignored: true,
          reason: `Unsupported event '${payload.event}'. Supported events: ${getSupportedRevalidationEvents().join(", ")}.`,
        }),
        { status: 202 },
      );
    }

    const revalidatedPaths = getRevalidationPaths(payload);

    logInfo("revalidation.event_accepted", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      event: payload.event,
      pathCount: revalidatedPaths.length,
    });

    await trackBackendEvent("content.revalidation.accepted", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      event: payload.event,
      revalidatedPaths,
    });

    for (const path of revalidatedPaths) {
      revalidatePath(path);
    }

    return NextResponse.json(
      success(requestId, {
        accepted: true,
        event: payload.event,
        revalidatedPaths,
      }),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await notifyLark("content.revalidate_payload_invalid", {
        requestId,
        source: "sanity",
      });

      logWarn("revalidation.payload_invalid", {
        requestId,
        route: "/api/content/revalidate",
      }, {
        errorType: error.constructor.name,
      });

      return NextResponse.json(
        failure(requestId, "REVALIDATION_PAYLOAD_INVALID", "Webhook payload is invalid."),
        { status: 400 },
      );
    }

    await notifyLark("content.revalidate_failed", {
      requestId,
      source: "sanity",
      message: error instanceof Error ? error.message : String(error),
    });

    logError("revalidation.failed", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("revalidation.failed", {
      requestId,
      route: "/api/content/revalidate",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "REVALIDATION_FAILED", "Unable to process revalidation event.", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 },
    );
  }
}
