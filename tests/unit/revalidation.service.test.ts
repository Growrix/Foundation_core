import { describe, expect, it } from "vitest";

import {
  createRevalidationSignature,
  getRevalidationPaths,
  getSupportedRevalidationEvents,
  isSupportedRevalidationEvent,
  parseRevalidationPayload,
  validateRevalidationSignature,
} from "@/server/modules/content/revalidation.service";

describe("revalidation service", () => {
  it("validates signatures against the raw request body", () => {
    const secret = "super-secret-webhook-token";
    const rawBody = JSON.stringify({ event: "content.published", slug: "home" });
    const signature = createRevalidationSignature(rawBody, secret);

    expect(validateRevalidationSignature(rawBody, signature, secret)).toBe(true);
    expect(validateRevalidationSignature(rawBody, "invalid", secret)).toBe(false);
  });

  it("normalizes derived revalidation paths", () => {
    const payload = parseRevalidationPayload(
      JSON.stringify({
        event: "content.published",
        slug: " About Us ",
        path: "//preview/?draft=1",
        collection: " Services ",
      }),
    );

    const paths = getRevalidationPaths(payload);
    expect(paths).toContain("/");
    expect(paths).toContain("/about-us");
    expect(paths).toContain("/preview");
    expect(paths).toContain("/collections/services");
  });

  it("exposes explicit supported revalidation events", () => {
    const supportedEvents = getSupportedRevalidationEvents();

    expect(supportedEvents).toContain("content.published");
    expect(isSupportedRevalidationEvent("content.published")).toBe(true);
    expect(isSupportedRevalidationEvent("content.archived")).toBe(false);
  });
});
