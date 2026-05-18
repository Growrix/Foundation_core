import { beforeEach, describe, expect, it } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import {
  consumeSubmissionRateLimit,
  resetRateLimitForTests,
} from "@/server/modules/forms/rate-limit.service";

describe("rate limit service", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    resetRuntimeEnvForTests();
    resetRateLimitForTests();
  });

  it("allows first request and limits repeated requests in memory mode", async () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "60";
    resetRuntimeEnvForTests();

    const first = await consumeSubmissionRateLimit("contact:127.0.0.1");
    const second = await consumeSubmissionRateLimit("contact:127.0.0.1");

    expect(first.allowed).toBe(true);
    expect(first.mode).toBe("memory");
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });
});
