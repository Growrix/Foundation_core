import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: { input?: { Key?: string } }) => {
    const key = command.input?.Key ?? "asset.bin";
    return `https://signed.example.com/${key}?X-Amz-Signature=mock`;
  }),
}));

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { createUploadIntent, resetMediaServiceForTests } from "@/server/modules/media/media.service";

describe("media service", () => {
  beforeEach(() => {
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.S3_PRESIGN_EXPIRES_SECONDS;

    resetRuntimeEnvForTests();
    resetMediaServiceForTests();
  });

  it("returns deterministic metadata in fallback mode", async () => {
    const intent = await createUploadIntent("hero-image.jpg", "image/jpeg", {
      width: 1200,
      height: 630,
    });

    expect(intent.enabled).toBe(false);
    expect(intent.asset.metadata.format).toBe("jpg");
    expect(intent.asset.metadata.aspectRatio).toBeCloseTo(1.9048, 3);
  });

  it("returns signed upload and read URLs for private assets", async () => {
    process.env.S3_BUCKET = "foundation-bucket";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key-123";
    resetRuntimeEnvForTests();

    const intent = await createUploadIntent("proof.png", "image/png", {
      visibility: "private",
      signReadUrl: true,
    });

    expect(intent.enabled).toBe(true);
    if (intent.enabled) {
      expect(intent.uploadUrl).toContain("X-Amz-Signature");
      expect(intent.readUrl).toContain("X-Amz-Signature");
      expect(intent.asset.visibility).toBe("private");
    }
  });
});
