import { getBillingSqlClient } from "@/server/modules/billing/billing.db";

export type BillingCustomerRecord = {
  userId: string;
  stripeCustomerId: string;
  createdAt: string;
  updatedAt: string;
  mode: "database" | "memory";
};

const memoryByUserId = new Map<string, BillingCustomerRecord>();
const memoryByStripeCustomerId = new Map<string, string>();
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
    CREATE TABLE IF NOT EXISTS foundation_billing_customers (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
  /* c8 ignore stop */
}

export async function getBillingCustomerByUserId(userId: string): Promise<BillingCustomerRecord | null> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    return memoryByUserId.get(userId) ?? null;
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{
    user_id: string;
    stripe_customer_id: string;
    created_at: Date;
    updated_at: Date;
  }[]>`
    SELECT
      user_id,
      stripe_customer_id,
      created_at,
      updated_at
    FROM foundation_billing_customers
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    mode: "database",
  };
  /* c8 ignore stop */
}

export async function getBillingCustomerByStripeCustomerId(
  stripeCustomerId: string,
): Promise<BillingCustomerRecord | null> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    const userId = memoryByStripeCustomerId.get(stripeCustomerId);

    if (!userId) {
      return null;
    }

    return memoryByUserId.get(userId) ?? null;
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{
    user_id: string;
    stripe_customer_id: string;
    created_at: Date;
    updated_at: Date;
  }[]>`
    SELECT
      user_id,
      stripe_customer_id,
      created_at,
      updated_at
    FROM foundation_billing_customers
    WHERE stripe_customer_id = ${stripeCustomerId}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    mode: "database",
  };
  /* c8 ignore stop */
}

export async function upsertBillingCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<BillingCustomerRecord> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    const existing = memoryByUserId.get(userId);
    const now = new Date().toISOString();

    if (existing) {
      memoryByStripeCustomerId.delete(existing.stripeCustomerId);
    }

    const record: BillingCustomerRecord = {
      userId,
      stripeCustomerId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      mode: "memory",
    };

    memoryByUserId.set(userId, record);
    memoryByStripeCustomerId.set(stripeCustomerId, userId);

    return record;
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{
    user_id: string;
    stripe_customer_id: string;
    created_at: Date;
    updated_at: Date;
  }[]>`
    INSERT INTO foundation_billing_customers (
      user_id,
      stripe_customer_id
    )
    VALUES (
      ${userId},
      ${stripeCustomerId}
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      updated_at = NOW()
    RETURNING user_id, stripe_customer_id, created_at, updated_at
  `;

  const row = rows[0];

  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    mode: "database",
  };
  /* c8 ignore stop */
}

export function resetBillingCustomersRepositoryForTests() {
  memoryByUserId.clear();
  memoryByStripeCustomerId.clear();
  schemaEnsured = false;
}