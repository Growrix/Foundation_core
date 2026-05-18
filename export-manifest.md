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
5. Probe `/`, `/api/health`, `/api/diagnostics`, `/api/content/pages/home`, and `/api/content/revalidate`.
6. Run `npm run build && npm run smoke:runtime`.
7. Run `npm run smoke:attached` after the target template root is built and exposes the attach-status contract endpoint expected by the harness.

## Validation criteria
- The dev server boots from the exported location.
- The runtime dashboard loads.
- The health API responds.
- The managed runtime smoke harness passes.
- The attached template smoke harness passes when an attach-contract-compliant template root is present.
- No repo-relative imports are required.
- Production adapter readiness is reflected accurately by `/api/health`.

## Release classification
- `foundation_ready_template_pending` is valid when `npm run verify` passes but no attach-contract-compliant template root is available for `npm run smoke:attached`.