import { NextResponse } from "next/server";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getCollection } from "@/server/modules/content/content.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ collection: string }> },
) {
  const requestId = createRequestId();
  const { collection } = await context.params;

  try {
    return NextResponse.json(success(requestId, await getCollection(collection)));
  } catch (error) {
    return NextResponse.json(
      failure(requestId, "CONTENT_PROVIDER_ERROR", "Content provider request failed.", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 },
    );
  }
}