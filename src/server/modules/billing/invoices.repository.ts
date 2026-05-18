import { getBillingSqlClient } from "@/server/modules/billing/billing.db";

export type BillingInvoiceRecord = {
  userId: string;
  stripeInvoiceId: string;
  amountCents: number;
  status: string;
  updatedAt: string;
  mode: "database" | "memory";
};

export type UpsertBillingInvoiceInput = {
  userId: string;
  stripeInvoiceId: string;
  amountCents: number;
  status: string;
};

const memoryByStripeInvoiceId = new Map<string, BillingInvoiceRecord>();
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
    CREATE TABLE IF NOT EXISTS foundation_billing_invoices (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_invoice_id TEXT NOT NULL UNIQUE,
      amount_cents INT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
  /* c8 ignore stop */
}

export async function upsertBillingInvoice(
  input: UpsertBillingInvoiceInput,
): Promise<BillingInvoiceRecord> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    const now = new Date().toISOString();

    const record: BillingInvoiceRecord = {
      userId: input.userId,
      stripeInvoiceId: input.stripeInvoiceId,
      amountCents: input.amountCents,
      status: input.status,
      updatedAt: now,
      mode: "memory",
    };

    memoryByStripeInvoiceId.set(input.stripeInvoiceId, record);

    return record;
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{
    user_id: string;
    stripe_invoice_id: string;
    amount_cents: number;
    status: string;
    updated_at: Date;
  }[]>`
    INSERT INTO foundation_billing_invoices (
      user_id,
      stripe_invoice_id,
      amount_cents,
      status
    )
    VALUES (
      ${input.userId},
      ${input.stripeInvoiceId},
      ${input.amountCents},
      ${input.status}
    )
    ON CONFLICT (stripe_invoice_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      amount_cents = EXCLUDED.amount_cents,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING user_id, stripe_invoice_id, amount_cents, status, updated_at
  `;

  const row = rows[0];

  return {
    userId: row.user_id,
    stripeInvoiceId: row.stripe_invoice_id,
    amountCents: row.amount_cents,
    status: row.status,
    updatedAt: toIsoString(row.updated_at),
    mode: "database",
  };
  /* c8 ignore stop */
}

export function resetBillingInvoicesRepositoryForTests() {
  memoryByStripeInvoiceId.clear();
  schemaEnsured = false;
}