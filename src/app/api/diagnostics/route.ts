import { NextResponse } from "next/server";

import { success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { getRuntimeDiagnosticsReport } from "@/server/modules/health/health.service";
import { logInfo } from "@/server/observability/logger";

export async function GET() {
  const requestId = createRequestId();
  const diagnostics = getRuntimeDiagnosticsReport();

  logInfo("diagnostics.report", {
    requestId,
    route: "/api/diagnostics",
  }, {
    environment: diagnostics.runtime.environment,
  });

  return NextResponse.json(success(requestId, diagnostics));
}
