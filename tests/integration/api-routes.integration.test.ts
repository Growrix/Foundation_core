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

const { enableDraftMode, draftModeMock } = vi.hoisted(() => {
  const enable = vi.fn();
  return {
    enableDraftMode: enable,
    draftModeMock: vi.fn(async () => ({ enable })),
  };
});

vi.mock("next/headers", () => ({
  draftMode: draftModeMock,
}));

import { GET as getSession } from "@/app/api/auth/session/route";
import { GET as getAdminDiagnostics } from "@/app/api/admin/diagnostics/route";
import { POST as createBillingCheckout } from "@/app/api/billing/checkout/route";
import { POST as createBillingPortal } from "@/app/api/billing/portal/route";
import { GET as getCollection } from "@/app/api/content/collections/[collection]/route";
import { GET as getPage } from "@/app/api/content/pages/[slug]/route";
import { GET as getSiteConfig } from "@/app/api/content/site-config/route";
import { GET as getDiagnostics } from "@/app/api/diagnostics/route";
import { POST as submitFormRoute } from "@/app/api/forms/[formId]/submit/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as createUploadRoute } from "@/app/api/media/upload/route";
import { POST as enablePreviewRoute } from "@/app/api/preview/enable/route";
import { POST as receiveStripeWebhook } from "@/app/api/webhooks/stripe/route";
import { resetRuntimeEnvForTests } from "@/server/config/env";
import { createSessionToken } from "@/server/modules/auth/session-token";
import { resetRateLimitStateForTests } from "@/server/modules/forms/form.service";

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

type EnvelopeResponse<T> = {
  ok: boolean;
  requestId: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

async function parseJson<T>(response: Response): Promise<EnvelopeResponse<T>> {
  return (await response.json()) as EnvelopeResponse<T>;
}

describe("Foundation Core API route integration", () => {
  beforeEach(() => {
    for (const key of managedKeys) {
      delete process.env[key];
    }

    resetRuntimeEnvForTests();
    resetRateLimitStateForTests();
    enableDraftMode.mockReset();
    draftModeMock.mockClear();
  });

  it("returns the health envelope with fallback status", async () => {
    const response = await getHealth();
    const body = await parseJson<{ status: string }>(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.status).toBe("api-ready-with-fallbacks");
  });

  it("returns diagnostics and protects admin diagnostics with role guards", async () => {
    const diagnosticsResponse = await getDiagnostics();
    const diagnosticsBody = await parseJson<{ readiness: { categorized: unknown } }>(diagnosticsResponse);

    expect(diagnosticsResponse.status).toBe(200);
    expect(diagnosticsBody.ok).toBe(true);
    expect(diagnosticsBody.data?.readiness?.categorized).toBeDefined();

    const deniedAdmin = await getAdminDiagnostics(new Request("http://localhost/api/admin/diagnostics"));
    const deniedAdminBody = await parseJson<never>(deniedAdmin);

    expect(deniedAdmin.status).toBe(401);
    expect(deniedAdminBody.ok).toBe(false);
    expect(deniedAdminBody.error?.code).toBe("AUTH_REQUIRED");

    process.env.AUTH_SECRET = "1234567890abcdef";
    resetRuntimeEnvForTests();

    const adminToken = createSessionToken(
      {
        sub: "admin-001",
        email: "admin@example.com",
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      process.env.AUTH_SECRET,
    );

    const allowedAdmin = await getAdminDiagnostics(
      new Request("http://localhost/api/admin/diagnostics", {
        headers: {
          cookie: `foundation_session=${encodeURIComponent(adminToken)}`,
        },
      }),
    );
    const allowedAdminBody = await parseJson<{ runtime: { environment: string } }>(allowedAdmin);

    expect(allowedAdmin.status).toBe(200);
    expect(allowedAdminBody.ok).toBe(true);
    expect(allowedAdminBody.data?.runtime.environment).toBeDefined();
  });

  it("returns configured auth mode when AUTH_SECRET exists", async () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    resetRuntimeEnvForTests();

    const response = await getSession(new Request("http://localhost/api/auth/session"));
    const body = await parseJson<{ mode: string }>(response);

    expect(response.status).toBe(200);
    expect(body.data?.mode).toBe("configured");
  });

  it("returns authenticated sessions when a valid signed cookie is supplied", async () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    resetRuntimeEnvForTests();

    const token = createSessionToken(
      {
        sub: "user-123",
        email: "owner@example.com",
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      process.env.AUTH_SECRET,
    );

    const response = await getSession(
      new Request("http://localhost/api/auth/session", {
        headers: {
          cookie: `foundation_session=${encodeURIComponent(token)}`,
        },
      }),
    );
    const body = await parseJson<{ authenticated: boolean; user: { email: string } }>(response);

    expect(response.status).toBe(200);
    expect(body.data?.authenticated).toBe(true);
    expect(body.data?.user?.email).toBe("owner@example.com");
  });

  it("returns a known page and a 404 for missing content", async () => {
    const found = await getPage(new Request("http://localhost/api/content/pages/home"), {
      params: Promise.resolve({ slug: "home" }),
    });
    const foundBody = await parseJson<{ slug: string }>(found);

    expect(found.status).toBe(200);
    expect(foundBody.data?.slug).toBe("home");

    const missing = await getPage(new Request("http://localhost/api/content/pages/missing"), {
      params: Promise.resolve({ slug: "missing" }),
    });
    const missingBody = await parseJson<never>(missing);

    expect(missing.status).toBe(404);
    expect(missingBody.ok).toBe(false);
    expect(missingBody.error?.code).toBe("PAGE_NOT_FOUND");
  });

  it("returns collection and site config envelopes with Growrix attribution", async () => {
    const collection = await getCollection(new Request("http://localhost/api/content/collections/services"), {
      params: Promise.resolve({ collection: "services" }),
    });
    const collectionBody = await parseJson<Array<{ id: string }>>(collection);

    expect(collection.status).toBe(200);
    expect(collectionBody.data?.length).toBeGreaterThan(0);

    const siteConfig = await getSiteConfig();
    const siteConfigBody = await parseJson<{ footer: { attribution: { url: string } } }>(siteConfig);

    expect(siteConfig.status).toBe(200);
    expect(siteConfigBody.data?.footer.attribution.url).toBe("https://www.growrixos.com");
  });

  it("accepts valid form submissions and rejects invalid payloads", async () => {
    const accepted = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Jane Doe",
          email: "jane@example.com",
          message: "Need a runtime consultation for our template stack.",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const acceptedBody = await parseJson<{
      accepted: boolean;
      formId: string;
      email: {
        delivered: boolean;
      };
    }>(accepted);

    expect(accepted.status).toBe(202);
    expect(acceptedBody.ok).toBe(true);
    expect(acceptedBody.data?.accepted).toBe(true);
    expect(acceptedBody.data?.formId).toBe("contact");
    expect(acceptedBody.data?.email?.delivered).toBe(false);

    const invalid = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const invalidBody = await parseJson<never>(invalid);

    expect(invalid.status).toBe(400);
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.error?.code).toBe("VALIDATION_ERROR");

    const honeypot = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Jane Doe",
          email: "jane@example.com",
          message: "Need a runtime consultation for our template stack.",
          website: "https://spam.example.com",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const honeypotBody = await parseJson<never>(honeypot);

    expect(honeypot.status).toBe(422);
    expect(honeypotBody.ok).toBe(false);
    expect(honeypotBody.error?.code).toBe("HONEYPOT_TRIGGERED");

    process.env.RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "60";
    resetRuntimeEnvForTests();
    resetRateLimitStateForTests();

    const rateFirst = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rate Limit User",
          email: "limit@example.com",
          message: "Need first accepted submission.",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    expect(rateFirst.status).toBe(202);

    const rateSecond = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rate Limit User",
          email: "limit@example.com",
          message: "Need second submission.",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const rateSecondBody = await parseJson<never>(rateSecond);

    expect(rateSecond.status).toBe(429);
    expect(rateSecondBody.ok).toBe(false);
    expect(rateSecondBody.error?.code).toBe("RATE_LIMITED");

    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    resetRuntimeEnvForTests();
    resetRateLimitStateForTests();

    const idempotentFirst = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-key-1",
        },
        body: JSON.stringify({
          name: "Idempotent User",
          email: "idem@example.com",
          message: "First idempotent submission.",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const idempotentFirstBody = await parseJson<{ accepted: boolean }>(idempotentFirst);

    const idempotentSecond = await submitFormRoute(
      new Request("http://localhost/api/forms/contact/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-key-1",
        },
        body: JSON.stringify({
          name: "Idempotent User",
          email: "idem@example.com",
          message: "Second request should be replayed.",
        }),
      }),
      { params: Promise.resolve({ formId: "contact" }) },
    );
    const idempotentSecondBody = await parseJson<{ accepted: boolean }>(idempotentSecond);

    expect(idempotentFirst.status).toBe(202);
    expect(idempotentSecond.status).toBe(202);
    expect(idempotentSecond.headers.get("Idempotent-Replay")).toBe("true");
    expect(idempotentSecondBody.requestId).toBe(idempotentFirstBody.requestId);
  });

  it("returns disabled upload intents without storage and enabled intents when storage is configured", async () => {
    const disabled = await createUploadRoute(
      new Request("http://localhost/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "hero.jpg", contentType: "image/jpeg" }),
      }),
    );
    const disabledBody = await parseJson<{ enabled: boolean }>(disabled);

    expect(disabled.status).toBe(503);
    expect(disabledBody.ok).toBe(true);
    expect(disabledBody.data?.enabled).toBe(false);

    process.env.S3_BUCKET = "foundation-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key-123";
    resetRuntimeEnvForTests();

    const enabled = await createUploadRoute(
      new Request("http://localhost/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "hero.jpg", contentType: "image/jpeg" }),
      }),
    );
    const enabledBody = await parseJson<{ enabled: boolean; uploadUrl: string }>(enabled);

    expect(enabled.status).toBe(200);
    expect(enabledBody.ok).toBe(true);
    expect(enabledBody.data?.enabled).toBe(true);
    expect(enabledBody.data?.uploadUrl).toContain("hero.jpg");
  });

  it("rejects preview when not configured and enables draft mode with a valid token", async () => {
    const denied = await enablePreviewRoute(
      new Request("http://localhost/api/preview/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectTo: "/preview" }),
      }),
    );
    const deniedBody = await parseJson<never>(denied);

    expect(denied.status).toBe(401);
    expect(deniedBody.ok).toBe(false);
    expect(deniedBody.error?.code).toBe("PREVIEW_NOT_CONFIGURED");

    process.env.PREVIEW_TOKEN = "preview-secret-token";
    resetRuntimeEnvForTests();

    const allowed = await enablePreviewRoute(
      new Request("http://localhost/api/preview/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "preview-secret-token", redirectTo: "/preview" }),
      }),
    );
    const allowedBody = await parseJson<{ enabled: boolean; redirectTo: string }>(allowed);

    expect(allowed.status).toBe(200);
    expect(allowedBody.ok).toBe(true);
    expect(allowedBody.data?.enabled).toBe(true);
    expect(allowedBody.data?.redirectTo).toBe("/preview");
    expect(enableDraftMode).toHaveBeenCalledTimes(1);
  });

  it("enforces billing auth and configuration fallback responses", async () => {
    const deniedCheckout = await createBillingCheckout(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_key: "starter",
          success_url: "https://example.com/success",
          cancel_url: "https://example.com/cancel",
        }),
      }),
    );
    const deniedCheckoutBody = await parseJson<never>(deniedCheckout);

    expect(deniedCheckout.status).toBe(401);
    expect(deniedCheckoutBody.ok).toBe(false);
    expect(deniedCheckoutBody.error?.code).toBe("BILLING_AUTH_REQUIRED");

    const deniedPortal = await createBillingPortal(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          return_url: "https://example.com/account",
        }),
      }),
    );
    const deniedPortalBody = await parseJson<never>(deniedPortal);

    expect(deniedPortal.status).toBe(401);
    expect(deniedPortalBody.ok).toBe(false);
    expect(deniedPortalBody.error?.code).toBe("BILLING_AUTH_REQUIRED");

    process.env.AUTH_SECRET = "1234567890abcdef";
    resetRuntimeEnvForTests();

    const token = createSessionToken(
      {
        sub: "billing-user",
        email: "billing-user@example.com",
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      process.env.AUTH_SECRET,
    );

    const configuredCheckout = await createBillingCheckout(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `foundation_session=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({
          offer_key: "starter",
          success_url: "https://example.com/success",
          cancel_url: "https://example.com/cancel",
        }),
      }),
    );
    const configuredCheckoutBody = await parseJson<never>(configuredCheckout);

    expect(configuredCheckout.status).toBe(503);
    expect(configuredCheckoutBody.ok).toBe(false);
    expect(configuredCheckoutBody.error?.code).toBe("BILLING_NOT_CONFIGURED");

    const configuredPortal = await createBillingPortal(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `foundation_session=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({
          return_url: "https://example.com/account",
        }),
      }),
    );
    const configuredPortalBody = await parseJson<never>(configuredPortal);

    expect(configuredPortal.status).toBe(503);
    expect(configuredPortalBody.ok).toBe(false);
    expect(configuredPortalBody.error?.code).toBe("BILLING_NOT_CONFIGURED");
  });

  it("returns webhook configuration failure until Stripe secrets exist", async () => {
    const response = await receiveStripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=bad",
        },
        body: JSON.stringify({ type: "invoice.paid" }),
      }),
    );
    const body = await parseJson<never>(response);

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("BILLING_NOT_CONFIGURED");
  });
});
