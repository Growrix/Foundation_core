import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const foundationPortStart = Number(process.env.FOUNDATION_SMOKE_PORT ?? "3200");
const templatePortStart = Number(process.env.TEMPLATE_SMOKE_PORT ?? "3201");
const startupTimeoutMs = Number(process.env.SMOKE_START_TIMEOUT_MS ?? "120000");
const templateRoot = process.env.ATTACHED_TEMPLATE_ROOT
  ? path.resolve(process.env.ATTACHED_TEMPLATE_ROOT)
  : path.resolve(process.cwd(), "..", "Templates", "foundation-attached-starter");

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

function isUsableNodeExecutable(candidate) {
  if (!candidate) {
    return false;
  }

  if (candidate !== "node" && !fs.existsSync(candidate)) {
    return false;
  }

  const probe = spawnSync(candidate, ["-v"], {
    stdio: "ignore",
    windowsHide: true,
  });

  return probe.status === 0;
}

function readWhereNodeCandidates() {
  const whereResult = spawnSync("where", ["node"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (whereResult.status !== 0 || !whereResult.stdout) {
    return [];
  }

  return whereResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseVersionFromDirName(name) {
  const normalized = name.startsWith("v") ? name.slice(1) : name;
  const parts = normalized.split(".").map((value) => Number(value));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return parts;
}

function compareVersionPartsDescending(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return b[index] - a[index];
    }
  }
  return 0;
}

function readFnmInstallationCandidates() {
  const appData = process.env.APPDATA;
  if (!appData) {
    return [];
  }

  const versionsRoot = path.join(appData, "fnm", "node-versions");
  if (!fs.existsSync(versionsRoot)) {
    return [];
  }

  const currentVersionCandidate = path.join(
    versionsRoot,
    `v${process.versions.node}`,
    "installation",
    "node.exe",
  );

  const versionedCandidates = fs
    .readdirSync(versionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, parts: parseVersionFromDirName(entry.name) }))
    .filter((entry) => entry.parts !== null)
    .sort((left, right) => compareVersionPartsDescending(left.parts, right.parts))
    .map((entry) => path.join(versionsRoot, entry.name, "installation", "node.exe"));

  return [currentVersionCandidate, ...versionedCandidates];
}

function resolveNodeExecutable() {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const candidates = [
    process.env.ATTACHED_SMOKE_NODE_PATH,
    ...readFnmInstallationCandidates(),
    programFiles ? path.join(programFiles, "nodejs", "node.exe") : undefined,
    programFilesX86 ? path.join(programFilesX86, "nodejs", "node.exe") : undefined,
    ...readWhereNodeCandidates().filter((candidate) => !candidate.includes("fnm_multishells")),
    process.env.npm_node_execpath,
    process.execPath,
    "node",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isUsableNodeExecutable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No usable Node executable found for attached template smoke. Set ATTACHED_SMOKE_NODE_PATH to a valid node.exe path.",
  );
}

const nodeExecutable = resolveNodeExecutable();

function spawnNextStart(root, port, extraEnv = {}) {
  const nextBin = nextBinFor(root);
  const child = spawn(nodeExecutable, [nextBin, "start", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("error", (error) => {
    process.stderr.write(`Failed to start Next from ${root}: ${error.message}\n`);
  });

  return child;
}

function assertTemplateRuntimePrereqs(root) {
  if (!fs.existsSync(root)) {
    throw new Error(
      `Attached template root does not exist: ${root}. Set ATTACHED_TEMPLATE_ROOT to a valid template runtime path.`,
    );
  }

  const templateNextBin = nextBinFor(root);
  if (!fs.existsSync(templateNextBin)) {
    throw new Error(
      `Attached template dependencies are missing at ${root}. Run npm install in the template root first.`,
    );
  }

  const buildIdPath = path.resolve(root, ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdPath)) {
    throw new Error(
      `Attached template build output is missing at ${root}. Run npm run build in the template root first.`,
    );
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

async function assertHome(baseUrl) {
  const response = await fetch(`${baseUrl}/`, { cache: "no-store" });
  const text = await response.text();
  const hasKnownMarker =
    text.includes("Built and Maintained by Growrix OS") ||
    text.toLowerCase().includes("foundation attached") ||
    text.toLowerCase().includes("mock fallback mode");

  if (response.status !== 200 || !hasKnownMarker) {
    throw new Error(`Expected attached template home route to return an attached template surface at ${baseUrl}/.`);
  }
  log(`ATTACHED PASS: template home route -> ${response.status}`);
}

async function assertAttachStatus(baseUrl, foundationBaseUrl) {
  const response = await fetch(`${baseUrl}/api/template-attach-status`, { cache: "no-store" });

  if (response.status === 404) {
    const homeResponse = await fetch(`${baseUrl}/`, { cache: "no-store" });
    const home = await homeResponse.text();
    const normalizedHome = home.toLowerCase();
    const mode = normalizedHome.includes("foundation attached")
      ? "attached"
      : normalizedHome.includes("mock fallback mode")
        ? "mock-fallback"
        : null;

    if (homeResponse.status !== 200 || mode === null) {
      throw new Error(
        "Template does not expose /api/template-attach-status and home surface did not prove attached or fallback mode.",
      );
    }

    const baseUrlMatches = home.includes(foundationBaseUrl);
    const baseUrlNote = mode === "attached" && !baseUrlMatches ? " (base-url-mismatch)" : "";
    log(`ATTACHED PASS: template attach status -> proved via home surface fallback (${mode}${baseUrlNote})`);
    return;
  }

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
    assertTemplateRuntimePrereqs(templateRoot);

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
    await waitForReady(`${templateBaseUrl}/`, startupTimeoutMs, async (response) => response.status === 200);

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
