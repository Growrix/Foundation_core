import { NextResponse } from "next/server";

import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import {
  requireAnyRole,
  requireAuthenticated,
} from "@/server/modules/auth/guards";
import { getRuntimeDiagnosticsReport } from "@/server/modules/health/health.service";
import { logInfo, logWarn } from "@/server/observability/logger";

export async function GET(request: Request) {
  const requestId = createRequestId();

  const authResult = requireAuthenticated({
    cookieHeader: request.headers.get("cookie"),
    authorizationHeader: request.headers.get("authorization"),
  });

  if (!authResult.ok) {
    logWarn("admin.diagnostics.auth_denied", {
      requestId,
      route: "/api/admin/diagnostics",
    }, {
      code: authResult.code,
    });

    return NextResponse.json(
      failure(requestId, authResult.code, authResult.message),
      { status: authResult.status },
    );
  }

  const roleResult = requireAnyRole(authResult.session, ["admin"]);

  if (!roleResult.ok) {
    logWarn("admin.diagnostics.role_denied", {
      requestId,
      route: "/api/admin/diagnostics",
    }, {
      code: roleResult.code,
    });

    return NextResponse.json(
      failure(requestId, roleResult.code, roleResult.message),
      { status: roleResult.status },
    );
  }

  const diagnostics = getRuntimeDiagnosticsReport();

  logInfo("admin.diagnostics.allowed", {
    requestId,
    route: "/api/admin/diagnostics",
    userId: roleResult.session.user?.id ?? null,
  }, {
    environment: diagnostics.runtime.environment,
  });

  return NextResponse.json(success(requestId, diagnostics));
}
