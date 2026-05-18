import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getAdapterStatus, getRuntimeEnv } from "@/server/config/env";

let cachedS3Client: S3Client | null = null;

function toSafeFilename(filename: string) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getS3Client() {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const env = getRuntimeEnv();

  if (!env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 adapter is missing required credentials.");
  }

  cachedS3Client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });

  return cachedS3Client;
}

export async function createUploadIntent(filename: string, contentType: string) {
  const adapters = getAdapterStatus();
  const env = getRuntimeEnv();

  if (!adapters.storage) {
    return {
      enabled: false,
      reason: "Storage adapter is not configured.",
      filename,
      contentType,
    } as const;
  }

  const safeFilename = toSafeFilename(filename) || "asset.bin";
  const objectKey = `foundation/${Date.now()}-${safeFilename}`;
  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: env.S3_PRESIGN_EXPIRES_SECONDS,
  });

  return {
    enabled: true,
    filename: safeFilename,
    objectKey,
    contentType,
    uploadUrl,
    assetUrl: env.S3_PUBLIC_BASE_URL
      ? `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${objectKey}`
      : null,
    method: "PUT",
  } as const;
}

export function resetMediaServiceForTests() {
  cachedS3Client = null;
}