import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { logInfo } from "@/server/observability/logger";
import { scrubPiiPayload } from "@/server/observability/pii-scrubber";
import { captureBackendError, trackBackendEvent } from "@/server/observability/telemetry";

describe("observability utilities", () => {
  beforeEach(() => {
    delete process.env.ANALYTICS_WRITE_KEY;
    resetRuntimeEnvForTests();
  });

  it("scrubs sensitive payload keys and email values", () => {
    const scrubbed = scrubPiiPayload({
      email: "owner@example.com",
      nested: {
        authorization: "Bearer token",
        note: "contact owner@example.com",
      },
    }) as Record<string, unknown>;

    expect(scrubbed.email).toBe("[REDACTED]");
    expect((scrubbed.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
    expect((scrubbed.nested as Record<string, unknown>).note).toBe("contact [REDACTED_EMAIL]");
  });

  it("emits structured logs with request correlation", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    logInfo(
      "test.log",
      {
        requestId: "req-1",
        route: "/api/test",
      },
      {
        email: "owner@example.com",
      },
    );

    expect(writeSpy).toHaveBeenCalled();
    const firstCall = writeSpy.mock.calls[0]?.[0];
    expect(String(firstCall)).toContain("\"request_id\":\"req-1\"");
    expect(String(firstCall)).toContain("[REDACTED]");

    writeSpy.mockRestore();
  });

  it("keeps telemetry adapters non-blocking when analytics is disabled", async () => {
    const eventResult = await trackBackendEvent(
      "forms.submission.accepted",
      {
        requestId: "req-2",
        route: "/api/forms/contact/submit",
      },
      {
        email: "owner@example.com",
      },
    );

    const errorResult = await captureBackendError(
      "forms.submission.unexpected_error",
      {
        requestId: "req-3",
        route: "/api/forms/contact/submit",
      },
      {
        email: "owner@example.com",
      },
    );

    expect(eventResult.sent).toBe(false);
    expect(eventResult.reason).toBe("ANALYTICS_NOT_CONFIGURED");
    expect(errorResult.sent).toBe(false);
    expect(errorResult.reason).toContain("MISSING_KNOWLEDGE");
  });

  it("marks analytics events as sent when analytics key is configured", async () => {
    process.env.ANALYTICS_WRITE_KEY = "analytics-key";
    resetRuntimeEnvForTests();

    const result = await trackBackendEvent(
      "content.revalidation.accepted",
      {
        requestId: "req-4",
        route: "/api/content/revalidate",
      },
      {
        event: "content.published",
      },
    );

    expect(result.sent).toBe(true);
    expect(result.reason).toBeNull();
  });
});
