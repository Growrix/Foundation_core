import { createClient, type SanityClient } from "@sanity/client";

import { getRuntimeEnv } from "@/server/config/env";
import {
  normalizeSlug,
  parseCollectionRecord,
  parsePageDto,
  parseSiteConfig,
} from "@/server/modules/content/cms.contract";
import type {
  CollectionRecord,
  PageDto,
  PageSection,
  SiteConfigDto,
} from "@/server/modules/content/content.types";

let cachedClient: SanityClient | null = null;

function getSanityClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getRuntimeEnv();

  if (!env.SANITY_PROJECT_ID || !env.SANITY_DATASET) {
    throw new Error("Sanity content source is selected, but SANITY_PROJECT_ID or SANITY_DATASET is missing.");
  }

  cachedClient = createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: env.SANITY_API_VERSION,
    token: env.SANITY_API_TOKEN,
    useCdn: false,
    perspective: "published",
  });

  return cachedClient;
}

function mapSection(section: Record<string, unknown>, index: number): PageSection {
  const kindFromType = typeof section._type === "string" ? section._type : "value";
  const normalizedKind: PageSection["kind"] = ["hero", "value", "proof", "conversion", "footer"].includes(kindFromType)
    ? (kindFromType as PageSection["kind"])
    : "value";

  return {
    id: typeof section._key === "string" ? section._key : `section-${index + 1}`,
    kind: normalizedKind,
    title: typeof section.title === "string" ? section.title : "",
    body: typeof section.body === "string" ? section.body : "",
  };
}

export async function fetchSanityPageBySlug(slug: string): Promise<PageDto | null> {
  const client = getSanityClient();
  const normalizedSlug = normalizeSlug(slug);

  const page = await client.fetch<Record<string, unknown> | null>(
    `*[_type == "page" && slug.current == $slug][0]{
      "slug": slug.current,
      title,
      description,
      "updatedAt": coalesce(_updatedAt, _createdAt),
      sections[]{
        _key,
        _type,
        title,
        body
      }
    }`,
    { slug: normalizedSlug },
  );

  if (!page) {
    return null;
  }

  const rawSections = Array.isArray(page.sections) ? page.sections : [];

  return parsePageDto({
    slug: typeof page.slug === "string" ? page.slug : normalizedSlug,
    title: typeof page.title === "string" ? page.title : "Untitled page",
    description: typeof page.description === "string" ? page.description : "",
    updatedAt: typeof page.updatedAt === "string" ? page.updatedAt : new Date().toISOString(),
    sections: rawSections.map((section, index) => mapSection(section as Record<string, unknown>, index)),
  }) as PageDto;
}

export async function fetchSanityCollection(name: string): Promise<CollectionRecord[]> {
  const client = getSanityClient();

  const records = await client.fetch<Array<Record<string, unknown>>>(
    `*[_type == $collection][0...50]{
      _id,
      title,
      summary,
      excerpt
    }`,
    { collection: name },
  );

  return records.map((record, index) =>
    parseCollectionRecord({
      id:
        (typeof record._id === "string" && record._id) ||
        `${name}-${index + 1}`,
      title: typeof record.title === "string" ? record.title : "Untitled",
      summary:
        typeof record.summary === "string"
          ? record.summary
          : typeof record.excerpt === "string"
            ? record.excerpt
            : "",
    }) as CollectionRecord,
  );
}

export async function fetchSanitySiteConfig(): Promise<SiteConfigDto | null> {
  const client = getSanityClient();

  const config = await client.fetch<Record<string, unknown> | null>(
    `*[_type == "siteConfig"][0]{
      brand,
      navigation,
      footer
    }`,
  );

  if (!config) {
    return null;
  }

  const brand = (config.brand as Record<string, unknown> | undefined) ?? {};
  const footer = (config.footer as Record<string, unknown> | undefined) ?? {};
  const attribution = (footer.attribution as Record<string, unknown> | undefined) ?? {};

  return parseSiteConfig({
    brand: {
      name: typeof brand.name === "string" ? brand.name : "Foundation Core",
      supportEmail: typeof brand.supportEmail === "string" ? brand.supportEmail : "ops@example.com",
    },
    navigation: Array.isArray(config.navigation)
      ? config.navigation
          .map((item) => item as Record<string, unknown>)
          .filter((item) => typeof item.label === "string" && typeof item.href === "string")
          .map((item) => ({
            label: String(item.label),
            href: String(item.href),
          }))
      : [],
    footer: {
      attribution: {
        enabled: typeof attribution.enabled === "boolean" ? attribution.enabled : true,
        text: typeof attribution.text === "string" ? attribution.text : "Built and maintenance by",
        linkText: typeof attribution.linkText === "string" ? attribution.linkText : "Growrix OS",
        url: typeof attribution.url === "string" ? attribution.url : "https://www.growrixos.com",
      },
    },
  }) as SiteConfigDto;
}
