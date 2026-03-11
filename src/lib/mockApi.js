const DB_KEY = "fcursor-fashion-db-v1";
const SESSION_KEY = "fcursor-fashion-session-v1";
const MODE_KEY = "fcursor-fashion-mode-v1";
const DEMO_KEY = "fcursor-fashion-demo-v1";
const ASSET_STORAGE_PREFIX = "torso-asset-library-v1";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const EXPLICIT_BACKEND_BASE_URL = String(import.meta.env.VITE_BACKEND_BASE_URL || "").trim();
const IS_LOCAL_BROWSER = typeof window === "undefined" || LOCAL_HOSTNAMES.has(window.location.hostname);
const DEFAULT_BACKEND_BASE_URL = IS_LOCAL_BROWSER ? "http://localhost:8787" : "";
const USE_BACKEND_API = import.meta.env.VITE_USE_BACKEND_API !== "false";
// Local dev talks to the standalone API server; production stays same-origin via Netlify.
const BACKEND_BASE_URL = (EXPLICIT_BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, "");

const PLAN_DEFS = {
  free: { label: "Free", monthlyCredits: 1 },
  starter: { label: "Starter", monthlyCredits: 30 },
  growth: { label: "Growth", monthlyCredits: 200 },
  business: { label: "Business", monthlyCredits: 800 },
  enterprise: { label: "Enterprise", monthlyCredits: 2000 },
  custom: { label: "Custom", monthlyCredits: 2000 },
};

const CREDIT_PACK_DEFS = {
  freeIntro: { id: "free-intro-10", label: "初回限定 10クレジット", credits: 10, priceYen: 500, oneTime: true },
  freeStandard: { id: "free-topup-10", label: "追加 10クレジット", credits: 10, priceYen: 1800, oneTime: false },
  starter: { id: "starter-topup-10", label: "追加 10クレジット", credits: 10, priceYen: 1650, oneTime: false },
  growth: { id: "growth-topup-10", label: "追加 10クレジット", credits: 10, priceYen: 1500, oneTime: false },
  business: { id: "business-topup-10", label: "追加 10クレジット", credits: 10, priceYen: 1250, oneTime: false },
  enterprise: { id: "enterprise-topup-10", label: "追加 10クレジット", credits: 10, priceYen: 1000, oneTime: false },
};
const CREDIT_PACKS_BY_CODE = Object.fromEntries(Object.values(CREDIT_PACK_DEFS).map((pack) => [pack.id, pack]));

const PLAN_ALIASES = {
  light: "starter",
  standard: "growth",
  pro: "enterprise",
};
const HIGH_QUALITY_PLANS = new Set(["growth", "business", "enterprise", "custom", "standard", "pro"]);
const MODEL_RUN_CREDIT_BY_STRATEGY = {
  "tryon-v1.6": 1,
  "tryon-max": 4,
  "product-to-model": 1,
};
const DEMO_OUTPUTS = {
  torso: ["/torso.png", "/bg1.png", "/bg3.png"],
  mannequin: ["/mannequin.png", "/bg2.png", "/bg4.png"],
  hanger: ["/hanger.png", "/bg5.png", "/bg6.png"],
  ghost: ["/ghost.png", "/bg7.png", "/bg8.png"],
  model: ["/mannequin.png", "/bg9.png", "/bg10.png"],
  custom: ["/mannequin.png", "/bg1.png", "/bg6.png"],
};
const DEMO_BACKGROUND_OUTPUT_MAP = {
  bg1: "/bg3.png",
  bg2: "/bg7.png",
  bg3: "/bg1.png",
  bg7: "/bg2.png",
};
const demoState = {
  jobs: [],
};

export const STYLE_DEFS = {
  torso: { label: "トルソー", credits: [1] },
  mannequin: { label: "マネキン", credits: [1] },
  hanger: { label: "ハンガー", credits: [1] },
  ghost: { label: "ゴースト", credits: [1] },
  model: { label: "モデル", credits: [1, 4] },
  custom: { label: "カスタムプロンプト", credits: [3, 4] },
};

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function buildOutputFileName({ style = "torso", index = 0, createdAt = null, ext = "jpg" }) {
  const safeStyle = String(style || "torso").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "torso";
  const safeExt = String(ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const seq = String(index + 1).padStart(2, "0");
  return `torso-ai-${compactTimestamp(createdAt)}-${safeStyle}-${seq}.${safeExt}`;
}

function readDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { users: [], jobs: [], session: { userId: null } };
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      session: parsed.session || { userId: null },
    };
  } catch {
    return { users: [], jobs: [], session: { userId: null } };
  }
}

function writeDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function readLocalAssetLibrary(userId) {
  if (!userId) return { studio: [], models: [], products: [] };
  try {
    const raw = localStorage.getItem(`${ASSET_STORAGE_PREFIX}:${userId}`);
    if (!raw) return { studio: [], models: [], products: [] };
    const parsed = JSON.parse(raw);
    return {
      studio: Array.isArray(parsed.studio) ? parsed.studio : [],
      models: Array.isArray(parsed.models) ? parsed.models : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
    };
  } catch {
    return { studio: [], models: [], products: [] };
  }
}

function writeLocalAssetLibrary(userId, payload) {
  if (!userId) return;
  const next = {
    studio: Array.isArray(payload?.studio) ? payload.studio : [],
    models: Array.isArray(payload?.models) ? payload.models : [],
    products: Array.isArray(payload?.products) ? payload.products : [],
  };
  localStorage.setItem(`${ASSET_STORAGE_PREFIX}:${userId}`, JSON.stringify(next));
}

function getApiMode() {
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === "mock" || mode === "backend") return mode;
  return "backend";
}

function setApiMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

function shouldUseBackend() {
  if (isDemoSession()) return false;
  return USE_BACKEND_API && getApiMode() === "backend";
}

export function isDemoSession() {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function startDemoSession() {
  localStorage.setItem(DEMO_KEY, "1");
  localStorage.removeItem(SESSION_KEY);
  setApiMode("mock");
  demoState.jobs = [];
}

export function endDemoSession() {
  localStorage.removeItem(DEMO_KEY);
  demoState.jobs = [];
}

function hash(input) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function resolvePlanId(planId) {
  if (PLAN_DEFS[planId]) return planId;
  return PLAN_ALIASES[planId] || "growth";
}

function getSubscriptionCreditsValue(user) {
  return Math.max(0, Number(user?.subscriptionCredits || 0));
}

function getPurchasedCreditsValue(user) {
  return Math.max(0, Number(user?.credits || 0) - getSubscriptionCreditsValue(user));
}

function applyMonthlyCreditAllocation(user, planId) {
  const resolvedPlan = resolvePlanId(planId || user?.plan);
  const plan = PLAN_DEFS[resolvedPlan];
  const monthlyCredits = Number.isFinite(plan?.monthlyCredits) ? plan.monthlyCredits : 999999;
  const purchasedCredits = getPurchasedCreditsValue(user);
  return {
    ...user,
    plan: resolvedPlan,
    credits: purchasedCredits + monthlyCredits,
    subscriptionCredits: monthlyCredits,
    introPackEligible: typeof user?.introPackEligible === "boolean" ? user.introPackEligible : true,
  };
}

function touchMonthlyCredits(user) {
  const month = currentMonthKey();
  if (user.creditMonth === month) return user;
  return {
    ...applyMonthlyCreditAllocation(user, user.plan),
    creditMonth: month,
  };
}

function persistMutator(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

function ensureLocalDevUser(db) {
  const existing = db.users.find((u) => u.email === "dev@local.test");
  if (existing) return touchMonthlyCredits(existing);
  const user = touchMonthlyCredits({
    id: "usr_devlocal",
    email: "dev@local.test",
    name: "Developer",
    password: "",
    plan: "growth",
    credits: PLAN_DEFS.growth.monthlyCredits,
    subscriptionCredits: PLAN_DEFS.growth.monthlyCredits,
    introPackEligible: false,
    creditMonth: currentMonthKey(),
    createdAt: nowIso(),
  });
  db.users.push(user);
  return user;
}

function estimateUnits(file) {
  const isZip = (file.name || "").toLowerCase().endsWith(".zip");
  return isZip ? 10 : 1;
}

function creditRateFor(style, seed) {
  const def = STYLE_DEFS[style] || STYLE_DEFS.torso;
  if (def.credits.length === 1) return def.credits[0];
  return def.credits[seed % def.credits.length];
}

function normalizeModelRunStrategy(value) {
  const v = String(value || "auto").trim().toLowerCase();
  if (v === "tryon" || v === "try-on" || v === "tryon-max" || v === "try-on-max" || v === "tryon-pro" || v === "try-on-pro") return "tryon-max";
  if (v === "tryon-v1.6" || v === "try-on-v1.6" || v === "v1.6" || v === "tryon16") return "tryon-v1.6";
  if (v === "product-to-model" || v === "product_to_model" || v === "producttomodel" || v === "product") return "product-to-model";
  return "auto";
}

function hasExtraTryonInstructions(styleConfig) {
  if (!styleConfig || typeof styleConfig !== "object") return false;
  if (String(styleConfig.customPrompt || "").trim()) return true;
  if (String(styleConfig.orientation || "front") !== "front") return true;
  if (String(styleConfig.framing || "focus") !== "focus") return true;
  return false;
}

function resolveEffectiveModelRunStrategy(style, modelRunStrategy, styleConfig) {
  const normalized = normalizeModelRunStrategy(modelRunStrategy || "auto");
  if (style === "model") {
    if (normalized === "product-to-model" || normalized === "tryon-v1.6" || normalized === "tryon-max") return normalized;
    return hasExtraTryonInstructions(styleConfig) ? "tryon-max" : "tryon-v1.6";
  }
  if (style === "torso" || style === "mannequin") {
    return normalized === "tryon-max" ? "tryon-max" : "product-to-model";
  }
  return "product-to-model";
}

function resolveBackgroundEditSurcharge(backgroundMode, backgroundReference) {
  const mode = String(backgroundMode || "solid").toLowerCase();
  const ref = String(backgroundReference || "").trim();
  if (mode !== "image") return 0;
  return ref ? 1 : 0;
}

function updateMockJobState(job) {
  if (job.status === "done" || job.status === "error") return job;

  const now = Date.now();
  if (job.status === "queued" && now >= job.processingAt) {
    return { ...job, status: "processing", updatedAt: nowIso() };
  }

  if (job.status === "processing" && now >= job.completeAt) {
    const items = job.items.map((item, index) => {
      const fail = hash(`${job.id}:${item.id}`) % 100 < 8;
      if (fail) return { ...item, status: "error", outputName: null };
      const ext = item.name.toLowerCase().endsWith(".png") ? "png" : "jpg";
      return {
        ...item,
        status: "done",
        outputName: buildOutputFileName({ style: job.style, index, createdAt: job.createdAt, ext }),
      };
    });

    const outputFiles = items.filter((item) => item.status === "done").map((item) => item.outputName);
    return {
      ...job,
      status: outputFiles.length > 0 ? "done" : "error",
      items,
      outputFiles,
      updatedAt: nowIso(),
    };
  }

  return job;
}

async function backendRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options,
    cache: method === "GET" ? "no-store" : options.cache,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data?.error || text || `API error ${response.status}`);
  }
  return data;
}

function getGoogleCallbackUrl() {
  if (typeof window === "undefined") return "/auth/callback";
  return `${window.location.origin}/auth/callback`;
}

async function fileToDataUrl(file) {
  if (typeof file.dataUrl === "string") return file.dataUrl;
  if (!(file.rawFile instanceof File)) {
    throw new Error(`画像データが不足しています: ${file.name}`);
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`画像読込に失敗: ${file.name}`));
    reader.readAsDataURL(file.rawFile);
  });
}

async function uploadFileForJob({ userId, file, purpose = "jobs-inputs" }) {
  const dataUrl = await fileToDataUrl(file);
  const data = await backendRequest("/api/storage/upload", {
    method: "POST",
    body: JSON.stringify({
      userId,
      name: file.name,
      dataUrl,
      purpose,
    }),
  });
  if (!data?.url) {
    throw new Error("画像アップロードに失敗しました");
  }
  return data.url;
}

export async function uploadAssetImage({ userId, name, dataUrl, purpose = "products-library" }) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedDataUrl = String(dataUrl || "");
  if (!normalizedUserId) throw new Error("userId is required");
  if (!normalizedDataUrl.startsWith("data:image/")) {
    throw new Error("画像アップロードに失敗しました");
  }
  if (!shouldUseBackend()) {
    return { url: normalizedDataUrl, path: "", mime: "" };
  }
  const data = await backendRequest("/api/storage/upload", {
    method: "POST",
    body: JSON.stringify({
      userId: normalizedUserId,
      name: String(name || "image.jpg"),
      dataUrl: normalizedDataUrl,
      purpose,
    }),
  });
  if (!data?.url) {
    throw new Error("画像アップロードに失敗しました");
  }
  return {
    url: String(data.url),
    path: String(data.path || ""),
    mime: String(data.mime || ""),
  };
}

export async function login({ email, password }) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  if (!normalizedEmail) throw new Error("メールアドレスを入力してください");
  endDemoSession();
  if (USE_BACKEND_API) setApiMode("backend");

  if (shouldUseBackend()) {
    try {
      const data = await backendRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
      });
      localStorage.setItem(SESSION_KEY, data.user.id);
      setApiMode("backend");
      return data.user;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error || "");
      const lower = message.toLowerCase();
      const isNetworkFailure = lower.includes("failed to fetch")
        || lower.includes("networkerror")
        || lower.includes("load failed")
        || lower.includes("api error 502")
        || lower.includes("api error 503")
        || lower.includes("api error 504");
      if (isNetworkFailure) {
        throw new Error(`APIサーバーに接続できません: ${message || "Failed to fetch"}`);
      }
      if (lower.includes("account not found")) {
        throw new Error("アカウントが存在しません。新規登録してください。");
      }
      if (lower.includes("invalid email or password") || lower.includes("api error 401")) {
        throw new Error("メールアドレスまたはパスワードが正しくありません。");
      }
      throw error instanceof Error ? error : new Error(message || "ログインに失敗しました。");
    }
  }

  return persistMutator((db) => {
    const existing = db.users.find((u) => u.email === normalizedEmail)
      || (normalizedEmail === "dev@local.test" ? ensureLocalDevUser(db) : null);
    if (!existing) throw new Error("アカウントが存在しません。新規登録してください。");
    if (existing.password && existing.password !== normalizedPassword) {
      throw new Error("メールアドレスまたはパスワードが正しくありません。");
    }
    const user = touchMonthlyCredits(existing);

    Object.assign(existing, user);

    db.session.userId = user.id;
    return user;
  });
}

export async function signup({ email, password }) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  if (!normalizedEmail) throw new Error("メールアドレスを入力してください");
  if (!normalizedPassword) throw new Error("パスワードを入力してください");
  endDemoSession();
  if (USE_BACKEND_API) setApiMode("backend");

  if (shouldUseBackend()) {
    const data = await backendRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
    });
    localStorage.setItem(SESSION_KEY, data.user.id);
    setApiMode("backend");
    return data.user;
  }

  return persistMutator((db) => {
    const existing = db.users.find((u) => u.email === normalizedEmail);
    if (existing) {
      throw new Error("このメールアドレスは既に登録されています。");
    }
    const user = touchMonthlyCredits({
      id: `usr_${Math.random().toString(36).slice(2, 10)}`,
      email: normalizedEmail,
      name: "",
      password: normalizedPassword,
      plan: "free",
      credits: PLAN_DEFS.free.monthlyCredits,
      subscriptionCredits: PLAN_DEFS.free.monthlyCredits,
      introPackEligible: true,
      creditMonth: currentMonthKey(),
      createdAt: nowIso(),
    });
    db.users.push(user);
    db.session.userId = user.id;
    return user;
  });
}

export function startGoogleLogin() {
  endDemoSession();
  if (USE_BACKEND_API) setApiMode("backend");
  const callbackUrl = getGoogleCallbackUrl();
  const url = `${BACKEND_BASE_URL}/api/auth/google/start?redirectTo=${encodeURIComponent(callbackUrl)}`;
  window.location.assign(url);
}

export async function completeGoogleLogin(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("Googleログインのトークンが取得できませんでした。");
  const data = await backendRequest("/api/auth/google/complete", {
    method: "POST",
    body: JSON.stringify({ accessToken: token }),
  });
  localStorage.setItem(SESSION_KEY, data.user.id);
  setApiMode("backend");
  return data.user;
}

export async function updateUserName(userId, name) {
  const nextName = String(name || "").trim();
  if (!nextName) throw new Error("名前を入力してください");

  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/users/${encodeURIComponent(userId)}/profile`, {
      method: "POST",
      body: JSON.stringify({ name: nextName }),
    });
    return data.user;
  }

  return persistMutator((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("user not found");
    user.name = nextName;
    return user;
  });
}

export async function logout() {
  if (isDemoSession()) {
    endDemoSession();
    return;
  }
  if (shouldUseBackend()) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  persistMutator((db) => {
    db.session.userId = null;
    return null;
  });
}

export async function getCurrentUser() {
  if (isDemoSession()) {
    return {
      id: "demo_user",
      email: "demo@torso.ai",
      name: "デモ版ログイン画面",
      plan: "business",
      credits: 800,
      subscriptionCredits: 800,
      createdAt: nowIso(),
      isDemo: true,
      introPackEligible: false,
    };
  }
  if (shouldUseBackend()) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    try {
      const data = await backendRequest(`/api/users/${userId}`);
      return data.user;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
      const isAuthInvalid = message.includes("user not found")
        || message.includes("invalid email or password")
        || message.includes("api error 401")
        || message.includes("api error 403");
      if (isAuthInvalid) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      // Keep session on transient/server/network failures to avoid forced logout.
      throw error;
    }
  }

  return persistMutator((db) => {
    const user = db.users.find((u) => u.id === db.session.userId);
    if (!user) return null;
    Object.assign(user, touchMonthlyCredits(user));
    return user;
  });
}

export async function createJob({
  userId,
  style,
  files,
  outputPreset = "default",
  styleConfig = null,
  backgroundAssetId = null,
  backgroundMode = "solid",
  backgroundColor = "#FFFFFF",
  modelAssetId = null,
  modelReference = "",
  faceReference = "",
  modelRunStrategy = "auto",
  forceTryonV16Basic = false,
  useModelImagePrompt = false,
  backgroundReference = "",
  customPrompt = "",
  randomModelPrompt = "",
}) {
  if (isDemoSession()) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("画像またはZIPファイルを選択してください");
    }
    const now = Date.now();
    const effectiveModelRunStrategy = resolveEffectiveModelRunStrategy(style, modelRunStrategy, styleConfig);
    const isHighQuality = String(styleConfig?.quality || "standard").toLowerCase() === "high"
      && !(effectiveModelRunStrategy === "tryon-v1.6" || effectiveModelRunStrategy === "tryon-max");
    const modelReferenceSurcharge = modelAssetId && style !== "model" && effectiveModelRunStrategy !== "tryon-max" ? 1 : 0;
    const backgroundEditSurcharge = resolveBackgroundEditSurcharge(backgroundMode, backgroundReference);
    const baseRate = (style === "model" || effectiveModelRunStrategy === "tryon-max")
      ? (MODEL_RUN_CREDIT_BY_STRATEGY[effectiveModelRunStrategy || "tryon-v1.6"] || 1)
      : (STYLE_DEFS[style]?.credits?.[0] || 1);
    const rate = baseRate + (isHighQuality ? 1 : 0) + modelReferenceSurcharge + backgroundEditSurcharge;
    const bgType = String(styleConfig?.background?.type || "solid");
    const bgColor = String(styleConfig?.background?.color || "#FFFFFF").toLowerCase();
    const bgRef = String(backgroundReference || "");
    const bgMatch = bgRef.match(/(bg\d+)\.png/i);
    const bgId = bgMatch ? bgMatch[1].toLowerCase() : "";
    const stylePool = DEMO_OUTPUTS[style] || DEMO_OUTPUTS.torso;
    const chooseDemoOutput = (index) => {
      if (bgType === "studio" && DEMO_BACKGROUND_OUTPUT_MAP[bgId]) {
        return DEMO_BACKGROUND_OUTPUT_MAP[bgId];
      }
      if (bgType === "solid" && bgColor === "#f6f1e8") {
        return stylePool[(index + 1) % stylePool.length];
      }
      return stylePool[index % stylePool.length];
    };

    const items = await Promise.all(files.map(async (file, index) => ({
      id: `itm_${Math.random().toString(36).slice(2, 10)}`,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      clientRef: file.clientRef || null,
      isZip: (file.name || "").toLowerCase().endsWith(".zip"),
      estimatedUnits: estimateUnits(file),
      creditRate: rate,
      creditUsed: rate,
      status: "queued",
      inputDataUrl: (String(file.type || "").startsWith("image/") && !(file.name || "").toLowerCase().endsWith(".zip"))
        ? await fileToDataUrl(file)
        : null,
      outputName: null,
      outputUrl: null,
      demoOutputUrl: chooseDemoOutput(index),
    })));

    const job = {
      id: `job_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      style,
      outputPreset,
      styleConfig,
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
      inputFiles: items.map((item) => item.name),
      outputFiles: [],
      creditUsed: 0,
      items,
      imageCount: items.length,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      retryAttempt: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      processingAt: now + 1000,
      completeAt: now + 5000,
      isDemo: true,
    };
    demoState.jobs.unshift(job);
    return job;
  }

  if (shouldUseBackend()) {
    const payloadFiles = await Promise.all(
      files.map(async (file) => {
        const name = String(file.name || "");
        const isZip = name.toLowerCase().endsWith(".zip");
        const base = {
          name: file.name,
          size: file.size,
          type: file.type,
          clientRef: file.clientRef || null,
        };
        if (isZip) {
          return {
            ...base,
            dataUrl: await fileToDataUrl(file),
          };
        }
        const url = await uploadFileForJob({ userId, file, purpose: "jobs-inputs" });
        return {
          ...base,
          url,
        };
      }),
    );

    const data = await backendRequest("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        userId,
        style,
        outputPreset,
        styleConfig,
        backgroundAssetId,
        backgroundMode,
        backgroundColor,
        modelAssetId,
        modelReference,
        faceReference,
        modelRunStrategy,
        forceTryonV16Basic,
        useModelImagePrompt,
        backgroundReference,
        customPrompt,
        randomModelPrompt,
        files: payloadFiles,
      }),
    });
    return data.job;
  }

  const localItems = await Promise.all(files.map(async (file, index) => {
    const effectiveModelRunStrategy = resolveEffectiveModelRunStrategy(style, modelRunStrategy, styleConfig);
    const requestedQuality = String(styleConfig?.quality || "standard").toLowerCase();
    const highQuality = requestedQuality === "high"
      && !(effectiveModelRunStrategy === "tryon-v1.6" || effectiveModelRunStrategy === "tryon-max");
    const modelReferenceSurcharge = modelAssetId && style !== "model" && effectiveModelRunStrategy !== "tryon-max" ? 1 : 0;
    const backgroundEditSurcharge = resolveBackgroundEditSurcharge(backgroundMode, backgroundReference);
    const seed = hash(`${file.name}:${file.size}:${index}`);
    const units = estimateUnits(file);
    const baseRate = (style === "model" || effectiveModelRunStrategy === "tryon-max")
      ? (MODEL_RUN_CREDIT_BY_STRATEGY[effectiveModelRunStrategy || "tryon-v1.6"] || 1)
      : creditRateFor(style, seed);
    const rate = baseRate + (highQuality ? 1 : 0) + modelReferenceSurcharge + backgroundEditSurcharge;
    return {
      id: `itm_${Math.random().toString(36).slice(2, 10)}`,
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
      clientRef: file.clientRef || null,
      isZip: (file.name || "").toLowerCase().endsWith(".zip"),
      estimatedUnits: units,
      creditRate: rate,
      creditUsed: units * rate,
      status: "queued",
      inputDataUrl: (String(file.type || "").startsWith("image/") && !(file.name || "").toLowerCase().endsWith(".zip"))
        ? await fileToDataUrl(file)
        : null,
      outputName: null,
    };
  }));

  return persistMutator((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("ログインが必要です");

    Object.assign(user, touchMonthlyCredits(user));

    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("画像またはZIPファイルを選択してください");
    }
    const effectiveModelRunStrategy = resolveEffectiveModelRunStrategy(style, modelRunStrategy, styleConfig);
    const requestedQuality = String(styleConfig?.quality || "standard").toLowerCase();
    const highQuality = requestedQuality === "high"
      && !(effectiveModelRunStrategy === "tryon-v1.6" || effectiveModelRunStrategy === "tryon-max");
    const modelReferenceSurcharge = modelAssetId && style !== "model" && effectiveModelRunStrategy !== "tryon-max" ? 1 : 0;
    const backgroundEditSurcharge = resolveBackgroundEditSurcharge(backgroundMode, backgroundReference);
    if (highQuality && !HIGH_QUALITY_PLANS.has(String(user.plan || "").toLowerCase())) {
      throw new Error("高画質はGrowth以上のプランで利用できます");
    }

    const items = localItems;

    const creditUsed = items.reduce((sum, item) => sum + item.creditUsed, 0);
    if (user.credits < creditUsed) {
      throw new Error(`クレジット不足です。必要 ${creditUsed}cr / 残り ${user.credits}cr`);
    }

    const subscriptionUsed = Math.min(getSubscriptionCreditsValue(user), creditUsed);
    user.subscriptionCredits = getSubscriptionCreditsValue(user) - subscriptionUsed;
    user.credits -= creditUsed;

    const now = Date.now();
    const totalUnits = items.reduce((sum, item) => sum + item.estimatedUnits, 0);
    const processingAt = now + 500;
    const completeAt = processingAt + Math.min(25000, 1000 + totalUnits * 1200);

    const job = {
      id: `job_${Math.random().toString(36).slice(2, 10)}`,
      userId,
      style,
      outputPreset,
      styleConfig,
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
      inputFiles: items.map((item) => item.name),
      outputFiles: [],
      creditUsed,
      items,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      processingAt,
      completeAt,
    };

    db.jobs.unshift(job);
    return job;
  });
}

export async function pollJob(jobId) {
  if (isDemoSession()) {
    const idx = demoState.jobs.findIndex((job) => job.id === jobId);
    if (idx < 0) return null;
    const job = demoState.jobs[idx];
    const now = Date.now();
    if (job.status === "queued" && now >= job.processingAt) {
      job.status = "processing";
      job.updatedAt = nowIso();
    }
    if ((job.status === "queued" || job.status === "processing") && now >= job.completeAt) {
      job.status = "done";
      job.items = job.items.map((item, index) => ({
        ...item,
        status: "done",
        outputUrl: item.demoOutputUrl || "",
        outputName: buildOutputFileName({ style: job.style, index, createdAt: job.createdAt, ext: "jpg" }),
      }));
      job.outputFiles = job.items.map((item) => item.outputName);
      job.processedCount = job.items.length;
      job.successCount = job.items.length;
      job.creditUsed = job.items.reduce((sum, item) => sum + Number(item.creditRate || 0), 0);
      job.updatedAt = nowIso();
    }
    demoState.jobs[idx] = { ...job };
    return demoState.jobs[idx];
  }
  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/jobs/${jobId}`);
    return data.job;
  }

  return persistMutator((db) => {
    const idx = db.jobs.findIndex((job) => job.id === jobId);
    if (idx < 0) return null;
    const next = updateMockJobState(db.jobs[idx]);
    db.jobs[idx] = next;
    return next;
  });
}

export async function listJobs(userId) {
  if (isDemoSession()) {
    return demoState.jobs
      .filter((job) => job.userId === userId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/jobs?userId=${encodeURIComponent(userId)}`);
    return data.jobs || [];
  }

  return persistMutator((db) => {
    db.jobs = db.jobs.map((job) => updateMockJobState(job));
    return db.jobs
      .filter((job) => job.userId === userId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  });
}

export async function listCreditHistory(userId) {
  if (!userId) return [];
  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/credits/history?userId=${encodeURIComponent(userId)}`);
    return Array.isArray(data.events) ? data.events : [];
  }

  const db = readDb();
  return db.jobs
    .filter((job) => job.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((job) => ({
      id: `mock_credit_${job.id}`,
      userId,
      type: "job_reserved",
      delta: -Number(job.reservedCredits || 0),
      balanceAfter: null,
      payload: {
        jobId: job.id,
        style: job.style,
        imageCount: Number(job.imageCount || 0),
        creditRate: Number(job.creditRate || 0),
      },
      createdAt: job.createdAt || nowIso(),
    }));
}

export async function getBillingHistory(userId) {
  if (!userId) {
    return { creditPackOrders: [], subscriptionOrders: [], billingCustomer: null };
  }
  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/billing/history?userId=${encodeURIComponent(userId)}`);
    return {
      creditPackOrders: Array.isArray(data?.creditPackOrders) ? data.creditPackOrders : [],
      subscriptionOrders: Array.isArray(data?.subscriptionOrders) ? data.subscriptionOrders : [],
      billingCustomer: data?.billingCustomer || null,
    };
  }

  const db = readDb();
  const creditPackOrders = (Array.isArray(db.creditPackOrders) ? db.creditPackOrders : [])
    .filter((order) => order.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((order) => ({
      id: order.id,
      kind: "credit_pack",
      userId: order.userId,
      planId: order.planId || "free",
      packCode: order.packCode || "",
      credits: Number(order.credits || 0),
      amountYen: Number(order.amountYen || 0),
      status: order.status || "pending",
      stripeCheckoutSessionId: order.stripeCheckoutSessionId || "",
      stripePaymentIntentId: order.stripePaymentIntentId || "",
      createdAt: order.createdAt || nowIso(),
      updatedAt: order.updatedAt || order.createdAt || nowIso(),
      payload: order.payload || {},
    }));
  const subscriptionOrders = (Array.isArray(db.subscriptionOrders) ? db.subscriptionOrders : [])
    .filter((order) => order.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map((order) => ({
      id: order.id,
      kind: "subscription",
      userId: order.userId,
      planId: order.planId || "free",
      interval: order.interval || "month",
      amountYen: order.amountYen == null ? null : Number(order.amountYen),
      status: order.status || "pending",
      stripeCheckoutSessionId: order.stripeCheckoutSessionId || "",
      stripeSubscriptionId: order.stripeSubscriptionId || "",
      stripeCustomerId: order.stripeCustomerId || "",
      stripeLatestInvoiceId: order.stripeLatestInvoiceId || "",
      createdAt: order.createdAt || nowIso(),
      updatedAt: order.updatedAt || order.createdAt || nowIso(),
      payload: order.payload || {},
    }));
  const customer = (Array.isArray(db.billingCustomers) ? db.billingCustomers : []).find((row) => row.userId === userId) || null;
  return {
    creditPackOrders,
    subscriptionOrders,
    billingCustomer: customer ? {
      userId: customer.userId,
      stripeCustomerId: customer.stripeCustomerId || "",
      billingEmail: customer.billingEmail || "",
      defaultPaymentMethodId: customer.defaultPaymentMethodId || "",
      createdAt: customer.createdAt || nowIso(),
      updatedAt: customer.updatedAt || customer.createdAt || nowIso(),
      payload: customer.payload || {},
    } : null,
  };
}

export async function createCustomerPortalSession(userId) {
  if (!userId) throw new Error("userId is required");
  if (!shouldUseBackend()) {
    throw new Error("請求管理ページはバックエンド接続時のみ利用できます。");
  }
  const data = await backendRequest("/api/billing/customer-portal", {
    method: "POST",
    body: JSON.stringify({
      userId,
      returnUrl: typeof window !== "undefined" ? `${window.location.origin}/app` : "",
    }),
  });
  if (!data?.url) throw new Error("portal url missing");
  return data;
}

export async function changeSubscriptionPlan(userId, targetPlanId) {
  if (!userId) throw new Error("userId is required");
  if (!shouldUseBackend()) {
    throw new Error("プラン変更はバックエンド接続時のみ利用できます。");
  }
  const normalizedPlanId = String(targetPlanId || "").trim().toLowerCase();
  if (!normalizedPlanId) throw new Error("targetPlanId is required");
  const data = await backendRequest("/api/billing/change-plan", {
    method: "POST",
    body: JSON.stringify({
      userId,
      targetPlanId: normalizedPlanId,
    }),
  });
  if (!data?.user) throw new Error("updated user missing");
  return data;
}

export async function listActiveJobs(userId) {
  const jobs = await listJobs(userId);
  return jobs.filter((job) => job.status === "queued" || job.status === "processing");
}

export async function fetchAssetLibrary(userId) {
  if (!userId) return { studio: [], models: [], products: [] };
  if (isDemoSession()) return { studio: [], models: [], products: [] };

  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/assets/library?userId=${encodeURIComponent(userId)}`);
    const lib = data?.library || {};
    return {
      studio: Array.isArray(lib.studio) ? lib.studio : [],
      models: Array.isArray(lib.models) ? lib.models : [],
      products: Array.isArray(lib.products) ? lib.products : [],
    };
  }

  return readLocalAssetLibrary(userId);
}

export async function saveAssetLibrary(userId, payload) {
  if (!userId) return { studio: [], models: [], products: [] };
  const next = {
    studio: Array.isArray(payload?.studio) ? payload.studio : [],
    models: Array.isArray(payload?.models) ? payload.models : [],
    products: Array.isArray(payload?.products) ? payload.products : [],
  };
  if (isDemoSession()) return next;

  if (shouldUseBackend()) {
    const data = await backendRequest("/api/assets/library", {
      method: "POST",
      body: JSON.stringify({
        userId,
        ...next,
      }),
    });
    const lib = data?.library || {};
    return {
      studio: Array.isArray(lib.studio) ? lib.studio : [],
      models: Array.isArray(lib.models) ? lib.models : [],
      products: Array.isArray(lib.products) ? lib.products : [],
    };
  }

  writeLocalAssetLibrary(userId, next);
  return next;
}

export async function retryJob(jobId, retryAttempt = 1) {
  if (isDemoSession()) {
    const job = demoState.jobs.find((item) => item.id === jobId);
    if (!job) return null;
    job.status = "queued";
    job.retryAttempt = retryAttempt;
    job.processingAt = Date.now() + 1000;
    job.completeAt = Date.now() + 5000;
    job.items = job.items.map((item) => ({
      ...item,
      status: "queued",
      outputUrl: null,
      outputName: null,
    }));
    job.updatedAt = nowIso();
    return job;
  }
  if (shouldUseBackend()) {
    const data = await backendRequest(`/api/jobs/${jobId}/retry`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: `${jobId}:${retryAttempt}` }),
    });
    return data.job;
  }
  return pollJob(jobId);
}

export async function downloadJobZip(jobId) {
  if (isDemoSession()) {
    throw new Error("デモ版ではZIPダウンロードは利用できません");
  }
  if (!shouldUseBackend()) {
    throw new Error("ZIPダウンロードはバックエンドモードで利用できます");
  }
  const response = await fetch(`${BACKEND_BASE_URL}/api/jobs/${jobId}/download`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || "ZIP生成に失敗しました");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${jobId}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteGeneratedItems(userId, itemIds = []) {
  const targets = Array.isArray(itemIds)
    ? itemIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (!userId) throw new Error("userId is required");
  if (targets.length === 0) throw new Error("itemIds are required");
  const targetSet = new Set(targets);

  if (isDemoSession()) {
    let deletedCount = 0;
    demoState.jobs = demoState.jobs
      .filter((job) => job.userId === userId)
      .map((job) => {
        const items = (job.items || []).filter((item) => {
          if (!targetSet.has(item.id)) return true;
          deletedCount += 1;
          return false;
        });
        const next = {
          ...job,
          items,
          processedCount: items.filter((item) => item.status === "done" || item.status === "error").length,
          successCount: items.filter((item) => item.status === "done").length,
          errorCount: items.filter((item) => item.status === "error").length,
        };
        next.creditUsed = next.successCount * Number(next.creditRate || 0);
        next.status = items.some((item) => item.status === "queued" || item.status === "processing")
          ? "processing"
          : (next.successCount > 0 ? "done" : "error");
        next.updatedAt = nowIso();
        return next;
      })
      .filter((job) => (job.items || []).length > 0);
    if (deletedCount === 0) throw new Error("no matching items found");
    return {
      deletedCount,
      jobs: demoState.jobs
        .filter((job) => job.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    };
  }

  if (shouldUseBackend()) {
    return backendRequest("/api/jobs/delete-items", {
      method: "POST",
      body: JSON.stringify({ userId, itemIds: targets }),
    });
  }

  return persistMutator((db) => {
    let deletedCount = 0;
    db.jobs = db.jobs
      .map((job) => updateMockJobState(job))
      .map((job) => {
        if (job.userId !== userId) return job;
        const items = (job.items || []).filter((item) => {
          if (!targetSet.has(item.id)) return true;
          deletedCount += 1;
          return false;
        });
        const next = {
          ...job,
          items,
          processedCount: items.filter((item) => item.status === "done" || item.status === "error").length,
          successCount: items.filter((item) => item.status === "done").length,
          errorCount: items.filter((item) => item.status === "error").length,
        };
        next.creditUsed = next.successCount * Number(next.creditRate || 0);
        next.status = items.some((item) => item.status === "queued" || item.status === "processing")
          ? "processing"
          : (next.successCount > 0 ? "done" : "error");
        next.updatedAt = nowIso();
        return next;
      })
      .filter((job) => (job.items || []).length > 0);
    if (deletedCount === 0) throw new Error("no matching items found");
    return {
      deletedCount,
      jobs: db.jobs
        .filter((job) => job.userId === userId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    };
  });
}

export function getPlanLabel(planId) {
  return PLAN_DEFS[resolvePlanId(planId)].label;
}

export function getCreditPackOffers(planId, introPackEligible = false) {
  const resolvedPlan = resolvePlanId(planId);
  if (resolvedPlan === "free") {
    return [introPackEligible ? CREDIT_PACK_DEFS.freeIntro : CREDIT_PACK_DEFS.freeStandard];
  }
  if (resolvedPlan === "custom") return [];
  return [CREDIT_PACK_DEFS[resolvedPlan]].filter(Boolean);
}

export async function createCheckoutSession({ userId, mode, planId = "", packCode = "" }) {
  if (!userId) throw new Error("userId is required");
  if (!shouldUseBackend()) {
    throw new Error("決済はバックエンド接続時のみ利用できます。");
  }
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode !== "subscription" && normalizedMode !== "payment") {
    throw new Error("unsupported checkout mode");
  }
  const payload = {
    userId,
    mode: normalizedMode,
    planId: String(planId || "").trim(),
    packCode: String(packCode || "").trim(),
    successUrl: typeof window !== "undefined" ? `${window.location.origin}/app` : "",
    cancelUrl: typeof window !== "undefined" ? `${window.location.origin}/app` : "",
  };
  if (normalizedMode === "payment") {
    const pack = CREDIT_PACKS_BY_CODE[payload.packCode];
    if (!pack) throw new Error("unknown credit pack");
  }
  const data = await backendRequest("/api/billing/checkout-session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!data?.url && !data?.user) throw new Error("checkout response missing");
  return data;
}

export async function generateModelAssets({
  userId,
  prompt,
  numImages = 1,
  resolution = "1k",
  targetGender = "womens",
  faceReference = "",
  signal,
}) {
  if (isDemoSession()) {
    throw new Error("デモ版ではモデル生成は利用できません");
  }
  if (shouldUseBackend()) {
    const data = await backendRequest("/api/models/generate", {
      method: "POST",
      signal,
      body: JSON.stringify({
        userId,
        prompt,
        numImages,
        resolution,
        targetGender,
        faceReference,
      }),
    });
    if (Array.isArray(data?.models)) return data.models;
    if (Array.isArray(data?.outputs)) return data.outputs;
    if (Array.isArray(data)) return data;
    if (data?.model && typeof data.model === "object") return [data.model];
    return [];
  }

  const now = nowIso();
  return Array.from({ length: Math.max(1, Math.min(4, numImages)) }).map((_, index) => ({
    id: `mdl_${Math.random().toString(36).slice(2, 10)}`,
    name: `モデル ${index + 1}`,
    outputUrl: "",
    sourceUrl: "",
    prompt,
    favorite: false,
    createdAt: now,
  }));
}

export async function editImage({
  userId,
  image = "",
  imageContext = "",
  prompt = "",
  editType = "background",
  preserveSubject = true,
  outputPreset = "fourThree",
}) {
  const normalizedImage = String(image || "").trim();
  const normalizedImageContext = String(imageContext || "").trim();
  if (!normalizedImage) throw new Error("編集対象画像を選択してください");
  if (String(editType || "background") === "background" && !normalizedImageContext) {
    throw new Error("背景画像を選択してください");
  }

  if (isDemoSession()) {
    return {
      outputUrl: normalizedImage,
      provider: "mock",
      predictionId: `mock_edit_${Math.random().toString(36).slice(2, 10)}`,
      job: null,
    };
  }

  if (shouldUseBackend()) {
    const data = await backendRequest("/api/edit", {
      method: "POST",
      body: JSON.stringify({
        userId,
        image: normalizedImage,
        imageContext: normalizedImageContext,
        prompt,
        editType,
        preserveSubject,
        outputPreset,
      }),
    });
    return {
      outputUrl: String(data?.outputUrl || ""),
      predictionId: String(data?.predictionId || ""),
      provider: String(data?.provider || "fashn"),
      job: data?.job || null,
      raw: data,
    };
  }

  return {
    outputUrl: normalizedImage,
    provider: "mock",
    predictionId: `mock_edit_${Math.random().toString(36).slice(2, 10)}`,
    job: null,
  };
}
