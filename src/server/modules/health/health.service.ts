import { getAdapterStatus, getProductionReadiness, getRuntimeEnv } from "@/server/config/env";

export function getFoundationSummary() {
  const env = getRuntimeEnv();
  const adapters = getAdapterStatus();
  const readiness = getProductionReadiness();

  const requiredAdaptersReady = readiness.ready;

  return {
    status: requiredAdaptersReady ? "production-capable" : "api-ready-with-fallbacks",
    runtime: {
      environment: env.NODE_ENV,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      contentSource: env.CONTENT_SOURCE,
    },
    adapters,
    readiness,
  };
}