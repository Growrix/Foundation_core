import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { parseSubmissionPayload, processLeadSubmission } from "@/server/modules/forms/form.service";

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

      return NextResponse.json(
        failure(requestId, result.code, result.message),
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

    return NextResponse.json(success(requestId, result), { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Form payload is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    return NextResponse.json(
      failure(requestId, "UNEXPECTED_ERROR", "An unexpected error occurred."),
      { status: 500 },
    );
  }
}