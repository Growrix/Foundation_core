import { getRuntimeEnv } from "@/server/config/env";
import { collectionFixtures, pageFixtures } from "@/server/modules/content/content.fixtures";
import {
  fetchSanityCollection,
  fetchSanityPageBySlug,
  fetchSanitySiteConfig,
} from "@/server/modules/content/sanity.client";
import type { CollectionRecord, PageDto, SiteConfigDto } from "@/server/modules/content/content.types";

function getFixtureSiteConfig(): SiteConfigDto {
  return {
    brand: {
      name: "Foundation Core",
      supportEmail: "ops@example.com",
    },
    navigation: [
      { label: "Platform", href: "/" },
      { label: "Admin", href: "/admin" },
      { label: "Preview", href: "/preview" },
    ],
    footer: {
      attribution: {
        enabled: true,
        text: "Built and maintenance by",
        linkText: "Growrix OS",
        url: "https://www.growrixos.com",
      },
    },
  };
}

export async function getPageBySlug(slug: string): Promise<PageDto | null> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    return fetchSanityPageBySlug(slug);
  }

  return pageFixtures[slug] ?? null;
}

export async function getCollection(name: string): Promise<CollectionRecord[]> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    return fetchSanityCollection(name);
  }

  return collectionFixtures[name] ?? [];
}

export async function getSiteConfig(): Promise<SiteConfigDto> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    const config = await fetchSanitySiteConfig();

    if (!config) {
      throw new Error("Sanity content source is enabled, but siteConfig document is missing.");
    }

    return config;
  }

  return getFixtureSiteConfig();
}