import seedSource from "@/server/modules/content/content.seed.json";
import {
  parseCollectionRecord,
  parsePageDto,
  parseSiteConfig,
} from "@/server/modules/content/cms.contract";
import type {
  CollectionRecord,
  PageDto,
  SiteConfigDto,
} from "@/server/modules/content/content.types";

type FixtureSeedSource = {
  schemaVersion: string;
  pages: PageDto[];
  collections: Record<string, CollectionRecord[]>;
  siteConfig: SiteConfigDto;
};

const typedSeedSource = seedSource as FixtureSeedSource;

export const fixtureSeedVersion = typedSeedSource.schemaVersion;

export const pageFixtures: Record<string, PageDto> = Object.fromEntries(
  typedSeedSource.pages.map((page) => {
    const parsed = parsePageDto(page) as PageDto;
    return [parsed.slug, parsed];
  }),
);

export const collectionFixtures: Record<string, CollectionRecord[]> = Object.fromEntries(
  Object.entries(typedSeedSource.collections).map(([collectionName, records]) => [
    collectionName,
    records.map((record) => parseCollectionRecord(record) as CollectionRecord),
  ]),
);

export const siteConfigFixture = parseSiteConfig(typedSeedSource.siteConfig) as SiteConfigDto;