import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredIdempotencyResponse,
  resetIdempotencyForTests,
  storeIdempotencyResponse,
} from "@/server/modules/forms/idempotency.service";

describe("idempotency service", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetIdempotencyForTests();
  });

  it("stores and replays responses in memory mode", async () => {
    await storeIdempotencyResponse(
      "contact",
      "idem-1",
      202,
      {
        ok: true,
        requestId: "req-1",
        data: { accepted: true },
      },
    );

    const stored = await getStoredIdempotencyResponse("contact", "idem-1");

    expect(stored?.mode).toBe("memory");
    expect(stored?.status).toBe(202);
    expect(stored?.responseBody.requestId).toBe("req-1");
  });

  it("ignores empty idempotency keys", async () => {
    await storeIdempotencyResponse("contact", "   ", 202, {
      ok: true,
      requestId: "req-2",
    });

    const stored = await getStoredIdempotencyResponse("contact", "   ");
    expect(stored).toBeNull();
  });
});
