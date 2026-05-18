import { getFormsSqlClient } from "@/server/modules/forms/forms.db";

export type StoredIdempotencyResponse = {
  formId: string;
  idempotencyKey: string;
  status: number;
  responseBody: Record<string, unknown>;
  mode: "database" | "memory";
};

type MemoryIdempotencyRecord = {
  status: number;
  responseBody: Record<string, unknown>;
};

const memoryStore = new Map<string, MemoryIdempotencyRecord>();
let schemaEnsured = false;

function normalizeIdempotencyKey(key: string) {
  return key.trim();
}

function createStoreKey(formId: string, idempotencyKey: string) {
  return `${formId}:${normalizeIdempotencyKey(idempotencyKey)}`;
}

async function ensureSchema() {
  const sql = getFormsSqlClient();

  if (!sql || schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_form_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      status_code INT NOT NULL,
      response_body JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
}

export async function getStoredIdempotencyResponse(
  formId: string,
  idempotencyKey: string | null,
): Promise<StoredIdempotencyResponse | null> {
  if (!idempotencyKey) {
    return null;
  }

  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  if (!normalizedKey) {
    return null;
  }

  const sql = getFormsSqlClient();

  if (!sql) {
    const entry = memoryStore.get(createStoreKey(formId, normalizedKey));

    if (!entry) {
      return null;
    }

    return {
      formId,
      idempotencyKey: normalizedKey,
      status: entry.status,
      responseBody: entry.responseBody,
      mode: "memory",
    };
  }

  await ensureSchema();

  const rows = await sql<{
    form_id: string;
    idempotency_key: string;
    status_code: number;
    response_body: Record<string, unknown>;
  }[]>`
    SELECT
      form_id,
      idempotency_key,
      status_code,
      response_body
    FROM foundation_form_idempotency
    WHERE idempotency_key = ${createStoreKey(formId, normalizedKey)}
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    formId: row.form_id,
    idempotencyKey: row.idempotency_key,
    status: row.status_code,
    responseBody: row.response_body,
    mode: "database",
  };
}

export async function storeIdempotencyResponse(
  formId: string,
  idempotencyKey: string | null,
  status: number,
  responseBody: Record<string, unknown>,
) {
  if (!idempotencyKey) {
    return;
  }

  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  if (!normalizedKey) {
    return;
  }

  const key = createStoreKey(formId, normalizedKey);
  const sql = getFormsSqlClient();

  if (!sql) {
    if (!memoryStore.has(key)) {
      memoryStore.set(key, {
        status,
        responseBody,
      });
    }

    return;
  }

  await ensureSchema();

  await sql`
    INSERT INTO foundation_form_idempotency (
      idempotency_key,
      form_id,
      status_code,
      response_body
    )
    VALUES (
      ${key},
      ${formId},
      ${status},
      ${sql.json(responseBody as never)}
    )
    ON CONFLICT (idempotency_key)
    DO NOTHING
  `;
}

export function resetIdempotencyForTests() {
  memoryStore.clear();
  schemaEnsured = false;
}
