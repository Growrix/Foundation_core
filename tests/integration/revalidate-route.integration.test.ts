import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { POST as revalidateRoute } from "@/app/api/content/revalidate/route";
import { resetRuntimeEnvForTests } from "@/server/config/env";
import { createRevalidationSignature } from "@/server/modules/content/revalidation.service";

describe("content revalidate route", () => {
  beforeEach(() => {
    delete process.env.SANITY_WEBHOOK_SECRET;
    delete process.env.LARK_WEBHOOK_URL;
    resetRuntimeEnvForTests();
    revalidatePathMock.mockReset();
  });

  it("returns 503 when revalidation secret is not configured", async () => {
    const response = await revalidateRoute(
      new Request("http://localhost/api/content/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "content.published", slug: "home" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("REVALIDATION_NOT_CONFIGURED");
  });

  it("returns 400 when the webhook signature is invalid", async () => {
    process.env.SANITY_WEBHOOK_SECRET = "super-secret-webhook-token";
    resetRuntimeEnvForTests();

    const response = await revalidateRoute(
      new Request("http://localhost/api/content/revalidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-foundation-signature": "invalid",
        },
        body: JSON.stringify({ event: "content.published", slug: "home" }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("REVALIDATION_SIGNATURE_INVALID");
  });

  it("accepts valid signatures and triggers path revalidation", async () => {
    process.env.SANITY_WEBHOOK_SECRET = "super-secret-webhook-token";
    resetRuntimeEnvForTests();

    const payload = JSON.stringify({ event: "content.published", slug: "home", path: "/" });
    const signature = createRevalidationSignature(payload, process.env.SANITY_WEBHOOK_SECRET);

    const response = await revalidateRoute(
      new Request("http://localhost/api/content/revalidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-foundation-signature": signature,
        },
        body: payload,
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.data.accepted).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("ignores unsupported events with accepted=false", async () => {
    process.env.SANITY_WEBHOOK_SECRET = "super-secret-webhook-token";
    resetRuntimeEnvForTests();

    const payload = JSON.stringify({ event: "content.archived", slug: "home" });
    const signature = createRevalidationSignature(payload, process.env.SANITY_WEBHOOK_SECRET);

    const response = await revalidateRoute(
      new Request("http://localhost/api/content/revalidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-foundation-signature": signature,
        },
        body: payload,
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.data.accepted).toBe(false);
    expect(body.data.ignored).toBe(true);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
