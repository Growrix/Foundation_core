import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: { input?: { Key?: string } }) => {
    const key = command.input?.Key ?? "asset.bin";
    return `https://signed.example.com/${key}?X-Amz-Signature=mock`;
  }),
}));

import { getAdapterStatus, getRuntimeEnv, resetRuntimeEnvForTests } from "@/server/config/env";
import { getSessionSnapshot } from "@/server/modules/auth/session.service";
import { getFoundationSummary } from "@/server/modules/health/health.service";
import { createUploadIntent } from "@/server/modules/media/media.service";

const managedKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "PREVIEW_TOKEN",
  "DATABASE_URL",
  "CONTENT_SOURCE",
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SANITY_API_VERSION",
  "SANITY_API_TOKEN",
  "SANITY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "LEADS_INBOX_EMAIL",
  "LARK_WEBHOOK_URL",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_ENDPOINT",
  "S3_PUBLIC_BASE_URL",
  "S3_PRESIGN_EXPIRES_SECONDS",
  "RATE_LIMIT_WINDOW_SECONDS",
  "RATE_LIMIT_MAX_REQUESTS",
  "ANALYTICS_WRITE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
] as const;

describe("runtime env and adapter surfaces", () => {
  beforeEach(() => {
    for (const key of managedKeys) {
      delete process.env[key];
    }

    resetRuntimeEnvForTests();
  });

  it("returns safe defaults when optional adapters are missing", () => {
    const env = getRuntimeEnv();
    const adapters = getAdapterStatus();

    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://foundation-core.example.com");
    expect(adapters.auth).toBe(false);
    expect(adapters.content).toBe(false);
    expect(adapters.lark).toBe(false);
    expect(adapters.storage).toBe(false);
  });

  it("reports configured adapters when env values are present", () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    process.env.PREVIEW_TOKEN = "preview-secret-token";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/runtime";
    process.env.CONTENT_SOURCE = "sanity";
    process.env.SANITY_PROJECT_ID = "foundation-project";
    process.env.SANITY_DATASET = "production";
    process.env.SANITY_API_VERSION = "2024-01-01";
    process.env.RESEND_API_KEY = "resend-key-12345";
    process.env.EMAIL_FROM = "ops@example.com";
    process.env.LEADS_INBOX_EMAIL = "leads@example.com";
    process.env.LARK_WEBHOOK_URL = "https://open.larksuite.com/webhook/mock";
    process.env.S3_BUCKET = "foundation-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key-123";
    process.env.ANALYTICS_WRITE_KEY = "analytics-key";
    process.env.STRIPE_SECRET_KEY = "sk_test_1234567890";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_1234567890";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_1234567890";
    resetRuntimeEnvForTests();

    const adapters = getAdapterStatus();

    expect(adapters.auth).toBe(true);
    expect(adapters.preview).toBe(true);
    expect(adapters.database).toBe(true);
    expect(adapters.content).toBe(true);
    expect(adapters.email).toBe(true);
    expect(adapters.storage).toBe(true);
    expect(adapters.lark).toBe(true);
    expect(adapters.analytics).toBe(true);
    expect(adapters.billing).toBe(true);
  });

  it("keeps the session in anonymous fallback mode until auth is configured", () => {
    expect(getSessionSnapshot().mode).toBe("anonymous_fallback");
  });

  it("reports production-capable status when all required adapters are configured", () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    process.env.PREVIEW_TOKEN = "preview-secret-token";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/runtime";
    process.env.CONTENT_SOURCE = "sanity";
    process.env.SANITY_PROJECT_ID = "foundation-project";
    process.env.SANITY_DATASET = "production";
    process.env.SANITY_API_VERSION = "2024-01-01";
    process.env.RESEND_API_KEY = "resend-key-12345";
    process.env.EMAIL_FROM = "ops@example.com";
    process.env.LEADS_INBOX_EMAIL = "leads@example.com";
    process.env.LARK_WEBHOOK_URL = "https://open.larksuite.com/webhook/mock";
    process.env.S3_BUCKET = "foundation-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key-123";
    resetRuntimeEnvForTests();

    expect(getFoundationSummary().status).toBe("production-capable");
  });

  it("creates enabled upload intents when storage is configured", async () => {
    process.env.S3_BUCKET = "foundation-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key-123";
    resetRuntimeEnvForTests();

    const intent = await createUploadIntent("hero.jpg", "image/jpeg");
    expect(intent.enabled).toBe(true);
    if (intent.enabled) {
      expect(intent.uploadUrl).toContain("hero.jpg");
    }
  });

  it("returns disabled upload intents when storage is missing", async () => {
    const intent = await createUploadIntent("hero.jpg", "image/jpeg");
    expect(intent.enabled).toBe(false);
  });
});