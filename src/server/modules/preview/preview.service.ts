import { getRuntimeEnv } from "@/server/config/env";

export function canEnablePreview(token: string | null) {
  const env = getRuntimeEnv();

  if (!env.PREVIEW_TOKEN) {
    return {
      allowed: false,
      code: "PREVIEW_NOT_CONFIGURED",
      message: "PREVIEW_TOKEN is not configured.",
    } as const;
  }

  if (!token || token !== env.PREVIEW_TOKEN) {
    return {
      allowed: false,
      code: "PREVIEW_TOKEN_INVALID",
      message: "Preview token is invalid.",
    } as const;
  }

  return {
    allowed: true,
  } as const;
}