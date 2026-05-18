import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { canEnablePreview } from "@/server/modules/preview/preview.service";

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
      return NextResponse.json(
        failure(requestId, result.code, result.message),
        { status: 401 },
      );
    }

    const draft = await draftMode();
    draft.enable();

    return NextResponse.json(success(requestId, { enabled: true, redirectTo: payload.redirectTo }));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Preview payload is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    return NextResponse.json(
      failure(requestId, "UNEXPECTED_ERROR", "Unable to enable preview."),
      { status: 500 },
    );
  }
}