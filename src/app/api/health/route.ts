import { NextResponse } from "next/server";

import { success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getFoundationSummary } from "@/server/modules/health/health.service";

export async function GET() {
  const requestId = createRequestId();

  return NextResponse.json(success(requestId, getFoundationSummary()));
}