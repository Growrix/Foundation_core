import { beforeEach, describe, expect, it, vi } from "vitest";

const { postgresFactoryMock, sqlMock } = vi.hoisted(() => {
  const sql = vi.fn();
  const postgresFactory = vi.fn(() => {
    const tag = sql as unknown as {
      (...args: unknown[]): Promise<unknown>;
      json: (value: unknown) => unknown;
      end: () => Promise<void>;
    };

    tag.json = (value: unknown) => value;
    tag.end = vi.fn(async () => undefined);

    return tag;
  });

  return {
    postgresFactoryMock: postgresFactory,
    sqlMock: sql,
  };
});

vi.mock("postgres", () => ({
  default: postgresFactoryMock,
}));

import { resetRuntimeEnvForTests } from "@/server/config/env";
import {
  persistLeadSubmission,
  resetLeadRepositoryForTests,
} from "@/server/modules/forms/lead.repository";

describe("lead repository", () => {
  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    resetRuntimeEnvForTests();

    sqlMock.mockReset();
    postgresFactoryMock.mockClear();

    await resetLeadRepositoryForTests();
  });

  it("returns disabled mode when database is not configured", async () => {
    const result = await persistLeadSubmission({
      formId: "contact",
      requestId: "req-1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      payload: {
        name: "Morgan",
        email: "morgan@example.com",
        message: "Need support",
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.mode).toBe("disabled");
    expect(postgresFactoryMock).not.toHaveBeenCalled();
  });

  it("persists leads and returns inserted id when database is configured", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db.example.com:5432/runtime";
    resetRuntimeEnvForTests();

    let queryCount = 0;
    sqlMock.mockImplementation(async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return [];
      }
      return [{ id: 42 }];
    });

    const result = await persistLeadSubmission({
      formId: "contact",
      requestId: "req-2",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      payload: {
        name: "Morgan",
        email: "morgan@example.com",
        message: "Need support",
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.mode).toBe("database");
    expect(result.leadId).toBe(42);
    expect(postgresFactoryMock).toHaveBeenCalledTimes(1);
  });
});
