import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const foundationPortStart = Number(process.env.FOUNDATION_SMOKE_PORT ?? "3200");
const templatePortStart = Number(process.env.TEMPLATE_SMOKE_PORT ?? "3201");
const startupTimeoutMs = Number(process.env.SMOKE_START_TIMEOUT_MS ?? "120000");
const templateRoot = process.env.ATTACHED_TEMPLATE_ROOT
  ? path.resolve(process.env.ATTACHED_TEMPLATE_ROOT)
  : path.resolve(process.cwd(), "..", "Templates", "local-business", "mezan");

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

async function waitForReady(url, timeoutMs, validator) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (await validator(response)) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function nextBinFor(root) {
  return path.resolve(root, "node_modules", "next", "dist", "bin", "next");
}

function spawnNextStart(root, port, extraEnv = {}) {
  const nextBin = nextBinFor(root);
  const child = spawn(process.execPath, [nextBin, "start", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return child;
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

async function assertHome(baseUrl) {
  const response = await fetch(`${baseUrl}/`, { cache: "no-store" });
  const text = await response.text();
  if (response.status !== 200 || !text.includes("Built and Maintained by Growrix OS")) {
    throw new Error(`Expected attached template home route to render the footer attribution at ${baseUrl}/.`);
  }
  log(`ATTACHED PASS: template home route -> ${response.status}`);
}

async function assertAttachStatus(baseUrl, foundationBaseUrl) {
  const response = await fetch(`${baseUrl}/api/template-attach-status`, { cache: "no-store" });
  const body = await response.json();

  if (
    response.status !== 200 ||
    body.mode !== "attached" ||
    body.reachable !== true ||
    body.foundationBaseUrl !== foundationBaseUrl
  ) {
    throw new Error(`Expected template attach status to report attached mode. Received: ${JSON.stringify(body)}`);
  }

  log(`ATTACHED PASS: template attach status -> ${response.status}`);
}

async function assertFoundationStillHealthy(baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  const body = await response.json();
  if (response.status !== 200 || body?.ok !== true) {
    throw new Error(`Expected Foundation health route to remain healthy during attached smoke.`);
  }
  log(`ATTACHED PASS: foundation health -> ${response.status}`);
}

async function main() {
  let foundationChild = null;
  let templateChild = null;

  try {
    const foundationPort = await findAvailablePort(foundationPortStart);
    const templatePort = await findAvailablePort(templatePortStart === foundationPort ? templatePortStart + 1 : templatePortStart);
    const foundationBaseUrl = `http://127.0.0.1:${foundationPort}`;
    const templateBaseUrl = `http://127.0.0.1:${templatePort}`;

    log(`Starting Foundation Core on ${foundationBaseUrl}`);
    foundationChild = spawnNextStart(process.cwd(), foundationPort);
    await waitForReady(`${foundationBaseUrl}/api/health`, startupTimeoutMs, async (response) => response.status === 200);

    log(`Starting attached template on ${templateBaseUrl}`);
    templateChild = spawnNextStart(templateRoot, templatePort, {
      FOUNDATION_BASE_URL: foundationBaseUrl,
    });
    await waitForReady(
      `${templateBaseUrl}/api/template-attach-status`,
      startupTimeoutMs,
      async (response) => {
        if (response.status !== 200) {
          return false;
        }
        const body = await response.json();
        return body.mode === "attached" && body.reachable === true;
      },
    );

    await assertFoundationStillHealthy(foundationBaseUrl);
    await assertHome(templateBaseUrl);
    await assertAttachStatus(templateBaseUrl, foundationBaseUrl);

    log(`Attached Foundation E2E smoke passed: ${foundationBaseUrl} -> ${templateBaseUrl}`);
  } finally {
    await killProcessTree(templateChild);
    await killProcessTree(foundationChild);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
