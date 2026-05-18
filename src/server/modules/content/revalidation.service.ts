import crypto from "node:crypto";

import { z } from "zod";

const revalidationPayloadSchema = z.object({
  event: z.string().min(1),
  slug: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  collection: z.string().min(1).optional(),
});

export type RevalidationPayload = z.infer<typeof revalidationPayloadSchema>;

export function parseRevalidationPayload(rawBody: string): RevalidationPayload {
  const parsedBody = JSON.parse(rawBody) as unknown;
  return revalidationPayloadSchema.parse(parsedBody);
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
    paths.add(payload.path.startsWith("/") ? payload.path : `/${payload.path}`);
  }

  if (payload.slug) {
    paths.add(payload.slug === "home" ? "/" : `/${payload.slug}`);
  }

  paths.add("/preview");

  return Array.from(paths);
}
