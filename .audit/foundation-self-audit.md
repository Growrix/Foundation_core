# Foundation Self Audit

## Status
- `lint`: passed
- `typecheck`: passed
- `test`: passed
- `build`: passed
- `smoke:runtime`: passed
- `smoke:attached`: passed
- `verify:factory`: passed

## Runtime evidence
- Foundation dashboard route exists at `/`
- Health route exists at `/api/health`
- Session route exists at `/api/auth/session`
- Content page route exists at `/api/content/pages/[slug]`
- Content revalidation route exists at `/api/content/revalidate`
- Lead intake route exists at `/api/forms/[formId]/submit`
- Media upload route exists at `/api/media/upload`
- Preview route exists at `/api/preview/enable`
- Integration route coverage exists at `tests/integration/api-routes.integration.test.ts`
- Revalidation route coverage exists at `tests/integration/revalidate-route.integration.test.ts`
- Managed live smoke harness exists at `scripts/runtime-smoke.mjs`
- Attached template smoke harness exists at `scripts/attached-template-smoke.mjs`

## Notes
- Optional adapters remain safe fallbacks until env values are supplied.
- `/api/health` now reports adapter readiness for auth, preview, content provider, persistence, lead delivery, storage, and operations notification.
- Export portability docs are present: `RUN.md`, `ENV.example`, `dev-server-checklist.md`, `export-manifest.md`.
- `npm run verify` now includes route integration coverage and a managed live runtime smoke pass.
- `npm run verify:factory` now proves attached-mode smoke against the validation template root with `FOUNDATION_BASE_URL` wired.