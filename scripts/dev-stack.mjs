import { spawn } from "node:child_process";

const API_PORT = Number(process.env.API_PORT || 8787);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/health`;

let shuttingDown = false;
let apiProcess = null;
let viteProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isApiHealthy() {
  try {
    const response = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnChild(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
  });
  child.on("error", (error) => {
    console.error(`[dev-stack] ${name} failed to start:`, error instanceof Error ? error.message : String(error));
  });
  return child;
}

async function ensureApiStarted() {
  if (await isApiHealthy()) {
    console.log(`[dev-stack] API already available on :${API_PORT}`);
    return null;
  }

  console.log(`[dev-stack] starting API on :${API_PORT}`);
  const child = spawnChild("api", "node", ["server/mvpServer.js"]);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isApiHealthy()) {
      console.log("[dev-stack] API health check passed");
      return child;
    }
    if (child.exitCode != null) {
      throw new Error(`API exited early with code ${child.exitCode}`);
    }
    await sleep(500);
  }

  throw new Error("API health check timed out");
}

async function startApiSupervisor() {
  apiProcess = await ensureApiStarted();
  if (!apiProcess) return;

  apiProcess.on("exit", async (code, signal) => {
    apiProcess = null;
    if (shuttingDown) return;
    console.warn(`[dev-stack] API exited (${signal || code || 0}). restarting...`);
    try {
      apiProcess = await ensureApiStarted();
      if (apiProcess) {
        startApiSupervisor();
      }
    } catch (error) {
      console.error("[dev-stack] API restart failed:", error instanceof Error ? error.message : String(error));
      shutdown(1);
    }
  });
}

function startVite() {
  console.log(`[dev-stack] starting Vite on :${VITE_PORT}`);
  viteProcess = spawnChild("vite", "npx", ["vite", "--port", String(VITE_PORT), "--strictPort"]);
  viteProcess.on("exit", (code, signal) => {
    viteProcess = null;
    if (shuttingDown) return;
    console.warn(`[dev-stack] Vite exited (${signal || code || 0})`);
    shutdown(typeof code === "number" ? code : 1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (viteProcess && viteProcess.exitCode == null) viteProcess.kill("SIGTERM");
  if (apiProcess && apiProcess.exitCode == null) apiProcess.kill("SIGTERM");
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  await startApiSupervisor();
  startVite();
} catch (error) {
  console.error("[dev-stack] startup failed:", error instanceof Error ? error.message : String(error));
  shutdown(1);
}
