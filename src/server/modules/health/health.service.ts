import {
  getAdapterStatus,
  getCategorizedReadiness,
  getEnvironmentPresenceMap,
  getProductionReadiness,
  getRuntimeEnv,
} from "@/server/config/env";

export function getFoundationSummary() {
  const env = getRuntimeEnv();
  const adapters = getAdapterStatus();
  const readiness = getProductionReadiness();
  const categorizedReadiness = getCategorizedReadiness();

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
    categorizedReadiness,
  };
}

export function getRuntimeDiagnosticsReport() {
  const env = getRuntimeEnv();

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      environment: env.NODE_ENV,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      contentSource: env.CONTENT_SOURCE,
      sessionCookieName: env.SESSION_COOKIE_NAME,
    },
    adapters: getAdapterStatus(),
    readiness: {
      production: getProductionReadiness(),
      categorized: getCategorizedReadiness(),
    },
    envPresence: getEnvironmentPresenceMap(),
  };
}