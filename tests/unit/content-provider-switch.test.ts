import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCollectionMock, fetchPageMock, fetchSiteConfigMock } = vi.hoisted(() => ({
  fetchPageMock: vi.fn(),
  fetchCollectionMock: vi.fn(),
  fetchSiteConfigMock: vi.fn(),
}));

vi.mock("@/server/modules/content/sanity.client", () => ({
  fetchSanityPageBySlug: fetchPageMock,
  fetchSanityCollection: fetchCollectionMock,
  fetchSanitySiteConfig: fetchSiteConfigMock,
}));

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { getCollection, getPageBySlug, getSiteConfig } from "@/server/modules/content/content.service";

describe("content service provider switching", () => {
  beforeEach(() => {
    delete process.env.CONTENT_SOURCE;
    resetRuntimeEnvForTests();

    fetchPageMock.mockReset();
    fetchCollectionMock.mockReset();
    fetchSiteConfigMock.mockReset();
  });

  it("delegates content reads to Sanity when CONTENT_SOURCE is sanity", async () => {
    process.env.CONTENT_SOURCE = "sanity";
    resetRuntimeEnvForTests();

    fetchPageMock.mockResolvedValueOnce({
      slug: "home",
      title: "Home",
      description: "desc",
      updatedAt: "2026-05-16T00:00:00.000Z",
      sections: [],
    });
    fetchCollectionMock.mockResolvedValueOnce([{ id: "service-1", title: "A", summary: "B" }]);
    fetchSiteConfigMock.mockResolvedValueOnce({
      brand: { name: "Foundation Core", supportEmail: "ops@example.com" },
      navigation: [],
      footer: {
        attribution: {
          enabled: true,
          text: "Built and maintenance by",
          linkText: "Growrix OS",
          url: "https://www.growrixos.com",
        },
      },
    });

    const page = await getPageBySlug("home");
    const collection = await getCollection("services");
    const config = await getSiteConfig();

    expect(page?.slug).toBe("home");
    expect(collection[0].id).toBe("service-1");
    expect(config.brand.name).toBe("Foundation Core");
  });

  it("throws when sanity site config is missing", async () => {
    process.env.CONTENT_SOURCE = "sanity";
    resetRuntimeEnvForTests();

    fetchSiteConfigMock.mockResolvedValueOnce(null);

    await expect(getSiteConfig()).rejects.toThrow("siteConfig document is missing");
  });
});
