import crypto from "node:crypto";

import { z } from "zod";

import { normalizeSlug } from "@/server/modules/content/cms.contract";

const revalidationPayloadSchema = z.object({
  event: z.string().min(1),
  slug: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  collection: z.string().min(1).optional(),
}).strip();

const supportedRevalidationEvents = new Set(["content.published"]);

export type RevalidationPayload = z.infer<typeof revalidationPayloadSchema>;

function normalizePath(pathValue: string) {
  const withoutQuery = pathValue.split("?")[0]?.split("#")[0] ?? "";
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function parseRevalidationPayload(rawBody: string): RevalidationPayload {
  const parsedBody = JSON.parse(rawBody) as unknown;
  return revalidationPayloadSchema.parse(parsedBody);
}

export function isSupportedRevalidationEvent(eventName: string) {
  return supportedRevalidationEvents.has(eventName);
}

export function getSupportedRevalidationEvents() {
  return Array.from(supportedRevalidationEvents);
}

function normalizeSignature(signature: string) {
  return signature.trim().replace(/^sha256=/i, "").toLowerCase();
}

export function createRevalidationSignature(rawBody: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function validateRevalidationSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader) {
    return false;
  }

  const expected = createRevalidationSignature(rawBody, secret);
  const provided = normalizeSignature(signatureHeader);

  // Compare signatures in constant-time to avoid timing side channels.
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function getRevalidationPaths(payload: RevalidationPayload) {
  const paths = new Set<string>(["/"]);

  if (payload.path) {
    paths.add(normalizePath(payload.path));
  }

  if (payload.slug) {
    const normalizedSlug = normalizeSlug(payload.slug);
    paths.add(normalizedSlug === "home" ? "/" : `/${normalizedSlug}`);
  }

  if (payload.collection) {
    const normalizedCollection = normalizeSlug(payload.collection);
    paths.add(`/collections/${normalizedCollection}`);
  }

  paths.add("/preview");

  return Array.from(paths);
}
