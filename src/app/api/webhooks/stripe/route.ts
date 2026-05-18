import { NextResponse } from "next/server";

import {
  BillingServiceError,
  constructStripeWebhookEvent,
  processStripeWebhookEvent,
} from "@/server/modules/billing/billing.service";
import { failure, success } from "@/server/http/envelope";
import { createRequestId } from "@/server/http/request-id";
import { logError, logInfo, logWarn } from "@/server/observability/logger";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

export async function POST(request: Request) {
  const requestId = createRequestId();

  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("stripe-signature");
    const event = constructStripeWebhookEvent(rawBody, signatureHeader);
    const result = await processStripeWebhookEvent(event);

    if (result.replayed) {
      logInfo("billing.webhook.replayed", {
        requestId,
        route: "/api/webhooks/stripe",
      }, {
        eventId: result.eventId,
        eventType: result.eventType,
        storageMode: result.storageMode,
      });
    } else {
      logInfo("billing.webhook.processed", {
        requestId,
        route: "/api/webhooks/stripe",
      }, {
        eventId: result.eventId,
        eventType: result.eventType,
        storageMode: result.storageMode,
        changesApplied: result.changesApplied,
      });

      await trackBackendEvent("billing.webhook.processed", {
        requestId,
        route: "/api/webhooks/stripe",
      }, {
        eventId: result.eventId,
        eventType: result.eventType,
        changesApplied: result.changesApplied,
      });
    }

    return NextResponse.json(
      success(requestId, {
        processed: result.processed,
        replayed: result.replayed,
        event_id: result.eventId,
        event_type: result.eventType,
      }),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof BillingServiceError) {
      logWarn("billing.webhook.rejected", {
        requestId,
        route: "/api/webhooks/stripe",
      }, {
        code: error.code,
      });

      return NextResponse.json(
        failure(requestId, error.code, error.message, error.details),
        { status: error.status },
      );
    }

    logError("billing.webhook.unexpected_error", {
      requestId,
      route: "/api/webhooks/stripe",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    await captureBackendError("billing.webhook.unexpected_error", {
      requestId,
      route: "/api/webhooks/stripe",
    }, {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      failure(requestId, "BILLING_UNEXPECTED_ERROR", "Unable to process Stripe webhook event."),
      { status: 500 },
    );
  }
}