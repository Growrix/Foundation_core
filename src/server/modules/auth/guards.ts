import {
  getSessionSnapshot,
  type SessionDto,
} from "@/server/modules/auth/session.service";

export type GuardFailure = {
  ok: false;
  status: 401 | 403;
  code: "AUTH_REQUIRED" | "ROLE_FORBIDDEN";
  message: string;
};

export type GuardSuccess = {
  ok: true;
  session: SessionDto;
};

export type GuardResult = GuardSuccess | GuardFailure;

type SessionHeaders = {
  cookieHeader?: string | null;
  authorizationHeader?: string | null;
};

export function requireAuthenticated(headers: SessionHeaders = {}): GuardResult {
  const session = getSessionSnapshot(headers);

  if (!session.authenticated) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication is required for this route.",
    };
  }

  return {
    ok: true,
    session,
  };
}

export function requireAnyRole(session: SessionDto, roles: string[]): GuardResult {
  if (!session.authenticated || !session.user) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication is required for this route.",
    };
  }

  const hasRole = roles.some((role) => session.user?.roles.includes(role));

  if (!hasRole) {
    return {
      ok: false,
      status: 403,
      code: "ROLE_FORBIDDEN",
      message: `At least one of the required roles is missing: ${roles.join(", ")}.`,
    };
  }

  return {
    ok: true,
    session,
  };
}

export function requireAllRoles(session: SessionDto, roles: string[]): GuardResult {
  if (!session.authenticated || !session.user) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication is required for this route.",
    };
  }

  const hasAllRoles = roles.every((role) => session.user?.roles.includes(role));

  if (!hasAllRoles) {
    return {
      ok: false,
      status: 403,
      code: "ROLE_FORBIDDEN",
      message: `All required roles must be present: ${roles.join(", ")}.`,
    };
  }

  return {
    ok: true,
    session,
  };
}
