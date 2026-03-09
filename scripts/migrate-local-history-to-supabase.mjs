import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const DB_PATH = resolve(ROOT, "server/data/mvp-db.json");
const STORAGE_ROOT = resolve(ROOT, "server/data/storage");
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "app-assets");
const execFileP = promisify(execFile);

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }
}

async function supabaseRequest(path, { method = "GET", body, headers = {} } = {}) {
  assertEnv();
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Supabase error ${response.status}`);
  }
  return data;
}

async function storageUpload(pathValue, buffer, contentType = "image/png") {
  const encoded = pathValue.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encoded}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Storage upload failed (${response.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encoded}`;
}

async function optimizeLargeImage(absPath, buffer) {
  if (buffer.length <= 8 * 1024 * 1024) {
    return {
      buffer,
      ext: extname(absPath) || ".png",
      contentType: mimeFromExt(extname(absPath) || ".png"),
    };
  }
  const tempDir = mkdtempSync(join(tmpdir(), "torso-history-"));
  const inputPath = join(tempDir, basename(absPath));
  const outputPath = join(tempDir, `${basename(absPath, extname(absPath))}.jpg`);
  try {
    await writeFile(inputPath, buffer);
    await execFileP("sips", ["-Z", "2048", "-s", "format", "jpeg", "-s", "formatOptions", "82", inputPath, "--out", outputPath], {
      maxBuffer: 20 * 1024 * 1024,
    });
    const optimized = await readFile(outputPath);
    return {
      buffer: optimized,
      ext: ".jpg",
      contentType: "image/jpeg",
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function mimeFromExt(ext) {
  const normalized = String(ext || "").toLowerCase();
  if (normalized === ".png") return "image/png";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function pathFromLocalStorageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!parsed.pathname.startsWith("/api/storage/")) return "";
    return decodeURIComponent(parsed.pathname.replace("/api/storage/", ""));
  } catch {
    if (raw.startsWith("/api/storage/")) {
      return decodeURIComponent(raw.replace("/api/storage/", ""));
    }
    return "";
  }
}

async function loadLocalDb() {
  const raw = await readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function getRemoteUsersByEmail(emails) {
  if (!emails.length) return [];
  const quoted = emails.map((email) => `"${String(email).replace(/"/g, '\\"')}"`).join(",");
  return supabaseRequest(`/app_users?email=in.(${encodeURIComponent(quoted)})&select=user_id,email`);
}

async function getExistingRemoteJobIds(userId) {
  const rows = await supabaseRequest(`/app_jobs?user_id=eq.${encodeURIComponent(userId)}&select=job_id`);
  return new Set((Array.isArray(rows) ? rows : []).map((row) => row.job_id));
}

async function uploadLocalStorageFile(localStoragePath, remoteUserId, jobId, itemId, prefix) {
  const relativePath = String(localStoragePath || "").trim();
  if (!relativePath) return "";
  const absPath = join(STORAGE_ROOT, relativePath);
  if (!existsSync(absPath)) return "";
  const original = await readFile(absPath);
  const optimized = await optimizeLargeImage(absPath, original);
  const targetPath = `${remoteUserId}/migrated-history/${prefix}/${jobId}/${itemId}${optimized.ext}`;
  return storageUpload(targetPath, optimized.buffer, optimized.contentType);
}

function normalizeJobRow(job, remoteUserId) {
  return {
    job_id: job.id,
    user_id: remoteUserId,
    style: String(job.style || "torso"),
    status: String(job.status || "done"),
    output_preset: String(job.outputPreset || "default"),
    style_config: typeof job.styleConfig === "object" && job.styleConfig ? job.styleConfig : {},
    background_asset_id: null,
    model_asset_id: null,
    model_run_strategy: String(job.modelRunStrategy || "auto"),
    credit_rate: Number(job.creditRate || 0),
    reserved_credits: Number(job.reservedCredits || 0),
    credit_used: Number(job.creditUsed || 0),
    image_count: Number(job.imageCount || (job.items || []).length || 0),
    processed_count: Number(job.processedCount || 0),
    success_count: Number(job.successCount || 0),
    error_count: Number(job.errorCount || 0),
    retry_attempt: Number(job.retryAttempt || 0),
    created_at: job.createdAt || new Date().toISOString(),
    updated_at: job.updatedAt || job.createdAt || new Date().toISOString(),
  };
}

async function migrateJob(localJob, remoteUserId) {
  const jobRow = normalizeJobRow(localJob, remoteUserId);
  const migratedItems = [];
  for (const item of Array.isArray(localJob.items) ? localJob.items : []) {
    const outputStoragePath = String(item.outputStoragePath || pathFromLocalStorageUrl(item.outputUrl) || "").trim();
    const inputStoragePath = String(item.inputStoragePath || pathFromLocalStorageUrl(item.inputRef) || "").trim();
    const [remoteOutputUrl, remoteInputUrl] = await Promise.all([
      uploadLocalStorageFile(outputStoragePath, remoteUserId, localJob.id, item.id, "outputs"),
      uploadLocalStorageFile(inputStoragePath, remoteUserId, localJob.id, item.id, "inputs"),
    ]);
    migratedItems.push({
      item_id: item.id,
      job_id: localJob.id,
      user_id: remoteUserId,
      name: String(item.name || "image"),
      relative_path: String(item.relativePath || item.originalPath || item.name || ""),
      sku_guess: String(item.skuGuess || ""),
      mime: String(item.mime || "image/jpeg"),
      status: String(item.status || "done"),
      error: item.error || null,
      error_hint: item.errorHint || null,
      input_url: remoteInputUrl || "",
      output_url: remoteOutputUrl || "",
      output_name: item.outputName || null,
      output_sequence: Number(item.outputSequence || 1),
      credit_used: Number(item.creditUsed || 0),
      created_at: localJob.createdAt || new Date().toISOString(),
      updated_at: localJob.updatedAt || localJob.createdAt || new Date().toISOString(),
    });
  }

  await supabaseRequest("/app_jobs", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: jobRow,
  });

  if (migratedItems.length > 0) {
    await supabaseRequest("/app_job_items", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: migratedItems,
    });
  }

  return {
    jobId: localJob.id,
    itemCount: migratedItems.length,
  };
}

async function main() {
  const db = await loadLocalDb();
  const localUsers = Array.isArray(db.users) ? db.users : [];
  const jobs = Array.isArray(db.jobs) ? db.jobs : [];
  const emails = [...new Set(localUsers.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean))];
  const remoteUsers = await getRemoteUsersByEmail(emails);
  const remoteUserIdByEmail = new Map((Array.isArray(remoteUsers) ? remoteUsers : []).map((user) => [String(user.email || "").trim().toLowerCase(), user.user_id]));

  let migratedJobCount = 0;
  let migratedItemCount = 0;

  for (const localUser of localUsers) {
    const email = String(localUser.email || "").trim().toLowerCase();
    const remoteUserId = remoteUserIdByEmail.get(email);
    if (!remoteUserId) {
      console.log(`skip user without remote match: ${email}`);
      continue;
    }
    const existingJobIds = await getExistingRemoteJobIds(remoteUserId);
    const userJobs = jobs.filter((job) => job.userId === localUser.id);
    for (const job of userJobs) {
      if (existingJobIds.has(job.id)) continue;
      const migrated = await migrateJob(job, remoteUserId);
      migratedJobCount += 1;
      migratedItemCount += migrated.itemCount;
      console.log(`migrated job ${migrated.jobId} (${migrated.itemCount} items)`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    migratedJobCount,
    migratedItemCount,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
