import { getRuntimeEnv } from "@/server/config/env";
import {
  parseCollectionRecord,
  parsePageDto,
  parseSiteConfig,
} from "@/server/modules/content/cms.contract";
import {
  collectionFixtures,
  pageFixtures,
  siteConfigFixture,
} from "@/server/modules/content/content.fixtures";
import {
  fetchSanityCollection,
  fetchSanityPageBySlug,
  fetchSanitySiteConfig,
} from "@/server/modules/content/sanity.client";
import type { CollectionRecord, PageDto, SiteConfigDto } from "@/server/modules/content/content.types";

export async function getPageBySlug(slug: string): Promise<PageDto | null> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    const page = await fetchSanityPageBySlug(slug);
    return page ? (parsePageDto(page) as PageDto) : null;
  }

  const page = pageFixtures[slug];
  return page ? (parsePageDto(page) as PageDto) : null;
}

export async function getCollection(name: string): Promise<CollectionRecord[]> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    const records = await fetchSanityCollection(name);
    return records.map((record) => parseCollectionRecord(record) as CollectionRecord);
  }

  return (collectionFixtures[name] ?? []).map((record) => parseCollectionRecord(record) as CollectionRecord);
}

export async function getSiteConfig(): Promise<SiteConfigDto> {
  const env = getRuntimeEnv();

  if (env.CONTENT_SOURCE === "sanity") {
    const config = await fetchSanitySiteConfig();

    if (!config) {
      throw new Error("Sanity content source is enabled, but siteConfig document is missing.");
    }

    return parseSiteConfig(config) as SiteConfigDto;
  }

  return parseSiteConfig(siteConfigFixture) as SiteConfigDto;
}