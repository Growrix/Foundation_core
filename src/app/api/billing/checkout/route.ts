import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  BillingServiceError,
  createCheckoutSession,
} from "@/server/modules/billing/billing.service";
import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { requireAuthenticated } from "@/server/modules/auth/guards";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

const checkoutSchema = z
  .object({
    offer_key: z.string().min(1),
    success_url: z.url(),
    cancel_url: z.url(),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = createRequestId();

  const authResult = requireAuthenticated({
    cookieHeader: request.headers.get("cookie"),
    authorizationHeader: request.headers.get("authorization"),
  });

  if (!authResult.ok) {
    logWarn("billing.checkout.auth_denied", {
      requestId,
      route: "/api/billing/checkout",
    }, {
      code: authResult.code,
    });

    return NextResponse.json(
      failure(requestId, "BILLING_AUTH_REQUIRED", "Authentication is required for billing checkout."),
      { status: 401 },
    );
  }

  try {
    const payload = checkoutSchema.parse(await request.json());
    const checkout = await createCheckoutSession({
      userId: authResult.session.user?.id ?? "",
      email: authResult.session.user?.email ?? null,
      offerKey: payload.offer_key,
      successUrl: payload.success_url,
      cancelUrl: payload.cancel_url,
    });

    logInfo("billing.checkout.created", {
      requestId,
      route: "/api/billing/checkout",
      userId: authResult.session.user?.id ?? null,
    }, {
      offerKey: payload.offer_key,
      customerId: checkout.customerId,
      priceId: checkout.priceId,
    });

    await trackBackendEvent("billing.checkout.created", {
      requestId,
      route: "/api/billing/checkout",
      userId: authResult.session.user?.id ?? null,
    }, {
      offerKey: payload.offer_key,
      priceId: checkout.priceId,
    });

    return NextResponse.json(
      success(requestId, {
        checkout_url: checkout.checkoutUrl,
        customer_id: checkout.customerId,
        offer_key: checkout.offerKey,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      logWarn("billing.checkout.validation_failed", {
        requestId,
        route: "/api/billing/checkout",
      }, {
        issueCount: error.issues.length,
      });

      return NextResponse.json(
        failure(requestId, "VALIDATION_ERROR", "Billing checkout payload is invalid.", {
          issues: error.issues,
        }),
        { status: 400 },
      );
    }

    if (error instanceof BillingServiceError) {
      logWarn("billing.checkout.rejected", {
        requestId,
        route: "/api/billing/checkout",
        userId: authResult.session.user?.id ?? null,
      }, {
        code: error.code,
      });

      return NextResponse.json(
        failure(requestId, error.code, error.message, error.details),
        { status: error.status },
      );
    }

    logError("billing.checkout.unexpected_error", {
      requestId,
      route: "/api/billing/checkout",
      userId: authResult.session.user?.id ?? null,
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("billing.checkout.unexpected_error", {
      requestId,
      route: "/api/billing/checkout",
      userId: authResult.session.user?.id ?? null,
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "BILLING_UNEXPECTED_ERROR", "Unable to create checkout session."),
      { status: 500 },
    );
  }
}