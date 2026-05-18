import { describe, expect, it } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import {
  parseSubmissionPayload,
  processLeadSubmission,
  resetRateLimitStateForTests,
  submitForm,
} from "@/server/modules/forms/form.service";

describe("form service", () => {
  function basePayload() {
    return parseSubmissionPayload({
      name: "Morgan Lee",
      email: "morgan@example.com",
      message: "Need a callback about template delivery.",
    });
  }

  function baseContext(requestId = "request-test") {
    return {
      requestId,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    };
  }

  function resetState() {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_SECONDS;
    resetRuntimeEnvForTests();
    resetRateLimitStateForTests();
  }

  it("accepts a valid contact submission", () => {
    resetState();

    const payload = parseSubmissionPayload({
      ...basePayload(),
      website: "",
    });

    const result = submitForm("contact", payload);
    expect(result.accepted).toBe(true);
  });

  it("rejects honeypot submissions", () => {
    resetState();

    const payload = parseSubmissionPayload({
      name: "Spam User",
      email: "spam@example.com",
      message: "This should not go through.",
      website: "https://spam.invalid",
    });

    const result = submitForm("contact", payload);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.code).toBe("HONEYPOT_TRIGGERED");
    }
  });

  it("rejects unknown form identifiers", () => {
    resetState();

    const payload = basePayload();

    const result = submitForm("unknown", payload);
    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("applies rate limits during processed submissions", async () => {
    resetState();
    process.env.RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.RATE_LIMIT_WINDOW_SECONDS = "60";
    resetRuntimeEnvForTests();

    const payload = basePayload();

    const first = await processLeadSubmission("contact", payload, baseContext("req-1"));
    expect(first.accepted).toBe(true);

    const second = await processLeadSubmission("contact", payload, baseContext("req-2"));
    expect(second.accepted).toBe(false);
    if (!second.accepted) {
      expect(second.code).toBe("RATE_LIMITED");
      expect(second.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});