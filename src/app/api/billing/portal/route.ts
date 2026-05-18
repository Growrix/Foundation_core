import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  BillingServiceError,
  createPortalSession,
} from "@/server/modules/billing/billing.service";
import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { requireAuthenticated } from "@/server/modules/auth/guards";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

const portalSchema = z
  .object({
    return_url: z.url().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = createRequestId();

  const authResult = requireAuthenticated({
    cookieHeader: request.headers.get("cookie"),
    authorizationHeader: request.headers.get("authorization"),
  });

  if (!authResult.ok) {
    logWarn("billing.portal.auth_denied", {
      requestId,
      route: "/api/billing/portal",
    }, {
      code: authResult.code,
    });

    return NextResponse.json(
      failure(requestId, "BILLING_AUTH_REQUIRED", "Authentication is required for billing portal access."),
      { status: 401 },
    );
  }

  try {
    const payload = portalSchema.parse(await request.json());
    const portal = await createPortalSession({
      userId: authResult.session.user?.id ?? "",
      returnUrl: payload.return_url ?? null,
    });

    logInfo("billing.portal.created", {
      requestId,
      route: "/api/billing/portal",
      userId: authResult.session.user?.id ?? null,
    }, {
      customerId: portal.customerId,
    });

    await trackBackendEvent("billing.portal.created", {
      requestId,
      route: "/api/billing/portal",
      userId: authResult.session.user?.id ?? null,
    }, {
      customerId: portal.customerId,
    });

    return NextResponse.json(
      success(requestId, {
        portal_url: portal.portalUrl,
        customer_id: portal.customerId,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      logWarn("billing.portal.validation_failed", {
        requestId,
        route: "/api/billing/portal",
      }, {
        issueCount: error.issues.length,
      });

      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Billing portal payload is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    if (error instanceof BillingServiceError) {
      logWarn("billing.portal.rejected", {
        requestId,
        route: "/api/billing/portal",
        userId: authResult.session.user?.id ?? null,
      }, {
        code: error.code,
      });

      return NextResponse.json(
        failure(requestId, error.code, error.message, error.details),
        { status: error.status },
      );
    }

    logError("billing.portal.unexpected_error", {
      requestId,
      route: "/api/billing/portal",
      userId: authResult.session.user?.id ?? null,
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("billing.portal.unexpected_error", {
      requestId,
      route: "/api/billing/portal",
      userId: authResult.session.user?.id ?? null,
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "BILLING_UNEXPECTED_ERROR", "Unable to create billing portal session."),
      { status: 500 },
    );
  }
}