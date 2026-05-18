import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { createUploadIntent } from "@/server/modules/media/media.service";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

const uploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(3),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  signReadUrl: z.boolean().optional(),
});

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const payload = uploadSchema.parse(await request.json());
    const result = await createUploadIntent(payload.filename, payload.contentType, {
      width: payload.width,
      height: payload.height,
      visibility: payload.visibility,
      signReadUrl: payload.signReadUrl,
    });

    logInfo("media.upload_intent.generated", {
      requestId,
      route: "/api/media/upload",
    }, {
      enabled: result.enabled,
      visibility: payload.visibility,
      format: result.asset.metadata.format,
    });

    await trackBackendEvent("media.upload_intent.generated", {
      requestId,
      route: "/api/media/upload",
    }, {
      enabled: result.enabled,
      visibility: payload.visibility,
    });

    return NextResponse.json(success(requestId, result), { status: result.enabled ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      logWarn("media.upload_intent.validation_failed", {
        requestId,
        route: "/api/media/upload",
      }, {
        issueCount: error.issues.length,
      });

      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Upload request is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    logError("media.upload_intent.unexpected_error", {
      requestId,
      route: "/api/media/upload",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("media.upload_intent.unexpected_error", {
      requestId,
      route: "/api/media/upload",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "UNEXPECTED_ERROR", "Unable to create upload intent."),
      { status: 500 },
    );
  }
}