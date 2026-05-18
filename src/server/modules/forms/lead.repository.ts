import { getFormsSqlClient, resetFormsDbForTests } from "@/server/modules/forms/forms.db";
import type { SubmissionPayload } from "@/server/modules/forms/form.service";

export type LeadPersistenceResult = {
  persisted: boolean;
  mode: "database" | "disabled";
  leadId: number | null;
};

export type PersistLeadInput = {
  formId: string;
  payload: SubmissionPayload;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

let schemaEnsured = false;

async function ensureSchema() {
  const sql = getFormsSqlClient();

  if (!sql) {
    return;
  }

  if (schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_leads (
      id BIGSERIAL PRIMARY KEY,
      form_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NULL,
      message TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
}

export async function persistLeadSubmission(input: PersistLeadInput): Promise<LeadPersistenceResult> {
  const sql = getFormsSqlClient();

  if (!sql) {
    return {
      persisted: false,
      mode: "disabled",
      leadId: null,
    };
  }

  await ensureSchema();

  const rows = await sql<{ id: number }[]>`
    INSERT INTO foundation_leads (
      form_id,
      name,
      email,
      phone,
      message,
      metadata
    )
    VALUES (
      ${input.formId},
      ${input.payload.name},
      ${input.payload.email},
      ${input.payload.phone ?? null},
      ${input.payload.message},
      ${sql.json({
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })}
    )
    RETURNING id
  `;

  return {
    persisted: true,
    mode: "database",
    leadId: rows[0]?.id ?? null,
  };
}

export async function resetLeadRepositoryForTests() {
  await resetFormsDbForTests();
  schemaEnsured = false;
}
