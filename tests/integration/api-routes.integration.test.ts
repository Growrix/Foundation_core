import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { GET as getCollection } from "@/app/api/content/collections/[collection]/route";
import { GET as getPage } from "@/app/api/content/pages/[slug]/route";
import { GET as getSiteConfig } from "@/app/api/content/site-config/route";
import { POST as submitFormRoute } from "@/app/api/forms/[formId]/submit/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as createUploadRoute } from "@/app/api/media/upload/route";
import { POST as enablePreviewRoute } from "@/app/api/preview/enable/route";
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
  "BILLING_PROVIDER_SECRET",
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
    const acceptedBody = await parseJson<{ accepted: boolean; formId: string }>(accepted);

    expect(accepted.status).toBe(202);
    expect(acceptedBody.ok).toBe(true);
    expect(acceptedBody.data?.accepted).toBe(true);
    expect(acceptedBody.data?.formId).toBe("contact");

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
});
