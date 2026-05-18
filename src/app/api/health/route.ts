import { NextResponse } from "next/server";

import { success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getFoundationSummary } from "@/server/modules/health/health.service";
import { logInfo } from "@/server/observability/logger";

export async function GET() {
  const requestId = createRequestId();
  const summary = getFoundationSummary();

  logInfo("health.summary", {
    requestId,
    route: "/api/health",
  }, {
    status: summary.status,
  });

  return NextResponse.json(success(requestId, summary));
}