# Dev Server Checklist

## 1. Runtime root verification
- Use `Foundation-Core/` as the runtime root.
- Run all install and dev commands from that directory.

## 2. Dependency preflight
- Confirm `package.json` exists in `Foundation-Core/`.
- Run `npm install`.

## 3. Environment preflight
- Copy `ENV.example` to `.env.local`.
- Fill in real values for the adapters you want enabled.
- For provider-backed mode, set `CONTENT_SOURCE=sanity` and complete Sanity, database, email, storage, and Lark values.
- Missing optional adapter values are allowed; the runtime will stay in fallback mode.

## 4. Port and process checks
- Ensure port `3000` is free.
- Stop stale `node` processes if a prior dev server is still holding the port.

## 5. Windows recovery
- Stop active `node`, `npm`, and `npx` processes.
- Remove `node_modules/` and `package-lock.json` only if the install is corrupted.
- Re-run `npm install` once.

## 6. Startup
- Run `npm run dev`.
- Confirm the local URL is printed.

## 7. Smoke verification
- Check `/`.
- Check `/api/health`.
- Check `/api/auth/session`.
- Check `/api/content/pages/home`.
- Check `/api/content/revalidate`.
- Run `npm run smoke:runtime` after `npm run build` for the managed end-to-end probe set.
- Run `npm run smoke:attached` after the template root has passed its own build to prove attached mode with `FOUNDATION_BASE_URL` wired.

## 8. Export portability
- After copying the project to a new root, repeat this checklist unchanged.