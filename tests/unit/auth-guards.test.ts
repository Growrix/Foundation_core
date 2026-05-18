import { beforeEach, describe, expect, it } from "vitest";

import { resetRuntimeEnvForTests } from "@/server/config/env";
import {
  requireAllRoles,
  requireAnyRole,
  requireAuthenticated,
} from "@/server/modules/auth/guards";
import { createSessionToken } from "@/server/modules/auth/session-token";

describe("auth guards", () => {
  beforeEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.SESSION_COOKIE_NAME;
    resetRuntimeEnvForTests();
  });

  it("fails requireAuthenticated when no valid session exists", () => {
    const result = requireAuthenticated();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTH_REQUIRED");
    }
  });

  it("passes authentication and role checks with a valid admin session", () => {
    process.env.AUTH_SECRET = "1234567890abcdef";
    process.env.SESSION_COOKIE_NAME = "foundation_session";
    resetRuntimeEnvForTests();

    const token = createSessionToken(
      {
        sub: "admin-1",
        email: "admin@example.com",
        roles: ["admin", "editor"],
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      process.env.AUTH_SECRET,
    );

    const auth = requireAuthenticated({
      cookieHeader: `foundation_session=${encodeURIComponent(token)}`,
    });

    expect(auth.ok).toBe(true);

    if (auth.ok) {
      expect(requireAnyRole(auth.session, ["admin"]).ok).toBe(true);
      expect(requireAllRoles(auth.session, ["admin", "editor"]).ok).toBe(true);
      expect(requireAllRoles(auth.session, ["admin", "owner"]).ok).toBe(false);
    }
  });
});
