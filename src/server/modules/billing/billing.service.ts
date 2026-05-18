import type Stripe from "stripe";

import { getRuntimeEnv } from "@/server/config/env";
import { resetBillingDbForTests } from "@/server/modules/billing/billing.db";
import {
  getBillingCustomerByStripeCustomerId,
  getBillingCustomerByUserId,
  resetBillingCustomersRepositoryForTests,
  upsertBillingCustomer,
} from "@/server/modules/billing/customers.repository";
import {
  resetBillingInvoicesRepositoryForTests,
  upsertBillingInvoice,
} from "@/server/modules/billing/invoices.repository";
import { resolveStripeOfferKey } from "@/server/modules/billing/offer-resolution.service";
import { resetStripeClientForTests, getStripeClient } from "@/server/modules/billing/stripe.client";
import {
  resetBillingSubscriptionsRepositoryForTests,
  upsertBillingSubscription,
} from "@/server/modules/billing/subscriptions.repository";
import { claimWebhookEvent, resetWebhookEventsRepositoryForTests } from "@/server/modules/billing/webhook-events.repository";

export type BillingErrorCode =
  | "BILLING_NOT_CONFIGURED"
  | "BILLING_OFFER_NOT_FOUND"
  | "BILLING_PORTAL_UNAVAILABLE"
  | "BILLING_CHECKOUT_UNAVAILABLE"
  | "BILLING_WEBHOOK_SIGNATURE_INVALID";

export class BillingServiceError extends Error {
  readonly code: BillingErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: BillingErrorCode,
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BillingServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type CreateCheckoutSessionInput = {
  userId: string;
  email: string | null;
  offerKey: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSessionResult = {
  checkoutUrl: string;
  customerId: string;
  offerKey: string;
  priceId: string;
};

export type CreatePortalSessionInput = {
  userId: string;
  returnUrl: string | null;
};

export type PortalSessionResult = {
  portalUrl: string;
  customerId: string;
};

export type StripeWebhookProcessResult = {
  eventId: string;
  eventType: string;
  processed: boolean;
  replayed: boolean;
  storageMode: "database" | "memory";
  changesApplied: number;
};

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  return readString(metadata?.[key]);
}

function toIsoDate(timestamp: number | null | undefined) {
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function requireStripeConfiguration(requireWebhookSecret: boolean) {
  const env = getRuntimeEnv();
  const stripe = getStripeClient();

  if (!stripe || !env.STRIPE_SECRET_KEY) {
    throw new BillingServiceError(
      "BILLING_NOT_CONFIGURED",
      503,
      "Stripe billing is not configured.",
    );
  }

  if (requireWebhookSecret && !env.STRIPE_WEBHOOK_SECRET) {
    throw new BillingServiceError(
      "BILLING_NOT_CONFIGURED",
      503,
      "STRIPE_WEBHOOK_SECRET is not configured.",
    );
  }

  return {
    stripe,
    env,
  };
}

async function ensureStripeCustomer(stripe: Stripe, userId: string, email: string | null) {
  const existing = await getBillingCustomerByUserId(userId);

  if (existing) {
    return existing;
  }

  const created = await stripe.customers.create({
    email: email ?? undefined,
    metadata: {
      internal_user_id: userId,
    },
  });

  return upsertBillingCustomer(userId, created.id);
}

function readCustomerIdFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "id" in value) {
    const candidate = (value as { id?: unknown }).id;
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
}

async function resolveUserIdFromCustomer(
  stripeCustomerId: string | null,
  fallbackUserId: string | null,
) {
  if (fallbackUserId) {
    return fallbackUserId;
  }

  if (!stripeCustomerId) {
    return null;
  }

  const existing = await getBillingCustomerByStripeCustomerId(stripeCustomerId);
  return existing?.userId ?? null;
}

function getPriceLookupKey(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  return readString(firstItem?.price?.lookup_key ?? null);
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  return toIsoDate(firstItem?.current_period_end);
}

async function handleCheckoutSessionCompleted(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<number> {
  const session = event.data.object as Stripe.Checkout.Session;
  const stripeCustomerId = readCustomerIdFromUnknown(session.customer);
  const metadataUserId =
    readMetadataValue(session.metadata, "internal_user_id") ??
    readMetadataValue(session.metadata, "user_id");

  let changes = 0;

  if (stripeCustomerId && metadataUserId) {
    await upsertBillingCustomer(metadataUserId, stripeCustomerId);
    changes += 1;
  }

  const subscriptionId = readString(session.subscription);

  if (!subscriptionId) {
    return changes;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserIdFromCustomer(stripeCustomerId, metadataUserId);

  if (!userId) {
    return changes;
  }

  await upsertBillingSubscription({
    userId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceLookupKey: getPriceLookupKey(subscription),
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });

  return changes + 1;
}

async function handleSubscriptionEvent(event: Stripe.Event): Promise<number> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId = readCustomerIdFromUnknown(subscription.customer);
  const metadataUserId =
    readMetadataValue(subscription.metadata, "internal_user_id") ??
    readMetadataValue(subscription.metadata, "user_id");

  const userId = await resolveUserIdFromCustomer(stripeCustomerId, metadataUserId);

  if (!userId) {
    return 0;
  }

  await upsertBillingSubscription({
    userId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceLookupKey: getPriceLookupKey(subscription),
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });

  return 1;
}

async function handleInvoiceEvent(event: Stripe.Event): Promise<number> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeInvoiceId = readString(invoice.id);

  if (!stripeInvoiceId) {
    return 0;
  }

  const stripeCustomerId = readCustomerIdFromUnknown(invoice.customer);
  const metadataUserId =
    readMetadataValue(invoice.metadata, "internal_user_id") ??
    readMetadataValue(invoice.metadata, "user_id");

  const userId = await resolveUserIdFromCustomer(stripeCustomerId, metadataUserId);

  if (!userId) {
    return 0;
  }

  const amountPaid = typeof invoice.amount_paid === "number" ? invoice.amount_paid : null;
  const amountDue = typeof invoice.amount_due === "number" ? invoice.amount_due : 0;

  await upsertBillingInvoice({
    userId,
    stripeInvoiceId,
    amountCents: amountPaid ?? amountDue,
    status: readString(invoice.status) ?? event.type,
  });

  return 1;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const { stripe } = requireStripeConfiguration(false);
  const offer = await resolveStripeOfferKey(input.offerKey);

  if (!offer.found || !offer.priceId) {
    throw new BillingServiceError(
      "BILLING_OFFER_NOT_FOUND",
      404,
      `Stripe offer key '${input.offerKey}' was not found.`,
      {
        offerKey: input.offerKey,
      },
    );
  }

  const customer = await ensureStripeCustomer(stripe, input.userId, input.email);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripeCustomerId,
    line_items: [
      {
        price: offer.priceId,
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      internal_user_id: input.userId,
      offer_key: input.offerKey,
    },
    subscription_data: {
      metadata: {
        internal_user_id: input.userId,
        offer_key: input.offerKey,
      },
    },
  });

  const checkoutUrl = readString(session.url);

  if (!checkoutUrl) {
    throw new BillingServiceError(
      "BILLING_CHECKOUT_UNAVAILABLE",
      503,
      "Stripe checkout session did not return a checkout URL.",
      {
        sessionId: session.id,
      },
    );
  }

  return {
    checkoutUrl,
    customerId: customer.stripeCustomerId,
    offerKey: input.offerKey,
    priceId: offer.priceId,
  };
}

export async function createPortalSession(
  input: CreatePortalSessionInput,
): Promise<PortalSessionResult> {
  const { stripe, env } = requireStripeConfiguration(false);
  const customer = await getBillingCustomerByUserId(input.userId);

  if (!customer) {
    throw new BillingServiceError(
      "BILLING_PORTAL_UNAVAILABLE",
      409,
      "No Stripe customer was found for this user.",
      {
        userId: input.userId,
      },
    );
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: input.returnUrl ?? env.NEXT_PUBLIC_SITE_URL,
  });

  const portalUrl = readString(portal.url);

  if (!portalUrl) {
    throw new BillingServiceError(
      "BILLING_PORTAL_UNAVAILABLE",
      503,
      "Stripe portal session did not return a portal URL.",
      {
        customerId: customer.stripeCustomerId,
      },
    );
  }

  return {
    portalUrl,
    customerId: customer.stripeCustomerId,
  };
}

export function constructStripeWebhookEvent(
  rawBody: string,
  signatureHeader: string | null,
) {
  const { stripe, env } = requireStripeConfiguration(true);

  if (!signatureHeader) {
    throw new BillingServiceError(
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
      400,
      "Stripe-Signature header is required.",
    );
  }

  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET as string);
  } catch {
    throw new BillingServiceError(
      "BILLING_WEBHOOK_SIGNATURE_INVALID",
      400,
      "Stripe webhook signature is invalid.",
    );
  }
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
): Promise<StripeWebhookProcessResult> {
  const { stripe } = requireStripeConfiguration(false);
  const claim = await claimWebhookEvent(event.id, event.type);

  if (!claim.claimed) {
    return {
      eventId: event.id,
      eventType: event.type,
      processed: false,
      replayed: true,
      storageMode: claim.mode,
      changesApplied: 0,
    };
  }

  let changesApplied = 0;

  if (event.type === "checkout.session.completed") {
    changesApplied = await handleCheckoutSessionCompleted(stripe, event);
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    changesApplied = await handleSubscriptionEvent(event);
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    changesApplied = await handleInvoiceEvent(event);
  }

  return {
    eventId: event.id,
    eventType: event.type,
    processed: true,
    replayed: false,
    storageMode: claim.mode,
    changesApplied,
  };
}

export async function resetBillingStateForTests() {
  resetStripeClientForTests();
  resetBillingCustomersRepositoryForTests();
  resetBillingSubscriptionsRepositoryForTests();
  resetBillingInvoicesRepositoryForTests();
  resetWebhookEventsRepositoryForTests();
  await resetBillingDbForTests();
}