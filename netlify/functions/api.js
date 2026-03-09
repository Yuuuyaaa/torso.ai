import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "app-assets");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getRoutePath(event) {
  const rawPath = String(event?.path || event?.rawUrl || "");
  return rawPath
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/\.netlify\/functions\/api\/?/, "/")
    .replace(/^\/api\/?/, "/")
    .replace(/\/+$/, "") || "/";
}

function parseBody(event) {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }
}

async function supabaseRequest(path, { method = "GET", body, headers = {} } = {}) {
  requireSupabase();
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

async function storageUpload(path, buffer, contentType) {
  requireSupabase();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
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

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.user_id,
    email: row.email || "",
    name: row.display_name || "",
    plan: row.plan_id || "growth",
    credits: Number(row.credits || 0),
    createdAt: row.created_at || nowIso(),
  };
}

function hashPassword(password) {
  return `s1:${scryptSync(String(password || ""), "torso-ai", 32).toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const normalized = String(storedHash || "");
  if (!normalized.startsWith("s1:")) return String(password || "") === normalized;
  const expected = Buffer.from(normalized.slice(3), "hex");
  const actual = scryptSync(String(password || ""), "torso-ai", expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getUserByEmail(email) {
  const rows = await supabaseRequest(`/app_users?email=eq.${encodeURIComponent(email)}&select=user_id,email,display_name,plan_id,credits,created_at,password_hash&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserById(userId) {
  const rows = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,display_name,plan_id,credits,created_at,password_hash&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function ensureAssetLibrary(userId) {
  const rows = await supabaseRequest(`/app_asset_libraries?user_id=eq.${encodeURIComponent(userId)}&select=user_id,studio_assets,model_assets,product_assets&limit=1`);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (row) {
    return {
      studio: Array.isArray(row.studio_assets) ? row.studio_assets : [],
      models: Array.isArray(row.model_assets) ? row.model_assets : [],
      products: Array.isArray(row.product_assets) ? row.product_assets : [],
    };
  }
  const created = await supabaseRequest("/app_asset_libraries", {
    method: "POST",
    body: {
      user_id: userId,
      studio_assets: [],
      model_assets: [],
      product_assets: [],
    },
  });
  const next = Array.isArray(created) ? created[0] || null : null;
  return {
    studio: Array.isArray(next?.studio_assets) ? next.studio_assets : [],
    models: Array.isArray(next?.model_assets) ? next.model_assets : [],
    products: Array.isArray(next?.product_assets) ? next.product_assets : [],
  };
}

async function listJobsForUser(userId) {
  const jobs = await supabaseRequest(`/app_jobs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
  const items = await supabaseRequest(`/app_job_items?user_id=eq.${encodeURIComponent(userId)}&select=*&order=output_sequence.asc`);
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const bucket = grouped.get(item.job_id) || [];
    bucket.push({
      id: item.item_id,
      name: item.name,
      relativePath: item.relative_path || "",
      skuGuess: item.sku_guess || "",
      mime: item.mime || "image/jpeg",
      status: item.status || "queued",
      error: item.error || null,
      errorHint: item.error_hint || null,
      inputRef: item.input_url || "",
      outputUrl: item.output_url || "",
      outputName: item.output_name || null,
      outputSequence: Number(item.output_sequence || 1),
      creditUsed: Number(item.credit_used || 0),
      createdAt: item.created_at || nowIso(),
      updatedAt: item.updated_at || nowIso(),
    });
    grouped.set(item.job_id, bucket);
  }
  return (Array.isArray(jobs) ? jobs : []).map((job) => ({
    id: job.job_id,
    userId: job.user_id,
    style: job.style,
    status: job.status,
    outputPreset: job.output_preset || "default",
    styleConfig: job.style_config || {},
    backgroundAssetId: job.background_asset_id || null,
    modelAssetId: job.model_asset_id || null,
    modelRunStrategy: job.model_run_strategy || "auto",
    creditRate: Number(job.credit_rate || 0),
    reservedCredits: Number(job.reserved_credits || 0),
    creditUsed: Number(job.credit_used || 0),
    imageCount: Number(job.image_count || 0),
    processedCount: Number(job.processed_count || 0),
    successCount: Number(job.success_count || 0),
    errorCount: Number(job.error_count || 0),
    retryAttempt: Number(job.retry_attempt || 0),
    createdAt: job.created_at || nowIso(),
    updatedAt: job.updated_at || nowIso(),
    items: grouped.get(job.job_id) || [],
  }));
}

async function getJobById(jobId) {
  const rows = await supabaseRequest(`/app_jobs?job_id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
  const job = Array.isArray(rows) ? rows[0] || null : null;
  if (!job) return null;
  const items = await supabaseRequest(`/app_job_items?job_id=eq.${encodeURIComponent(jobId)}&select=*&order=output_sequence.asc`);
  return {
    id: job.job_id,
    userId: job.user_id,
    style: job.style,
    status: job.status,
    outputPreset: job.output_preset || "default",
    styleConfig: job.style_config || {},
    backgroundAssetId: job.background_asset_id || null,
    modelAssetId: job.model_asset_id || null,
    modelRunStrategy: job.model_run_strategy || "auto",
    creditRate: Number(job.credit_rate || 0),
    reservedCredits: Number(job.reserved_credits || 0),
    creditUsed: Number(job.credit_used || 0),
    imageCount: Number(job.image_count || 0),
    processedCount: Number(job.processed_count || 0),
    successCount: Number(job.success_count || 0),
    errorCount: Number(job.error_count || 0),
    retryAttempt: Number(job.retry_attempt || 0),
    createdAt: job.created_at || nowIso(),
    updatedAt: job.updated_at || nowIso(),
    items: (Array.isArray(items) ? items : []).map((item) => ({
      id: item.item_id,
      name: item.name,
      relativePath: item.relative_path || "",
      skuGuess: item.sku_guess || "",
      mime: item.mime || "image/jpeg",
      status: item.status || "queued",
      error: item.error || null,
      errorHint: item.error_hint || null,
      inputRef: item.input_url || "",
      outputUrl: item.output_url || "",
      outputName: item.output_name || null,
      outputSequence: Number(item.output_sequence || 1),
      creditUsed: Number(item.credit_used || 0),
      createdAt: item.created_at || nowIso(),
      updatedAt: item.updated_at || nowIso(),
    })),
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error("Invalid data URL");
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const raw = match[3] || "";
  return {
    mime,
    buffer: isBase64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw), "utf8"),
  };
}

function extFromMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/heic") return ".heic";
  if (mime === "image/heif") return ".heif";
  return ".jpg";
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders(), body: "" };

  const path = getRoutePath(event);
  const method = String(event.httpMethod || "GET").toUpperCase();

  try {
    if (method === "GET" && path === "/health") {
      return json(200, {
        ok: true,
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
        storageBucket: SUPABASE_STORAGE_BUCKET,
      });
    }

    if (method === "POST" && path === "/auth/signup") {
      const body = parseBody(event);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email) return json(400, { error: "email is required" });
      if (!password) return json(400, { error: "password is required" });
      const existing = await getUserByEmail(email);
      if (existing) return json(400, { error: "email already registered" });
      const created = await supabaseRequest("/app_users", {
        method: "POST",
        body: {
          user_id: id("usr"),
          email,
          display_name: "",
          plan_id: "growth",
          credits: 200,
          password_hash: hashPassword(password),
        },
      });
      return json(200, { user: mapUser(Array.isArray(created) ? created[0] || null : null) });
    }

    if (method === "POST" && path === "/auth/login") {
      const body = parseBody(event);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email) return json(400, { error: "email is required" });
      let user = await getUserByEmail(email);
      if (!user && email.endsWith("@local.test")) {
        const created = await supabaseRequest("/app_users", {
          method: "POST",
          body: {
            user_id: "usr_devlocal",
            email,
            display_name: email.split("@")[0] || "user",
            plan_id: "growth",
            credits: 200,
            password_hash: hashPassword(""),
          },
        });
        user = Array.isArray(created) ? created[0] || null : null;
      }
      if (!user) return json(404, { error: "account not found" });
      if (!verifyPassword(password, user.password_hash)) return json(401, { error: "invalid email or password" });
      return json(200, { user: mapUser(user) });
    }

    if (method === "GET" && path.startsWith("/users/")) {
      const userId = decodeURIComponent(path.replace("/users/", "").split("/")[0] || "");
      const user = await getUserById(userId);
      if (!user) return json(404, { error: "user not found" });
      return json(200, { user: mapUser(user) });
    }

    if (method === "POST" && path.match(/^\/users\/[^/]+\/profile$/)) {
      const userId = decodeURIComponent(path.replace("/users/", "").replace("/profile", "") || "");
      const body = parseBody(event);
      const name = String(body.name || "").trim();
      if (!name) return json(400, { error: "name is required" });
      const updated = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: { display_name: name },
      });
      return json(200, { user: mapUser(Array.isArray(updated) ? updated[0] || null : null) });
    }

    if (method === "GET" && path === "/credits/history") {
      const userId = String(event.queryStringParameters?.userId || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      const rows = await supabaseRequest(`/app_credit_events?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
      const events = (Array.isArray(rows) ? rows : []).map((row) => ({
        id: row.event_id,
        userId: row.user_id,
        type: row.event_type,
        delta: Number(row.delta || 0),
        balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
        payload: row.payload || {},
        createdAt: row.created_at || nowIso(),
      }));
      return json(200, { events });
    }

    if (method === "GET" && path === "/assets/library") {
      const userId = String(event.queryStringParameters?.userId || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      const library = await ensureAssetLibrary(userId);
      return json(200, { library });
    }

    if (method === "POST" && path === "/assets/library") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      const next = {
        user_id: userId,
        studio_assets: Array.isArray(body.studio) ? body.studio : [],
        model_assets: Array.isArray(body.models) ? body.models : [],
        product_assets: Array.isArray(body.products) ? body.products : [],
      };
      const rows = await supabaseRequest("/app_asset_libraries?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: next,
      });
      const row = Array.isArray(rows) ? rows[0] || null : null;
      return json(200, {
        library: {
          studio: Array.isArray(row?.studio_assets) ? row.studio_assets : [],
          models: Array.isArray(row?.model_assets) ? row.model_assets : [],
          products: Array.isArray(row?.product_assets) ? row.product_assets : [],
        },
      });
    }

    if (method === "POST" && path === "/storage/upload") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const name = String(body.name || "image.jpg");
      const dataUrl = String(body.dataUrl || "");
      const purpose = String(body.purpose || "uploads").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "uploads";
      if (!userId) return json(400, { error: "userId is required" });
      if (!dataUrl.startsWith("data:image/")) return json(400, { error: "dataUrl must be an image data URL" });
      const { mime, buffer } = parseDataUrl(dataUrl);
      const ext = extFromMime(mime) || ".jpg";
      const pathValue = `${userId}/${purpose}/${Date.now()}-${randomUUID()}${ext}`;
      const url = await storageUpload(pathValue, buffer, mime || "image/jpeg");
      return json(200, { ok: true, url, path: pathValue, mime });
    }

    if (method === "GET" && path === "/jobs") {
      const userId = String(event.queryStringParameters?.userId || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      const jobs = await listJobsForUser(userId);
      return json(200, { jobs });
    }

    if (method === "GET" && path.match(/^\/jobs\/[^/]+$/)) {
      const jobId = decodeURIComponent(path.replace("/jobs/", "") || "");
      const job = await getJobById(jobId);
      if (!job) return json(404, { error: "job not found" });
      return json(200, { job });
    }

    return json(404, { error: `Not found: ${method} ${path}` });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
