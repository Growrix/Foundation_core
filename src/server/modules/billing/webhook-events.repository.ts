import { getBillingSqlClient } from "@/server/modules/billing/billing.db";

export type ClaimWebhookEventResult = {
  claimed: boolean;
  mode: "database" | "memory";
};

const memoryEventIds = new Set<string>();
let schemaEnsured = false;

async function ensureSchema() {
  /* c8 ignore start */
  const sql = getBillingSqlClient();

  if (!sql || schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_billing_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
  /* c8 ignore stop */
}

export async function claimWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<ClaimWebhookEventResult> {
  const sql = getBillingSqlClient();

  /* c8 ignore next */
  if (!sql) {
    if (memoryEventIds.has(eventId)) {
      return {
        claimed: false,
        mode: "memory",
      };
    }

    memoryEventIds.add(eventId);

    return {
      claimed: true,
      mode: "memory",
    };
  }

  /* c8 ignore start */
  await ensureSchema();

  const rows = await sql<{ event_id: string }[]>`
    INSERT INTO foundation_billing_webhook_events (
      event_id,
      event_type
    )
    VALUES (
      ${eventId},
      ${eventType}
    )
    ON CONFLICT (event_id)
    DO NOTHING
    RETURNING event_id
  `;

  return {
    claimed: rows.length > 0,
    mode: "database",
  };
  /* c8 ignore stop */
}

export function resetWebhookEventsRepositoryForTests() {
  memoryEventIds.clear();
  schemaEnsured = false;
}