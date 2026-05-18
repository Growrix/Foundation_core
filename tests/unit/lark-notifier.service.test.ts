import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { notifyLark } from "@/server/modules/ops/lark-notifier.service";

describe("lark notifier service", () => {
  beforeEach(() => {
    delete process.env.LARK_WEBHOOK_URL;
    resetRuntimeEnvForTests();
    vi.restoreAllMocks();
  });

  it("returns disabled result when Lark is not configured", async () => {
    const result = await notifyLark("lead.accepted", {
      requestId: "req-1",
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("LARK_NOT_CONFIGURED");
  });

  it("sends notifications when webhook is configured", async () => {
    process.env.LARK_WEBHOOK_URL = "https://open.larksuite.com/webhook/mock";
    resetRuntimeEnvForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    );

    const result = await notifyLark("lead.accepted", {
      requestId: "req-2",
    });

    expect(result.sent).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("returns webhook errors for non-2xx responses", async () => {
    process.env.LARK_WEBHOOK_URL = "https://open.larksuite.com/webhook/mock";
    resetRuntimeEnvForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const result = await notifyLark("lead.accepted", {
      requestId: "req-3",
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("LARK_HTTP_500");
  });
});
