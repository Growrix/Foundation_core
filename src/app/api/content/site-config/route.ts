import { NextResponse } from "next/server";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getSiteConfig } from "@/server/modules/content/content.service";

export async function GET() {
  const requestId = createRequestId();

  try {
    return NextResponse.json(success(requestId, await getSiteConfig()));
  } catch (error) {
    return NextResponse.json(
      failure(requestId, "CONTENT_PROVIDER_ERROR", "Content provider request failed.", {
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500 },
    );
  }
}