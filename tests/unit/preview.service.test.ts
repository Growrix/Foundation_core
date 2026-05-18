import { beforeEach, describe, expect, it } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { canEnablePreview } from "@/server/modules/preview/preview.service";

describe("preview service", () => {
  beforeEach(() => {
    resetRuntimeEnvForTests();
    delete process.env.PREVIEW_TOKEN;
    process.env.PREVIEW_TOKEN = "preview-secret-token";
  });

  it("allows preview when the configured token matches", () => {
    expect(canEnablePreview("preview-secret-token").allowed).toBe(true);
  });

  it("rejects preview when the token mismatches", () => {
    expect(canEnablePreview("wrong-token").allowed).toBe(false);
  });

  it("rejects preview when preview mode is not configured", () => {
    delete process.env.PREVIEW_TOKEN;
    resetRuntimeEnvForTests();

    expect(canEnablePreview("preview-secret-token").allowed).toBe(false);
  });
});