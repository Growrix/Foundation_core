import { NextResponse } from "next/server";

import { success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getSessionSnapshot } from "@/server/modules/auth/session.service";

export async function GET(request: Request) {
  const requestId = createRequestId();

  return NextResponse.json(
    success(
      requestId,
      getSessionSnapshot({
        cookieHeader: request.headers.get("cookie"),
        authorizationHeader: request.headers.get("authorization"),
      }),
    ),
  );
}