# Foundation Core Runbook

## Runtime root
- Run all install, dev, build, test, and verify commands from `Foundation-Core/`.

## Commands
- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:integration`
- `npm run build`
- `npm run seed:content`
- `npm run seed:content:apply`
- `npm run smoke:runtime`
- `npm run smoke:attached`
- `npm run verify`
- `npm run verify:factory`

## Primary local checks
- Open `/` for the runtime dashboard.
- Open `/api/health` for adapter readiness.
- Open `/api/diagnostics` for categorized readiness and env presence reporting.
- Open `/api/auth/session` for the normalized session envelope.
- Open `/api/admin/diagnostics` with an admin role token for guarded diagnostics.
- Post to `/api/forms/contact/submit` to validate form intake.
- Post to `/api/content/revalidate` to validate webhook signature handling.

## E2E proof
- `npm run test` now covers both unit and route-level integration tests.
- `npm run smoke:runtime` boots a managed production server from `Foundation-Core/` and probes `/`, `/api/health`, `/api/auth/session`, `/api/content/pages/home`, `/api/content/site-config`, `/api/forms/contact/submit`, `/api/media/upload`, and `/api/preview/enable`.
- Runtime smoke also probes `/api/diagnostics` and `/api/content/revalidate` in fallback mode to verify webhook configuration gating.
- `npm run verify` now includes the live runtime smoke step after build.
- `npm run smoke:attached` boots `Foundation-Core/` and an attached template root together, injects `FOUNDATION_BASE_URL`, and requires an attach-status contract surface from the template runtime.
- `npm run verify:factory` is the paired Foundation + template E2E gate for the current factory lane and depends on a template root that exposes the attach-status contract.

## Delivery note
- This runtime is API-ready out of the box. Add real adapter secrets in `.env.local` to switch from safe fallbacks to configured integrations.
- Production-capable status requires configured auth, preview, database persistence, Sanity content source, Resend lead delivery, S3 signed upload adapter, and Lark notifications.
- Optional analytics and billing integrations remain non-blocking and are reported as optional readiness categories.