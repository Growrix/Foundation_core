import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSlug(rawSlug: string) {
  return rawSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const cmsSlugSchema = z
  .string()
  .min(1)
  .transform((value) => normalizeSlug(value))
  .refine((value) => slugRegex.test(value), "Slug must be lowercase kebab-case.");

export const pageSectionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["hero", "value", "proof", "conversion", "footer"]),
  title: z.string().min(1),
  body: z.string(),
});

export const pageDtoSchema = z.object({
  slug: cmsSlugSchema,
  title: z.string().min(1),
  description: z.string(),
  updatedAt: z.string().datetime(),
  sections: z.array(pageSectionSchema),
});

export const collectionRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
});

export const siteConfigSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    supportEmail: z.email(),
  }),
  navigation: z.array(
    z.object({
      label: z.string().min(1),
      href: z.string().min(1),
    }),
  ),
  footer: z.object({
    attribution: z.object({
      enabled: z.boolean(),
      text: z.string().min(1),
      linkText: z.string().min(1),
      url: z.url(),
    }),
  }),
});

export type CmsDocumentType = "page" | "collection" | "siteConfig";

export type CmsPageDto = z.infer<typeof pageDtoSchema>;
export type CmsCollectionRecord = z.infer<typeof collectionRecordSchema>;
export type CmsSiteConfig = z.infer<typeof siteConfigSchema>;

export function parsePageDto(input: unknown) {
  return pageDtoSchema.parse(input);
}

export function parseCollectionRecord(input: unknown) {
  return collectionRecordSchema.parse(input);
}

export function parseSiteConfig(input: unknown) {
  return siteConfigSchema.parse(input);
}
