# Export Manifest

## Required bundle
- `Foundation-Core/`

## Runtime root contract
- The exported runtime root is `Foundation-Core/`.
- Run `npm install`, `npm run dev`, `npm run build`, `npm run smoke:runtime`, `npm run smoke:attached`, `npm run verify`, and `npm run verify:factory` from that directory.

## Post-export bootstrap
1. Enter `Foundation-Core/`.
2. Run `npm install`.
3. Copy `ENV.example` to `.env.local` and fill in secrets.
4. Run `npm run dev`.
5. Probe `/`, `/api/health`, `/api/diagnostics`, `/api/content/pages/home`, `/api/content/revalidate`, `/api/billing/checkout`, `/api/billing/portal`, and `/api/webhooks/stripe`.
6. Run `npm run build && npm run smoke:runtime`.
7. Run `npm run smoke:attached` after the target template root is built.
8. If default template path resolution is not usable in your shell, set `ATTACHED_TEMPLATE_ROOT` to a shell-safe absolute template path and rerun `npm run smoke:attached`.

## Validation criteria
- The dev server boots from the exported location.
- The runtime dashboard loads.
- The health API responds.
- The managed runtime smoke harness passes.
- The attached template smoke harness passes when template attach proof is available through `/api/template-attach-status` or home-surface mode markers.
- No repo-relative imports are required.
- Production adapter readiness is reflected accurately by `/api/health`.
- Stripe billing endpoints are reachable and return normalized fallback envelopes before secrets are configured.

## Release classification
- `foundation_ready_template_pending` is valid when `npm run verify` passes but no prepared template root is available for `npm run smoke:attached`.