import { getFormsSqlClient } from "@/server/modules/forms/forms.db";

export type SubmissionLifecycleStatus =
  | "accepted"
  | "persisted"
  | "delivered"
  | "notify_failed"
  | "delivery_failed";

export type SubmissionLifecycleEntry = {
  requestId: string;
  formId: string;
  status: SubmissionLifecycleStatus;
  provider: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type SubmissionLogWriteResult = {
  stored: boolean;
  mode: "database" | "memory";
  entryId: number | null;
};

const inMemoryLogs = new Map<string, SubmissionLifecycleEntry[]>();
let schemaEnsured = false;

async function ensureSchema() {
  const sql = getFormsSqlClient();

  if (!sql || schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_form_submission_logs (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
}

export async function appendSubmissionLifecycleLog(
  entry: SubmissionLifecycleEntry,
): Promise<SubmissionLogWriteResult> {
  const sql = getFormsSqlClient();

  if (!sql) {
    const existing = inMemoryLogs.get(entry.requestId) ?? [];
    existing.push(entry);
    inMemoryLogs.set(entry.requestId, existing);

    return {
      stored: true,
      mode: "memory",
      entryId: null,
    };
  }

  await ensureSchema();

  const rows = await sql<{ id: number }[]>`
    INSERT INTO foundation_form_submission_logs (
      request_id,
      form_id,
      status,
      provider,
      details,
      created_at
    )
    VALUES (
      ${entry.requestId},
      ${entry.formId},
      ${entry.status},
      ${entry.provider},
      ${sql.json(entry.details as never)},
      ${entry.createdAt}
    )
    RETURNING id
  `;

  return {
    stored: true,
    mode: "database",
    entryId: rows[0]?.id ?? null,
  };
}

export function getInMemorySubmissionLifecycle(requestId: string) {
  return inMemoryLogs.get(requestId) ?? [];
}

export function resetSubmissionLogForTests() {
  inMemoryLogs.clear();
  schemaEnsured = false;
}
