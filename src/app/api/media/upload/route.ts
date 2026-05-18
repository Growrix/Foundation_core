import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { createUploadIntent } from "@/server/modules/media/media.service";

const uploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(3),
});

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const payload = uploadSchema.parse(await request.json());
    const result = await createUploadIntent(payload.filename, payload.contentType);

    return NextResponse.json(success(requestId, result), { status: result.enabled ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Upload request is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    return NextResponse.json(
      failure(requestId, "UNEXPECTED_ERROR", "Unable to create upload intent."),
      { status: 500 },
    );
  }
}