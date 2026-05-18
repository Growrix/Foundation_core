import type { CmsDocumentType } from "@/server/modules/content/cms.contract";

export const foundationSanitySchemaVersion = "2026-05-18";

type SanityField = {
  name: string;
  type: string;
  required: boolean;
};

type SanityDocumentSchema = {
  documentType: CmsDocumentType;
  sanityType: string;
  fields: SanityField[];
};

export const foundationSanitySchemaRegistry: {
  version: string;
  slugInvariant: string;
  documents: SanityDocumentSchema[];
} = {
  version: foundationSanitySchemaVersion,
  slugInvariant: "lowercase-kebab-case",
  documents: [
    {
      documentType: "page",
      sanityType: "page",
      fields: [
        { name: "slug", type: "slug", required: true },
        { name: "title", type: "string", required: true },
        { name: "description", type: "text", required: false },
        { name: "sections", type: "array", required: false },
      ],
    },
    {
      documentType: "collection",
      sanityType: "collectionItem",
      fields: [
        { name: "collection", type: "string", required: true },
        { name: "title", type: "string", required: true },
        { name: "summary", type: "text", required: false },
      ],
    },
    {
      documentType: "siteConfig",
      sanityType: "siteConfig",
      fields: [
        { name: "brand", type: "object", required: true },
        { name: "navigation", type: "array", required: false },
        { name: "footer", type: "object", required: false },
      ],
    },
  ],
};
