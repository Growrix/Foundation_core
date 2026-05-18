import { beforeEach, describe, expect, it } from "vitest";

import {
  appendSubmissionLifecycleLog,
  getInMemorySubmissionLifecycle,
  resetSubmissionLogForTests,
} from "@/server/modules/forms/submission-log.repository";

describe("submission lifecycle repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetSubmissionLogForTests();
  });

  it("stores lifecycle entries in memory mode when database is disabled", async () => {
    const result = await appendSubmissionLifecycleLog({
      requestId: "req-1",
      formId: "contact",
      status: "accepted",
      provider: "foundation.forms",
      details: {
        requestId: "req-1",
      },
      createdAt: new Date().toISOString(),
    });

    const entries = getInMemorySubmissionLifecycle("req-1");

    expect(result.mode).toBe("memory");
    expect(entries.length).toBe(1);
    expect(entries[0]?.status).toBe("accepted");
  });
});
