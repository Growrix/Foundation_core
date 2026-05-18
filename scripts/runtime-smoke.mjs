import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const managedPortStart = Number(process.env.SMOKE_PORT ?? "3100");
const startupTimeoutMs = Number(process.env.SMOKE_START_TIMEOUT_MS ?? "120000");
const externalBaseUrl = process.env.SMOKE_BASE_URL ?? null;

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(start) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = start + offset;
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No available port found starting at ${start}.`);
}

async function waitForReady(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.status === 200) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health to become ready.`);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function killProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
}

async function runSmoke(baseUrl) {
  const checkResults = [];

  const checks = [
    {
      name: "runtime dashboard",
      method: "GET",
      path: "/",
      assert: async (response) => {
        const text = await response.text();
        if (response.status !== 200 || !text.includes("Foundation Core")) {
          throw new Error(`Expected dashboard 200 with Foundation Core marker, received ${response.status}.`);
        }
      },
    },
    {
      name: "health API",
      method: "GET",
      path: "/api/health",
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 200 || body?.ok !== true) {
          throw new Error(`Expected health 200 success envelope, received ${response.status}.`);
        }
      },
    },
    {
      name: "diagnostics API",
      method: "GET",
      path: "/api/diagnostics",
      assert: async (response) => {
        const body = await readJson(response);
        if (
          response.status !== 200 ||
          body?.ok !== true ||
          !body?.data?.readiness?.categorized?.required_for_production
        ) {
          throw new Error(`Expected diagnostics 200 with categorized readiness, received ${response.status}.`);
        }
      },
    },
    {
      name: "auth session API",
      method: "GET",
      path: "/api/auth/session",
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 200 || body?.ok !== true || !body?.data?.mode) {
          throw new Error(`Expected auth session envelope, received ${response.status}.`);
        }
      },
    },
    {
      name: "billing checkout auth guard",
      method: "POST",
      path: "/api/billing/checkout",
      body: {
        offer_key: "starter",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 401 || body?.ok !== false || body?.error?.code !== "BILLING_AUTH_REQUIRED") {
          throw new Error(`Expected billing checkout endpoint to enforce auth, received ${response.status}.`);
        }
      },
    },
    {
      name: "billing portal auth guard",
      method: "POST",
      path: "/api/billing/portal",
      body: {
        return_url: "https://example.com/account",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 401 || body?.ok !== false || body?.error?.code !== "BILLING_AUTH_REQUIRED") {
          throw new Error(`Expected billing portal endpoint to enforce auth, received ${response.status}.`);
        }
      },
    },
    {
      name: "content page API",
      method: "GET",
      path: "/api/content/pages/home",
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 200 || body?.data?.slug !== "home") {
          throw new Error(`Expected content page 'home', received ${response.status}.`);
        }
      },
    },
    {
      name: "site config API",
      method: "GET",
      path: "/api/content/site-config",
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 200 || body?.data?.footer?.attribution?.url !== "https://www.growrixos.com") {
          throw new Error(`Expected site config to expose the Growrix attribution URL, received ${response.status}.`);
        }
      },
    },
    {
      name: "forms API",
      method: "POST",
      path: "/api/forms/contact/submit",
      body: {
        name: "Factory Smoke",
        email: "smoke@example.com",
        message: "Validating Foundation Core runtime smoke behavior.",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 202 || body?.data?.accepted !== true) {
          throw new Error(`Expected forms endpoint to accept the smoke submission, received ${response.status}.`);
        }
      },
    },
    {
      name: "media API fallback",
      method: "POST",
      path: "/api/media/upload",
      body: {
        filename: "smoke-asset.jpg",
        contentType: "image/jpeg",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (![200, 503].includes(response.status) || body?.ok !== true || typeof body?.data?.enabled !== "boolean") {
          throw new Error(`Expected media endpoint to return a normalized upload-intent envelope, received ${response.status}.`);
        }
      },
    },
    {
      name: "content revalidation API fallback",
      method: "POST",
      path: "/api/content/revalidate",
      body: {
        event: "content.published",
        slug: "home",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 503 || body?.ok !== false || body?.error?.code !== "REVALIDATION_NOT_CONFIGURED") {
          throw new Error(`Expected revalidation endpoint to require webhook configuration, received ${response.status}.`);
        }
      },
    },
    {
      name: "preview API fallback",
      method: "POST",
      path: "/api/preview/enable",
      body: {
        redirectTo: "/preview",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 401 || body?.ok !== false || !body?.error?.code) {
          throw new Error(`Expected preview endpoint to reject without configuration, received ${response.status}.`);
        }
      },
    },
    {
      name: "stripe webhook API fallback",
      method: "POST",
      path: "/api/webhooks/stripe",
      body: {
        type: "invoice.paid",
      },
      assert: async (response) => {
        const body = await readJson(response);
        if (response.status !== 503 || body?.ok !== false || body?.error?.code !== "BILLING_NOT_CONFIGURED") {
          throw new Error(`Expected Stripe webhook endpoint to require configuration, received ${response.status}.`);
        }
      },
    },
  ];

  for (const check of checks) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method,
      headers: check.body ? { "Content-Type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      cache: "no-store",
    });

    await check.assert(response);
    log(`SMOKE PASS: ${check.name} -> ${response.status}`);

    checkResults.push({
      name: check.name,
      status: response.status,
      path: check.path,
    });
  }

  return checkResults;
}

async function writeSmokeEvidence(baseUrl, checks) {
  const auditDirectory = path.resolve(process.cwd(), ".audit");
  await fs.mkdir(auditDirectory, { recursive: true });

  const evidencePath = path.resolve(auditDirectory, "runtime-smoke-evidence.json");
  const evidence = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    checks,
  };

  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
  log(`SMOKE EVIDENCE: ${evidencePath}`);
}

async function main() {
  let child = null;
  let baseUrl = externalBaseUrl;

  try {
    if (!baseUrl) {
      const port = await findAvailablePort(managedPortStart);
      baseUrl = `http://127.0.0.1:${port}`;
      const nextBin = path.resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");

      log(`Starting managed Foundation Core server on ${baseUrl}`);
      child = spawn(process.execPath, [nextBin, "start", "--port", String(port)], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));

      await waitForReady(baseUrl, startupTimeoutMs);
    } else {
      log(`Using external Foundation Core server at ${baseUrl}`);
    }

    const checkResults = await runSmoke(baseUrl);
    await writeSmokeEvidence(baseUrl, checkResults);
    log(`Foundation runtime smoke passed against ${baseUrl}`);
  } finally {
    await killProcessTree(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
