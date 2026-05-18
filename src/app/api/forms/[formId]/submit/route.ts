import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import {
  getStoredIdempotencyResponse,
  storeIdempotencyResponse,
} from "@/server/modules/forms/idempotency.service";
import { parseSubmissionPayload, processLeadSubmission } from "@/server/modules/forms/form.service";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const firstAddress = forwardedFor.split(",")[0]?.trim();
    if (firstAddress) {
      return firstAddress;
    }
  }

  return request.headers.get("x-real-ip");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ formId: string }> },
) {
  const requestId = createRequestId();
  const { formId } = await context.params;
  const idempotencyKey = request.headers.get("idempotency-key");

  const replay = await getStoredIdempotencyResponse(formId, idempotencyKey);

  if (replay) {
    logInfo("forms.idempotency.replay", {
      requestId,
      route: "/api/forms/[formId]/submit",
    }, {
      formId,
      idempotencyMode: replay.mode,
    });

    return NextResponse.json(replay.responseBody, {
      status: replay.status,
      headers: {
        "Idempotent-Replay": "true",
      },
    });
  }

  try {
    const payload = parseSubmissionPayload(await request.json());
    const result = await processLeadSubmission(formId, payload, {
      requestId,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.accepted) {
      const status =
        result.code === "FORM_NOT_FOUND"
          ? 404
          : result.code === "RATE_LIMITED"
            ? 429
            : 422;

      const responseBody = failure(requestId, result.code, result.message);

      logWarn("forms.submission.rejected", {
        requestId,
        route: "/api/forms/[formId]/submit",
      }, {
        formId,
        code: result.code,
      });

      await storeIdempotencyResponse(formId, idempotencyKey, status, responseBody as Record<string, unknown>);

      return NextResponse.json(
        responseBody,
        {
          status,
          headers:
            result.code === "RATE_LIMITED" && result.retryAfterSeconds
              ? {
                  "Retry-After": String(result.retryAfterSeconds),
                }
              : undefined,
        },
      );
    }

    const responseBody = success(requestId, result);
    logInfo("forms.submission.accepted", {
      requestId,
      route: "/api/forms/[formId]/submit",
    }, {
      formId,
      accepted: result.accepted,
      emailDelivered: result.email.delivered,
      requestLifecycle: result.lifecycle.map((entry) => entry.status),
    });

    await trackBackendEvent("forms.submission.accepted", {
      requestId,
      route: "/api/forms/[formId]/submit",
    }, {
      formId,
      emailDelivered: result.email.delivered,
      rateLimitMode: result.rateLimitMode,
    });

    await storeIdempotencyResponse(formId, idempotencyKey, 202, responseBody as Record<string, unknown>);

    return NextResponse.json(responseBody, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      const responseBody = failure(requestId, "VALIDATION_ERROR", "Form payload is invalid.", {
        issues: error.issues,
      });

      await storeIdempotencyResponse(formId, idempotencyKey, 400, responseBody as Record<string, unknown>);

      logWarn("forms.submission.validation_failed", {
        requestId,
        route: "/api/forms/[formId]/submit",
      }, {
        formId,
        issueCount: error.issues.length,
      });

      return NextResponse.json(
        responseBody,
        { status: 400 },
      );
    }

    const responseBody = failure(requestId, "UNEXPECTED_ERROR", "An unexpected error occurred.");
    await storeIdempotencyResponse(formId, idempotencyKey, 500, responseBody as Record<string, unknown>);

    logError("forms.submission.unexpected_error", {
      requestId,
      route: "/api/forms/[formId]/submit",
    }, {
      formId,
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("forms.submission.unexpected_error", {
      requestId,
      route: "/api/forms/[formId]/submit",
    }, {
      formId,
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      responseBody,
      { status: 500 },
    );
  }
}