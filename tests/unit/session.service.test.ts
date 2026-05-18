import { beforeEach, describe, expect, it } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import { createSessionToken } from "@/server/modules/auth/session-token";
import { getSessionSnapshot } from "@/server/modules/auth/session.service";

describe("session service", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.SESSION_COOKIE_NAME;
    resetRuntimeEnvForTests();
  });

  it("returns fallback mode when auth is not configured", () => {
    const snapshot = getSessionSnapshot();
    expect(snapshot.mode).toBe("anonymous_fallback");
    expect(snapshot.authenticated).toBe(false);
  });

  it("returns authenticated users for valid session cookies", () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    process.env.SESSION_COOKIE_NAME = "foundation_session";
    resetRuntimeEnvForTests();

    const token = createSessionToken(
      {
        sub: "user-001",
        email: "owner@example.com",
        roles: ["admin"],
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      process.env.AUTH_SECRET,
    );

    const snapshot = getSessionSnapshot({
      cookieHeader: `foundation_session=${encodeURIComponent(token)}`,
    });

    expect(snapshot.mode).toBe("configured");
    expect(snapshot.authenticated).toBe(true);
    expect(snapshot.user?.email).toBe("owner@example.com");
  });

  it("keeps configured mode with anonymous user when token is invalid", () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    resetRuntimeEnvForTests();

    const snapshot = getSessionSnapshot({
      cookieHeader: "foundation_session=invalid-token",
    });

    expect(snapshot.mode).toBe("configured");
    expect(snapshot.authenticated).toBe(false);
    expect(snapshot.user).toBeNull();
  });
});
