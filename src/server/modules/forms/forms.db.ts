import postgres from "postgres";

import { getRuntimeEnv } from "@/server/config/env";

let sqlClient: postgres.Sql | null = null;

export function getFormsSqlClient() {
  const env = getRuntimeEnv();

  if (!env.DATABASE_URL) {
    return null;
  }

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

export async function resetFormsDbForTests() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 1 });
  }

  sqlClient = null;
}
