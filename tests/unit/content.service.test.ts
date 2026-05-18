import { describe, expect, it } from "vitest";

import { getCollection, getPageBySlug, getSiteConfig } from "@/server/modules/content/content.service";

describe("content service", () => {
  it("returns the home page DTO", async () => {
    const page = await getPageBySlug("home");
    expect(page?.slug).toBe("home");
    expect(page?.sections.length).toBeGreaterThan(2);
  });

  it("returns empty arrays for unknown collections", async () => {
    await expect(getCollection("missing")).resolves.toEqual([]);
  });

  it("exposes footer attribution in the site config", async () => {
    const config = await getSiteConfig();
    expect(config.footer.attribution.enabled).toBe(true);
    expect(config.footer.attribution.url).toContain("growrixos.com");
  });
});