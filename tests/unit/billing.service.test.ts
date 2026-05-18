import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => {
  return {
    pricesList: vi.fn(),
    customersCreate: vi.fn(),
    checkoutCreate: vi.fn(),
    portalCreate: vi.fn(),
    subscriptionRetrieve: vi.fn(),
    webhookConstructEvent: vi.fn(),
  };
});

vi.mock("stripe", () => ({
  default: class MockStripe {
    prices = {
      list: stripeMocks.pricesList,
    };

    customers = {
      create: stripeMocks.customersCreate,
    };

    checkout = {
      sessions: {
        create: stripeMocks.checkoutCreate,
      },
    };

    billingPortal = {
      sessions: {
        create: stripeMocks.portalCreate,
      },
    };

    subscriptions = {
      retrieve: stripeMocks.subscriptionRetrieve,
    };

    webhooks = {
      constructEvent: stripeMocks.webhookConstructEvent,
    };
  },
}));

import { resetRuntimeEnvForTests } from "@/server/config/env";
import {
  BillingServiceError,
  constructStripeWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  processStripeWebhookEvent,
  resetBillingStateForTests,
} from "@/server/modules/billing/billing.service";
import { upsertBillingCustomer } from "@/server/modules/billing/customers.repository";

const managedKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
] as const;

describe("billing.service", () => {
  beforeEach(async () => {
    for (const key of managedKeys) {
      delete process.env[key];
    }

    process.env.NEXT_PUBLIC_SITE_URL = "https://foundation-core.example.com";

    resetRuntimeEnvForTests();
    await resetBillingStateForTests();

    stripeMocks.pricesList.mockReset();
    stripeMocks.customersCreate.mockReset();
    stripeMocks.checkoutCreate.mockReset();
    stripeMocks.portalCreate.mockReset();
    stripeMocks.subscriptionRetrieve.mockReset();
    stripeMocks.webhookConstructEvent.mockReset();
  });

  it("fails checkout when Stripe is not configured", async () => {
    await expect(
      createCheckoutSession({
        userId: "user-1",
        email: "user-1@example.com",
        offerKey: "starter",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("creates checkout sessions with offer-key resolution and persistent customer mapping", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_checkout_12345";
    resetRuntimeEnvForTests();

    stripeMocks.pricesList.mockResolvedValue({
      data: [
        {
          id: "price_starter",
          currency: "usd",
          unit_amount: 1900,
        },
      ],
    });
    stripeMocks.customersCreate.mockResolvedValue({ id: "cus_123" });
    stripeMocks.checkoutCreate.mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.com/pay/cs_123",
    });

    const first = await createCheckoutSession({
      userId: "user-1",
      email: "user-1@example.com",
      offerKey: "starter",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    const second = await createCheckoutSession({
      userId: "user-1",
      email: "user-1@example.com",
      offerKey: "starter",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(first.checkoutUrl).toContain("checkout.stripe.com");
    expect(first.customerId).toBe("cus_123");
    expect(first.priceId).toBe("price_starter");
    expect(second.customerId).toBe("cus_123");
    expect(stripeMocks.customersCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects checkout when offer lookup_key does not exist", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_checkout_12345";
    resetRuntimeEnvForTests();

    stripeMocks.pricesList.mockResolvedValue({ data: [] });

    await expect(
      createCheckoutSession({
        userId: "user-2",
        email: "user-2@example.com",
        offerKey: "missing-offer",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_OFFER_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects checkout when Stripe does not provide a checkout URL", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_checkout_12345";
    resetRuntimeEnvForTests();

    stripeMocks.pricesList.mockResolvedValue({
      data: [
        {
          id: "price_starter",
          currency: "usd",
          unit_amount: 1900,
        },
      ],
    });
    stripeMocks.customersCreate.mockResolvedValue({ id: "cus_missing_url" });
    stripeMocks.checkoutCreate.mockResolvedValue({ id: "cs_missing_url", url: null });

    await expect(
      createCheckoutSession({
        userId: "user-3",
        email: "user-3@example.com",
        offerKey: "starter",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_CHECKOUT_UNAVAILABLE",
      status: 503,
    });
  });

  it("rejects portal session when customer mapping does not exist", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal_12345";
    resetRuntimeEnvForTests();

    await expect(
      createPortalSession({
        userId: "user-without-customer",
        returnUrl: "https://example.com/account",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_PORTAL_UNAVAILABLE",
      status: 409,
    });
  });

  it("creates a portal session when a customer mapping exists", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal_12345";
    resetRuntimeEnvForTests();

    await upsertBillingCustomer("user-portal", "cus_portal");
    stripeMocks.portalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/p/session/test",
    });

    const portal = await createPortalSession({
      userId: "user-portal",
      returnUrl: "https://example.com/account",
    });

    expect(portal.portalUrl).toContain("billing.stripe.com");
    expect(portal.customerId).toBe("cus_portal");
  });

  it("rejects portal session when Stripe does not provide a portal URL", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal_12345";
    resetRuntimeEnvForTests();

    await upsertBillingCustomer("user-portal-missing-url", "cus_portal_missing_url");
    stripeMocks.portalCreate.mockResolvedValue({ url: null });

    await expect(
      createPortalSession({
        userId: "user-portal-missing-url",
        returnUrl: "https://example.com/account",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_PORTAL_UNAVAILABLE",
      status: 503,
    });
  });

  it("processes webhook events once and replays duplicates safely", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    resetRuntimeEnvForTests();

    await upsertBillingCustomer("user-1", "cus_123");

    const event = {
      id: "evt_invoice_1",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          customer: "cus_123",
          amount_paid: 5000,
          amount_due: 5000,
          status: "paid",
          metadata: {},
        },
      },
    } as unknown as Stripe.Event;

    const first = await processStripeWebhookEvent(event);
    const second = await processStripeWebhookEvent(event);

    expect(first.processed).toBe(true);
    expect(first.replayed).toBe(false);
    expect(first.changesApplied).toBe(1);
    expect(second.replayed).toBe(true);
  });

  it("handles checkout.session.completed and subscription lifecycle events", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    resetRuntimeEnvForTests();

    stripeMocks.subscriptionRetrieve.mockResolvedValue({
      id: "sub_checkout",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: Math.floor(Date.now() / 1000) + 3600,
            price: {
              lookup_key: "starter",
            },
          },
        ],
      },
      metadata: {
        internal_user_id: "user-checkout",
      },
    });

    const checkoutEvent = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_checkout",
          subscription: "sub_checkout",
          metadata: {
            internal_user_id: "user-checkout",
          },
        },
      },
    } as unknown as Stripe.Event;

    const checkoutResult = await processStripeWebhookEvent(checkoutEvent);

    expect(checkoutResult.processed).toBe(true);
    expect(checkoutResult.changesApplied).toBe(2);

    const updatedEvent = {
      id: "evt_subscription_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_checkout",
          status: "past_due",
          customer: "cus_checkout",
          cancel_at_period_end: true,
          items: {
            data: [
              {
                current_period_end: Math.floor(Date.now() / 1000) + 7200,
                price: {
                  lookup_key: "starter",
                },
              },
            ],
          },
          metadata: {},
        },
      },
    } as unknown as Stripe.Event;

    const updatedResult = await processStripeWebhookEvent(updatedEvent);

    expect(updatedResult.processed).toBe(true);
    expect(updatedResult.changesApplied).toBe(1);

    const unknownEvent = {
      id: "evt_unknown_1",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_123",
        },
      },
    } as unknown as Stripe.Event;

    const unknownResult = await processStripeWebhookEvent(unknownEvent);
    expect(unknownResult.changesApplied).toBe(0);
  });

  it("rejects webhook construction when signature verification fails", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_1234567890";
    resetRuntimeEnvForTests();

    stripeMocks.webhookConstructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    expect(() =>
      constructStripeWebhookEvent("{}", "t=1,v1=bad"),
    ).toThrowError(BillingServiceError);

    expect(() =>
      constructStripeWebhookEvent("{}", "t=1,v1=bad"),
    ).toThrowError(/signature is invalid/i);
  });

  it("requires stripe signature header for webhook construction", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_1234567890";
    resetRuntimeEnvForTests();

    expect(() => constructStripeWebhookEvent("{}", null)).toThrowError(BillingServiceError);

    try {
      constructStripeWebhookEvent("{}", null);
    } catch (error) {
      expect(error).toMatchObject({
        code: "BILLING_WEBHOOK_SIGNATURE_INVALID",
        status: 400,
      });
    }
  });

  it("requires webhook secret before constructing Stripe events", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    resetRuntimeEnvForTests();

    expect(() => constructStripeWebhookEvent("{}", "t=1,v1=bad")).toThrowError(BillingServiceError);

    try {
      constructStripeWebhookEvent("{}", "t=1,v1=bad");
    } catch (error) {
      expect(error).toMatchObject({
        code: "BILLING_NOT_CONFIGURED",
        status: 503,
      });
    }
  });

  it("returns zero changes for invoice events missing id or customer mapping", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_webhook_12345";
    resetRuntimeEnvForTests();

    const missingInvoiceId = {
      id: "evt_invoice_missing_id",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "",
          customer: "cus_unknown",
          amount_due: 1000,
          status: "open",
          metadata: {},
        },
      },
    } as unknown as Stripe.Event;

    const unknownCustomer = {
      id: "evt_invoice_unknown_customer",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_unknown_customer",
          customer: "cus_unknown",
          amount_due: 2000,
          status: "open",
          metadata: {},
        },
      },
    } as unknown as Stripe.Event;

    const first = await processStripeWebhookEvent(missingInvoiceId);
    const second = await processStripeWebhookEvent(unknownCustomer);

    expect(first.changesApplied).toBe(0);
    expect(second.changesApplied).toBe(0);
  });
});