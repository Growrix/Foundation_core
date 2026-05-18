import { describe, expect, it } from "vitest";

import {
  normalizeSlug,
  parseCollectionRecord,
  parsePageDto,
  parseSiteConfig,
} from "@/server/modules/content/cms.contract";

describe("cms contract", () => {
  it("normalizes slugs to lowercase kebab-case", () => {
    expect(normalizeSlug("  About Us  ")).toBe("about-us");
    expect(normalizeSlug("Hello___World")).toBe("hello-world");
  });

  it("parses page DTOs with normalized slugs", () => {
    const page = parsePageDto({
      slug: " HOME ",
      title: "Home",
      description: "desc",
      updatedAt: "2026-05-16T00:00:00.000Z",
      sections: [
        {
          id: "hero",
          kind: "hero",
          title: "Hero",
          body: "Body",
        },
      ],
    });

    expect(page.slug).toBe("home");
  });

  it("parses collection and site config contracts", () => {
    const record = parseCollectionRecord({
      id: "service-1",
      title: "Service",
      summary: "Summary",
    });

    const siteConfig = parseSiteConfig({
      brand: {
        name: "Foundation Core",
        supportEmail: "ops@example.com",
      },
      navigation: [{ label: "Home", href: "/" }],
      footer: {
        attribution: {
          enabled: true,
          text: "Built and maintenance by",
          linkText: "Growrix OS",
          url: "https://www.growrixos.com",
        },
      },
    });

    expect(record.id).toBe("service-1");
    expect(siteConfig.brand.name).toBe("Foundation Core");
  });
});
