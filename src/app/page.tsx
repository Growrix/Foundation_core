import { getFoundationSummary } from "@/server/modules/health/health.service";

const apiSurfaces = [
  {
    method: "GET",
    path: "/api/health",
    description: "Runtime health, adapter status, and deployment readiness snapshot.",
  },
  {
    method: "GET",
    path: "/api/auth/session",
    description: "Normalized anonymous or authenticated session envelope.",
  },
  {
    method: "GET",
    path: "/api/content/pages/home",
    description: "Page DTO surface for attached templates and preview clients.",
  },
  {
    method: "POST",
    path: "/api/forms/contact/submit",
    description: "Validated lead intake with anti-spam signals and request ids.",
  },
  {
    method: "POST",
    path: "/api/media/upload",
    description: "Storage adapter handshake surface for signed uploads.",
  },
  {
    method: "POST",
    path: "/api/preview/enable",
    description: "Draft mode activation for CMS preview and screenshot QA.",
  },
] as const;

const routes = [
  { href: "/sign-in", label: "Sign in fallback" },
  { href: "/sign-up", label: "Sign up fallback" },
  { href: "/admin", label: "Admin shell" },
  { href: "/preview", label: "Preview shell" },
];

export default function Home() {
  const summary = getFoundationSummary();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
      <section className="grid gap-6 rounded-4xl border border-white/10 bg-(--surface) p-8 shadow-(--shadow-panel) lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-(--border-strong) px-4 py-1 text-sm font-medium text-(--accent)">
            Backend-first runtime
          </span>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Foundation Core is ready to power screenshot-driven frontend delivery.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-(--muted) sm:text-lg">
              This runtime keeps operational concerns centralized: auth, content DTOs,
              forms, media, preview, and health signals. Public-facing template teams
              attach through documented contracts instead of inheriting a locked design system.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a className="foundation-button foundation-button--primary" href="/api/health">
              Inspect health API
            </a>
            <a className="foundation-button" href="/docs/contracts/frontend-attach-contract.json">
              View attach contract
            </a>
          </div>
        </div>

        <div className="grid gap-4 rounded-[28px] border border-white/10 bg-(--panel) p-6">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-(--muted)">
              Runtime status
            </p>
            <p className="mt-3 text-3xl font-semibold text-foreground">
              {summary.status}
            </p>
          </div>
          <dl className="grid gap-3 text-sm">
            <StatusRow label="Auth contract" value={summary.adapters.auth ? "configured" : "anonymous fallback"} />
            <StatusRow label="Content provider" value={summary.adapters.content ? "sanity configured" : "fixture fallback"} />
            <StatusRow label="Storage" value={summary.adapters.storage ? "configured" : "disabled until env"} />
            <StatusRow label="Email" value={summary.adapters.email ? "configured" : "disabled until env"} />
            <StatusRow label="Ops alerts" value={summary.adapters.lark ? "lark configured" : "disabled until env"} />
            <StatusRow label="Preview" value={summary.adapters.preview ? "token ready" : "preview token missing"} />
          </dl>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[28px] border border-white/10 bg-(--surface) p-7 shadow-(--shadow-panel)">
          <h2 className="text-2xl font-semibold">API surfaces</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-(--muted)">
            Every route emits a normalized envelope so downstream templates can bind to typed
            contracts without scanning internal implementation details.
          </p>
          <div className="mt-6 grid gap-4">
            {apiSurfaces.map((surface) => (
              <div key={surface.path} className="rounded-2xl border border-white/8 bg-(--panel) p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex min-w-16 justify-center rounded-full border border-(--border-strong) px-2 py-1 text-xs font-semibold tracking-wide text-(--accent)">
                    {surface.method}
                  </span>
                  <code className="text-sm text-foreground">{surface.path}</code>
                </div>
                <p className="mt-3 text-sm leading-6 text-(--muted)">{surface.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[28px] border border-white/10 bg-(--surface) p-7 shadow-(--shadow-panel)">
          <h2 className="text-2xl font-semibold">Operational routes</h2>
          <p className="mt-3 text-sm leading-7 text-(--muted)">
            The frontend shell stays intentionally light. These screens exist to support auth,
            preview, and admin workflows while client-facing templates stay separate.
          </p>
          <div className="mt-6 grid gap-4">
            {routes.map((route) => (
              <a
                key={route.href}
                href={route.href}
                className="rounded-2xl border border-white/8 bg-(--panel) p-4 transition-transform hover:-translate-y-0.5"
              >
                <div className="text-base font-semibold">{route.label}</div>
                <div className="mt-2 text-sm text-(--muted)">{route.href}</div>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-(--surface-soft) px-4 py-3">
      <dt className="text-(--muted)">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
