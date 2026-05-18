import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createClient } from "@sanity/client";

const runtimeRoot = process.cwd();
const seedFilePath = path.resolve(runtimeRoot, "src", "server", "modules", "content", "content.seed.json");
const dryRun = process.argv.includes("--dry-run");

function normalizeSlug(rawSlug) {
  return String(rawSlug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadSeedSource() {
  const raw = await fs.readFile(seedFilePath, "utf8");
  return JSON.parse(raw);
}

function buildSeedDocuments(seedSource) {
  const pageDocuments = seedSource.pages.map((page) => ({
    _id: `foundation-page-${normalizeSlug(page.slug)}`,
    _type: "page",
    slug: {
      _type: "slug",
      current: normalizeSlug(page.slug),
    },
    title: page.title,
    description: page.description,
    sections: page.sections.map((section) => ({
      _key: section.id,
      _type: section.kind,
      title: section.title,
      body: section.body,
    })),
  }));

  const collectionDocuments = Object.entries(seedSource.collections).flatMap(([collection, records]) =>
    records.map((record) => ({
      _id: `foundation-collection-${normalizeSlug(collection)}-${normalizeSlug(record.id)}`,
      _type: "collectionItem",
      collection,
      title: record.title,
      summary: record.summary,
    })),
  );

  const siteConfigDocument = {
    _id: "foundation-site-config",
    _type: "siteConfig",
    ...seedSource.siteConfig,
  };

  return [...pageDocuments, ...collectionDocuments, siteConfigDocument];
}

function createSanitySeedClient() {
  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET;
  const token = process.env.SANITY_API_TOKEN;
  const apiVersion = process.env.SANITY_API_VERSION ?? "2024-01-01";

  if (!projectId || !dataset || !token) {
    throw new Error(
      "MISSING_KNOWLEDGE: SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_API_TOKEN are required for provider-backed seeding.",
    );
  }

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion,
    useCdn: false,
  });
}

async function upsertSeedDocuments(documents) {
  const client = createSanitySeedClient();

  for (const document of documents) {
    await client.createOrReplace(document);
  }
}

async function main() {
  const seedSource = await loadSeedSource();
  const documents = buildSeedDocuments(seedSource);

  const summary = {
    schemaVersion: seedSource.schemaVersion,
    totalDocuments: documents.length,
    pages: seedSource.pages.length,
    collections: Object.keys(seedSource.collections).length,
    mode: dryRun ? "dry-run" : "upsert",
    ids: documents.map((document) => document._id),
  };

  if (!dryRun) {
    await upsertSeedDocuments(documents);
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
