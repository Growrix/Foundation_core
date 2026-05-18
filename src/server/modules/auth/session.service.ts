import { getAdapterStatus, getRuntimeEnv } from "@/server/config/env";
import { readCookieValue, verifySessionToken } from "@/server/modules/auth/session-token";

export type SessionDto = {
  authenticated: boolean;
  user: null | {
    id: string;
    email: string;
    roles: string[];
  };
  mode: "anonymous_fallback" | "configured";
};

type SessionSnapshotOptions = {
  cookieHeader?: string | null;
  authorizationHeader?: string | null;
  nowEpochSeconds?: number;
};

function readBearerToken(header: string | null | undefined) {
  if (!header) {
    return null;
  }

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

export function getSessionSnapshot(options: SessionSnapshotOptions = {}): SessionDto {
  const adapters = getAdapterStatus();
  const env = getRuntimeEnv();

  if (!adapters.auth) {
    return {
      authenticated: false,
      user: null,
      mode: "anonymous_fallback",
    };
  }

  const cookieToken = readCookieValue(options.cookieHeader ?? null, env.SESSION_COOKIE_NAME);
  const bearerToken = readBearerToken(options.authorizationHeader);
  const token = bearerToken ?? cookieToken;

  if (token && env.AUTH_SECRET) {
    const payload = verifySessionToken(token, env.AUTH_SECRET, options.nowEpochSeconds);

    if (payload) {
      return {
        authenticated: true,
        user: {
          id: payload.sub,
          email: payload.email,
          roles: payload.roles,
        },
        mode: "configured",
      };
    }
  }

  return {
    authenticated: false,
    user: null,
    mode: "configured",
  };
}