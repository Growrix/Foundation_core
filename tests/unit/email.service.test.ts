import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: sendMock,
    };
  },
}));

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { resetLeadEmailServiceForTests, sendLeadEmail } from "@/server/modules/forms/email.service";

const managedKeys = ["RESEND_API_KEY", "EMAIL_FROM", "LEADS_INBOX_EMAIL"] as const;

describe("email service", () => {
  beforeEach(() => {
    for (const key of managedKeys) {
      delete process.env[key];
    }

    resetRuntimeEnvForTests();
    resetLeadEmailServiceForTests();
    sendMock.mockReset();
  });

  it("returns disabled mode when email adapter is not configured", async () => {
    const result = await sendLeadEmail({
      formId: "contact",
      requestId: "req-1",
      payload: {
        name: "Morgan",
        email: "morgan@example.com",
        message: "Hello",
      },
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("EMAIL_ADAPTER_NOT_CONFIGURED");
  });

  it("sends lead emails through Resend when configured", async () => {
    process.env.RESEND_API_KEY = "resend-key-12345";
    process.env.EMAIL_FROM = "ops@example.com";
    process.env.LEADS_INBOX_EMAIL = "leads@example.com";
    resetRuntimeEnvForTests();

    sendMock.mockResolvedValueOnce({
      data: { id: "msg-123" },
      error: null,
    });

    const result = await sendLeadEmail({
      formId: "contact",
      requestId: "req-2",
      payload: {
        name: "Morgan",
        email: "morgan@example.com",
        message: "Need a callback",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("msg-123");
  });

  it("returns delivery failures when Resend reports an error", async () => {
    process.env.RESEND_API_KEY = "resend-key-12345";
    process.env.EMAIL_FROM = "ops@example.com";
    process.env.LEADS_INBOX_EMAIL = "leads@example.com";
    resetRuntimeEnvForTests();

    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Resend unavailable" },
    });

    const result = await sendLeadEmail({
      formId: "contact",
      requestId: "req-3",
      payload: {
        name: "Morgan",
        email: "morgan@example.com",
        message: "Need a callback",
      },
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toContain("Resend unavailable");
  });
});
