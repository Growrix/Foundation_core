import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, fetchMock } = vi.hoisted(() => {
  const fetch = vi.fn();
  const createClient = vi.fn(() => ({
    fetch,
  }));

  return {
    createClientMock: createClient,
    fetchMock: fetch,
  };
});

vi.mock("@sanity/client", () => ({
  createClient: createClientMock,
}));

const managedKeys = [
  "CONTENT_SOURCE",
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SANITY_API_VERSION",
  "SANITY_API_TOKEN",
] as const;

async function resetRuntimeEnvCache() {
  const env = await import("@/server/config/env");
  env.resetRuntimeEnvForTests();
}

describe("sanity client", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    createClientMock.mockClear();

    for (const key of managedKeys) {
      delete process.env[key];
    }

    await resetRuntimeEnvCache();
  });

  it("throws when required Sanity settings are missing", async () => {
    process.env.CONTENT_SOURCE = "sanity";
    await resetRuntimeEnvCache();

    const sanity = await import("@/server/modules/content/sanity.client");
    await expect(sanity.fetchSanityPageBySlug("home")).rejects.toThrow(
      "Sanity content source is selected",
    );
  });

  it("maps page and collection payloads from Sanity", async () => {
    process.env.CONTENT_SOURCE = "sanity";
    process.env.SANITY_PROJECT_ID = "foundation-project";
    process.env.SANITY_DATASET = "production";
    process.env.SANITY_API_VERSION = "2024-01-01";
    await resetRuntimeEnvCache();

    fetchMock
      .mockResolvedValueOnce({
        slug: "home",
        title: "Home",
        description: "desc",
        updatedAt: "2026-05-16T00:00:00.000Z",
        sections: [
          {
            _key: "hero-1",
            _type: "hero",
            title: "Hero",
            body: "Body",
          },
        ],
      })
      .mockResolvedValueOnce([
        {
          _id: "service-1",
          title: "Service",
          summary: "Summary",
        },
      ]);

    const sanity = await import("@/server/modules/content/sanity.client");
    const page = await sanity.fetchSanityPageBySlug("home");
    const collection = await sanity.fetchSanityCollection("services");

    expect(page?.slug).toBe("home");
    expect(page?.sections[0].kind).toBe("hero");
    expect(collection[0].id).toBe("service-1");
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("maps site config payloads with defaults", async () => {
    process.env.CONTENT_SOURCE = "sanity";
    process.env.SANITY_PROJECT_ID = "foundation-project";
    process.env.SANITY_DATASET = "production";
    process.env.SANITY_API_VERSION = "2024-01-01";
    await resetRuntimeEnvCache();

    fetchMock.mockResolvedValueOnce({
      brand: {
        name: "Foundation Core",
        supportEmail: "ops@example.com",
      },
      navigation: [{ label: "Platform", href: "/" }],
      footer: {
        attribution: {
          enabled: true,
          text: "Built and maintenance by",
          linkText: "Growrix OS",
          url: "https://www.growrixos.com",
        },
      },
    });

    const sanity = await import("@/server/modules/content/sanity.client");
    const config = await sanity.fetchSanitySiteConfig();

    expect(config?.brand.name).toBe("Foundation Core");
    expect(config?.navigation.length).toBe(1);
    expect(config?.footer.attribution.url).toContain("growrixos.com");
  });
});
