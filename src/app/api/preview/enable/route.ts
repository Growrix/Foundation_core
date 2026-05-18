import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { canEnablePreview } from "@/server/modules/preview/preview.service";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

const previewSchema = z.object({
  token: z.string().optional(),
  redirectTo: z.string().default("/preview"),
});

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const payload = previewSchema.parse(await request.json());
    const result = canEnablePreview(payload.token ?? null);

    if (!result.allowed) {
      logWarn("preview.enable.denied", {
        requestId,
        route: "/api/preview/enable",
      }, {
        code: result.code,
      });

      return NextResponse.json(
        failure(requestId, result.code, result.message),
        { status: 401 },
      );
    }

    const draft = await draftMode();
    draft.enable();

    logInfo("preview.enable.allowed", {
      requestId,
      route: "/api/preview/enable",
    }, {
      redirectTo: payload.redirectTo,
    });

    await trackBackendEvent("preview.enable.allowed", {
      requestId,
      route: "/api/preview/enable",
    }, {
      redirectTo: payload.redirectTo,
    });

    return NextResponse.json(success(requestId, { enabled: true, redirectTo: payload.redirectTo }));
  } catch (error) {
    if (error instanceof ZodError) {
      logWarn("preview.enable.validation_failed", {
        requestId,
        route: "/api/preview/enable",
      }, {
        issueCount: error.issues.length,
      });

      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Preview payload is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    logError("preview.enable.unexpected_error", {
      requestId,
      route: "/api/preview/enable",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("preview.enable.unexpected_error", {
      requestId,
      route: "/api/preview/enable",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "UNEXPECTED_ERROR", "Unable to enable preview."),
      { status: 500 },
    );
  }
}