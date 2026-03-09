import { execFile } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = resolve(__dirname, "./data/mvp-db.json");
const STORAGE_ROOT = resolve(__dirname, "./data/storage");
const PUBLIC_ROOT = resolve(__dirname, "../public");
const MAX_REQUEST_BYTES = Math.max(10 * 1024 * 1024, Number(process.env.API_MAX_REQUEST_BYTES || 200 * 1024 * 1024));
const INPUT_CONVERT_MAX_SIDE = Math.max(1024, Number(process.env.INPUT_CONVERT_MAX_SIDE || 5120));
const INPUT_JPEG_QUALITY = Math.min(100, Math.max(60, Number(process.env.INPUT_JPEG_QUALITY || 85)));

function loadDotEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const lineRaw of raw.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key || process.env[key]) continue;
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore .env parsing errors and rely on process env
  }
}

loadDotEnvLocal();

const PORT = Number(process.env.API_PORT || 8787);
const FASHN_API_KEY = process.env.FASHN_API_KEY || "";
const FASHN_BASE_URL = (process.env.FASHN_BASE_URL || "https://api.fashn.ai/v1").replace(/\/$/, "");
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "app-assets");
function normalizeTryonProModelName(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "tryon-max";
  if (v === "tryon-pro") return "tryon-max";
  return value;
}

const FASHN_TRYON_MAX_MODEL_NAME = normalizeTryonProModelName(process.env.FASHN_TRYON_MAX_MODEL_NAME || process.env.FASHN_TRYON_PRO_MODEL_NAME || "tryon-max");
const FASHN_TRYON_V16_MODEL_NAME = process.env.FASHN_TRYON_V16_MODEL_NAME || "tryon-v1.6";
const BACKEND_PUBLIC_BASE_URL = String(process.env.BACKEND_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const TORSO_PROMPT_IMAGE_PATH = resolve(PUBLIC_ROOT, "torsoprompt.png");
const MANNEQUIN_PROMPT_IMAGE_PATH = resolve(PUBLIC_ROOT, "mannequinprompt.png");
const HANGER_TOP_PROMPT_IMAGE_PATH = resolve(PUBLIC_ROOT, "hangerprompt.png");
const DEFAULT_STORAGE_MODEL_FILES = Array.from({ length: 12 }, (_, idx) => `m${idx + 1}.png`);
const DEFAULT_STORAGE_STUDIO_FILES = ["bg1.png", "bg2.png", "bg3.png", "bg4.png", "bg5.png", "bg6.png", "bg7.png", "bg8.png", "bg9.png", "bg10.png"];
const BACKGROUND_EDIT_PROMPT = [
  "Replace the background with the provided image.",
  "Treat the background as the primary scene and place the subject naturally within that environment, as if the photograph was originally taken there.",
  "Analyze the background’s spatial depth, horizon line, camera height, lens perspective, and vanishing point.",
  "Adjust the subject’s scale and positioning so she fits realistically within the environment’s natural proportions.",
  "You may adjust pose, body orientation, and stance to best fit the scene naturally.",
  "The subject does not need to be centered and does not need to dominate the frame.",
  "Avoid forcing the subject to be overly large or foregrounded if it breaks environmental realism.",
  "Choose the strongest editorial composition for a high-end fashion magazine look.",
  "Match lighting direction, intensity, color temperature, atmospheric depth, and shadow softness precisely to the background.",
  "Add physically accurate ground contact shadows and subtle ambient occlusion consistent with the surface material.",
  "If necessary, adjust framing for natural environmental context without excessive cropping.",
  "Do not alter facial identity.",
  "Do not alter garment design, silhouette, logos, colors, textures, or details.",
  "Do not replace the person or clothing.",
  "Only adapt pose, subject placement, and scene integration so the result feels naturally photographed in this location.",
].join("\n");
const MODEL_CREATE_FEMALE_STYLE_PROMPT = [
  "Wearing a plain white fitted tank top with thin straps,",
  "",
  "high-waisted dark gray denim shorts.",
  "",
  "Barefoot.",
  "",
  "Standing straight, perfectly centered in the frame,",
  "",
  "facing directly forward,",
  "",
  "arms relaxed naturally at sides,",
  "",
  "feet parallel and shoulder-width apart.",
  "",
  "Full body fully visible from head to toes.",
  "",
  "No cropping.",
  "",
  "Entire head and both feet must be inside the frame.",
  "",
  "Camera straight-on at chest height.",
  "",
  "Symmetrical fashion catalog composition.",
  "",
  "Seamless light gray cyclorama background.",
  "No visible floor.",
  "No horizon line.",
].join("\n");
const MODEL_CREATE_MALE_STYLE_PROMPT = [
  "Wearing a plain white fitted t-shirt,",
  "dark gray denim shorts that end well above the knees,",
  "mid-thigh length.",
  "",
  "Barefoot.",
  "",
  "Standing straight, perfectly centered in the frame,",
  "facing directly forward,",
  "arms relaxed naturally at sides,",
  "feet parallel and shoulder-width apart.",
  "",
  "Full body fully visible from head to toes.",
  "No cropping.",
  "Entire head and both feet must be inside the frame.",
  "",
  "Camera straight-on at chest height.",
  "Symmetrical fashion catalog composition.",
  "",
  "Simple light gray studio background.",
  "Natural soft lighting.",
].join("\n");
let torsoPromptDataUrlCache = null;
let mannequinPromptDataUrlCache = null;
let hangerTopPromptDataUrlCache = null;

const CREDIT_BY_STYLE = {
  torso: 1,
  mannequin: 1,
  hanger: 1,
  ghost: 1,
  model: 2,
  custom: 3,
};
const MODEL_RUN_CREDIT_BY_STRATEGY = {
  "tryon-v1.6": 1,
  "tryon-max": 4,
  "product-to-model": 1,
};
const HIGH_QUALITY_PLANS = new Set(["growth", "business", "enterprise", "custom", "standard", "pro"]);

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

function ensureDbFile() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORAGE_ROOT)) mkdirSync(STORAGE_ROOT, { recursive: true });
  if (!existsSync(DB_PATH)) {
    writeFileSync(DB_PATH, JSON.stringify({ users: [], jobs: [], jobEvents: [], creditEvents: [], assetLibraries: [] }, null, 2));
  }
}

function loadDb() {
  ensureDbFile();
  try {
    const raw = readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      jobEvents: Array.isArray(parsed.jobEvents) ? parsed.jobEvents : [],
      creditEvents: Array.isArray(parsed.creditEvents) ? parsed.creditEvents : [],
      assetLibraries: Array.isArray(parsed.assetLibraries) ? parsed.assetLibraries : [],
    };
  } catch {
    return { users: [], jobs: [], jobEvents: [], creditEvents: [], assetLibraries: [] };
  }
}

let db = loadDb();

function saveDb() {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };
}

function json(res, status, payload) {
  res.writeHead(status, corsHeaders());
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_REQUEST_BYTES) {
        rejectBody(new Error("payload too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(data));
      } catch {
        rejectBody(new Error("invalid json"));
      }
    });
    req.on("error", rejectBody);
  });
}

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeAssetLibraryPayload(raw = {}) {
  const payload = typeof raw === "object" && raw ? raw : {};
  const normalizeAsset = (asset = {}) => {
    const next = { ...(asset || {}) };
    next.outputUrl = absolutizeStorageUrl(next.outputUrl);
    next.sourceUrl = absolutizeStorageUrl(next.sourceUrl);
    next.dataUrl = absolutizeStorageUrl(next.dataUrl);
    next.faceReferenceUrl = absolutizeStorageUrl(next.faceReferenceUrl);
    next.faceReferenceDataUrl = absolutizeStorageUrl(next.faceReferenceDataUrl);
    return next;
  };
  const normalizeList = (list) => (Array.isArray(list) ? list.map((asset) => normalizeAsset(asset)) : []);
  return {
    studio: normalizeList(payload.studio),
    models: normalizeList(payload.models),
    products: normalizeList(payload.products),
  };
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function normalizeSupabasePlanId(plan) {
  const value = String(plan || "growth").toLowerCase();
  if (value === "standard") return "growth";
  if (value === "light") return "starter";
  if (value === "pro") return "enterprise";
  if (value === "starter" || value === "growth" || value === "business" || value === "enterprise" || value === "custom") {
    return value;
  }
  return "growth";
}

function hasAnyAssetItems(lib = {}) {
  return (Array.isArray(lib.studio) && lib.studio.length > 0)
    || (Array.isArray(lib.models) && lib.models.length > 0)
    || (Array.isArray(lib.products) && lib.products.length > 0);
}

async function upsertSupabaseUser(user) {
  if (!hasSupabaseConfig() || !user?.id) return;
  try {
    await supabaseRequest("/app_users?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{
        user_id: String(user.id),
        email: String(user.email || ""),
        display_name: String(user.name || ""),
          plan_id: normalizeSupabasePlanId(user.plan),
        credits: Number(user.credits || 0),
      }]),
    });
    await supabaseRequest("/app_user_settings?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{
        user_id: String(user.id),
        locale: "ja-JP",
        timezone: "Asia/Tokyo",
      }]),
    });
  } catch (error) {
    console.warn("[upsertSupabaseUser] skipped", error instanceof Error ? error.message : String(error));
  }
}

function pathExtFromMime(mime = "") {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("heic")) return ".heic";
  if (m.includes("heif")) return ".heif";
  return ".jpg";
}

function encodePathForStorage(pathValue) {
  return String(pathValue || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function uploadBufferToSupabaseStorage(pathValue, buffer, contentType = "image/jpeg") {
  if (!hasSupabaseConfig()) return "";
  const encodedPath = encodePathForStorage(pathValue);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `storage upload failed (${response.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${encodedPath}`;
}

async function persistBufferToManagedStorage(pathValue, buffer, contentType = "image/jpeg") {
  if (hasSupabaseConfig()) {
    return uploadBufferToSupabaseStorage(pathValue, buffer, contentType);
  }
  writeStorageFile(pathValue, buffer);
  return buildStorageUrl(pathValue) || `/api/storage/${encodePathForStorage(pathValue)}`;
}

async function ensureDefaultPublicAssetsInSupabase() {
  if (!hasSupabaseConfig()) return;
  const uploadOne = async (publicFileName, storagePath) => {
    const localPath = resolve(PUBLIC_ROOT, publicFileName);
    if (!existsSync(localPath)) return;
    const buffer = readFileSync(localPath);
    const mime = contentTypeFromFilePath(localPath).split(";")[0] || "image/png";
    await uploadBufferToSupabaseStorage(storagePath, buffer, mime);
  };
  const tasks = [];
  DEFAULT_STORAGE_MODEL_FILES.forEach((fileName) => {
    tasks.push(uploadOne(fileName, `defaults/models/${fileName}`));
  });
  DEFAULT_STORAGE_STUDIO_FILES.forEach((fileName) => {
    tasks.push(uploadOne(fileName, `defaults/studio/${fileName}`));
  });
  await Promise.all(tasks);
}

function localStoragePathFromUrl(url) {
  const raw = String(url || "");
  if (!raw) return "";
  if (raw.startsWith("/api/storage/")) {
    return decodeURIComponent(raw.replace("/api/storage/", ""));
  }
  if (/^https?:\/\//.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/api/storage/")) {
        return decodeURIComponent(parsed.pathname.replace("/api/storage/", ""));
      }
    } catch {
      return "";
    }
  }
  return "";
}

async function compactSingleAssetForSupabase(userId, assetType, asset) {
  const next = { ...(asset || {}) };
  const candidates = [
    { field: "dataUrl", purpose: "output" },
    { field: "outputUrl", purpose: "output" },
    { field: "faceReferenceDataUrl", purpose: "face" },
  ];
  for (const candidate of candidates) {
    const value = String(next[candidate.field] || "");
    if (!value) continue;
    if (isDataUrl(value)) {
      const { mime, buffer } = parseDataUrl(value);
      const ext = pathExtFromMime(mime);
      const relPath = `${userId}/${assetType}/${candidate.purpose}/${Date.now()}-${randomUUID()}${ext}`;
      const publicUrl = await persistBufferToManagedStorage(relPath, buffer, mime || "image/jpeg");
      if (candidate.purpose === "face") {
        next.faceReferenceUrl = publicUrl;
        next.faceReferenceDataUrl = "";
      } else {
        next.outputUrl = publicUrl;
        if (!next.sourceUrl) next.sourceUrl = publicUrl;
        next.dataUrl = "";
      }
      continue;
    }
    const localPath = localStoragePathFromUrl(value);
    if (!localPath) continue;
    const abs = storageAbsPath(localPath);
    if (!existsSync(abs)) continue;
    const buffer = readFileSync(abs);
    const ext = extname(abs).toLowerCase() || ".jpg";
    const contentType = contentTypeFromFilePath(abs);
    const relPath = `${userId}/${assetType}/${candidate.purpose}/${Date.now()}-${randomUUID()}${ext}`;
    const publicUrl = await persistBufferToManagedStorage(relPath, buffer, contentType);
    if (candidate.purpose === "face") {
      next.faceReferenceUrl = publicUrl;
      next.faceReferenceDataUrl = "";
    } else {
      next.outputUrl = publicUrl;
      if (!next.sourceUrl) next.sourceUrl = publicUrl;
      if (candidate.field === "dataUrl") next.dataUrl = "";
    }
  }
  return next;
}

async function compactAssetLibraryForSupabase(userId, payload) {
  const normalized = normalizeAssetLibraryPayload(payload);
  if (!hasAnyAssetItems(normalized)) {
    return normalized;
  }
  const studio = [];
  const models = [];
  const products = [];
  for (const asset of normalized.studio) studio.push(await compactSingleAssetForSupabase(userId, "studio", asset));
  for (const asset of normalized.models) models.push(await compactSingleAssetForSupabase(userId, "models", asset));
  for (const asset of normalized.products) products.push(await compactSingleAssetForSupabase(userId, "products", asset));
  return { studio, models, products };
}

async function supabaseRequest(path, options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error("supabase is not configured");
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.hint || data?.error || `supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function readAssetLibrary(userId) {
  if (!userId) return { studio: [], models: [], products: [] };
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(
      `/app_asset_libraries?user_id=eq.${encodeURIComponent(userId)}&select=studio_assets,model_assets,product_assets&limit=1`,
      { method: "GET" },
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) return { studio: [], models: [], products: [] };
    return normalizeAssetLibraryPayload({
      studio: row.studio_assets,
      models: row.model_assets,
      products: row.product_assets,
    });
  }
  const row = (db.assetLibraries || []).find((item) => item.userId === userId);
  return normalizeAssetLibraryPayload(row || {});
}

async function writeAssetLibrary(userId, payload) {
  const normalized = normalizeAssetLibraryPayload(payload);
  if (!userId) return normalized;
  const compacted = await compactAssetLibraryForSupabase(userId, normalized);
  if (hasSupabaseConfig()) {
    const body = [{
      user_id: userId,
      studio_assets: compacted.studio,
      model_assets: compacted.models,
      product_assets: compacted.products,
    }];
    const rows = await supabaseRequest("/app_asset_libraries?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    });
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) return compacted;
    return normalizeAssetLibraryPayload({
      studio: row.studio_assets,
      models: row.model_assets,
      products: row.product_assets,
    });
  }
  const now = nowIso();
  const libs = Array.isArray(db.assetLibraries) ? db.assetLibraries : [];
  const idx = libs.findIndex((item) => item.userId === userId);
  if (idx >= 0) {
    libs[idx] = {
      ...libs[idx],
      ...compacted,
      updatedAt: now,
    };
  } else {
    libs.push({
      userId,
      ...compacted,
      createdAt: now,
      updatedAt: now,
    });
  }
  db.assetLibraries = libs;
  saveDb();
  return compacted;
}

function nowIso() {
  return new Date().toISOString();
}

function compactTimestamp(source = null) {
  const d = source ? new Date(source) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function buildOutputFileName({ style = "torso", seq = 1, createdAt = null, ext = "jpg" }) {
  const safeStyle = String(style || "torso").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "torso";
  const safeExt = String(ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const safeSeq = String(Math.max(1, Number(seq) || 1)).padStart(2, "0");
  return `torso-ai-${compactTimestamp(createdAt)}-${safeStyle}-${safeSeq}.${safeExt}`;
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function findUser(userId) {
  return db.users.find((u) => u.id === userId);
}

function findJob(jobId) {
  return db.jobs.find((j) => j.id === jobId);
}

function canUseHighQuality(plan) {
  return HIGH_QUALITY_PLANS.has(String(plan || "").toLowerCase());
}

function normalizeTargetGender(value) {
  return String(value || "").toLowerCase() === "mens" ? "mens" : "womens";
}

function withDefaultModelStylePrompt(prompt, targetGender = "womens") {
  const base = String(prompt || "").trim();
  if (!base) return "";
  const gender = normalizeTargetGender(targetGender);
  const lower = base.toLowerCase();
  const femaleSignature = "wearing a plain white fitted tank top with thin straps";
  const maleSignature = "wearing a plain white fitted t-shirt";

  if (gender === "womens") {
    if (lower.includes(femaleSignature)) return base;
    return `${base}\n\n${MODEL_CREATE_FEMALE_STYLE_PROMPT}`;
  }
  if (gender === "mens") {
    if (lower.includes(maleSignature)) return base;
    return `${base}\n\n${MODEL_CREATE_MALE_STYLE_PROMPT}`;
  }
  return base;
}

function appendJobEvent(jobId, type, payload = {}) {
  db.jobEvents.push({
    id: id("evt"),
    jobId,
    type,
    payload,
    createdAt: nowIso(),
  });
}

function appendCreditEvent(userId, type, delta, payload = {}) {
  if (!userId) return;
  const user = findUser(userId);
  db.creditEvents.push({
    id: id("cev"),
    userId,
    type,
    delta: Number(delta || 0),
    balanceAfter: Number(user?.credits || 0),
    payload,
    createdAt: nowIso(),
  });
}

function skuGuessFromPath(pathValue) {
  const rel = safeRelPath(pathValue);
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.length > 1) return parts[0];
  const stem = basename(rel).replace(/\.[^.]+$/, "");
  const tokens = stem.split(/[_\-. ]+/).filter(Boolean);
  return tokens[0] || "unknown";
}

function safeRelPath(pathValue) {
  const normalized = normalize(String(pathValue || ""))
    .replace(/^([/\\])+/, "")
    .replace(/\.\.(\/|\\)/g, "");
  return normalized || "image.jpg";
}

function mimeFromExt(ext) {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  return "image/jpeg";
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("heic")) return ".heic";
  if (m.includes("heif")) return ".heif";
  return ".jpg";
}

function contentTypeFromFilePath(pathValue) {
  const ext = extname(pathValue).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "image/jpeg";
}

function storageAbsPath(relPath) {
  const safe = safeRelPath(relPath);
  return join(STORAGE_ROOT, safe);
}

function writeStorageFile(relPath, buffer) {
  const absPath = storageAbsPath(relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, buffer);
}

function buildStorageUrl(relPath) {
  const encoded = safeRelPath(relPath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const origin = BACKEND_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
  return `${origin}/api/storage/${encoded}`;
}

function absolutizeStorageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("/api/storage/")) return raw;
  const origin = BACKEND_PUBLIC_BASE_URL || `http://localhost:${PORT}`;
  return `${origin}${raw}`;
}

function parseDataUrl(dataUrl) {
  const text = String(dataUrl || "");
  const match = text.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("invalid data url");
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function safeDownloadBaseName(filename) {
  const base = String(filename || "image")
    .replace(/\.[^.]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "image";
}

function getTorsoPromptReference() {
  if (torsoPromptDataUrlCache) return torsoPromptDataUrlCache;
  if (!existsSync(TORSO_PROMPT_IMAGE_PATH)) return "";
  try {
    const buffer = readFileSync(TORSO_PROMPT_IMAGE_PATH);
    torsoPromptDataUrlCache = `data:image/png;base64,${buffer.toString("base64")}`;
    return torsoPromptDataUrlCache;
  } catch {
    return "";
  }
}

function getMannequinPromptReference() {
  if (mannequinPromptDataUrlCache) return mannequinPromptDataUrlCache;
  if (!existsSync(MANNEQUIN_PROMPT_IMAGE_PATH)) return "";
  try {
    const buffer = readFileSync(MANNEQUIN_PROMPT_IMAGE_PATH);
    mannequinPromptDataUrlCache = `data:image/png;base64,${buffer.toString("base64")}`;
    return mannequinPromptDataUrlCache;
  } catch {
    return "";
  }
}

function getHangerTopPromptReference() {
  if (hangerTopPromptDataUrlCache) return hangerTopPromptDataUrlCache;
  if (!existsSync(HANGER_TOP_PROMPT_IMAGE_PATH)) return "";
  try {
    const buffer = readFileSync(HANGER_TOP_PROMPT_IMAGE_PATH);
    hangerTopPromptDataUrlCache = `data:image/png;base64,${buffer.toString("base64")}`;
    return hangerTopPromptDataUrlCache;
  } catch {
    return "";
  }
}

function isBottomGarmentName(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  const keywords = [
    "pants", "pant", "trouser", "trousers", "slack", "slacks", "jean", "jeans", "denim",
    "bottom", "shorts", "skirt", "culotte", "leggings",
    "ズボン", "パンツ", "スラックス", "ジーンズ", "デニム", "ボトム", "ショーツ", "スカート",
  ];
  return keywords.some((k) => n.includes(k));
}

function isFootwearGarmentName(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  const keywords = [
    "shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "loafer", "loafers",
    "heel", "heels", "sandals", "sandal", "mule", "mules",
    "靴", "シューズ", "スニーカー", "ブーツ", "サンダル", "パンプス",
  ];
  return keywords.some((k) => n.includes(k));
}

function inferGarmentCategoryFromName(name) {
  if (isFootwearGarmentName(name)) return "footwear";
  if (isBottomGarmentName(name)) return "bottom";
  return "top";
}

function getHangerPromptReference() {
  return getHangerTopPromptReference();
}

function toPublicDataUrl(ref) {
  const value = String(ref || "");
  const tryResolveStoragePath = (pathLike) => {
    const normalizedPath = (() => {
      try {
        return new URL(pathLike, "http://localhost").pathname || pathLike;
      } catch {
        return String(pathLike || "").split("?")[0].split("#")[0] || String(pathLike || "");
      }
    })();
    if (!normalizedPath.startsWith("/api/storage/")) return "";
    const relPath = decodeURIComponent(normalizedPath.replace("/api/storage/", ""));
    const absPath = storageAbsPath(relPath);
    if (!existsSync(absPath)) return "";
    try {
      const buffer = readFileSync(absPath);
      const mime = contentTypeFromFilePath(absPath).split(";")[0] || "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return "";
    }
  };

  // Handles relative storage URL: /api/storage/...
  const fromRelativeStorage = tryResolveStoragePath(value);
  if (fromRelativeStorage) return fromRelativeStorage;

  // Handles absolute storage URL: http://localhost:8787/api/storage/... or public base URL.
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const pathOnly = `${parsed.pathname}${parsed.search || ""}${parsed.hash || ""}`;
      const fromAbsoluteStorage = tryResolveStoragePath(pathOnly);
      if (fromAbsoluteStorage) return fromAbsoluteStorage;
    } catch {
      // keep original URL
    }
    return value;
  }

  if (!value.startsWith("/")) return value;
  const normalizedPath = (() => {
    try {
      return new URL(value, "http://localhost").pathname || value;
    } catch {
      return value.split("?")[0].split("#")[0] || value;
    }
  })();
  // /api/storage/* is already handled above via tryResolveStoragePath.
  const candidates = [
    resolve(PUBLIC_ROOT, `.${normalizedPath}`),
    resolve(PUBLIC_ROOT, basename(normalizedPath)),
  ];
  for (const absPath of candidates) {
    if (!absPath.startsWith(PUBLIC_ROOT) || !existsSync(absPath)) continue;
    const ext = extname(absPath).toLowerCase();
    const mime = mimeFromExt(ext);
    try {
      const buffer = readFileSync(absPath);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      // try next candidate
    }
  }
  return value;
}

async function extractImagesFromZip(dataUrl, zipName) {
  const { buffer } = parseDataUrl(dataUrl);
  const tempDir = mkdtempSync(join(tmpdir(), "fcursor-zip-"));
  const zipPath = join(tempDir, "input.zip");
  writeFileSync(zipPath, buffer);

  try {
    const { stdout } = await execFileP("unzip", ["-Z1", zipPath], { maxBuffer: 10 * 1024 * 1024 });
    const entries = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((entry) => !entry.endsWith("/"))
      .filter((entry) => IMAGE_EXTS.has(extname(entry).toLowerCase()));

    const extracted = [];
    for (const entry of entries) {
      const out = await execFileP("unzip", ["-p", zipPath, entry], { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 });
      const ext = extname(entry).toLowerCase();
      const mime = mimeFromExt(ext);
      const b64 = out.stdout.toString("base64");
      extracted.push({
        name: basename(entry),
        relativePath: entry,
        mime,
        dataUrl: `data:${mime};base64,${b64}`,
        sourceZip: zipName,
      });
    }
    return extracted;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function expandInputFiles(files) {
  const all = [];
  for (const file of files) {
    const name = String(file.name || "image.jpg");
    let dataUrl = String(file.dataUrl || "");
    const sourceUrl = String(file.url || "").trim();
    const isZip = name.toLowerCase().endsWith(".zip");

    if (!dataUrl && sourceUrl) {
      if (sourceUrl.startsWith("/api/storage/")) {
        const localPath = localStoragePathFromUrl(sourceUrl);
        const abs = localPath ? storageAbsPath(localPath) : "";
        if (!abs || !existsSync(abs)) {
          throw new Error(`invalid image url payload: ${name}`);
        }
        const buffer = readFileSync(abs);
        const mime = contentTypeFromFilePath(abs);
        dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      } else {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`failed to fetch image payload: ${name} (${response.status})`);
        }
        const contentType = String(response.headers.get("content-type") || "");
        const mime = contentType.includes("image/") || contentType.includes("application/zip")
          ? contentType.split(";")[0].trim()
          : (isZip ? "application/zip" : "image/jpeg");
        const buffer = Buffer.from(await response.arrayBuffer());
        dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    }

    if (isZip) {
      const extracted = await extractImagesFromZip(dataUrl, name);
      all.push(...extracted);
      continue;
    }

    if (!dataUrl.startsWith("data:image/")) {
      throw new Error(`invalid image payload: ${name}`);
    }

    all.push({
      name,
      relativePath: String(file.relativePath || name),
      mime: String(file.type || "image/jpeg"),
      dataUrl,
      sourceZip: null,
      clientRef: String(file.clientRef || ""),
    });
  }

  return all;
}

async function convertToJpegDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  const tempDir = mkdtempSync(join(tmpdir(), "fcursor-image-"));
  const inputExt = extFromMime(parsed.mime);
  const inputPath = join(tempDir, `input${inputExt}`);
  const outputPath = join(tempDir, "output.jpg");
  writeFileSync(inputPath, parsed.buffer);

  try {
    await execFileP(
      "sips",
      [
        "-s", "format", "jpeg",
        "-s", "formatOptions", String(INPUT_JPEG_QUALITY),
        "--resampleHeightWidthMax", String(INPUT_CONVERT_MAX_SIDE),
        inputPath,
        "--out", outputPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const outputBuffer = readFileSync(outputPath);
    return {
      mime: "image/jpeg",
      buffer: outputBuffer,
      dataUrl: `data:image/jpeg;base64,${outputBuffer.toString("base64")}`,
    };
  } catch {
    throw new Error("画像のJPG変換に失敗しました。JPG/PNG/WEBPで再試行してください。");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function convertImageBufferFormat(buffer, inputExt, targetFormat) {
  const normalizedFormat = targetFormat === "jpg" ? "jpeg" : "png";
  const tempDir = mkdtempSync(join(tmpdir(), "fcursor-export-image-"));
  const normalizedInputExt = String(inputExt || ".jpg").toLowerCase();
  const safeInputExt = normalizedInputExt === ".jpeg" ? ".jpg" : normalizedInputExt;
  const inputPath = join(tempDir, `input${safeInputExt || ".jpg"}`);
  const outputPath = join(tempDir, `output.${targetFormat}`);
  writeFileSync(inputPath, buffer);

  try {
    const args = ["-s", "format", normalizedFormat];
    if (normalizedFormat === "jpeg") {
      args.push("-s", "formatOptions", "92");
    }
    args.push(inputPath, "--out", outputPath);
    await execFileP("sips", args, { maxBuffer: 10 * 1024 * 1024 });
    return readFileSync(outputPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function exportImagesAsZip(items, format = "png") {
  const targetFormat = format === "jpg" ? "jpg" : "png";
  const tmpRoot = mkdtempSync(join(tmpdir(), "fcursor-export-zip-"));
  const outDir = join(tmpRoot, "out");
  mkdirSync(outDir, { recursive: true });

  try {
    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i] || {};
      const sourceUrl = String(entry.url || "");
      if (!sourceUrl) continue;

      const response = await fetch(sourceUrl);
      if (!response.ok) continue;
      const sourceBuffer = Buffer.from(await response.arrayBuffer());

      let sourceExt = extFromMime(response.headers.get("content-type"));
      if (!sourceExt) {
        try {
          sourceExt = extname(new URL(sourceUrl).pathname).toLowerCase() || ".jpg";
        } catch {
          sourceExt = ".jpg";
        }
      }
      if (sourceExt === ".jpeg") sourceExt = ".jpg";

      const baseName = safeDownloadBaseName(entry.filename || `image_${i + 1}`);
      const outputName = `${baseName}.${targetFormat}`;
      const outputPath = join(outDir, outputName);

      let outputBuffer = sourceBuffer;
      const sameFormat = (targetFormat === "png" && sourceExt === ".png")
        || (targetFormat === "jpg" && (sourceExt === ".jpg" || sourceExt === ".jpeg"));
      if (!sameFormat) {
        outputBuffer = await convertImageBufferFormat(sourceBuffer, sourceExt, targetFormat);
      }
      writeFileSync(outputPath, outputBuffer);
    }

    const zipPath = join(tmpRoot, `generated-images-${compactTimestamp()}.zip`);
    await execFileP("zip", ["-qr", zipPath, "."], { cwd: outDir, maxBuffer: 20 * 1024 * 1024 });
    return readFileSync(zipPath);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function normalizeAndStoreInputImage(jobId, item) {
  const converted = await convertToJpegDataUrl(item.inputDataUrl);
  const storagePath = `inputs/${jobId}/${item.id}.jpg`;
  writeStorageFile(storagePath, converted.buffer);
  const storageUrl = buildStorageUrl(storagePath);

  // Keep refs on disk/storage and avoid persisting large base64 in DB.
  item.inputDataUrl = "";
  item.inputMime = converted.mime;
  item.inputStoragePath = storagePath;
  item.inputStorageUrl = storageUrl;
  item.inputRef = storageUrl || `/api/storage/${encodePathForStorage(storagePath)}`;
}

async function fashnRequest(path, options = {}) {
  if (!FASHN_API_KEY) {
    throw new Error("FASHN_API_KEY is missing");
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;
  const { timeoutMs: _ignoredTimeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${FASHN_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${FASHN_API_KEY}`,
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && String(error.name || "") === "AbortError") {
      throw new Error(`FASHN request timeout: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.message || data?.error || `FASHN error ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

function normalizeStyleConfig(style, outputPreset, rawConfig = {}) {
  const cfg = typeof rawConfig === "object" && rawConfig ? rawConfig : {};
  const bg = typeof cfg.background === "object" && cfg.background ? cfg.background : {};
  const ratioRaw = String(cfg.aspectRatio || outputPreset || "fourThree");
  const ratioMap = {
    default: "4:3",
    oneOne: "1:1",
    threeFour: "3:4",
    fourThree: "4:3",
    nineSixteen: "9:16",
    sixteenNine: "16:9",
    twoThree: "2:3",
    threeTwo: "3:2",
    fourFive: "4:5",
    fiveFour: "5:4",
    square: "1:1",
  };
  return {
    mode: String(cfg.mode || style || "torso"),
    aspectRatio: ratioMap[ratioRaw] || ratioRaw,
    targetGender: String(cfg.targetGender || "womens"),
    orientation: String(cfg.orientation || "front"),
    framing: String(cfg.framing || "full"),
    background: {
      type: String(bg.type || "solid"),
      color: String(bg.color || "#FFFFFF"),
    },
    lighting: String(cfg.lighting || "soft"),
    quality: String(cfg.quality || "standard"),
    preserveDetails: cfg.preserveDetails !== false,
    customPrompt: String(cfg.customPrompt || ""),
  };
}

function resolveFashnResolution(styleConfig) {
  return styleConfig?.quality === "high" ? "4k" : "1k";
}

function resolveFashnOutputFormat() {
  return "png";
}

function normalizeModelRunStrategy(value) {
  const v = String(value || "auto").trim().toLowerCase();
  if (v === "tryon" || v === "try-on" || v === "tryon-max" || v === "try-on-max" || v === "tryon-pro" || v === "try-on-pro") {
    return "tryon-max";
  }
  if (v === "tryon-v1.6" || v === "try-on-v1.6" || v === "v1.6" || v === "tryon16") return "tryon-v1.6";
  if (v === "product-to-model" || v === "product_to_model" || v === "producttomodel" || v === "product") {
    return "product-to-model";
  }
  return "auto";
}

function hasExtraTryonInstructions(styleConfig) {
  if (!styleConfig || typeof styleConfig !== "object") return false;
  const customPrompt = String(styleConfig.customPrompt || "").trim();
  if (customPrompt) return true;
  const orientation = String(styleConfig.orientation || "front");
  if (orientation !== "front") return true;
  const framing = String(styleConfig.framing || "focus");
  if (framing !== "focus") return true;
  return false;
}

function resolveTryonVariant(modelRunStrategy, styleConfig) {
  const normalized = normalizeModelRunStrategy(modelRunStrategy || "auto");
  if (normalized === "tryon-v1.6" || normalized === "tryon-max") return normalized;
  return hasExtraTryonInstructions(styleConfig) ? "tryon-max" : "tryon-v1.6";
}

function resolveEffectiveRunStrategy(style, requestedModelRunStrategy, styleConfig) {
  const normalizedStyle = String(style || "");
  if (normalizedStyle === "model") {
    const requested = normalizeModelRunStrategy(requestedModelRunStrategy || "auto");
    if (requested === "product-to-model") return "product-to-model";
    return resolveTryonVariant(requested, styleConfig);
  }
  if (normalizedStyle === "torso" || normalizedStyle === "mannequin") {
    const requested = normalizeModelRunStrategy(requestedModelRunStrategy || "product-to-model");
    return requested === "tryon-max" ? "tryon-max" : "product-to-model";
  }
  return "product-to-model";
}

function resolveBaseCreditRate(style, effectiveRunStrategy) {
  if (style === "model") {
    return MODEL_RUN_CREDIT_BY_STRATEGY[effectiveRunStrategy || "tryon-v1.6"] || 1;
  }
  if (effectiveRunStrategy === "tryon-max") return MODEL_RUN_CREDIT_BY_STRATEGY["tryon-max"];
  return CREDIT_BY_STYLE[style] || 1;
}

function isTryonStrategy(strategy) {
  return strategy === "tryon-v1.6" || strategy === "tryon-max";
}

function resolveQualitySurcharge(styleConfig, effectiveRunStrategy) {
  if (isTryonStrategy(effectiveRunStrategy)) return 0;
  return styleConfig?.quality === "high" ? 1 : 0;
}

function resolveModelReferenceSurcharge(style, modelAssetId, effectiveRunStrategy) {
  if (!modelAssetId || style === "model") return 0;
  if (effectiveRunStrategy === "tryon-max") return 0;
  return 1;
}

function resolveBackgroundEditSurcharge(backgroundMode, backgroundReference) {
  const mode = String(backgroundMode || "solid").toLowerCase();
  const ref = String(backgroundReference || "").trim();
  if (mode !== "image") return 0;
  return ref ? 1 : 0;
}

function buildPromptFromConfig(styleConfig) {
  const GARMENT_INTEGRITY_BLOCK_BY_MODE = {
    torso: [
      "Keep the garment fully faithful to the source image with no redesign.",
      "Retain micro-details and realistic material texture while keeping natural drape.",
      "Do not alter colors, logos, fabric grain, stitching, seams, or proportions.",
    ],
    mannequin: [
      "Keep the garment fully faithful to the source image with no redesign.",
      "Retain micro-details and realistic material texture while keeping natural drape.",
      "Do not alter colors, logos, fabric grain, stitching, seams, or proportions.",
    ],
    hanger: [
      "Keep the garment fully faithful to the source image with no redesign.",
      "Retain micro-details and realistic material texture while keeping natural drape.",
      "Do not alter colors, logos, fabric grain, stitching, seams, or proportions.",
    ],
    default: [
      "Keep the garment fully faithful to the source image with no redesign.",
      "Do not alter color, silhouette, fabric grain, logos, print scale, or panel proportions.",
      "Preserve stitching, seam lines, zipper shapes, buttons, buckles, hems, cuffs, and collar geometry exactly.",
      "Retain micro-details and realistic material texture while keeping natural drape.",
    ],
  };
  const GARMENT_INTEGRITY_BLOCK = GARMENT_INTEGRITY_BLOCK_BY_MODE[styleConfig.mode]
    || GARMENT_INTEGRITY_BLOCK_BY_MODE.default;

  const mannequinGenderConstraint = styleConfig.targetGender === "mens"
    ? [
      "Use a male mannequin with clear mens body proportions.",
      "Use broader shoulders, flatter chest, straighter waist, and masculine neck/head silhouette.",
      "Do not use female mannequin body shape.",
    ].join(" ")
    : [
      "Use a female mannequin with clear womens body proportions.",
      "Do not use male mannequin body shape.",
    ].join(" ");

  const MODE_PROMPTS = {
    torso: [
      "Place the garment on the provided torso mannequin.",
      "Do not change mannequin type, torso texture, or stand material.",
      "Upper-body only.",
      "No arms.",
      "No head.",
    ].join(" "),
    mannequin: [
      "Place the garment on the provided full-body mannequin.",
      "Do not change mannequin type, surface texture, or body proportions.",
      "Render only the uploaded garment item.",
      "Do not add any extra clothing items, accessories, shoes, or layering.",
      mannequinGenderConstraint,
    ].join(" "),
    hanger: [
      "Present the garment on a realistic hanger.",
      "Use the hanger from the uploaded reference image.",
      "Do not replace or redesign the hanger. Preserve hanger shape, material, and hook exactly.",
      "Ensure natural hanging drape and balanced alignment.",
      "Clean e-commerce studio background and lighting.",
    ].join(" "),
    ghost: [
      "Create a professional ghost mannequin effect for e-commerce.",
      "Remove all visible mannequin or model parts while preserving the original garment shape and structure.",
      "Maintain realistic inner collar, inner back neck, and natural interior garment structure as seen in professional ghost mannequin product photography.",
      "The interior neck area must appear naturally hollow as in real ghost mannequin photography.",
      "Ensure shoulders, sleeves, and side seams retain natural volume and symmetry.",
      "Do not collapse or flatten the garment.",
      "Preserve sharp garment edges and fine garment details.",
    ].join(" "),
    model: [
      "Generate a professional fashion model wearing the garment.",
      "Natural body proportions.",
      "Neutral facial expression.",
      "Studio lighting.",
      "Ensure realistic fit and accurate garment scaling.",
      "Do not distort fabric patterns.",
    ].join(" "),
    custom: "",
  };
  const BACKGROUND_PRESETS = {
    solid: `Background: solid color ${styleConfig.background.color}.`,
    studio: "Background: professional studio setting.",
    outdoor: "Background: clean outdoor setting suitable for e-commerce fashion.",
  };

  const LIGHTING_PROMPTS = {
    studio: "Use controlled studio lighting.",
    soft: "Use soft studio lighting with gentle shadows.",
    dramatic: "Use dramatic directional lighting while preserving garment details.",
  };

  const qualityLine = styleConfig.quality === "high"
    ? "Use high-detail e-commerce studio quality."
    : "Use standard e-commerce quality.";
  const genderLine = styleConfig.targetGender === "mens"
    ? "Target gender fit: mens."
    : "Target gender fit: womens.";
  const ORIENTATION_PROMPTS_NON_MODEL_DEFAULT = {
    front: "Front view, camera positioned directly in front.",
    front45: [
      "Strict 45-degree front-left composition.",
      "Rotate the support and garment together to a true 45-degree angle.",
      "Garment front panel must be visibly angled (not flat front-facing).",
      "Keep natural perspective on both shoulders and side seams.",
      "Do not keep the garment in a full front view.",
    ].join(" "),
    side: "Strict left side profile view, camera perpendicular to the subject.",
    back45: [
      "Strict 45-degree back-left composition.",
      "Rotate the support and garment together to a true 45-degree back angle.",
      "Back panel and side seam must both be visible.",
      "Do not keep the garment in a full back-flat view.",
    ].join(" "),
    back: "Strict back view, camera positioned directly behind.",
  };
  const ORIENTATION_PROMPTS_NON_MODEL_BY_MODE = {
    torso: {
      front: [
        "Strict front-facing torso composition.",
        "Camera positioned directly in front.",
        "Do not add left or right rotation.",
      ].join(" "),
    front45: [
      "Strict 45-degree front-left torso composition.",
      "Orientation lock: rotate toward camera-left (viewer-left).",
      "Rotate the mannequin torso and the garment together to a true 45-degree angle.",
      "Front panel must be clearly angled, not flat front-facing.",
      "Keep both shoulder depth and side seam perspective visible.",
      "Never output camera-right 45-degree orientation.",
      "Never output a full front-flat orientation.",
    ].join(" "),
      side: [
        "Strict left side torso profile.",
        "Camera perpendicular to the torso.",
        "No front-facing and no back-facing angle.",
      ].join(" "),
    back45: [
      "Strict 45-degree back-left torso composition.",
      "Orientation lock: back view at 45 degrees toward camera-left (viewer-left).",
      "Rotate the mannequin torso and the garment together to a true 45-degree back angle.",
      "Back panel and side seam must both be visible.",
      "Never output camera-right back-45 orientation.",
      "Do not keep the garment in a full back-flat view.",
    ].join(" "),
      back: [
        "Strict back-facing torso composition.",
        "Camera positioned directly behind.",
        "No partial front visibility.",
      ].join(" "),
    },
    mannequin: {
      front: [
        "Strict front-facing mannequin composition.",
        "Camera positioned directly in front.",
        "Do not add left or right rotation.",
      ].join(" "),
      front45: [
        "Strict 45-degree front-left mannequin composition.",
        "Orientation lock: rotate toward camera-left (viewer-left).",
        "Rotate the mannequin and the garment together to a true 45-degree angle.",
        "Front panel must be clearly angled, not flat front-facing.",
        "Keep both shoulder depth and side seam perspective visible.",
        "Never output camera-right 45-degree orientation.",
        "Never output a full front-flat orientation.",
      ].join(" "),
      side: [
        "Strict left side mannequin profile.",
        "Camera perpendicular to the mannequin.",
        "No front-facing and no back-facing angle.",
      ].join(" "),
      back45: [
        "Strict 45-degree back-left mannequin composition.",
        "Orientation lock: back view at 45 degrees toward camera-left (viewer-left).",
        "Rotate the mannequin and the garment together to a true 45-degree back angle.",
        "Back panel and side seam must both be visible.",
        "Never output camera-right back-45 orientation.",
        "Do not keep the garment in a full back-flat view.",
      ].join(" "),
      back: [
        "Strict back-facing mannequin composition.",
        "Camera positioned directly behind.",
        "No partial front visibility.",
      ].join(" "),
    },
    hanger: {
      front: [
        "Strict front-facing hanger composition.",
        "Camera positioned directly in front.",
        "Do not add left or right rotation.",
      ].join(" "),
      front45: [
        "Strict 45-degree front-left hanger composition.",
        "Orientation lock: rotate toward camera-left (viewer-left).",
        "Rotate the hanger and the garment together to a true 45-degree angle.",
        "Front panel must be clearly angled, not flat front-facing.",
        "Keep shoulder depth and side seam perspective visible.",
        "Never output camera-right 45-degree orientation.",
        "Never output a full front-flat orientation.",
      ].join(" "),
      side: [
        "Strict left side hanger profile.",
        "Camera perpendicular to the hanger.",
        "No front-facing and no back-facing angle.",
      ].join(" "),
      back45: [
        "Strict 45-degree back-left hanger composition.",
        "Orientation lock: back view at 45 degrees toward camera-left (viewer-left).",
        "Rotate the hanger and the garment together to a true 45-degree back angle.",
        "Back panel and side seam must both be visible.",
        "Never output camera-right back-45 orientation.",
        "Do not keep the garment in a full back-flat view.",
      ].join(" "),
      back: [
        "Strict back-facing hanger composition.",
        "Camera positioned directly behind.",
        "No partial front visibility.",
      ].join(" "),
    },
  };
  const ORIENTATION_PROMPTS_MODEL = {
    front: [
      "Model is fully front-facing.",
      "Camera positioned directly in front.",
      "Shoulders squared to the camera.",
      "Face visible.",
      "Neutral expression.",
    ].join(" "),
    front45: [
      "Model must be at a strict 45-degree front-left angle.",
      "Do not generate a full front pose.",
      "Camera slightly off-center to capture front depth.",
      "Keep the left-facing 45-degree orientation clearly visible.",
    ].join(" "),
    side: [
      "Model is in strict left side profile.",
      "Camera positioned perpendicular to the body.",
      "No front-facing angle.",
      "No back-facing angle.",
    ].join(" "),
    back45: [
      "The garment image represents the back design.",
      "Model turned 45 degrees from the back to the left.",
      "Back side emphasized.",
      "Face minimally visible.",
      "No shoulder twist.",
      "Camera positioned behind and slightly to the right.",
    ].join(" "),
    back: [
      "The garment image represents the back design.",
      "Model must be completely back-facing.",
      "The model must be fully turned away from the camera.",
      "Camera positioned directly behind the model.",
      "Face must not be visible.",
      "No head turning.",
      "No shoulder twist.",
      "No partial front view.",
      "Ensure the jacket fits naturally on the model's back.",
    ].join(" "),
  };
  const orientationKey = String(styleConfig.orientation || "front");
  const nonModelOrientationMap = ORIENTATION_PROMPTS_NON_MODEL_BY_MODE[styleConfig.mode] || ORIENTATION_PROMPTS_NON_MODEL_DEFAULT;
  const orientationLine = orientationKey === "auto"
    ? ""
    : (styleConfig.mode === "model"
      ? (ORIENTATION_PROMPTS_MODEL[orientationKey] || ORIENTATION_PROMPTS_MODEL.front)
      : (nonModelOrientationMap[orientationKey] || nonModelOrientationMap.front));

  const preserveLine = styleConfig.preserveDetails
    ? "Preserve all fine garment details and edge accuracy."
    : "Preserve garment structure and major details.";
  const torsoFocusCategoryLine = (() => {
    const category = String(styleConfig.itemCategory || "").toLowerCase();
    if (category === "bottom") {
      return "Center the garment as the primary subject. Frame waist to hem. Keep the entire garment visible and avoid showing unnecessary upper torso or stand area.";
    }
    if (category === "footwear") {
      return "Center the garment as the primary subject. Frame feet/ankle area only. Keep footwear fully visible and avoid showing unnecessary torso or stand area.";
    }
    return "Center the garment as the primary subject. For tops, frame upper torso and include the neck cap of the mannequin. Use a tighter crop, minimize lower empty area and stand/base visibility, and do not shift focus to lower body. Never output full-body torso composition.";
  })();
  const mannequinFocusCategoryLine = (() => {
    const category = String(styleConfig.itemCategory || "").toLowerCase();
    if (category === "bottom") {
      return "Center the garment as the primary subject. Frame waist to hem. Keep the entire garment visible and avoid showing unnecessary upper body area.";
    }
    if (category === "footwear") {
      return "Center the garment as the primary subject. Frame feet/ankle area only. Keep footwear fully visible and avoid showing unnecessary upper body area.";
    }
    return [
      "Center the garment as the primary subject.",
      "For tops, frame upper body area with a tighter crop and minimize lower empty area.",
      "Keep the mannequin head fully visible and include the very top of the head within frame.",
      "Do not cut the top of the head.",
      "Do not shift focus to lower body.",
      "Never output full-body mannequin composition.",
    ].join(" ");
  })();

  const FRAMING_PROMPTS = {
    torso: {
      full: [
        "Show the torso fixture from the very top of the form down to the stand/base.",
        "Keep the entire torso setup fully visible within frame, including the base.",
      ].join(" "),
      focus: [
        "Use product-focused framing based on garment category.",
        torsoFocusCategoryLine,
        "Ensure the entire garment is visible with no cropping.",
      ].join(" "),
    },
    mannequin: {
      full: [
        "Show the full mannequin from the very top of the head down to the bottom silver base.",
        "Keep the entire mannequin fully visible in frame, including the silver base/stand.",
      ].join(" "),
      focus: [
        "Use product-focused framing based on garment category.",
        mannequinFocusCategoryLine,
        "Ensure the entire garment is visible with no cropping.",
      ].join(" "),
    },
    hanger: {
      focus: [
        "Use product-focused framing for hanger outputs.",
        "Keep the entire garment and hanger (including hook) fully visible.",
        "Center the hanger and garment with balanced margins.",
        "Do not crop any part of the hanger or garment.",
      ].join(" "),
    },
    model: {
      full: [
        "Show full body output from head to feet.",
        "Keep complete model silhouette visible in frame.",
      ].join(" "),
      focus: [
        "Use strict product-focused framing based on garment category.",
        "If the uploaded item is a top or outerwear, crop to upper body focus (chest to waist priority).",
        "If the uploaded item is a bottom, crop to lower body focus (waist to ankle priority).",
        "If the uploaded item is footwear, crop to feet and ankle focus.",
        "Keep only the relevant body region needed to present the garment details.",
        "Do not output full-body composition in focus mode.",
      ].join(" "),
    },
  };
  const framingPrompt = FRAMING_PROMPTS[styleConfig.mode]?.[styleConfig.framing] || "";

  if (styleConfig.mode === "custom" && styleConfig.customPrompt.trim()) {
    return [
      ...GARMENT_INTEGRITY_BLOCK,
      styleConfig.customPrompt.trim(),
    ].join(" ");
  }

  const centerLine = (styleConfig.mode === "torso" || styleConfig.mode === "mannequin" || styleConfig.mode === "hanger")
    ? "Center composition around the uploaded garment."
    : "Centered subject.";
  const noCropLine = styleConfig.mode === "torso" ? "" : "No cropping of garment.";
  return [
    ...GARMENT_INTEGRITY_BLOCK,
    MODE_PROMPTS[styleConfig.mode] || MODE_PROMPTS.torso,
    BACKGROUND_PRESETS[styleConfig.background.type] || BACKGROUND_PRESETS.solid,
    centerLine,
    noCropLine,
    LIGHTING_PROMPTS[styleConfig.lighting] || LIGHTING_PROMPTS.soft,
    genderLine,
    orientationLine,
    framingPrompt,
    preserveLine,
    qualityLine,
  ].filter(Boolean).join(" ");
}

function buildTryonOrientationDirective(styleConfig) {
  const orientation = String(styleConfig?.orientation || "front");
  if (orientation === "front45") {
    return [
      "Orientation lock: 45 degrees toward camera-left (viewer-left).",
      "Never output camera-right 45-degree orientation.",
      "Keep this exact left-facing direction.",
    ].join(" ");
  }
  if (orientation === "back45") {
    return [
      "Orientation lock: back view at 45 degrees toward camera-left (viewer-left).",
      "Never output camera-right back-45 orientation.",
      "Keep this exact left-facing back direction.",
    ].join(" ");
  }
  if (orientation === "side") {
    return [
      "Orientation lock: strict left profile (viewer-left side).",
      "Never output right profile.",
    ].join(" ");
  }
  return "";
}

async function runPayload(style, imageRef, outputPreset, options = {}) {
  const {
    modelImageRef = "",
    faceReferenceRef = "",
    backgroundReferenceRef = "",
    randomModelPrompt = "",
    styleConfig: rawStyleConfig = null,
    modelRunStrategy = "auto",
    sourceName = "",
    forceTryonV16Basic = false,
    useModelImagePrompt = false,
  } = options;
  const styleConfig = normalizeStyleConfig(style, outputPreset, rawStyleConfig);
  const inferredItemCategory = String(styleConfig?.itemCategory || "").trim() || inferGarmentCategoryFromName(sourceName);
  const styleConfigForPrompt = { ...styleConfig, itemCategory: inferredItemCategory };
  const explicitAspectRatio = String(styleConfig?.aspectRatio || "").trim();
  const prompt = buildPromptFromConfig(styleConfigForPrompt);
  const resolution = resolveFashnResolution(styleConfig);
  const outputFormat = resolveFashnOutputFormat();
  const normalizedRandomModelPrompt = String(randomModelPrompt || "").trim();
  const normalizedProductImageRef = toPublicDataUrl(imageRef);
  const normalizedModelImageRef = toPublicDataUrl(modelImageRef);
  const normalizedFaceReferenceRef = toPublicDataUrl(faceReferenceRef);
  const normalizedBackgroundReferenceRef = toPublicDataUrl(backgroundReferenceRef);
  const styleImageReferenceRaw = styleConfig.mode === "torso"
    ? getTorsoPromptReference()
    : styleConfig.mode === "mannequin"
      ? getMannequinPromptReference()
      : styleConfig.mode === "hanger"
        ? getHangerPromptReference()
      : "";
  const styleImageReference = toPublicDataUrl(styleImageReferenceRaw);
  const effectiveRunStrategy = resolveEffectiveRunStrategy(styleConfig.mode, modelRunStrategy, styleConfig);
  if (effectiveRunStrategy === "tryon-v1.6" || effectiveRunStrategy === "tryon-max") {
    const tryonModelImage = normalizedModelImageRef || styleImageReference;
    if (!tryonModelImage) {
      throw new Error("モデル参照画像が未選択です");
    }
    const inputs = {
      model_image: tryonModelImage,
      ...(effectiveRunStrategy === "tryon-max"
        ? { product_image: normalizedProductImageRef }
        : { garment_image: normalizedProductImageRef }),
    };
    if (effectiveRunStrategy === "tryon-v1.6") {
      inputs.mode = "quality";
      inputs.moderation_level = "none";
      inputs.garment_photo_type = "auto";
      inputs.seed = 42;
      inputs.output_format = outputFormat === "jpg" ? "jpeg" : outputFormat;
    }
    if (effectiveRunStrategy === "tryon-max" && prompt.trim()) {
      const tryonOrientationDirective = buildTryonOrientationDirective(styleConfig);
      inputs.prompt = tryonOrientationDirective
        ? `${prompt} ${tryonOrientationDirective}`
        : prompt;
      if (explicitAspectRatio) inputs.aspect_ratio = explicitAspectRatio;
      inputs.seed = 42;
      inputs.output_format = outputFormat === "jpg" ? "jpeg" : outputFormat;
    }
    return {
      model_name: effectiveRunStrategy === "tryon-max" ? FASHN_TRYON_MAX_MODEL_NAME : FASHN_TRYON_V16_MODEL_NAME,
      inputs,
    };
  }

  const productToModelPrompt = normalizedRandomModelPrompt
    ? `${prompt} Random model appearance requirements: ${normalizedRandomModelPrompt}`
    : prompt;
  const inputs = {
    product_image: normalizedProductImageRef,
    prompt: productToModelPrompt,
    num_images: 1,
    output_format: outputFormat,
    resolution,
    ...(explicitAspectRatio ? { aspect_ratio: explicitAspectRatio } : {}),
  };
  const styleImageReferenceForProductToModel = styleImageReference;
  const isModelOnReference = styleConfig.mode === "model";
  const modelRefForRun = isModelOnReference
    ? normalizedModelImageRef
    : (normalizedModelImageRef || styleImageReferenceForProductToModel);
  const shouldAvoidModelImage = Boolean(normalizedBackgroundReferenceRef);
  const shouldUseImagePrompt = isModelOnReference
    && normalizedModelImageRef
    && (useModelImagePrompt || shouldAvoidModelImage);
  if (shouldUseImagePrompt) {
    inputs.image_prompt = normalizedModelImageRef;
  } else if (modelRefForRun && !shouldAvoidModelImage) {
    inputs.model_image = modelRefForRun;
  }
  if (normalizedFaceReferenceRef) inputs.face_reference = normalizedFaceReferenceRef;
  if (normalizedBackgroundReferenceRef) inputs.background_reference = normalizedBackgroundReferenceRef;
  return { model_name: "product-to-model", inputs };
}

function buildBackgroundEditPayload(subjectImageRef, backgroundImageRef, styleConfig) {
  const normalizedStyleConfig = normalizeStyleConfig(String(styleConfig?.mode || "torso"), "fourThree", styleConfig || {});
  const outputFormat = resolveFashnOutputFormat();
  const resolution = resolveFashnResolution(normalizedStyleConfig);
  const normalizedSubjectRef = toPublicDataUrl(subjectImageRef);
  const normalizedBackgroundRef = toPublicDataUrl(backgroundImageRef);
  return {
    model_name: "edit",
    inputs: {
      image: normalizedSubjectRef,
      image_context: normalizedBackgroundRef,
      prompt: BACKGROUND_EDIT_PROMPT,
      output_format: outputFormat === "jpg" ? "jpeg" : outputFormat,
      resolution,
    },
  };
}

function buildBackgroundEditPrompt(userPrompt = "", preserveSubject = true) {
  const custom = String(userPrompt || "").trim();
  const preserveLine = preserveSubject
    ? "Preserve facial identity and garment details exactly, while allowing pose and placement adjustments for natural scene fit."
    : "";
  return [BACKGROUND_EDIT_PROMPT, preserveLine, custom].filter(Boolean).join("\n\n");
}

function isCompletedLikeStatus(status) {
  const v = String(status || "").toLowerCase();
  return v === "completed" || v === "complete" || v === "succeeded" || v === "success";
}

async function waitForPrediction(predictionId, maxPolls = 90, pollMs = 2000) {
  const terminalStatuses = new Set(["completed", "complete", "succeeded", "success", "failed", "error", "cancelled", "canceled"]);
  for (let i = 0; i < maxPolls; i += 1) {
    await new Promise((r) => setTimeout(r, pollMs));
    const statusRes = await fashnRequest(`/status/${predictionId}`);
    const status = String(statusRes?.status || "").toLowerCase();
    if (terminalStatuses.has(status)) {
      return statusRes;
    }
  }
  return { status: "failed", error: "FASHN timeout", output: [] };
}

function extractOutputUrls(statusRes) {
  const collect = [];
  const pushValue = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }
    if (typeof value === "string") {
      const v = value.trim();
      if (v) collect.push(v);
      return;
    }
    if (typeof value === "object") {
      const urlLike = value.url || value.output || value.output_url || value.outputUrl || value.image || value.src;
      if (typeof urlLike === "string" && urlLike.trim()) {
        collect.push(urlLike.trim());
      }
    }
  };

  if (!statusRes || typeof statusRes !== "object") return [];

  pushValue(statusRes.output);
  pushValue(statusRes.outputs);
  pushValue(statusRes.output_url);
  pushValue(statusRes.outputUrl);
  pushValue(statusRes.result?.output);
  pushValue(statusRes.result?.outputs);
  pushValue(statusRes.result?.images);
  pushValue(statusRes.result?.image_urls);
  pushValue(statusRes.data?.output);
  pushValue(statusRes.data?.outputs);
  pushValue(statusRes.data?.images);
  pushValue(statusRes.data?.image_urls);
  pushValue(statusRes.images);
  pushValue(statusRes.image_urls);
  pushValue(statusRes.artifacts);
  pushValue(statusRes.result?.artifacts);
  pushValue(statusRes.data?.artifacts);
  pushValue(statusRes.prediction?.output);
  pushValue(statusRes.prediction?.outputs);
  pushValue(statusRes.prediction?.images);
  pushValue(statusRes.prediction?.image_urls);

  return collect.filter(Boolean);
}

async function persistRemoteImageToStorage(url, relPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch generated image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeStorageFile(relPath, buffer);
  const ext = extname(relPath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return buildStorageUrl(relPath) || `data:${mime};base64,${buffer.toString("base64")}`;
}

function parseAspectRatio(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

async function readImageSize(filePath) {
  const { stdout } = await execFileP("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath], {
    maxBuffer: 1024 * 1024,
  });
  const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
  const width = Number(widthMatch?.[1] || 0);
  const height = Number(heightMatch?.[1] || 0);
  if (!width || !height) {
    throw new Error("failed to read output image size");
  }
  return { width, height };
}

async function enforceAspectRatioBuffer(buffer, aspectRatio, ext = ".png") {
  const parsedRatio = parseAspectRatio(aspectRatio);
  if (!parsedRatio) return { buffer, adjusted: false };

  const normalizedExt = String(ext || ".png").toLowerCase();
  const inputExt = normalizedExt === ".jpeg" ? ".jpg" : normalizedExt;
  const tempDir = mkdtempSync(join(tmpdir(), "fcursor-output-ratio-"));
  const inputPath = join(tempDir, `input${inputExt}`);
  const outputPath = join(tempDir, `output${inputExt}`);
  writeFileSync(inputPath, buffer);

  try {
    const { width, height } = await readImageSize(inputPath);
    const sourceRatio = width / height;
    const targetRatio = parsedRatio.width / parsedRatio.height;
    const ratioDiff = Math.abs(sourceRatio - targetRatio);
    if (ratioDiff <= 0.005) {
      return { buffer, adjusted: false };
    }

    let cropWidth = width;
    let cropHeight = height;
    if (sourceRatio > targetRatio) {
      cropWidth = Math.max(1, Math.round(height * targetRatio));
    } else {
      cropHeight = Math.max(1, Math.round(width / targetRatio));
    }

    await execFileP(
      "sips",
      ["--cropToHeightWidth", String(cropHeight), String(cropWidth), inputPath, "--out", outputPath],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const outBuffer = readFileSync(outputPath);
    return { buffer: outBuffer, adjusted: true };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function padBufferToAspectRatio(buffer, aspectRatio, ext = ".png", padColor = "FFFFFF") {
  const parsedRatio = parseAspectRatio(aspectRatio);
  if (!parsedRatio) return { buffer, adjusted: false };

  const normalizedExt = String(ext || ".png").toLowerCase();
  const inputExt = normalizedExt === ".jpeg" ? ".jpg" : normalizedExt;
  const tempDir = mkdtempSync(join(tmpdir(), "fcursor-input-ratio-"));
  const inputPath = join(tempDir, `input${inputExt}`);
  const outputPath = join(tempDir, `output${inputExt}`);
  writeFileSync(inputPath, buffer);

  try {
    const { width, height } = await readImageSize(inputPath);
    const sourceRatio = width / height;
    const targetRatio = parsedRatio.width / parsedRatio.height;
    const ratioDiff = Math.abs(sourceRatio - targetRatio);
    if (ratioDiff <= 0.005) {
      return { buffer, adjusted: false };
    }

    let targetWidth = width;
    let targetHeight = height;
    if (sourceRatio > targetRatio) {
      targetHeight = Math.max(height, Math.round(width / targetRatio));
    } else {
      targetWidth = Math.max(width, Math.round(height * targetRatio));
    }

    await execFileP(
      "sips",
      [
        "--padToHeightWidth", String(targetHeight), String(targetWidth),
        "--padColor", String(padColor || "FFFFFF"),
        inputPath,
        "--out", outputPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const outBuffer = readFileSync(outputPath);
    return { buffer: outBuffer, adjusted: true };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function normalizeImageRefForAspect(ref, aspectRatio) {
  const normalizedRef = toPublicDataUrl(ref);
  const ratioText = String(aspectRatio || "").trim();
  if (!ratioText || !parseAspectRatio(ratioText)) return normalizedRef;
  if (!String(normalizedRef || "").startsWith("data:image/")) return normalizedRef;
  try {
    const { mime, buffer } = parseDataUrl(normalizedRef);
    const ext = extFromMime(mime || "image/png");
    const { buffer: outBuffer, adjusted } = await padBufferToAspectRatio(buffer, ratioText, ext, "FFFFFF");
    if (!adjusted) return normalizedRef;
    const outMime = mimeFromExt(ext);
    return `data:${outMime};base64,${outBuffer.toString("base64")}`;
  } catch {
    return normalizedRef;
  }
}

async function persistRemoteImageWithAspect(url, relPath, aspectRatio) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch generated image: ${response.status}`);
  }
  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const ext = extname(relPath).toLowerCase() || ".png";
  const { buffer } = await enforceAspectRatioBuffer(rawBuffer, aspectRatio, ext);
  writeStorageFile(relPath, buffer);
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return buildStorageUrl(relPath) || `data:${mime};base64,${buffer.toString("base64")}`;
}

function finalizeJob(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  const user = findUser(job.userId);
  let refundedCount = 0;

  job.items.forEach((item) => {
    if (item.status === "done" && !item.billed) {
      item.billed = true;
    }
    if (item.status === "error" && !item.refunded) {
      if (user) user.credits += job.creditRate;
      item.refunded = true;
      refundedCount += 1;
    }
  });

  const hasActive = job.items.some((item) => item.status === "queued" || item.status === "processing");
  const hasDone = job.items.some((item) => item.status === "done");
  const processedCount = job.items.filter((item) => item.status === "done" || item.status === "error").length;
  job.status = hasActive ? "processing" : hasDone ? "done" : "error";
  job.outputFiles = job.items.filter((item) => item.outputName).map((item) => item.outputName);
  job.processedCount = processedCount;
  job.successCount = job.items.filter((item) => item.status === "done").length;
  job.errorCount = job.items.filter((item) => item.status === "error").length;
  job.creditUsed = job.successCount * job.creditRate;
  job.updatedAt = nowIso();
  job.refunded = job.errorCount > 0;
  if (user && refundedCount > 0) {
    appendCreditEvent(user.id, "job_error_refund", job.creditRate * refundedCount, {
      jobId: job.id,
      refundedCount,
      creditRate: job.creditRate,
    });
  }

  saveDb();
}

function recomputeJobFromItems(job) {
  const hasActive = job.items.some((item) => item.status === "queued" || item.status === "processing");
  const hasDone = job.items.some((item) => item.status === "done");
  const processedCount = job.items.filter((item) => item.status === "done" || item.status === "error").length;
  job.status = hasActive ? "processing" : hasDone ? "done" : "error";
  job.outputFiles = job.items.filter((item) => item.outputName).map((item) => item.outputName);
  job.processedCount = processedCount;
  job.successCount = job.items.filter((item) => item.status === "done").length;
  job.errorCount = job.items.filter((item) => item.status === "error").length;
  job.creditUsed = job.successCount * job.creditRate;
  job.updatedAt = nowIso();
}

function removeStoredOutput(relPath) {
  const safePath = String(relPath || "").trim();
  if (!safePath) return;
  try {
    const abs = storageAbsPath(safePath);
    rmSync(abs, { force: true });
  } catch {
    // ignore invalid path or missing file
  }
}

function itemErrorHint(message) {
  const msg = String(message || "").toLowerCase();
  if (msg.includes("fashn_api_key is missing")) {
    return "APIキーが未設定です。.env.local の FASHN_API_KEY を確認してサーバーを再起動してください。";
  }
  if (msg.includes("product_image is required")) {
    return "FASHN入力パラメータ不整合。サーバー設定を確認してください。";
  }
  if (msg.includes("invalid \"inputs\" for try-on model")) {
    return "モデル生成パラメータ不整合です。サーバー入力を確認してください。";
  }
  if (msg.includes("image_context") || (msg.includes("invalid \"inputs\"") && msg.includes("edit"))) {
    return "背景編集パラメータ不整合です。背景画像設定を確認してください。";
  }
  if (msg.includes("timeout")) return "タイムアウト。画像サイズを小さくして再試行してください。";
  if (msg.includes("payload") || msg.includes("too large")) return "画像サイズが大きすぎる可能性があります。";
  if (msg.includes("invalid")) return "画像形式をJPG/PNG/WEBPにしてください。";
  return "画像の背景が複雑、または服が見切れている可能性があります。";
}

function formatProviderError(errorLike, fallback = "provider error") {
  if (errorLike == null) return fallback;
  if (typeof errorLike === "string") return errorLike;
  if (errorLike instanceof Error) return errorLike.message || fallback;
  if (typeof errorLike === "object") {
    const message = String(errorLike.message || errorLike.error || errorLike.detail || "").trim();
    if (message) return message;
    try {
      return JSON.stringify(errorLike);
    } catch {
      return fallback;
    }
  }
  return String(errorLike || fallback);
}

async function processItem(jobId, itemId) {
  const job = findJob(jobId);
  if (!job) return;
  const item = job.items.find((v) => v.id === itemId);
  if (!item || item.status !== "queued") return;

  item.status = "processing";
  item.attempt = (item.attempt || 0) + 1;
  item.error = null;
  item.errorHint = null;
  job.status = "processing";
  job.updatedAt = nowIso();
  appendJobEvent(job.id, "item_processing", { itemId: item.id, attempt: item.attempt });
  saveDb();

  try {
    const requestedModelRunStrategy = normalizeModelRunStrategy(job.modelRunStrategy || "auto");
    const originalStyleConfig = job.styleConfig || {
      mode: job.style,
      aspectRatio: job.outputPreset,
      background: {
        type: job.backgroundMode === "image" ? "image" : "solid",
        color: job.backgroundColor || "#FFFFFF",
      },
      customPrompt: job.customPrompt || "",
      quality: "standard",
      preserveGarment: true,
    };
    const hasBackgroundReference = String(job.backgroundReference || "").trim().length > 0;
    const useDirectBackgroundReference = job.style === "model"
      && requestedModelRunStrategy === "product-to-model"
      && String(job.backgroundMode || "solid") === "image"
      && hasBackgroundReference
      && !String(job.modelReference || "").trim();
    const shouldForceWhiteStageOne = String(job.backgroundMode || "solid") === "image"
      && !useDirectBackgroundReference;
    const stageOneStyleConfig = {
      ...(shouldForceWhiteStageOne
        ? {
          ...originalStyleConfig,
          background: {
            type: "solid",
            color: "#FFFFFF",
          },
        }
        : originalStyleConfig
      ),
    };
    const baseRunOptions = {
      modelImageRef: job.modelReference || "",
      faceReferenceRef: job.faceReference || "",
      backgroundReferenceRef: useDirectBackgroundReference ? (job.backgroundReference || "") : "",
      randomModelPrompt: job.randomModelPrompt || "",
      styleConfig: stageOneStyleConfig,
      forceTryonV16Basic: Boolean(job.forceTryonV16Basic),
      useModelImagePrompt: Boolean(job.useModelImagePrompt),
    };
    const requestRun = async (strategy) => {
      const payload = await runPayload(job.style, item.inputRef || item.inputDataUrl, job.outputPreset, {
        ...baseRunOptions,
        modelRunStrategy: strategy,
        sourceName: item.originalPath || item.relativePath || item.name || "",
      });
      return fashnRequest("/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    };
    let runRes;
    if (job.style === "model" && requestedModelRunStrategy === "product-to-model") {
      runRes = await requestRun("product-to-model");
    } else {
      try {
        runRes = await requestRun(requestedModelRunStrategy);
      } catch (firstError) {
        if (job.style !== "model"
          || requestedModelRunStrategy === "tryon-v1.6"
          || requestedModelRunStrategy === "tryon-max") {
          throw firstError;
        }
        const firstMessage = String(firstError instanceof Error ? firstError.message : firstError || "");
        const shouldFallbackToProductToModel = firstMessage.toLowerCase().includes("validate api key")
          || firstMessage.toLowerCase().includes("try-on model");
        if (!shouldFallbackToProductToModel) throw firstError;
        appendJobEvent(job.id, "fashn_fallback", {
          itemId: item.id,
          reason: firstMessage,
          fallbackModel: "product-to-model",
        });
        runRes = await requestRun("product-to-model");
      }
    }

    const predictionId = runRes.id;
    item.predictionId = predictionId;
    appendJobEvent(job.id, "fashn_run_started", {
      itemId: item.id,
      predictionId,
      requestedModelRunStrategy: requestedModelRunStrategy,
      effectiveModelRunStrategy: resolveEffectiveRunStrategy(job.style, requestedModelRunStrategy, baseRunOptions.styleConfig),
    });
    saveDb();

    const statusRes = await waitForPrediction(predictionId, 90, 2000);
    const predictionStatus = String(statusRes?.status || "").toLowerCase();
    const primaryOutputs = extractOutputUrls(statusRes);
    let outputUrl = primaryOutputs[0] || null;
    const hasOutput = Boolean(outputUrl);
    const isCompletedLike = predictionStatus === "completed"
      || predictionStatus === "complete"
      || predictionStatus === "succeeded"
      || predictionStatus === "success";
    if (isCompletedLike || hasOutput) {
      const shouldRunBackgroundEdit = String(job.backgroundMode || "solid") === "image"
        && String(job.backgroundReference || "").trim().length > 0
        && !useDirectBackgroundReference;
      if (outputUrl && shouldRunBackgroundEdit) {
        const editRunRes = await fashnRequest("/run", {
          method: "POST",
          body: JSON.stringify(buildBackgroundEditPayload(outputUrl, job.backgroundReference, originalStyleConfig)),
        });
        const editPredictionId = editRunRes.id;
        appendJobEvent(job.id, "fashn_edit_started", {
          itemId: item.id,
          predictionId: editPredictionId,
        });
        const editStatusRes = await waitForPrediction(editPredictionId, 120, 2000);
        if (editStatusRes.status !== "completed") {
          throw new Error(editStatusRes?.error || "FASHN edit timeout");
        }
        const editedOutputUrl = extractOutputUrls(editStatusRes)[0] || null;
        if (!editedOutputUrl) {
          throw new Error("FASHN edit output is empty");
        }
        outputUrl = editedOutputUrl;
      }
      item.status = outputUrl ? "done" : "error";
      item.outputUrl = outputUrl;
      if (outputUrl) {
        let outputExt = "png";
        try {
          outputExt = extname(new URL(outputUrl).pathname).replace(/^\./, "") || "png";
        } catch {
          outputExt = "png";
        }
        if (outputExt === "jpeg") outputExt = "jpg";
        const normalizedStyle = normalizeStyleConfig(job.style, job.outputPreset, job.styleConfig || {});
        const storagePath = `outputs/${job.id}/${item.id}.${outputExt}`;
        try {
          item.outputUrl = normalizedStyle.quality === "high"
            ? await persistRemoteImageWithAspect(outputUrl, storagePath, normalizedStyle.aspectRatio)
            : await persistRemoteImageToStorage(outputUrl, storagePath);
          item.outputStoragePath = storagePath;
        } catch (persistError) {
          appendJobEvent(job.id, "output_persist_failed", {
            itemId: item.id,
            error: persistError instanceof Error ? persistError.message : String(persistError || ""),
          });
          throw persistError;
        }
        item.outputName = buildOutputFileName({
          style: job.style,
          seq: item.outputSequence || 1,
          createdAt: job.createdAt,
          ext: outputExt,
        });
      } else {
        item.outputName = null;
      }
      appendJobEvent(job.id, item.status === "done" ? "item_done" : "item_error", { itemId: item.id });
    } else {
      item.status = "error";
      item.error = statusRes?.error || "FASHN timeout";
      item.errorHint = itemErrorHint(item.error);
      appendJobEvent(job.id, "item_error", { itemId: item.id, error: item.error });
    }
  } catch (error) {
    item.status = "error";
    item.error = error instanceof Error ? error.message : "unknown error";
    item.errorHint = itemErrorHint(item.error);
    appendJobEvent(job.id, "item_error", { itemId: item.id, error: item.error });
  }

  finalizeJob(jobId);
}

function queueJob(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  job.items
    .filter((item) => item.status === "queued")
    .forEach((item) => {
      processItem(job.id, item.id).catch(() => {});
    });
}

function migrateLegacyInlineImageRefs() {
  let changed = false;
  for (const job of (db.jobs || [])) {
    const jobId = String(job?.id || "");
    if (!jobId || !Array.isArray(job.items)) continue;
    for (const item of job.items) {
      if (!item || typeof item !== "object") continue;
      const itemId = String(item.id || "");
      if (!itemId) continue;
      const inlineRef = String(item.inputRef || "");
      const inlineData = String(item.inputDataUrl || "");
      const source = inlineRef.startsWith("data:image/") ? inlineRef : (inlineData.startsWith("data:image/") ? inlineData : "");
      if (!source) continue;
      try {
        const parsed = parseDataUrl(source);
        const ext = extFromMime(parsed.mime || "image/jpeg");
        const storagePath = `inputs/${jobId}/${itemId}${ext}`;
        writeStorageFile(storagePath, parsed.buffer);
        const storageUrl = buildStorageUrl(storagePath) || `/api/storage/${encodePathForStorage(storagePath)}`;
        item.inputDataUrl = "";
        item.inputMime = parsed.mime || "image/jpeg";
        item.inputStoragePath = storagePath;
        item.inputStorageUrl = storageUrl;
        item.inputRef = storageUrl;
        changed = true;
      } catch {
        // skip malformed legacy payloads
      }
    }
  }
  if (changed) saveDb();
}

function migrateRelativeStorageUrls() {
  let changed = false;
  for (const job of (db.jobs || [])) {
    if (!Array.isArray(job.items)) continue;
    for (const item of job.items) {
      if (!item || typeof item !== "object") continue;
      const nextInputRef = absolutizeStorageUrl(item.inputRef);
      if (nextInputRef && nextInputRef !== item.inputRef) {
        item.inputRef = nextInputRef;
        changed = true;
      }
      const nextInputStorageUrl = absolutizeStorageUrl(item.inputStorageUrl);
      if (nextInputStorageUrl && nextInputStorageUrl !== item.inputStorageUrl) {
        item.inputStorageUrl = nextInputStorageUrl;
        changed = true;
      }
      const nextOutputUrl = absolutizeStorageUrl(item.outputUrl);
      if (nextOutputUrl && nextOutputUrl !== item.outputUrl) {
        item.outputUrl = nextOutputUrl;
        changed = true;
      }
    }
  }
  if (Array.isArray(db.assetLibraries)) {
    db.assetLibraries = db.assetLibraries.map((row) => {
      const normalized = normalizeAssetLibraryPayload(row || {});
      const next = { ...(row || {}), ...normalized };
      if (JSON.stringify(next) !== JSON.stringify(row || {})) changed = true;
      return next;
    });
  }
  if (changed) saveDb();
}

function compactStoredInputDataUrls() {
  let changed = false;
  for (const job of (db.jobs || [])) {
    for (const item of (job.items || [])) {
      if (!item) continue;
      const hasPersistentRef = String(item.inputRef || "").trim() || String(item.inputStorageUrl || "").trim();
      if (hasPersistentRef && typeof item.inputDataUrl === "string" && item.inputDataUrl.length > 0) {
        item.inputDataUrl = "";
        changed = true;
      }
    }
  }
  if (changed) saveDb();
}

async function migrateLegacyOutputUrls() {
  let changed = false;
  for (const job of (db.jobs || [])) {
    const jobId = String(job?.id || "");
    if (!jobId || !Array.isArray(job.items)) continue;
    for (const item of job.items) {
      if (!item || typeof item !== "object") continue;
      const outputUrl = String(item.outputUrl || "");
      if (!outputUrl) continue;
      if (outputUrl.startsWith("/api/storage/")) continue;
      if (outputUrl.includes("/storage/v1/object/public/")) continue;
      if (String(item.outputStoragePath || "").trim()) continue;
      let outputExt = "png";
      try {
        outputExt = extname(new URL(outputUrl).pathname).replace(/^\./, "").toLowerCase() || "png";
      } catch {
        outputExt = "png";
      }
      if (outputExt === "jpeg") outputExt = "jpg";
      const storagePath = `outputs/${jobId}/${String(item.id || id("itm"))}.${outputExt}`;
      try {
        const persisted = await persistRemoteImageToStorage(outputUrl, storagePath);
        item.outputUrl = persisted;
        item.outputStoragePath = storagePath;
        changed = true;
      } catch {
        // keep legacy URL when migration fails
      }
    }
  }
  if (changed) saveDb();
}

function recoverAndResumeActiveJobsOnStartup() {
  const activeJobs = (db.jobs || []).filter((job) => Array.isArray(job.items) && job.items.length > 0);
  let changed = false;
  for (const job of activeJobs) {
    for (const item of (job.items || [])) {
      // If server restarted mid-flight before run started, processing items can be orphaned forever.
      if (item.status === "processing" && !String(item.predictionId || "").trim()) {
        item.status = "queued";
        item.error = null;
        item.errorHint = null;
        changed = true;
      }
    }
    const hasActive = (job.items || []).some((item) => item.status === "queued" || item.status === "processing");
    if (hasActive && job.status !== "processing") {
      job.status = "processing";
      changed = true;
    }
  }
  if (changed) saveDb();
  for (const job of activeJobs) {
    const hasQueued = (job.items || []).some((item) => item.status === "queued");
    if (hasQueued) queueJob(job.id);
  }
}

async function buildJobZip(job) {
  const tmpRoot = mkdtempSync(join(tmpdir(), `fcursor-job-${job.id}-`));
  const outDir = join(tmpRoot, "out");
  mkdirSync(outDir, { recursive: true });

  try {
    for (const item of job.items) {
      if (item.status !== "done" || !item.outputUrl) continue;

      const response = await fetch(item.outputUrl);
      if (!response.ok) continue;
      const arr = await response.arrayBuffer();
      const buffer = Buffer.from(arr);

      const relPath = safeRelPath(item.relativePath || item.name);
      const fullPath = join(outDir, relPath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, buffer);
    }

    const zipPath = join(tmpRoot, `${job.id}.zip`);
    await execFileP("zip", ["-qr", zipPath, "."], { cwd: outDir, maxBuffer: 10 * 1024 * 1024 });
    return readFileSync(zipPath);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    json(res, 400, { error: "invalid request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, {
        ok: true,
        now: nowIso(),
        provider: "fashn",
        fashnConfigured: Boolean(FASHN_API_KEY),
        supabaseConfigured: hasSupabaseConfig(),
        fashnBaseUrl: FASHN_BASE_URL,
        backendPublicBaseUrl: BACKEND_PUBLIC_BASE_URL || null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/preview/convert") {
      const body = await parseBody(req);
      const dataUrl = String(body.dataUrl || "");
      if (!dataUrl.startsWith("data:image/")) {
        json(res, 400, { error: "invalid image payload" });
        return;
      }
      const converted = await convertToJpegDataUrl(dataUrl);
      json(res, 200, { previewDataUrl: converted.dataUrl, mime: converted.mime });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/debug/run-payload") {
      const body = await parseBody(req);
      const style = String(body.style || "torso");
      const outputPreset = String(body.outputPreset || "fourThree");
      const imageRef = String(body.imageRef || "data:image/png;base64,AA==");
      const options = {
        modelImageRef: String(body.modelImageRef || ""),
        faceReferenceRef: String(body.faceReferenceRef || ""),
        backgroundReferenceRef: String(body.backgroundReferenceRef || ""),
        randomModelPrompt: String(body.randomModelPrompt || ""),
        styleConfig: (typeof body.styleConfig === "object" && body.styleConfig) ? body.styleConfig : null,
        modelRunStrategy: String(body.modelRunStrategy || "auto"),
        sourceName: String(body.sourceName || ""),
        forceTryonV16Basic: Boolean(body.forceTryonV16Basic),
        useModelImagePrompt: Boolean(body.useModelImagePrompt),
      };
      const payload = await runPayload(style, imageRef, outputPreset, options);
      const hasModelImage = Boolean(payload?.inputs?.model_image);
      const hasBackgroundReference = Boolean(payload?.inputs?.background_reference);
      console.log("[debug_run_payload]", JSON.stringify({
        style,
        outputPreset,
        framing: String(options?.styleConfig?.framing || ""),
        modelRunStrategy: options.modelRunStrategy,
        model_name: payload?.model_name,
        hasModelImage,
        hasBackgroundReference,
      }));
      json(res, 200, {
        ok: true,
        payload,
        summary: {
          hasModelImage,
          hasBackgroundReference,
          modelName: payload?.model_name || "",
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/export/images-zip") {
      const body = await parseBody(req);
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const format = String(body.format || "png").toLowerCase() === "jpg" ? "jpg" : "png";
      const items = itemsRaw
        .map((item) => ({
          url: String(item?.url || ""),
          filename: String(item?.filename || ""),
        }))
        .filter((item) => Boolean(item.url));
      if (items.length === 0) {
        json(res, 400, { error: "items are required" });
        return;
      }
      const zipBuffer = await exportImagesAsZip(items, format);
      const fileName = `torso-ai-selected-${compactTimestamp()}.zip`;
      res.writeHead(200, {
        ...corsHeaders("application/zip"),
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      });
      res.end(zipBuffer);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/edit") {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      const editType = String(body.editType || "background").toLowerCase();
      const sourceImage = String(body.image || "").trim();
      const imageContext = String(body.imageContext || body.image_context || "").trim();
      const prompt = String(body.prompt || "");
      const preserveSubject = body.preserveSubject !== false;
      const outputPreset = String(body.outputPreset || "fourThree");
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      const user = findUser(userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      if (!sourceImage) {
        json(res, 400, { error: "image is required" });
        return;
      }
      if (editType !== "background") {
        json(res, 400, { error: "only background edit is supported" });
        return;
      }
      if (!imageContext) {
        json(res, 400, { error: "image_context is required for background edit" });
        return;
      }

      const styleConfig = normalizeStyleConfig("model", outputPreset, {
        mode: "model",
        aspectRatio: outputPreset,
      });
      const payload = buildBackgroundEditPayload(sourceImage, imageContext, styleConfig);
      payload.inputs.prompt = buildBackgroundEditPrompt(prompt, preserveSubject);

      const runRes = await fashnRequest("/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const predictionId = String(runRes?.id || "");
      if (!predictionId) {
        json(res, 500, { error: "edit prediction id is missing" });
        return;
      }
      const statusRes = await waitForPrediction(predictionId, 120, 2000);
      if (!isCompletedLikeStatus(statusRes?.status)) {
        json(res, 500, { error: formatProviderError(statusRes?.error, "FASHN edit timeout"), predictionId });
        return;
      }
      const outputUrl = extractOutputUrls(statusRes)[0] || "";
      if (!outputUrl) {
        json(res, 500, { error: "FASHN edit output is empty", predictionId });
        return;
      }

      const createdAt = nowIso();
      const jobId = id("job");
      const itemId = id("itm");
      let outputExt = "png";
      try {
        const fromUrl = extname(new URL(outputUrl).pathname).replace(/^\./, "").toLowerCase();
        if (fromUrl) outputExt = fromUrl === "jpeg" ? "jpg" : fromUrl;
      } catch {
        outputExt = "png";
      }
      const outputName = buildOutputFileName({
        style: "edit",
        seq: 1,
        createdAt,
        ext: outputExt,
      });
      const storagePath = `edits/${jobId}/${itemId}.${outputExt}`;
      const persistedOutputUrl = await persistRemoteImageToStorage(outputUrl, storagePath);
      const job = {
        id: jobId,
        userId: user.id,
        style: "edit",
        provider: "fashn",
        outputPreset,
        styleConfig,
        status: "done",
        imageCount: 1,
        processedCount: 1,
        successCount: 1,
        errorCount: 0,
        creditRate: 0,
        reservedCredits: 0,
        creditUsed: 0,
        billingPolicy: "success_only",
        refunded: false,
        retryAttempt: 0,
        lastRetryKey: null,
        lastRetryAt: null,
        inputFiles: ["edit-input"],
        outputFiles: [outputName],
        items: [
          {
            id: itemId,
            outputSequence: 1,
            name: "edit-input",
            originalPath: "edit-input",
            relativePath: "edit-input",
            skuGuess: "edit",
            mime: outputExt === "jpg" ? "image/jpeg" : `image/${outputExt}`,
            clientRef: "",
            sourceZip: null,
            status: "done",
            inputDataUrl: null,
            outputUrl: persistedOutputUrl,
            outputStoragePath: storagePath,
            outputName,
            predictionId,
            error: null,
            errorHint: null,
            billed: false,
            refunded: false,
            attempt: 1,
          },
        ],
        createdAt,
        updatedAt: createdAt,
        editType,
      };
      db.jobs.unshift(job);
      appendJobEvent(job.id, "edit_created", {
        editType,
        predictionId,
        preserveSubject,
      });
      saveDb();

      json(res, 200, {
        ok: true,
        provider: "fashn",
        predictionId,
        outputUrl: persistedOutputUrl,
        job,
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/storage/")) {
      const relPath = safeRelPath(
        decodeURIComponent(url.pathname.replace("/api/storage/", "") || ""),
      );
      const absPath = storageAbsPath(relPath);
      if (!existsSync(absPath)) {
        json(res, 404, { error: "file not found" });
        return;
      }
      const buffer = readFileSync(absPath);
      res.writeHead(200, {
        ...corsHeaders(contentTypeFromFilePath(absPath)),
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end(buffer);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/models/generate") {
      const body = await parseBody(req);
      const userId = String(body.userId || "");
      const prompt = String(body.prompt || "").trim();
      const targetGender = normalizeTargetGender(body.targetGender);
      const effectivePrompt = withDefaultModelStylePrompt(prompt, targetGender);
      const numImages = Math.max(1, Math.min(4, Number(body.numImages || 1)));
      const resolution = String(body.resolution || "1k").toLowerCase() === "4k" ? "4k" : "1k";
      const faceReference = String(body.faceReference || "").trim();

      const user = findUser(userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      await upsertSupabaseUser(user);
      if (!prompt) {
        json(res, 400, { error: "prompt is required" });
        return;
      }
      const modelCreditRate = resolution === "4k" ? 2 : 1;
      const reservedCredits = numImages * modelCreditRate;
      if (user.credits < reservedCredits) {
        json(res, 400, { error: `insufficient credits: need ${reservedCredits}, have ${user.credits}` });
        return;
      }
      user.credits -= reservedCredits;
      appendCreditEvent(user.id, "model_generate_reserved", -reservedCredits, {
        numImages,
        resolution,
        targetGender,
      });

      const createdAt = nowIso();
      const createdAtDate = new Date(createdAt);
      const createdDateLabel = createdAtDate.toLocaleDateString("ja-JP");
      const createdTimeLabel = createdAtDate
        .toLocaleTimeString("ja-JP", { hour12: false })
        .replace(/:/g, "");
      const models = [];
      const predictionIds = [];
      let failedCount = 0;
      const usedSeeds = new Set();
      const nextUniqueSeed = () => {
        let seed = randomInt(0x100000000);
        while (usedSeeds.has(seed)) {
          seed = randomInt(0x100000000);
        }
        usedSeeds.add(seed);
        return seed;
      };

      for (let i = 0; i < numImages; i += 1) {
        const seed = nextUniqueSeed();
        const payload = {
          model_name: "model-create",
          inputs: {
            prompt: effectivePrompt,
            num_images: 1,
            seed,
            aspect_ratio: "4:5",
            resolution,
            output_format: "png",
          },
        };
        if (faceReference.startsWith("data:image/") || /^https?:\/\//.test(faceReference)) {
          payload.inputs.face_reference = faceReference;
        }

        const runRes = await fashnRequest("/run", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const predictionId = runRes.id;
        predictionIds.push(predictionId);
        const statusRes = await waitForPrediction(predictionId, 90, 2000);
        if (statusRes.status !== "completed") {
          failedCount += 1;
          continue;
        }

        const outputUrls = extractOutputUrls(statusRes);
        const outputUrlSource = outputUrls[0];
        if (!outputUrlSource) {
          console.warn("[models/generate] completed but no output url", {
            predictionId,
            status: statusRes?.status,
            keys: statusRes && typeof statusRes === "object" ? Object.keys(statusRes) : [],
          });
          failedCount += 1;
          continue;
        }
        const modelId = id("mdl");
        const storagePath = `models/${userId}/${modelId}.png`;
        const outputUrl = await persistRemoteImageToStorage(outputUrlSource, storagePath);
        models.push({
          id: modelId,
          name: `モデル ${createdDateLabel}-${createdTimeLabel}-${i + 1}-${modelId.slice(-4)}`,
          outputUrl,
          sourceUrl: outputUrlSource,
          prompt: effectivePrompt,
          seed,
          favorite: false,
          createdAt,
        });
      }
      if (failedCount > 0) {
        const refundCredits = failedCount * modelCreditRate;
        user.credits += refundCredits;
        appendCreditEvent(user.id, "model_generate_refund", refundCredits, {
          numImages,
          failedCount,
          resolution,
          targetGender,
        });
      }
      if (models.length === 0) {
        saveDb();
        json(res, 502, { error: "model generation failed" });
        return;
      }

      saveDb();
      json(res, 200, { models, predictionId: predictionIds[0] || null, predictionIds, failedCount, user });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email) {
        json(res, 400, { error: "email is required" });
        return;
      }
      if (!password) {
        json(res, 400, { error: "password is required" });
        return;
      }

      const existing = db.users.find((u) => u.email === email);
      if (existing) {
        json(res, 400, { error: "email already registered" });
        return;
      }

      const user = {
        id: id("usr"),
        email,
        password,
        name: "",
        plan: "growth",
        credits: 200,
        createdAt: nowIso(),
      };
      db.users.push(user);
      saveDb();
      await upsertSupabaseUser(user);
      json(res, 200, { user });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email) {
        json(res, 400, { error: "email is required" });
        return;
      }

      let user = db.users.find((u) => u.email === email);
      if (!user) {
        const allowDevAutoCreate = email.endsWith("@local.test");
        if (!allowDevAutoCreate) {
          json(res, 404, { error: "account not found" });
          return;
        }
        user = {
          id: id("usr"),
          email,
          password: "",
          name: email.split("@")[0] || "user",
          plan: "growth",
          credits: 200,
          createdAt: nowIso(),
        };
        db.users.push(user);
        saveDb();
      }

      if (String(user.password || "") !== String(password || "")) {
        json(res, 401, { error: "invalid email or password" });
        return;
      }

      await upsertSupabaseUser(user);
      json(res, 200, { user });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/users/")) {
      const userId = url.pathname.replace("/api/users/", "");
      const user = findUser(userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      json(res, 200, { user });
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/users\/[^/]+\/profile$/)) {
      const userId = url.pathname.replace("/api/users/", "").replace("/profile", "");
      const user = findUser(userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      if (!name) {
        json(res, 400, { error: "name is required" });
        return;
      }
      user.name = name;
      saveDb();
      await upsertSupabaseUser(user);
      json(res, 200, { user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const userId = url.searchParams.get("userId") || "";
      const jobs = db.jobs
        .filter((job) => job.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      json(res, 200, { jobs });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/credits/history") {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      const events = db.creditEvents
        .filter((event) => event.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      json(res, 200, { events });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/assets/library") {
      const userId = String(url.searchParams.get("userId") || "").trim();
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      const library = await readAssetLibrary(userId);
      json(res, 200, { library });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/assets/library") {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      const library = await writeAssetLibrary(userId, body);
      json(res, 200, { library });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/upload") {
      const body = await parseBody(req);
      const userId = String(body.userId || "").trim();
      const name = String(body.name || "image.jpg");
      const dataUrl = String(body.dataUrl || "");
      const purposeRaw = String(body.purpose || "jobs").trim().toLowerCase();
      const purpose = purposeRaw.replace(/[^a-z0-9_-]/g, "") || "jobs";
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      if (!dataUrl.startsWith("data:image/")) {
        json(res, 400, { error: "dataUrl must be an image data URL" });
        return;
      }
      const { mime, buffer } = parseDataUrl(dataUrl);
      const ext = extFromMime(mime || "") || extname(name).toLowerCase() || ".jpg";
      const relPath = `${userId}/${purpose}/${Date.now()}-${randomUUID()}${ext}`;
      const publicUrl = await persistBufferToManagedStorage(relPath, buffer, mime || "image/jpeg");
      json(res, 200, {
        ok: true,
        url: publicUrl,
        path: relPath,
        mime: mime || "image/jpeg",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/delete-items") {
      const body = await parseBody(req);
      const userId = String(body.userId || "");
      const itemIds = Array.isArray(body.itemIds)
        ? body.itemIds.map((v) => String(v || "").trim()).filter(Boolean)
        : [];
      if (!userId) {
        json(res, 400, { error: "userId is required" });
        return;
      }
      if (itemIds.length === 0) {
        json(res, 400, { error: "itemIds are required" });
        return;
      }
      const targetSet = new Set(itemIds);
      let deletedCount = 0;
      db.jobs = db.jobs.filter((job) => {
        if (job.userId !== userId) return true;
        const kept = [];
        for (const item of job.items || []) {
          if (!targetSet.has(item.id)) {
            kept.push(item);
            continue;
          }
          deletedCount += 1;
          if (item.outputStoragePath) removeStoredOutput(item.outputStoragePath);
        }
        job.items = kept;
        if (job.items.length === 0) return false;
        recomputeJobFromItems(job);
        return true;
      });
      if (deletedCount === 0) {
        json(res, 404, { error: "no matching items found" });
        return;
      }
      saveDb();
      const jobs = db.jobs
        .filter((job) => job.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      json(res, 200, { ok: true, deletedCount, jobs });
      return;
    }

    if (req.method === "GET" && url.pathname.match(/^\/api\/jobs\/[^/]+\/download$/)) {
      const jobId = url.pathname.replace("/api/jobs/", "").replace("/download", "");
      const job = findJob(jobId);
      if (!job) {
        json(res, 404, { error: "job not found" });
        return;
      }
      if (job.status !== "done") {
        json(res, 400, { error: "job is not done" });
        return;
      }

      const zipBuffer = await buildJobZip(job);
      res.writeHead(200, {
        ...corsHeaders("application/zip"),
        "Content-Disposition": `attachment; filename="${job.id}.zip"`,
      });
      res.end(zipBuffer);
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/jobs\/[^/]+\/retry$/)) {
      const jobId = url.pathname.replace("/api/jobs/", "").replace("/retry", "");
      const body = await parseBody(req);
      const idempotencyKey = String(body.idempotencyKey || "");
      const job = findJob(jobId);
      if (!job) {
        json(res, 404, { error: "job not found" });
        return;
      }

      if (job.status === "queued" || job.status === "processing") {
        json(res, 400, { error: "retry is allowed only when job is settled (done/error)" });
        return;
      }

      if (idempotencyKey && job.lastRetryKey === idempotencyKey) {
        json(res, 200, { job, retryCount: 0, idempotent: true });
        return;
      }

      const retryCandidates = job.items.filter((item) => item.status === "error");
      if (retryCandidates.length === 0) {
        json(res, 400, { error: "no error items to retry" });
        return;
      }

      const reserveNeeded = retryCandidates.filter((item) => item.refunded).length * job.creditRate;
      const user = findUser(job.userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      if (reserveNeeded > 0 && user.credits < reserveNeeded) {
        json(res, 400, { error: `retry requires credits: need ${reserveNeeded}, have ${user.credits}` });
        return;
      }
      user.credits -= reserveNeeded;
      if (reserveNeeded > 0) {
        appendCreditEvent(user.id, "job_retry_reserved", -reserveNeeded, {
          jobId: job.id,
          retryItemCount: retryCandidates.length,
          creditRate: job.creditRate,
        });
      }

      let retryCount = 0;
      retryCandidates.forEach((item) => {
        item.status = "queued";
        item.error = null;
        item.errorHint = null;
        item.refunded = false;
        retryCount += 1;
      });

      job.retryAttempt = (job.retryAttempt || 0) + 1;
      job.lastRetryKey = idempotencyKey || `${job.id}:attempt:${job.retryAttempt}`;
      job.lastRetryAt = nowIso();
      job.status = "queued";
      job.updatedAt = nowIso();
      appendJobEvent(job.id, "retry_requested", {
        retryAttempt: job.retryAttempt,
        retryCount,
        idempotencyKey: job.lastRetryKey,
      });
      saveDb();
      queueJob(job.id);

      json(res, 200, { job, retryCount });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const jobId = url.pathname.replace("/api/jobs/", "");
      const job = findJob(jobId);
      if (!job) {
        json(res, 404, { error: "job not found" });
        return;
      }
      json(res, 200, { job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const body = await parseBody(req);
      const userId = String(body.userId || "");
      const style = String(body.style || "torso");
      const files = Array.isArray(body.files) ? body.files : [];
      const outputPreset = String(body.outputPreset || "fourThree");
      const rawStyleConfig = typeof body.styleConfig === "object" && body.styleConfig ? body.styleConfig : null;
      const backgroundAssetId = body.backgroundAssetId ? String(body.backgroundAssetId) : null;
      const backgroundMode = String(body.backgroundMode || "solid");
      const backgroundColor = String(body.backgroundColor || "#FFFFFF");
      const modelAssetId = body.modelAssetId ? String(body.modelAssetId) : null;
      const modelReference = String(body.modelReference || "");
      const faceReference = String(body.faceReference || "");
      const modelRunStrategy = normalizeModelRunStrategy(body.modelRunStrategy || "auto");
      const forceTryonV16Basic = Boolean(body.forceTryonV16Basic);
      const useModelImagePrompt = Boolean(body.useModelImagePrompt);
      const backgroundReference = String(body.backgroundReference || "");
      const customPrompt = String(body.customPrompt || "");
      const randomModelPrompt = String(body.randomModelPrompt || "");

      if (!CREDIT_BY_STYLE[style]) {
        json(res, 400, { error: "invalid style" });
        return;
      }

      if (files.length === 0) {
        json(res, 400, { error: "files are required" });
        return;
      }

      const user = findUser(userId);
      if (!user) {
        json(res, 404, { error: "user not found" });
        return;
      }
      const normalizedStyleConfig = normalizeStyleConfig(style, outputPreset, rawStyleConfig);
      const effectiveModelRunStrategy = resolveEffectiveRunStrategy(style, modelRunStrategy, normalizedStyleConfig);
      const qualitySurcharge = resolveQualitySurcharge(normalizedStyleConfig, effectiveModelRunStrategy);
      const modelReferenceSurcharge = resolveModelReferenceSurcharge(style, modelAssetId, effectiveModelRunStrategy);
      const backgroundEditSurcharge = resolveBackgroundEditSurcharge(backgroundMode, backgroundReference);
      if (qualitySurcharge > 0 && !canUseHighQuality(user.plan)) {
        json(res, 400, { error: "高画質はGrowth以上のプランで利用できます" });
        return;
      }
      if (backgroundMode === "image" && !backgroundReference.trim()) {
        json(res, 400, { error: "背景画像を選択してください" });
        return;
      }
      if (style === "model" && effectiveModelRunStrategy === "tryon-max" && !modelReference) {
        json(res, 400, { error: "Try-On Max には参照モデル画像が必要です" });
        return;
      }

      const expanded = await expandInputFiles(files);
      if (expanded.length === 0) {
        json(res, 400, { error: "ZIP内に画像がありません" });
        return;
      }

      const jobId = id("job");
      const items = expanded.map((file, index) => ({
        id: id("itm"),
        outputSequence: index + 1,
        name: file.name,
        originalPath: safeRelPath(file.relativePath || file.name),
        relativePath: safeRelPath(file.relativePath || file.name),
        skuGuess: skuGuessFromPath(file.relativePath || file.name),
        mime: file.mime,
        clientRef: file.clientRef || "",
        sourceZip: file.sourceZip,
        status: "queued",
        inputDataUrl: file.dataUrl,
        outputUrl: null,
        outputName: null,
        predictionId: null,
        error: null,
        errorHint: null,
        billed: false,
        refunded: false,
        attempt: 0,
      }));

      const baseStyleCreditRate = resolveBaseCreditRate(style, effectiveModelRunStrategy);
      const creditRate = baseStyleCreditRate + qualitySurcharge + modelReferenceSurcharge + backgroundEditSurcharge;
      const reservedCredits = items.length * creditRate;
      if (user.credits < reservedCredits) {
        json(res, 400, { error: `insufficient credits: need ${reservedCredits}, have ${user.credits}` });
        return;
      }

      user.credits -= reservedCredits;
      appendCreditEvent(user.id, "job_reserved", -reservedCredits, {
        jobId,
        imageCount: items.length,
        creditRate,
        style,
      });

      const job = {
        id: jobId,
        userId,
        style,
        provider: "fashn",
        outputPreset,
        styleConfig: normalizedStyleConfig,
        backgroundAssetId,
        backgroundMode,
        backgroundColor,
        modelAssetId,
        modelReference,
        faceReference,
        modelRunStrategy,
        forceTryonV16Basic,
        useModelImagePrompt,
        effectiveModelRunStrategy,
        backgroundReference,
        customPrompt,
        randomModelPrompt,
        status: "queued",
        imageCount: items.length,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        creditRate,
        reservedCredits,
        creditUsed: 0,
        billingPolicy: "success_only",
        refunded: false,
        retryAttempt: 0,
        lastRetryKey: null,
        lastRetryAt: null,
        inputFiles: items.map((item) => item.relativePath),
        outputFiles: [],
        items,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      for (const item of items) {
        await normalizeAndStoreInputImage(job.id, item);
      }

      job.creditUsed = job.successCount * job.creditRate;

      db.jobs.unshift(job);
      appendJobEvent(job.id, "job_created", {
        imageCount: job.imageCount,
        style: job.style,
        outputPreset: job.outputPreset,
        backgroundAssetId: job.backgroundAssetId,
        backgroundMode: job.backgroundMode,
        backgroundColor: job.backgroundColor,
        modelAssetId: job.modelAssetId,
        modelReference: job.modelReference ? "set" : null,
        modelRunStrategy: job.modelRunStrategy,
        effectiveModelRunStrategy: job.effectiveModelRunStrategy,
        backgroundReference: job.backgroundReference ? "set" : null,
        customPrompt: job.customPrompt ? "set" : null,
        randomModelPrompt: job.randomModelPrompt ? "set" : null,
        styleConfig: job.styleConfig ? "set" : null,
        reservedCredits: job.reservedCredits,
      });
      saveDb();
      queueJob(job.id);

      json(res, 200, { job, user });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal error";
    if (message === "payload too large") {
      json(res, 413, {
        error: `payload too large (max ${Math.round(MAX_REQUEST_BYTES / (1024 * 1024))}MB)`,
      });
      return;
    }
    if (message === "invalid json") {
      json(res, 400, { error: "invalid json" });
      return;
    }
    json(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`MVP API server running on http://localhost:${PORT}`);
  migrateRelativeStorageUrls();
  migrateLegacyInlineImageRefs();
  compactStoredInputDataUrls();
  void migrateLegacyOutputUrls();
  recoverAndResumeActiveJobsOnStartup();
  if (hasSupabaseConfig()) {
    void ensureDefaultPublicAssetsInSupabase()
      .then(() => {
        console.log("[startup] default model/studio assets synced to Supabase storage");
      })
      .catch((error) => {
        console.warn("[startup] failed to sync default assets:", error instanceof Error ? error.message : String(error));
      });
  }
});
