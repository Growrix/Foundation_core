# Foundation Core

Foundation Core is the reusable backend-first runtime for screenshot-driven frontend delivery.

## What it owns
- Auth/session fallback routes and normalized session API.
- Content DTO endpoints, site config, and signed revalidation webhook surface.
- Lead form intake with honeypot + rate-limit checks.
- Media upload signed-intent contract for S3-compatible storage.
- Preview enablement contract.
- Health and adapter readiness visibility.
- Operational notifications for critical runtime events.

## What it does not own
- Client-facing screenshot replication.
- DS-specific component systems.
- Project-specific public page composition.

## Runtime root
- `Foundation-Core/`

## Key files
- `docs/contracts/frontend-attach-contract.json`
- `docs/contracts/openapi.foundation.yaml`
- `foundation.manifest.json`
- `RUN.md`
- `ENV.example`
- `dev-server-checklist.md`
- `export-manifest.md`

## Verification
- Run `npm run verify` from `Foundation-Core/`.
- `npm run verify` includes lint, typecheck, unit + integration tests, build, and a managed live runtime smoke pass.
- Run `npm run verify:factory` from `Foundation-Core/` for the paired Foundation + attached-template E2E proof.

## Adapter modes
- Default local mode uses safe fallbacks (`CONTENT_SOURCE=fixtures`, optional adapters disabled).
- Production mode is considered ready only when health readiness reports all required adapters configured.
- To enable provider-backed runtime behavior, configure Sanity, Postgres, Resend, Lark, and S3-compatible env values from `ENV.example`.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
