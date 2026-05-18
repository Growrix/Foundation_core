import { describe, expect, it } from "vitest";

import {
  foundationSanitySchemaRegistry,
  foundationSanitySchemaVersion,
} from "@/server/modules/content/sanity.schema-registry";

describe("sanity schema registry", () => {
  it("exposes a versioned schema registry for page, collection, and site config", () => {
    expect(foundationSanitySchemaRegistry.version).toBe(foundationSanitySchemaVersion);

    const documentTypes = foundationSanitySchemaRegistry.documents.map((document) => document.documentType);

    expect(documentTypes).toContain("page");
    expect(documentTypes).toContain("collection");
    expect(documentTypes).toContain("siteConfig");
  });
});
