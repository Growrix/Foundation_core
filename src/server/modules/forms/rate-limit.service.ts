import { getRuntimeEnv } from "@/server/config/env";
import { getFormsSqlClient } from "@/server/modules/forms/forms.db";

type RateLimitState = {
  count: number;
  windowStartedAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  mode: "memory" | "database";
};

const rateLimitState = new Map<string, RateLimitState>();
let schemaEnsured = false;

async function ensureSchema() {
  const sql = getFormsSqlClient();

  if (!sql || schemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS foundation_form_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      request_count INT NOT NULL,
      window_started_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  schemaEnsured = true;
}

function consumeMemoryRateLimit(
  bucketKey: string,
  now: number,
  windowMs: number,
  maxRequests: number,
): RateLimitDecision {
  const existing = rateLimitState.get(bucketKey);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    rateLimitState.set(bucketKey, {
      count: 1,
      windowStartedAt: now,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      mode: "memory",
    };
  }

  if (existing.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - existing.windowStartedAt)) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      mode: "memory",
    };
  }

  existing.count += 1;
  rateLimitState.set(bucketKey, existing);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    mode: "memory",
  };
}

async function consumeDatabaseRateLimit(
  bucketKey: string,
  now: Date,
  windowMs: number,
  maxRequests: number,
): Promise<RateLimitDecision> {
  const sql = getFormsSqlClient();

  if (!sql) {
    return consumeMemoryRateLimit(bucketKey, now.getTime(), windowMs, maxRequests);
  }

  await ensureSchema();

  const rows = await sql<{ window_started_at: Date; request_count: number }[]>`
    SELECT window_started_at, request_count
    FROM foundation_form_rate_limits
    WHERE bucket_key = ${bucketKey}
    LIMIT 1
  `;

  const existing = rows[0];

  if (!existing) {
    await sql`
      INSERT INTO foundation_form_rate_limits (
        bucket_key,
        request_count,
        window_started_at,
        updated_at
      )
      VALUES (
        ${bucketKey},
        1,
        ${now.toISOString()},
        ${now.toISOString()}
      )
      ON CONFLICT (bucket_key)
      DO UPDATE
      SET request_count = foundation_form_rate_limits.request_count + 1,
          updated_at = EXCLUDED.updated_at
    `;

    return {
      allowed: true,
      retryAfterSeconds: 0,
      mode: "database",
    };
  }

  const elapsedMs = now.getTime() - existing.window_started_at.getTime();

  if (elapsedMs >= windowMs) {
    await sql`
      UPDATE foundation_form_rate_limits
      SET request_count = 1,
          window_started_at = ${now.toISOString()},
          updated_at = ${now.toISOString()}
      WHERE bucket_key = ${bucketKey}
    `;

    return {
      allowed: true,
      retryAfterSeconds: 0,
      mode: "database",
    };
  }

  if (existing.request_count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));

    return {
      allowed: false,
      retryAfterSeconds,
      mode: "database",
    };
  }

  await sql`
    UPDATE foundation_form_rate_limits
    SET request_count = request_count + 1,
        updated_at = ${now.toISOString()}
    WHERE bucket_key = ${bucketKey}
  `;

  return {
    allowed: true,
    retryAfterSeconds: 0,
    mode: "database",
  };
}

export async function consumeSubmissionRateLimit(bucketKey: string): Promise<RateLimitDecision> {
  const env = getRuntimeEnv();
  const now = new Date();
  const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

  try {
    return await consumeDatabaseRateLimit(bucketKey, now, windowMs, maxRequests);
  } catch {
    return consumeMemoryRateLimit(bucketKey, now.getTime(), windowMs, maxRequests);
  }
}

export function resetRateLimitForTests() {
  rateLimitState.clear();
  schemaEnsured = false;
}
