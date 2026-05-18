import { getBillingSqlClient } from "@/server/modules/billing/billing.db";

export type BillingSubscriptionRecord = {
  userId: string;
  stripeSubscriptionId: string;
  status: string;
  priceLookupKey: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  mode: "database" | "memory";
};

export type UpsertBillingSubscriptionInput = {
  userId: string;
  stripeSubscriptionId: string;
  status: string;
  priceLookupKey: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const memoryByStripeSubscriptionId = new Map<string, BillingSubscriptionRecord>();
let schemaEnsured = false;

function toIsoString(value: Date | string | null | undefined) {
  /* c8 ignore start */
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : value;
  /* c8 ignore stop */
}

async function ensureSchema() {
  /* c8 ignore start */
  const sql = getBillingSqlClient();

  if (!sql || schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_billing_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      price_lookup_key TEXT NULL,
      current_period_end TIMESTAMPTZ NULL,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
  /* c8 ignore stop */
}

export async function upsertBillingSubscription(
  input: UpsertBillingSubscriptionInput,
): Promise<BillingSubscriptionRecord> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    const now = new Date().toISOString();
    const existing = memoryByStripeSubscriptionId.get(input.stripeSubscriptionId);

    const record: BillingSubscriptionRecord = {
      userId: input.userId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      status: input.status,
      priceLookupKey: input.priceLookupKey,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      updatedAt: now,
      mode: "memory",
    };

    memoryByStripeSubscriptionId.set(input.stripeSubscriptionId, {
      ...record,
      updatedAt: existing ? now : record.updatedAt,
    });

    return memoryByStripeSubscriptionId.get(input.stripeSubscriptionId) as BillingSubscriptionRecord;
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{
    user_id: string;
    stripe_subscription_id: string;
    status: string;
    price_lookup_key: string | null;
    current_period_end: Date | null;
    cancel_at_period_end: boolean;
    updated_at: Date;
  }[]>`
    INSERT INTO foundation_billing_subscriptions (
      user_id,
      stripe_subscription_id,
      status,
      price_lookup_key,
      current_period_end,
      cancel_at_period_end
    )
    VALUES (
      ${input.userId},
      ${input.stripeSubscriptionId},
      ${input.status},
      ${input.priceLookupKey},
      ${input.currentPeriodEnd},
      ${input.cancelAtPeriodEnd}
    )
    ON CONFLICT (stripe_subscription_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      status = EXCLUDED.status,
      price_lookup_key = EXCLUDED.price_lookup_key,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = NOW()
    RETURNING
      user_id,
      stripe_subscription_id,
      status,
      price_lookup_key,
      current_period_end,
      cancel_at_period_end,
      updated_at
  `;

  const row = rows[0];

  return {
    userId: row.user_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    status: row.status,
    priceLookupKey: row.price_lookup_key,
    currentPeriodEnd: row.current_period_end ? toIsoString(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    updatedAt: toIsoString(row.updated_at),
    mode: "database",
  };
  /* c8 ignore stop */
}

export function resetBillingSubscriptionsRepositoryForTests() {
  memoryByStripeSubscriptionId.clear();
  schemaEnsured = false;
}