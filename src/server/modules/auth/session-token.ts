import crypto from "node:crypto";

export type SessionTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  exp: number;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createSessionToken(payload: SessionTokenPayload, secret: string) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): SessionTokenPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(providedSignature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionTokenPayload;

    if (!payload?.sub || !payload?.email || !Array.isArray(payload.roles) || typeof payload.exp !== "number") {
      return null;
    }

    if (payload.exp <= nowEpochSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function readCookieValue(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((part) => part.trim());

  for (const cookie of cookies) {
    if (!cookie.startsWith(`${cookieName}=`)) {
      continue;
    }

    const rawValue = cookie.slice(cookieName.length + 1);
    return decodeURIComponent(rawValue);
  }

  return null;
}
