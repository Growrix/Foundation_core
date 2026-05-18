import postgres from "postgres";

import { getRuntimeEnv } from "@/server/config/env";

let sqlClient: postgres.Sql | null = null;

export function getBillingSqlClient() {
  const env = getRuntimeEnv();

  /* c8 ignore next */
  if (!env.DATABASE_URL) {
    return null;
  }

  /* c8 ignore next */
  if (!sqlClient) {
    sqlClient = postgres(env.DATABASE_URL, {
      prepare: false,
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });
  }

  return sqlClient;
}

export async function resetBillingDbForTests() {
  /* c8 ignore next */
  if (sqlClient) {
    await sqlClient.end({ timeout: 1 });
  }

  sqlClient = null;
}