import { z } from "zod";

export const runtimeEnvKeys = [
  "NODE_ENV",
  "NEXT_PUBLIC_SITE_URL",
  "AUTH_SECRET",
  "SESSION_COOKIE_NAME",
  "PREVIEW_TOKEN",
  "DATABASE_URL",
  "CONTENT_SOURCE",
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SANITY_API_VERSION",
  "SANITY_API_TOKEN",
  "SANITY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "LEADS_INBOX_EMAIL",
  "LARK_WEBHOOK_URL",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_ENDPOINT",
  "S3_PUBLIC_BASE_URL",
  "S3_PRESIGN_EXPIRES_SECONDS",
  "RATE_LIMIT_WINDOW_SECONDS",
  "RATE_LIMIT_MAX_REQUESTS",
  "ANALYTICS_WRITE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
] as const;

export type RuntimeEnvKey = (typeof runtimeEnvKeys)[number];

const runtimeSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.url().default("https://foundation-core.example.com"),
  AUTH_SECRET: z.string().min(16).optional(),
  SESSION_COOKIE_NAME: z.string().min(3).default("foundation_session"),
  PREVIEW_TOKEN: z.string().min(12).optional(),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use postgres:// or postgresql://",
    )
    .optional(),
  CONTENT_SOURCE: z.enum(["fixtures", "sanity"]).default("fixtures"),
  SANITY_PROJECT_ID: z.string().min(1).optional(),
  SANITY_DATASET: z.string().min(1).optional(),
  SANITY_API_VERSION: z.string().min(6).default("2024-01-01"),
  SANITY_API_TOKEN: z.string().min(10).optional(),
  SANITY_WEBHOOK_SECRET: z.string().min(12).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.email().optional(),
  LEADS_INBOX_EMAIL: z.email().optional(),
  LARK_WEBHOOK_URL: z.url().optional(),
  S3_BUCKET: z.string().min(3).optional(),
  S3_REGION: z.string().min(2).optional(),
  S3_ACCESS_KEY_ID: z.string().min(4).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_BASE_URL: z.url().optional(),
  S3_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(10),
  ANALYTICS_WRITE_KEY: z.string().min(6).optional(),
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(10).optional(),
});

export type RuntimeEnv = z.infer<typeof runtimeSchema>;
export type AdapterStatus = {
  auth: boolean;
  preview: boolean;
  database: boolean;
  content: boolean;
  email: boolean;
  storage: boolean;
  lark: boolean;
  analytics: boolean;
  billing: boolean;
  errorTracking: boolean;
};

const requiredProductionAdapters = [
  "auth",
  "preview",
  "database",
  "content",
  "email",
  "storage",
  "lark",
] as const;

export type RequiredProductionAdapter = (typeof requiredProductionAdapters)[number];

export type ProductionReadiness = {
  ready: boolean;
  required: RequiredProductionAdapter[];
  missing: RequiredProductionAdapter[];
};

export type ReadinessCategory = "required_for_boot" | "required_for_production" | "optional";

export type CategorizedReadiness = {
  required_for_boot: Array<{
    name: string;
    ready: boolean;
    reason: string | null;
  }>;
  required_for_production: Array<{
    name: string;
    ready: boolean;
    reason: string | null;
  }>;
  optional: Array<{
    name: string;
    ready: boolean;
    reason: string | null;
  }>;
};

let cachedEnv: RuntimeEnv | null = null;

export function resetRuntimeEnvForTests() {
  cachedEnv = null;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = runtimeSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid Foundation-Core environment: ${issues.join("; ")}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getAdapterStatus(): AdapterStatus {
  const env = getRuntimeEnv();
  const sanityConfigured = Boolean(
    env.CONTENT_SOURCE === "sanity" && env.SANITY_PROJECT_ID && env.SANITY_DATASET && env.SANITY_API_VERSION,
  );

  return {
    auth: Boolean(env.AUTH_SECRET),
    preview: Boolean(env.PREVIEW_TOKEN),
    database: Boolean(env.DATABASE_URL),
    content: sanityConfigured,
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM && env.LEADS_INBOX_EMAIL),
    storage: Boolean(
      env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY,
    ),
    lark: Boolean(env.LARK_WEBHOOK_URL),
    analytics: Boolean(env.ANALYTICS_WRITE_KEY),
    billing: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    errorTracking: false,
  };
}

export function getProductionReadiness(): ProductionReadiness {
  const adapters = getAdapterStatus();
  const missing = requiredProductionAdapters.filter((adapter) => !adapters[adapter]);

  return {
    ready: missing.length === 0,
    required: [...requiredProductionAdapters],
    missing,
  };
}

export function getCategorizedReadiness(): CategorizedReadiness {
  const adapters = getAdapterStatus();
  const optionalAdapters = ["analytics", "billing", "errorTracking"] as const;

  return {
    required_for_boot: [
      {
        name: "runtime_env",
        ready: true,
        reason: null,
      },
    ],
    required_for_production: requiredProductionAdapters.map((adapter) => ({
      name: adapter,
      ready: adapters[adapter],
      reason: adapters[adapter] ? null : `${adapter} adapter is not configured.`,
    })),
    optional: optionalAdapters.map((adapter) => ({
      name: adapter,
      ready: adapters[adapter],
      reason: adapters[adapter] ? null : `${adapter} adapter is optional and currently disabled.`,
    })),
  };
}

export function getEnvironmentPresenceMap() {
  return Object.fromEntries(runtimeEnvKeys.map((key) => [key, Boolean(process.env[key])])) as Record<
    RuntimeEnvKey,
    boolean
  >;
}