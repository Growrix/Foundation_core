import { NextResponse } from "next/server";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getPageBySlug } from "@/server/modules/content/content.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const requestId = createRequestId();
  const { slug } = await context.params;

  try {
    const page = await getPageBySlug(slug);

    if (!page) {
      return NextResponse.json(
        failure(requestId, "PAGE_NOT_FOUND", `No page exists for slug '${slug}'.`),
        { status: 404 },
      );
    }

    return NextResponse.json(success(requestId, page));
  } catch (error) {
    return NextResponse.json(
      failure(
        requestId,
        "CONTENT_PROVIDER_ERROR",
        "Content provider request failed.",
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ),
      { status: 500 },
    );
  }
}