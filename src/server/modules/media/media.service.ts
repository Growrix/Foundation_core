import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

type AssetVisibility = "public" | "private";

export type MediaAssetMetadata = {
  width: number | null;
  height: number | null;
  format: string;
  aspectRatio: number | null;
  placeholder: string;
};

export type MediaAssetRecord = {
  id: string;
  objectKey: string;
  filename: string;
  contentType: string;
  visibility: AssetVisibility;
  metadata: MediaAssetMetadata;
};

function getFileFormat(filename: string, contentType: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension && extension.length > 0) {
    return extension;
  }

  return contentType.split("/")[1]?.toLowerCase() ?? "bin";
}

function createPlaceholderToken(value: string) {
  return Buffer.from(value).toString("base64url").slice(0, 16);
}

function buildAssetMetadata(
  filename: string,
  contentType: string,
  width: number | undefined,
  height: number | undefined,
): MediaAssetMetadata {
  const normalizedWidth = width && width > 0 ? width : null;
  const normalizedHeight = height && height > 0 ? height : null;

  return {
    width: normalizedWidth,
    height: normalizedHeight,
    format: getFileFormat(filename, contentType),
    aspectRatio:
      normalizedWidth && normalizedHeight
        ? Number((normalizedWidth / normalizedHeight).toFixed(4))
        : null,
    placeholder: createPlaceholderToken(`${filename}:${contentType}:${normalizedWidth ?? "na"}:${normalizedHeight ?? "na"}`),
  };
}

type UploadIntentOptions = {
  visibility?: AssetVisibility;
  width?: number;
  height?: number;
  signReadUrl?: boolean;
};

export async function createUploadIntent(filename: string, contentType: string, options: UploadIntentOptions = {}) {
  const adapters = getAdapterStatus();
  const env = getRuntimeEnv();
  const visibility = options.visibility ?? "public";

  const safeFilename = toSafeFilename(filename) || "asset.bin";
  const objectKey = `foundation/${Date.now()}-${safeFilename}`;
  const asset: MediaAssetRecord = {
    id: `asset-${Date.now()}-${safeFilename}`,
    objectKey,
    filename: safeFilename,
    contentType,
    visibility,
    metadata: buildAssetMetadata(safeFilename, contentType, options.width, options.height),
  };

  if (!adapters.storage) {
    return {
      enabled: false,
      reason: "Storage adapter is not configured.",
      filename: safeFilename,
      contentType,
      asset,
      readUrl: null,
    } as const;
  }

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: env.S3_PRESIGN_EXPIRES_SECONDS,
  });

  const readUrl =
    options.signReadUrl && visibility === "private"
      ? await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: env.S3_BUCKET!,
            Key: objectKey,
          }),
          { expiresIn: env.S3_PRESIGN_EXPIRES_SECONDS },
        )
      : null;

  return {
    enabled: true,
    filename: safeFilename,
    objectKey,
    contentType,
    uploadUrl,
    readUrl,
    asset,
    assetUrl: env.S3_PUBLIC_BASE_URL
      ? `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${objectKey}`
      : null,
    method: "PUT",
  } as const;
}

export function resetMediaServiceForTests() {
  cachedS3Client = null;
}