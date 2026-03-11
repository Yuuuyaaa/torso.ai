import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "app-assets");
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || "");
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "");
const STRIPE_PRICE_STARTER_MONTHLY = String(process.env.STRIPE_PRICE_STARTER_MONTHLY || "");
const STRIPE_PRICE_GROWTH_MONTHLY = String(process.env.STRIPE_PRICE_GROWTH_MONTHLY || "");
const STRIPE_PRICE_BUSINESS_MONTHLY = String(process.env.STRIPE_PRICE_BUSINESS_MONTHLY || "");
const STRIPE_PRICE_ENTERPRISE_MONTHLY = String(process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || "");
const STRIPE_PRICE_FREE_INTRO_10 = String(process.env.STRIPE_PRICE_FREE_INTRO_10 || "");
const STRIPE_PRICE_FREE_TOPUP_10 = String(process.env.STRIPE_PRICE_FREE_TOPUP_10 || "");
const STRIPE_PRICE_STARTER_TOPUP_10 = String(process.env.STRIPE_PRICE_STARTER_TOPUP_10 || "");
const STRIPE_PRICE_GROWTH_TOPUP_10 = String(process.env.STRIPE_PRICE_GROWTH_TOPUP_10 || "");
const STRIPE_PRICE_BUSINESS_TOPUP_10 = String(process.env.STRIPE_PRICE_BUSINESS_TOPUP_10 || "");
const STRIPE_PRICE_ENTERPRISE_TOPUP_10 = String(process.env.STRIPE_PRICE_ENTERPRISE_TOPUP_10 || "");
const STRIPE_BILLING_PORTAL_CONFIGURATION_ID = String(process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || "");
const FASHN_API_KEY = String(process.env.FASHN_API_KEY || "");
const FASHN_BASE_URL = String(process.env.FASHN_BASE_URL || "https://api.fashn.ai/v1").replace(/\/$/, "");
const FASHN_TRYON_MAX_MODEL_NAME = "tryon-max";
const FASHN_TRYON_V16_MODEL_NAME = "tryon-v1.6";
const HIGH_QUALITY_PLANS = new Set(["growth", "business", "enterprise", "custom", "standard", "pro"]);
const CREDIT_BY_STYLE = {
  torso: 1,
  mannequin: 1,
  hanger: 1,
  ghost: 1,
  model: 1,
  custom: 3,
};
const MODEL_RUN_CREDIT_BY_STRATEGY = {
  "tryon-v1.6": 1,
  "tryon-max": 4,
  "product-to-model": 1,
};
const BACKGROUND_EDIT_PROMPT = [
  "Replace the background with the provided image.",
  "Treat the background as the primary scene and place the subject naturally within that environment.",
  "Match perspective, lighting, depth, shadow softness, and subject placement realistically.",
  "Do not alter facial identity or garment details.",
].join("\n");

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

function redirect(statusCode, location) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      Location: location,
    },
    body: "",
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAssetLibraryPayload(raw = {}) {
  const payload = typeof raw === "object" && raw ? raw : {};
  const normalizeAsset = (asset = {}) => ({ ...(asset || {}) });
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

function hasAnyAssetItems(lib = {}) {
  return (Array.isArray(lib.studio) && lib.studio.length > 0)
    || (Array.isArray(lib.models) && lib.models.length > 0)
    || (Array.isArray(lib.products) && lib.products.length > 0);
}

function buildAssetLibraryCounts(library = {}) {
  const normalized = normalizeAssetLibraryPayload(library);
  return {
    studioCount: normalized.studio.length,
    modelCount: normalized.models.length,
    productCount: normalized.products.length,
  };
}

const CREDIT_PACK_CONFIG = {
  "free-intro-10": { planId: "free", credits: 10, amountYen: 500, priceId: STRIPE_PRICE_FREE_INTRO_10, introOnly: true },
  "free-topup-10": { planId: "free", credits: 10, amountYen: 1800, priceId: STRIPE_PRICE_FREE_TOPUP_10, introOnly: false },
  "starter-topup-10": { planId: "starter", credits: 10, amountYen: 1650, priceId: STRIPE_PRICE_STARTER_TOPUP_10, introOnly: false },
  "growth-topup-10": { planId: "growth", credits: 10, amountYen: 1500, priceId: STRIPE_PRICE_GROWTH_TOPUP_10, introOnly: false },
  "business-topup-10": { planId: "business", credits: 10, amountYen: 1250, priceId: STRIPE_PRICE_BUSINESS_TOPUP_10, introOnly: false },
  "enterprise-topup-10": { planId: "enterprise", credits: 10, amountYen: 1000, priceId: STRIPE_PRICE_ENTERPRISE_TOPUP_10, introOnly: false },
};
const SUBSCRIPTION_PRICE_BY_PLAN = {
  starter: STRIPE_PRICE_STARTER_MONTHLY,
  growth: STRIPE_PRICE_GROWTH_MONTHLY,
  business: STRIPE_PRICE_BUSINESS_MONTHLY,
  enterprise: STRIPE_PRICE_ENTERPRISE_MONTHLY,
};
const PLAN_MONTHLY_CREDITS = {
  free: 1,
  starter: 30,
  growth: 200,
  business: 800,
  enterprise: 2000,
  custom: 2000,
};

function normalizeCreditSplit(row) {
  const planId = String(row?.plan_id || "free").toLowerCase();
  const totalCredits = Math.max(0, Number(row?.credits || 0));
  const planMonthlyCredits = Math.max(0, Number(PLAN_MONTHLY_CREDITS[planId] || 0));
  const rawSubscriptionCredits = Math.max(0, Number(row?.subscription_credits || 0));
  const introPackEligible = Boolean(row?.intro_pack_eligible);

  let subscriptionCredits = Math.min(rawSubscriptionCredits, totalCredits);
  if (planId === "free" && totalCredits <= 0 && subscriptionCredits <= 0 && introPackEligible) {
    subscriptionCredits = PLAN_MONTHLY_CREDITS.free;
    return {
      totalCredits: PLAN_MONTHLY_CREDITS.free,
      subscriptionCredits,
      purchasedCredits: 0,
    };
  }
  // Backfill older/broken rows where monthly balance was not persisted,
  // but total balance still clearly contains the full monthly allocation.
  if (subscriptionCredits <= 0 && planMonthlyCredits > 0 && totalCredits >= planMonthlyCredits) {
    subscriptionCredits = planMonthlyCredits;
  }
  subscriptionCredits = Math.min(subscriptionCredits, totalCredits);
  return {
    totalCredits,
    subscriptionCredits,
    purchasedCredits: Math.max(0, totalCredits - subscriptionCredits),
  };
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

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildOutputFileName({ style = "torso", seq = 1, createdAt = null, ext = "jpg" }) {
  const safeStyle = String(style || "torso").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "torso";
  const safeExt = String(ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const safeSeq = String(seq || 1).padStart(2, "0");
  return `torso-ai-${compactTimestamp(createdAt)}-${safeStyle}-${safeSeq}.${safeExt}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
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

function isMissingAssetLibraryCountColumnError(error) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return message.includes("studio_count")
    || message.includes("model_count")
    || message.includes("product_count");
}

function requireStripe() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is missing");
  }
}

async function stripeRequest(path, params) {
  requireStripe();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message || text || `Stripe error ${response.status}`);
  }
  return data;
}

async function stripeGetRequest(path, params = {}) {
  requireStripe();
  const search = new URLSearchParams(params);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const response = await fetch(`https://api.stripe.com/v1${path}${suffix}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message || text || `Stripe error ${response.status}`);
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
      "cache-control": "public, max-age=31536000, immutable",
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
  const creditState = normalizeCreditSplit(row);
  return {
    id: row.user_id,
    email: row.email || "",
    name: row.display_name || "",
    plan: row.plan_id || "free",
    credits: creditState.totalCredits,
    subscriptionCredits: creditState.subscriptionCredits,
    introPackEligible: Boolean(row.intro_pack_eligible),
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
  const rows = await supabaseRequest(`/app_users?email=eq.${encodeURIComponent(email)}&select=user_id,email,display_name,plan_id,credits,subscription_credits,intro_pack_eligible,created_at,password_hash&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserById(userId) {
  const rows = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,display_name,plan_id,credits,subscription_credits,intro_pack_eligible,created_at,password_hash&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createCreditPackOrder({ userId, planId, packCode, credits, amountYen, introPackEligible }) {
  const rows = await supabaseRequest("/app_credit_pack_orders", {
    method: "POST",
    body: {
      user_id: userId,
      plan_id: planId,
      pack_code: packCode,
      credits,
      amount_yen: amountYen,
      status: "pending",
      payload: {
        introPackEligible: Boolean(introPackEligible),
      },
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateCreditPackOrder(orderId, payload) {
  const rows = await supabaseRequest(`/app_credit_pack_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createSubscriptionOrder({ userId, planId, interval = "month", amountYen = null }) {
  const rows = await supabaseRequest("/app_subscription_orders", {
    method: "POST",
    body: {
      user_id: userId,
      plan_id: planId,
      interval,
      amount_yen: amountYen == null ? null : Number(amountYen),
      status: "pending",
      payload: {},
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateSubscriptionOrder(orderId, payload) {
  const rows = await supabaseRequest(`/app_subscription_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findSubscriptionOrderBySessionId(sessionId) {
  const rows = await supabaseRequest(`/app_subscription_orders?stripe_checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findSubscriptionOrderBySubscriptionId(subscriptionId) {
  const rows = await supabaseRequest(`/app_subscription_orders?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findLatestSubscriptionOrderByUserId(userId) {
  const rows = await supabaseRequest(`/app_subscription_orders?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findLatestManagedSubscriptionOrderByUserId(userId) {
  const rows = await supabaseRequest(`/app_subscription_orders?user_id=eq.${encodeURIComponent(userId)}&stripe_subscription_id=not.is.null&select=*&order=updated_at.desc&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findBillingCustomerByUserId(userId) {
  const rows = await supabaseRequest(`/app_billing_customers?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertBillingCustomer({ userId, stripeCustomerId, billingEmail = "", defaultPaymentMethodId = "", payload = {} }) {
  if (!userId || !stripeCustomerId) return null;
  const rows = await supabaseRequest("/app_billing_customers?on_conflict=user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: {
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      billing_email: billingEmail,
      default_payment_method_id: defaultPaymentMethodId || null,
      payload,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStripeCustomerBillingProfile(stripeCustomerId) {
  if (!stripeCustomerId) return { defaultPaymentMethodId: "", billingEmail: "" };
  const customer = await stripeGetRequest(`/customers/${encodeURIComponent(stripeCustomerId)}`);
  const defaultPaymentMethodId = String(customer?.invoice_settings?.default_payment_method || "");
  const billingEmail = String(customer?.email || "");
  const methods = await stripeGetRequest("/payment_methods", {
    customer: stripeCustomerId,
    type: "card",
    limit: "1",
  });
  const preferredMethod = methods?.data?.find?.((item) => String(item?.id || "") === defaultPaymentMethodId) || methods?.data?.[0] || null;
  const fallbackPaymentMethodId = String(preferredMethod?.id || defaultPaymentMethodId || "");
  return {
    defaultPaymentMethodId: fallbackPaymentMethodId,
    billingEmail,
    cardBrand: String(preferredMethod?.card?.brand || ""),
    cardLast4: String(preferredMethod?.card?.last4 || ""),
    cardExpMonth: preferredMethod?.card?.exp_month == null ? null : Number(preferredMethod.card.exp_month),
    cardExpYear: preferredMethod?.card?.exp_year == null ? null : Number(preferredMethod.card.exp_year),
  };
}

async function resolveBillingCustomerForUser(userId) {
  const directCustomer = await findBillingCustomerByUserId(userId);
  if (directCustomer?.stripe_customer_id) return directCustomer;

  const latestSubscription = await findLatestSubscriptionOrderByUserId(userId);
  if (!latestSubscription?.stripe_customer_id) return null;

  return upsertBillingCustomer({
    userId,
    stripeCustomerId: String(latestSubscription.stripe_customer_id),
    billingEmail: latestSubscription.payload?.customer_email || "",
    payload: {
      source: "subscription_order_backfill",
      subscriptionOrderId: latestSubscription.order_id,
    },
  });
}

async function createWebhookEventLog({ stripeEventId, eventType, userId = null, objectId = null, payload = {} }) {
  const rows = await supabaseRequest("/app_billing_webhook_events", {
    method: "POST",
    body: {
      stripe_event_id: stripeEventId,
      event_type: eventType,
      user_id: userId,
      object_id: objectId,
      status: "pending",
      processed: false,
      payload,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateWebhookEventLog(stripeEventId, payload) {
  const rows = await supabaseRequest(`/app_billing_webhook_events?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getWebhookEventLog(stripeEventId) {
  const rows = await supabaseRequest(`/app_billing_webhook_events?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function mapCreditPackOrder(row) {
  return {
    id: row.order_id,
    kind: "credit_pack",
    userId: row.user_id,
    planId: row.plan_id || "free",
    packCode: row.pack_code || "",
    credits: Number(row.credits || 0),
    amountYen: Number(row.amount_yen || 0),
    status: row.status || "pending",
    stripeCheckoutSessionId: row.stripe_checkout_session_id || "",
    stripePaymentIntentId: row.stripe_payment_intent_id || "",
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
    payload: row.payload || {},
  };
}

function mapSubscriptionOrder(row) {
  return {
    id: row.order_id,
    kind: "subscription",
    userId: row.user_id,
    planId: row.plan_id || "free",
    interval: row.interval || "month",
    amountYen: row.amount_yen == null ? null : Number(row.amount_yen),
    status: row.status || "pending",
    stripeCheckoutSessionId: row.stripe_checkout_session_id || "",
    stripeSubscriptionId: row.stripe_subscription_id || "",
    stripeCustomerId: row.stripe_customer_id || "",
    stripeLatestInvoiceId: row.stripe_latest_invoice_id || "",
    createdAt: row.created_at || nowIso(),
    updatedAt: row.updated_at || row.created_at || nowIso(),
    payload: row.payload || {},
  };
}

function verifyStripeWebhookSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  const header = String(signatureHeader || "");
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [k, v] = part.split("=");
    return [k, v];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Invalid Stripe signature header");
  const payload = `${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(payload, "utf8").digest("hex");
  const expected = Buffer.from(signature, "hex");
  const actual = Buffer.from(digest, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Stripe signature verification failed");
  }
}

function getPlanIdBySubscriptionPrice(priceId) {
  return Object.entries(SUBSCRIPTION_PRICE_BY_PLAN).find(([, value]) => value === priceId)?.[0] || "";
}

function getInvoiceLinePriceId(line) {
  return String(line?.price?.id || line?.plan?.id || line?.pricing?.price_details?.price || "");
}

async function markIntroPackConsumed(userId) {
  await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { intro_pack_eligible: false },
  });
}

async function creditUserFromPack({ userId, packCode, orderId = "", stripePaymentIntentId = "", stripeCheckoutSessionId = "" }) {
  const user = await getUserById(userId);
  if (!user) throw new Error("user not found");
  const pack = CREDIT_PACK_CONFIG[packCode];
  if (!pack) throw new Error("credit pack config not found");
  if (orderId) {
    const orders = await supabaseRequest(`/app_credit_pack_orders?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
    const order = Array.isArray(orders) ? orders[0] || null : null;
    if (order?.status === "paid") return;
  }
  const updatedUser = await addPurchasedCredits(userId, Number(pack.credits || 0));
  if (pack.introOnly) {
    await markIntroPackConsumed(userId);
  }
  if (orderId) {
    await updateCreditPackOrder(orderId, {
      status: "paid",
      stripe_payment_intent_id: stripePaymentIntentId || null,
      stripe_checkout_session_id: stripeCheckoutSessionId || null,
      payload: {
        creditedAt: nowIso(),
      },
    });
  }
  await appendCreditEvent(userId, "credit_pack_purchase", Number(pack.credits || 0), {
    packCode,
    orderId,
    stripePaymentIntentId,
    stripeCheckoutSessionId,
  }, Number(updatedUser?.credits || 0));
}

async function applySubscriptionInvoicePaid(invoice) {
  const line = Array.isArray(invoice?.lines?.data) ? invoice.lines.data[0] || null : null;
  const priceId = getInvoiceLinePriceId(line);
  const planId = getPlanIdBySubscriptionPrice(priceId);
  const userId = String(invoice?.lines?.data?.[0]?.metadata?.user_id || invoice?.parent?.subscription_details?.metadata?.user_id || invoice?.metadata?.user_id || "");
  if (!userId || !planId) return;
  const monthlyCredits = PLAN_MONTHLY_CREDITS[planId];
  const previousUser = await getUserById(userId);
  const user = await applySubscriptionCreditAllocation(userId, planId);
  const subscriptionId = String(invoice?.subscription || invoice?.parent?.subscription_details?.subscription || "");
  const existingOrder = subscriptionId ? await findSubscriptionOrderBySubscriptionId(subscriptionId) : null;
  if (existingOrder?.order_id) {
    await updateSubscriptionOrder(existingOrder.order_id, {
      status: "active",
      stripe_latest_invoice_id: invoice.id || null,
      stripe_customer_id: invoice.customer || null,
      payload: {
        lastInvoicePaidAt: nowIso(),
      },
    });
  }
  if (invoice.customer) {
    const billingProfile = await getStripeCustomerBillingProfile(String(invoice.customer));
    await upsertBillingCustomer({
      userId,
      stripeCustomerId: String(invoice.customer),
      billingEmail: String(billingProfile.billingEmail || invoice.customer_email || user?.email || ""),
      defaultPaymentMethodId: billingProfile.defaultPaymentMethodId,
      payload: {
        source: "invoice.paid",
        stripeSubscriptionId: subscriptionId,
        cardBrand: billingProfile.cardBrand || "",
        cardLast4: billingProfile.cardLast4 || "",
        cardExpMonth: billingProfile.cardExpMonth,
        cardExpYear: billingProfile.cardExpYear,
      },
    });
  }
  await appendCreditEvent(userId, "subscription_cycle_reset", Number((user?.credits || 0) - Number(previousUser?.credits || 0)), {
    planId,
    invoiceId: invoice.id,
    stripeSubscriptionId: subscriptionId,
  }, Number(user?.credits || monthlyCredits || 0));
}

async function handleStripeWebhookEvent(eventPayload) {
  const stripeEventId = String(eventPayload?.id || "");
  const type = String(eventPayload?.type || "");
  const object = eventPayload?.data?.object || {};
  const userIdGuess = String(
    object?.metadata?.user_id
    || object?.client_reference_id
    || object?.lines?.data?.[0]?.metadata?.user_id
    || object?.parent?.subscription_details?.metadata?.user_id
    || ""
  ) || null;
  const objectId = String(object?.id || object?.subscription || object?.payment_intent || "") || null;
  if (stripeEventId) {
    const existing = await getWebhookEventLog(stripeEventId);
    if (existing?.processed) return;
    if (!existing) {
      await createWebhookEventLog({
        stripeEventId,
        eventType: type,
        userId: userIdGuess,
        objectId,
        payload: eventPayload,
      });
    }
  }
  if (type === "checkout.session.completed") {
    const metadata = object?.metadata || {};
    if (String(object?.mode || "") === "payment") {
      await creditUserFromPack({
        userId: String(metadata.user_id || object.client_reference_id || ""),
        packCode: String(metadata.pack_code || ""),
        orderId: String(metadata.order_id || ""),
        stripePaymentIntentId: String(object.payment_intent || ""),
        stripeCheckoutSessionId: String(object.id || ""),
      });
      if (object.customer) {
        const billingProfile = await getStripeCustomerBillingProfile(String(object.customer));
        await upsertBillingCustomer({
          userId: String(metadata.user_id || object.client_reference_id || ""),
          stripeCustomerId: String(object.customer),
          billingEmail: String(billingProfile.billingEmail || object.customer_details?.email || ""),
          defaultPaymentMethodId: billingProfile.defaultPaymentMethodId,
          payload: {
            source: "checkout.session.completed",
            mode: "payment",
            cardBrand: billingProfile.cardBrand || "",
            cardLast4: billingProfile.cardLast4 || "",
            cardExpMonth: billingProfile.cardExpMonth,
            cardExpYear: billingProfile.cardExpYear,
          },
        });
      }
      if (stripeEventId) {
        await updateWebhookEventLog(stripeEventId, {
          status: "processed",
          processed: true,
          processed_at: nowIso(),
        });
      }
      return;
    }
    if (String(object?.mode || "") === "subscription") {
      const orderId = String(metadata.order_id || "");
      if (orderId) {
        await updateSubscriptionOrder(orderId, {
          status: "pending",
          stripe_checkout_session_id: object.id || null,
          stripe_subscription_id: object.subscription || null,
          stripe_customer_id: object.customer || null,
          payload: {
            checkoutCompletedAt: nowIso(),
          },
        });
      } else if (object.subscription) {
        const order = await findSubscriptionOrderBySessionId(String(object.id || ""));
        if (order?.order_id) {
          await updateSubscriptionOrder(order.order_id, {
            status: "pending",
            stripe_subscription_id: object.subscription || null,
            stripe_customer_id: object.customer || null,
          });
        }
      }
      if (object.customer) {
        const billingProfile = await getStripeCustomerBillingProfile(String(object.customer));
        await upsertBillingCustomer({
          userId: String(metadata.user_id || object.client_reference_id || ""),
          stripeCustomerId: String(object.customer),
          billingEmail: String(billingProfile.billingEmail || object.customer_details?.email || ""),
          defaultPaymentMethodId: billingProfile.defaultPaymentMethodId,
          payload: {
            source: "checkout.session.completed",
            mode: "subscription",
            stripeSubscriptionId: String(object.subscription || ""),
            cardBrand: billingProfile.cardBrand || "",
            cardLast4: billingProfile.cardLast4 || "",
            cardExpMonth: billingProfile.cardExpMonth,
            cardExpYear: billingProfile.cardExpYear,
          },
        });
      }
      if (stripeEventId) {
        await updateWebhookEventLog(stripeEventId, {
          status: "processed",
          processed: true,
          processed_at: nowIso(),
        });
      }
    }
    return;
  }
  if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    await applySubscriptionInvoicePaid(object);
    if (stripeEventId) {
      await updateWebhookEventLog(stripeEventId, {
        status: "processed",
        processed: true,
        processed_at: nowIso(),
      });
    }
    return;
  }
  if (type === "invoice.payment_failed") {
    const userId = String(object?.lines?.data?.[0]?.metadata?.user_id || object?.parent?.subscription_details?.metadata?.user_id || object?.metadata?.user_id || "");
    const line = Array.isArray(object?.lines?.data) ? object.lines.data[0] || null : null;
    const planId = getPlanIdBySubscriptionPrice(getInvoiceLinePriceId(line));
    if (userId) {
      const subscriptionId = String(object?.subscription || object?.parent?.subscription_details?.subscription || "");
      const existingOrder = subscriptionId ? await findSubscriptionOrderBySubscriptionId(subscriptionId) : null;
      if (existingOrder?.order_id) {
        await updateSubscriptionOrder(existingOrder.order_id, {
          status: "failed",
          stripe_latest_invoice_id: object.id || null,
          stripe_customer_id: object.customer || null,
          payload: {
            lastInvoiceFailedAt: nowIso(),
          },
        });
      }
      await appendCreditEvent(userId, "subscription_payment_failed", 0, {
        planId,
        invoiceId: object.id,
        stripeSubscriptionId: subscriptionId,
      }, Number((await getUserById(userId))?.credits || 0));
    }
    if (stripeEventId) {
      await updateWebhookEventLog(stripeEventId, {
        status: "failed",
        processed: true,
        processed_at: nowIso(),
      });
    }
    return;
  }
  if (stripeEventId) {
    await updateWebhookEventLog(stripeEventId, {
      status: "ignored",
      processed: true,
      processed_at: nowIso(),
    });
  }
}

async function getSupabaseAuthUser(accessToken) {
  requireSupabase();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Auth error ${response.status}`);
  }
  return data;
}

async function findOrCreateGoogleUser(authUser) {
  const email = String(authUser?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Googleアカウントのメールアドレスが取得できません。");
  const existing = await getUserByEmail(email);
  if (existing) return existing;
  const displayName = String(
    authUser?.user_metadata?.full_name
      || authUser?.user_metadata?.name
      || authUser?.user_metadata?.display_name
      || email.split("@")[0]
      || ""
  ).trim();
  const created = await supabaseRequest("/app_users", {
    method: "POST",
    body: {
      user_id: `usr_google_${String(authUser?.id || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`,
      email,
      display_name: displayName,
      plan_id: "free",
      credits: PLAN_MONTHLY_CREDITS.free,
      subscription_credits: PLAN_MONTHLY_CREDITS.free,
      intro_pack_eligible: true,
      password_hash: "",
    },
  });
  return Array.isArray(created) ? created[0] || null : null;
}

async function ensureAssetLibrary(userId) {
  let rows;
  try {
    rows = await supabaseRequest(`/app_asset_libraries?user_id=eq.${encodeURIComponent(userId)}&select=user_id,studio_assets,model_assets,product_assets,studio_count,model_count,product_count&limit=1`);
  } catch (error) {
    if (!isMissingAssetLibraryCountColumnError(error)) throw error;
    rows = await supabaseRequest(`/app_asset_libraries?user_id=eq.${encodeURIComponent(userId)}&select=user_id,studio_assets,model_assets,product_assets&limit=1`);
  }
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (row) {
    const counts = buildAssetLibraryCounts({
      studio: Array.isArray(row.studio_assets) ? row.studio_assets : [],
      models: Array.isArray(row.model_assets) ? row.model_assets : [],
      products: Array.isArray(row.product_assets) ? row.product_assets : [],
    });
    return {
      studio: Array.isArray(row.studio_assets) ? row.studio_assets : [],
      models: Array.isArray(row.model_assets) ? row.model_assets : [],
      products: Array.isArray(row.product_assets) ? row.product_assets : [],
      stats: {
        studioCount: Number(row.studio_count ?? counts.studioCount ?? 0),
        modelCount: Number(row.model_count ?? counts.modelCount ?? 0),
        productCount: Number(row.product_count ?? counts.productCount ?? 0),
      },
    };
  }
  let created;
  try {
    created = await supabaseRequest("/app_asset_libraries", {
      method: "POST",
      body: {
        user_id: userId,
        studio_assets: [],
        model_assets: [],
        product_assets: [],
        studio_count: 0,
        model_count: 0,
        product_count: 0,
      },
    });
  } catch (error) {
    if (!isMissingAssetLibraryCountColumnError(error)) throw error;
    created = await supabaseRequest("/app_asset_libraries", {
      method: "POST",
      body: {
        user_id: userId,
        studio_assets: [],
        model_assets: [],
        product_assets: [],
      },
    });
  }
  const next = Array.isArray(created) ? created[0] || null : null;
  return {
    studio: Array.isArray(next?.studio_assets) ? next.studio_assets : [],
    models: Array.isArray(next?.model_assets) ? next.model_assets : [],
    products: Array.isArray(next?.product_assets) ? next.product_assets : [],
    stats: {
      studioCount: Number(next?.studio_count || 0),
      modelCount: Number(next?.model_count || 0),
      productCount: Number(next?.product_count || 0),
    },
  };
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
    if (!value || !isDataUrl(value)) continue;
    const { mime, buffer } = parseDataUrl(value);
    const ext = extFromMime(mime || "image/jpeg");
    const pathValue = `${userId}/${assetType}/${candidate.purpose}/${Date.now()}-${randomUUID()}${ext}`;
    const publicUrl = await storageUpload(pathValue, buffer, mime || "image/jpeg");
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
  if (!hasAnyAssetItems(normalized)) return normalized;
  const studio = [];
  const models = [];
  const products = [];
  for (const asset of normalized.studio) studio.push(await compactSingleAssetForSupabase(userId, "studio", asset));
  for (const asset of normalized.models) models.push(await compactSingleAssetForSupabase(userId, "models", asset));
  for (const asset of normalized.products) products.push(await compactSingleAssetForSupabase(userId, "products", asset));
  return { studio, models, products };
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

function mimeFromUrl(url) {
  const lower = String(url || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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

function hasExtraTryonInstructions(styleConfig) {
  if (!styleConfig || typeof styleConfig !== "object") return false;
  if (String(styleConfig.customPrompt || "").trim()) return true;
  if (String(styleConfig.orientation || "front") !== "front") return true;
  if (String(styleConfig.framing || "focus") !== "focus") return true;
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

function isTryonStrategy(strategy) {
  return strategy === "tryon-v1.6" || strategy === "tryon-max";
}

function resolveBaseCreditRate(style, effectiveRunStrategy) {
  if (style === "model") return MODEL_RUN_CREDIT_BY_STRATEGY[effectiveRunStrategy || "tryon-v1.6"] || 1;
  if (effectiveRunStrategy === "tryon-max") return MODEL_RUN_CREDIT_BY_STRATEGY["tryon-max"];
  return CREDIT_BY_STYLE[style] || 1;
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
  if (String(backgroundMode || "solid").toLowerCase() !== "image") return 0;
  return String(backgroundReference || "").trim() ? 1 : 0;
}

function getRequestOrigin(event) {
  const proto = String(event?.headers?.["x-forwarded-proto"] || event?.headers?.["X-Forwarded-Proto"] || "https");
  const host = String(event?.headers?.host || event?.headers?.Host || "");
  if (!host) return "";
  return `${proto}://${host}`;
}

function toAbsoluteUrl(event, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/")) return raw;
  const origin = getRequestOrigin(event);
  return origin ? `${origin}${raw}` : raw;
}

function getPromptReferenceUrl(event, styleMode) {
  const origin = getRequestOrigin(event);
  if (!origin) return "";
  if (styleMode === "torso") return `${origin}/torsoprompt.png`;
  if (styleMode === "mannequin") return `${origin}/mannequinprompt.png`;
  if (styleMode === "hanger") return `${origin}/hangerprompt.png`;
  return "";
}

function buildPromptFromConfig(styleConfig) {
  const mode = String(styleConfig?.mode || "torso");
  const baseByMode = {
    torso: "Place the garment on the provided torso mannequin. No head. No arms. Keep the garment fully faithful to the source image.",
    mannequin: "Place the garment on the provided full-body mannequin. Do not add extra clothing or accessories. Keep the garment fully faithful to the source image.",
    hanger: "Present the garment on a hanger. Keep the garment fully faithful to the source image. Use a seamless edge-to-edge background with no artificial border, no card frame, and no canvas-like padding. Fill the frame tightly while keeping the full hanger hook visible.",
    ghost: "Create a high-end ghost mannequin style e-commerce image. Keep the garment fully faithful to the source image. If a solid background color is selected, match that exact background color with a seamless uniform backdrop.",
    model: "Create a premium fashion editorial model shot while preserving the garment design and details exactly.",
    custom: String(styleConfig?.customPrompt || "").trim() || "Create a premium fashion image while preserving the garment exactly.",
  };
  const backgroundLine = String(styleConfig?.background?.type || "solid") === "transparent"
    ? "Use a transparent or clean cutout background."
    : String(styleConfig?.background?.type || "solid") === "studio"
      ? "Use a premium fashion studio background."
      : `Use the exact solid background color ${String(styleConfig?.background?.color || "#FFFFFF")}. Keep it seamless and uniform with no gradient, no gray cast, no vignette, and no visible floor line.`;
  const framingLine = String(styleConfig?.framing || "full") === "focus"
    ? (mode === "hanger"
      ? "Use tight product-focused framing. Keep the full garment and hanger hook visible while minimizing empty margins. No border, card, or canvas-like padding."
      : "Use product-focused framing and keep the garment as the clear main subject.")
    : "Keep the full subject composition visible.";
  const orientationLine = String(styleConfig?.orientation || "front") === "front"
    ? "Front-facing composition."
    : `Orientation: ${String(styleConfig?.orientation || "front")}.`;
  const qualityLine = styleConfig?.quality === "high"
    ? "Prioritize premium detail retention and sharp material texture."
    : "Keep clean e-commerce quality with realistic texture.";
  return [
    baseByMode[mode] || baseByMode.torso,
    backgroundLine,
    framingLine,
    orientationLine,
    qualityLine,
    String(styleConfig?.customPrompt || "").trim(),
  ].filter(Boolean).join(" ");
}

function normalizeTargetGender(value) {
  return String(value || "").toLowerCase() === "mens" ? "mens" : "womens";
}

function withDefaultModelStylePrompt(prompt, targetGender = "womens") {
  const base = String(prompt || "").trim();
  const outfitPrompt = targetGender === "mens"
    ? [
      "Wearing a plain white fitted t-shirt, dark gray denim shorts ending above the knees, barefoot.",
      "Standing straight, centered, facing forward, arms relaxed, feet parallel.",
      "Full body fully visible from head to toes.",
      "Seamless light gray cyclorama background.",
    ].join(" ")
    : [
      "Wearing a plain white fitted tank top with thin straps, high-waisted dark gray denim shorts, barefoot.",
      "Standing straight, centered, facing forward, arms relaxed, feet parallel.",
      "Full body fully visible from head to toes.",
      "Seamless light gray cyclorama background.",
    ].join(" ");
  return [base, outfitPrompt].filter(Boolean).join(" ");
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
    throw new Error(data?.message || data?.error || `FASHN error ${response.status}`);
  }
  return data;
}

async function waitForPrediction(predictionId, maxPolls = 90, pollMs = 2000) {
  const terminalStatuses = new Set(["completed", "complete", "succeeded", "success", "failed", "error", "cancelled", "canceled"]);
  for (let i = 0; i < maxPolls; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const statusRes = await fashnRequest(`/status/${predictionId}`);
    const status = String(statusRes?.status || "").toLowerCase();
    if (terminalStatuses.has(status)) return statusRes;
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
      if (value.trim()) collect.push(value.trim());
      return;
    }
    if (typeof value === "object") {
      const urlLike = value.url || value.output || value.output_url || value.outputUrl || value.image || value.src;
      if (typeof urlLike === "string" && urlLike.trim()) collect.push(urlLike.trim());
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

async function appendCreditEvent(userId, eventType, delta, payload = {}, balanceAfter = null) {
  await supabaseRequest("/app_credit_events", {
    method: "POST",
    body: {
      user_id: userId,
      event_type: eventType,
      delta: Number(delta || 0),
      balance_after: balanceAfter == null ? null : Number(balanceAfter),
      payload,
    },
  });
}

async function appendJobEvent(userId, jobId, eventType, payload = {}) {
  await supabaseRequest("/app_job_events", {
    method: "POST",
    body: {
      user_id: userId,
      job_id: jobId,
      event_type: eventType,
      payload,
    },
  });
}

async function appendAssetEvent(userId, assetType, assetId, eventType, payload = {}) {
  await supabaseRequest("/app_asset_events", {
    method: "POST",
    body: {
      user_id: userId,
      asset_type: assetType,
      asset_id: assetId,
      event_type: eventType,
      payload,
    },
  });
}

async function appendAssetLibraryEvents(userId, previousLibrary = {}, nextLibrary = {}) {
  const assetTypes = [
    ["studio", "studio"],
    ["models", "model"],
    ["products", "product"],
  ];
  for (const [key, assetType] of assetTypes) {
    const previousItems = Array.isArray(previousLibrary?.[key]) ? previousLibrary[key] : [];
    const nextItems = Array.isArray(nextLibrary?.[key]) ? nextLibrary[key] : [];
    const previousMap = new Map(previousItems.map((asset) => [String(asset?.id || ""), asset]).filter(([id]) => id));
    const nextMap = new Map(nextItems.map((asset) => [String(asset?.id || ""), asset]).filter(([id]) => id));

    for (const [assetId, asset] of nextMap.entries()) {
      const before = previousMap.get(assetId);
      if (!before) {
        await appendAssetEvent(userId, assetType, assetId, "uploaded", {
          name: String(asset?.name || ""),
          category: String(asset?.category || ""),
          outputUrl: String(asset?.outputUrl || ""),
          sourceUrl: String(asset?.sourceUrl || ""),
        });
        continue;
      }
      const categoryChanged = String(before?.category || "") !== String(asset?.category || "");
      const outputChanged = String(before?.outputUrl || "") !== String(asset?.outputUrl || "");
      if (categoryChanged || outputChanged) {
        await appendAssetEvent(userId, assetType, assetId, "updated", {
          previousCategory: String(before?.category || ""),
          nextCategory: String(asset?.category || ""),
          outputUrl: String(asset?.outputUrl || ""),
          sourceUrl: String(asset?.sourceUrl || ""),
        });
      }
    }

    for (const [assetId, asset] of previousMap.entries()) {
      if (nextMap.has(assetId)) continue;
      await appendAssetEvent(userId, assetType, assetId, "deleted", {
        name: String(asset?.name || ""),
        category: String(asset?.category || ""),
        outputUrl: String(asset?.outputUrl || ""),
        sourceUrl: String(asset?.sourceUrl || ""),
      });
    }
  }
}

function getSubscriptionCreditBalance(user) {
  return normalizeCreditSplit(user).subscriptionCredits;
}

function getPurchasedCreditBalance(user) {
  return normalizeCreditSplit(user).purchasedCredits;
}

async function updateUserCredits(userId, nextCredits) {
  const rows = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { credits: Number(nextCredits || 0) },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateUserPlanAndCredits(userId, planId, nextCredits) {
  const rows = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: {
      plan_id: String(planId || "free"),
      credits: Number(nextCredits || 0),
      subscription_credits: Number(PLAN_MONTHLY_CREDITS[String(planId || "free").toLowerCase()] || 0),
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchUserCreditState(userId, payload) {
  const rows = await supabaseRequest(`/app_users?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function addPurchasedCredits(userId, amount) {
  const user = await getUserById(userId);
  if (!user) throw new Error("user not found");
  return patchUserCreditState(userId, {
    credits: Number(user.credits || 0) + Number(amount || 0),
  });
}

async function applySubscriptionCreditAllocation(userId, planId) {
  const user = await getUserById(userId);
  if (!user) throw new Error("user not found");
  const purchasedCredits = getPurchasedCreditBalance(user);
  const subscriptionCredits = Number(PLAN_MONTHLY_CREDITS[planId] || 0);
  return patchUserCreditState(userId, {
    plan_id: String(planId || "free"),
    credits: purchasedCredits + subscriptionCredits,
    subscription_credits: subscriptionCredits,
  });
}

async function reserveUserCredits(userId, amount) {
  const user = await getUserById(userId);
  if (!user) throw new Error("user not found");
  const creditState = normalizeCreditSplit(user);
  const totalCredits = creditState.totalCredits;
  const subscriptionCredits = creditState.subscriptionCredits;
  const reserveAmount = Number(amount || 0);
  if (totalCredits < reserveAmount) {
    throw new Error(`insufficient credits: need ${reserveAmount}, have ${totalCredits}`);
  }
  const subscriptionUsed = Math.min(subscriptionCredits, reserveAmount);
  const purchasedUsed = reserveAmount - subscriptionUsed;
  const updated = await patchUserCreditState(userId, {
    credits: totalCredits - reserveAmount,
    subscription_credits: subscriptionCredits - subscriptionUsed,
  });
  return {
    user: updated,
    subscriptionUsed,
    purchasedUsed,
  };
}

async function refundUserCredits(userId, amount) {
  const user = await getUserById(userId);
  if (!user) throw new Error("user not found");
  const planLimit = Number(PLAN_MONTHLY_CREDITS[String(user.plan_id || "free").toLowerCase()] || 0);
  const currentSubscriptionCredits = getSubscriptionCreditBalance(user);
  const restoreAmount = Number(amount || 0);
  const subscriptionRestore = Math.min(planLimit - currentSubscriptionCredits, restoreAmount);
  const nextSubscriptionCredits = currentSubscriptionCredits + Math.max(0, subscriptionRestore);
  return patchUserCreditState(userId, {
    credits: Number(user.credits || 0) + restoreAmount,
    subscription_credits: nextSubscriptionCredits,
  });
}

async function updateJobRow(jobId, payload) {
  const rows = await supabaseRequest(`/app_jobs?job_id=eq.${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateJobItemRow(itemId, payload) {
  const rows = await supabaseRequest(`/app_job_items?item_id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: payload,
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function persistRemoteImageToStorage(url, relPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch generated image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || mimeFromUrl(url);
  return storageUpload(relPath, buffer, contentType);
}

async function runPayload(event, style, imageRef, outputPreset, options = {}) {
  const {
    modelImageRef = "",
    faceReferenceRef = "",
    backgroundReferenceRef = "",
    randomModelPrompt = "",
    styleConfig: rawStyleConfig = null,
    modelRunStrategy = "auto",
  } = options;
  const styleConfig = normalizeStyleConfig(style, outputPreset, rawStyleConfig);
  const prompt = buildPromptFromConfig(styleConfig);
  const resolution = resolveFashnResolution(styleConfig);
  const outputFormat = resolveFashnOutputFormat();
  const normalizedProductImageRef = toAbsoluteUrl(event, imageRef);
  const normalizedModelImageRef = toAbsoluteUrl(event, modelImageRef);
  const normalizedFaceReferenceRef = toAbsoluteUrl(event, faceReferenceRef);
  const normalizedBackgroundReferenceRef = toAbsoluteUrl(event, backgroundReferenceRef);
  const styleImageReference = getPromptReferenceUrl(event, styleConfig.mode);
  const effectiveRunStrategy = resolveEffectiveRunStrategy(styleConfig.mode, modelRunStrategy, styleConfig);

  if (effectiveRunStrategy === "tryon-v1.6" || effectiveRunStrategy === "tryon-max") {
    const tryonModelImage = normalizedModelImageRef || styleImageReference;
    if (!tryonModelImage) throw new Error("モデル参照画像が未選択です");
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
      inputs.prompt = prompt;
      if (String(styleConfig?.aspectRatio || "").trim()) inputs.aspect_ratio = String(styleConfig.aspectRatio).trim();
      inputs.seed = 42;
      inputs.output_format = outputFormat === "jpg" ? "jpeg" : outputFormat;
    }
    return {
      model_name: effectiveRunStrategy === "tryon-max" ? FASHN_TRYON_MAX_MODEL_NAME : FASHN_TRYON_V16_MODEL_NAME,
      inputs,
    };
  }

  const productToModelPrompt = String(randomModelPrompt || "").trim()
    ? `${prompt} Random model appearance requirements: ${String(randomModelPrompt || "").trim()}`
    : prompt;
  const inputs = {
    product_image: normalizedProductImageRef,
    prompt: productToModelPrompt,
    num_images: 1,
    output_format: outputFormat,
    resolution,
    ...(String(styleConfig?.aspectRatio || "").trim() ? { aspect_ratio: String(styleConfig.aspectRatio).trim() } : {}),
  };
  const isModelOnReference = styleConfig.mode === "model";
  const modelRefForRun = isModelOnReference ? normalizedModelImageRef : (normalizedModelImageRef || styleImageReference);
  const shouldAvoidModelImage = Boolean(normalizedBackgroundReferenceRef);
  if (isModelOnReference && normalizedModelImageRef && shouldAvoidModelImage) {
    inputs.image_prompt = normalizedModelImageRef;
  } else if (modelRefForRun && !shouldAvoidModelImage) {
    inputs.model_image = modelRefForRun;
  }
  if (normalizedFaceReferenceRef) inputs.face_reference = normalizedFaceReferenceRef;
  if (normalizedBackgroundReferenceRef) inputs.background_reference = normalizedBackgroundReferenceRef;
  return { model_name: "product-to-model", inputs };
}

function buildBackgroundEditPayload(event, subjectImageRef, backgroundImageRef, styleConfig) {
  const normalizedStyleConfig = normalizeStyleConfig(String(styleConfig?.mode || "torso"), "fourThree", styleConfig || {});
  const outputFormat = resolveFashnOutputFormat();
  const resolution = resolveFashnResolution(normalizedStyleConfig);
  return {
    model_name: "edit",
    inputs: {
      image: toAbsoluteUrl(event, subjectImageRef),
      image_context: toAbsoluteUrl(event, backgroundImageRef),
      prompt: BACKGROUND_EDIT_PROMPT,
      output_format: outputFormat === "jpg" ? "jpeg" : outputFormat,
      resolution,
    },
  };
}

function itemErrorHint(message) {
  const msg = String(message || "").toLowerCase();
  if (msg.includes("fashn_api_key is missing")) return "APIキーが未設定です。Netlify の環境変数を確認してください。";
  if (msg.includes("timeout")) return "タイムアウト。画像サイズを小さくして再試行してください。";
  if (msg.includes("invalid")) return "入力画像または生成パラメータを確認してください。";
  return "画像の背景が複雑、または服が見切れている可能性があります。";
}

async function processJobItem(event, job, item, requestOptions) {
  const originalStyleConfig = requestOptions.styleConfig || {
    mode: job.style,
    aspectRatio: job.outputPreset,
    background: {
      type: requestOptions.backgroundMode === "image" ? "image" : "solid",
      color: requestOptions.backgroundColor || "#FFFFFF",
    },
    customPrompt: requestOptions.customPrompt || "",
    quality: "standard",
    preserveDetails: true,
  };
  await updateJobItemRow(item.id, { status: "processing", error: null, error_hint: null });
  await updateJobRow(job.id, { status: "processing" });
  await appendJobEvent(job.userId, job.id, "item_processing", { itemId: item.id });

  try {
    const useDirectBackgroundReference = job.style === "model"
      && requestOptions.effectiveModelRunStrategy === "product-to-model"
      && String(requestOptions.backgroundMode || "solid") === "image"
      && String(requestOptions.backgroundReference || "").trim()
      && !String(requestOptions.modelReference || "").trim();
    const stageOneStyleConfig = String(requestOptions.backgroundMode || "solid") === "image" && !useDirectBackgroundReference
      ? {
        ...originalStyleConfig,
        background: { type: "solid", color: "#FFFFFF" },
      }
      : originalStyleConfig;
    const payload = await runPayload(event, job.style, item.inputRef, job.outputPreset, {
      modelImageRef: requestOptions.modelReference || "",
      faceReferenceRef: requestOptions.faceReference || "",
      backgroundReferenceRef: useDirectBackgroundReference ? (requestOptions.backgroundReference || "") : "",
      randomModelPrompt: requestOptions.randomModelPrompt || "",
      styleConfig: stageOneStyleConfig,
      modelRunStrategy: requestOptions.modelRunStrategy,
    });
    const runRes = await fashnRequest("/run", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 45000,
    });
    await appendJobEvent(job.userId, job.id, "fashn_run_started", {
      itemId: item.id,
      predictionId: runRes.id,
      effectiveModelRunStrategy: requestOptions.effectiveModelRunStrategy,
    });
    const statusRes = await waitForPrediction(runRes.id, 90, 2000);
    const predictionStatus = String(statusRes?.status || "").toLowerCase();
    let outputUrl = extractOutputUrls(statusRes)[0] || "";
    const isCompletedLike = ["completed", "complete", "succeeded", "success"].includes(predictionStatus);
    if (!isCompletedLike && !outputUrl) {
      throw new Error(statusRes?.error || "FASHN timeout");
    }
    const editBackgroundReference = String(requestOptions.backgroundMode || "solid") === "image"
      ? (String(requestOptions.backgroundReference || "").trim() && !useDirectBackgroundReference ? requestOptions.backgroundReference : "")
      : "";
    const shouldRunBackgroundEdit = Boolean(editBackgroundReference);
    if (outputUrl && shouldRunBackgroundEdit) {
      const editRunRes = await fashnRequest("/run", {
        method: "POST",
        body: JSON.stringify(buildBackgroundEditPayload(event, outputUrl, editBackgroundReference, originalStyleConfig)),
        timeoutMs: 45000,
      });
      const editStatusRes = await waitForPrediction(editRunRes.id, 120, 2000);
      if (!["completed", "complete", "succeeded", "success"].includes(String(editStatusRes?.status || "").toLowerCase())) {
        throw new Error(editStatusRes?.error || "FASHN edit timeout");
      }
      outputUrl = extractOutputUrls(editStatusRes)[0] || "";
      if (!outputUrl) throw new Error("FASHN edit output is empty");
    }
    const outputExt = extFromMime(mimeFromUrl(outputUrl)).replace(/^\./, "") || "jpg";
    const storagePath = `${job.userId}/jobs-outputs/${job.id}/${item.id}.${outputExt}`;
    const publicUrl = await persistRemoteImageToStorage(outputUrl, storagePath);
    await updateJobItemRow(item.id, {
      status: "done",
      output_url: publicUrl,
      output_name: buildOutputFileName({ style: job.style, seq: item.outputSequence, createdAt: job.createdAt, ext: outputExt }),
      credit_used: Number(job.creditRate || 0),
      error: null,
      error_hint: null,
    });
    await appendJobEvent(job.userId, job.id, "item_done", { itemId: item.id });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    await updateJobItemRow(item.id, {
      status: "error",
      error: message,
      error_hint: itemErrorHint(message),
      credit_used: 0,
    });
    await appendJobEvent(job.userId, job.id, "item_error", { itemId: item.id, error: message });
    return { ok: false, error: message };
  }
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

    if (method === "POST" && path === "/stripe/webhook") {
      verifyStripeWebhookSignature(String(event.body || ""), event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"]);
      const payload = parseBody(event);
      await handleStripeWebhookEvent(payload);
      return json(200, { received: true });
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
          plan_id: "free",
          credits: PLAN_MONTHLY_CREDITS.free,
          subscription_credits: PLAN_MONTHLY_CREDITS.free,
          intro_pack_eligible: true,
          password_hash: hashPassword(password),
        },
      });
      return json(200, { user: mapUser(Array.isArray(created) ? created[0] || null : null) });
    }

    if (method === "GET" && path === "/auth/google/start") {
      const redirectTo = String(event.queryStringParameters?.redirectTo || "").trim();
      if (!redirectTo) return json(400, { error: "redirectTo is required" });
      requireSupabase();
      const location = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
      return redirect(302, location);
    }

    if (method === "POST" && path === "/auth/google/complete") {
      const body = parseBody(event);
      const accessToken = String(body.accessToken || "").trim();
      if (!accessToken) return json(400, { error: "accessToken is required" });
      const authUser = await getSupabaseAuthUser(accessToken);
      const user = await findOrCreateGoogleUser(authUser);
      if (!user) return json(500, { error: "google login failed" });
      return json(200, { user: mapUser(user) });
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
            subscription_credits: 200,
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

    if (method === "GET" && path === "/billing/history") {
      const userId = String(event.queryStringParameters?.userId || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      const [creditPackRows, subscriptionRows, billingCustomer] = await Promise.all([
        supabaseRequest(`/app_credit_pack_orders?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`),
        supabaseRequest(`/app_subscription_orders?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`),
        resolveBillingCustomerForUser(userId),
      ]);
      return json(200, {
        creditPackOrders: (Array.isArray(creditPackRows) ? creditPackRows : []).map(mapCreditPackOrder),
        subscriptionOrders: (Array.isArray(subscriptionRows) ? subscriptionRows : []).map(mapSubscriptionOrder),
        billingCustomer: billingCustomer ? {
          userId: billingCustomer.user_id,
          stripeCustomerId: billingCustomer.stripe_customer_id || "",
          billingEmail: billingCustomer.billing_email || "",
          defaultPaymentMethodId: billingCustomer.default_payment_method_id || "",
          createdAt: billingCustomer.created_at || nowIso(),
          updatedAt: billingCustomer.updated_at || billingCustomer.created_at || nowIso(),
          payload: billingCustomer.payload || {},
        } : null,
      });
    }

    if (method === "POST" && path === "/billing/change-plan") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const targetPlanId = String(body.targetPlanId || "").trim().toLowerCase();
      if (!userId) return json(400, { error: "userId is required" });
      if (!SUBSCRIPTION_PRICE_BY_PLAN[targetPlanId]) return json(400, { error: "unsupported target plan" });
      const user = await getUserById(userId);
      if (!user) return json(404, { error: "user not found" });
      if (String(user.plan_id || "free").toLowerCase() === targetPlanId) {
        return json(400, { error: "already on target plan" });
      }
      const order = await findLatestManagedSubscriptionOrderByUserId(userId);
      if (!order?.stripe_subscription_id) {
        return json(400, { error: "active subscription not found" });
      }
      const subscription = await stripeGetRequest(`/subscriptions/${encodeURIComponent(order.stripe_subscription_id)}`, {
        "expand[]": "items.data.price",
      });
      const item = Array.isArray(subscription?.items?.data) ? subscription.items.data[0] || null : null;
      if (!item?.id) return json(400, { error: "subscription item not found" });

      const updatedSubscription = await stripeRequest(`/subscriptions/${encodeURIComponent(order.stripe_subscription_id)}`, {
        "items[0][id]": String(item.id),
        "items[0][price]": String(SUBSCRIPTION_PRICE_BY_PLAN[targetPlanId]),
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        "metadata[user_id]": userId,
        "metadata[target_plan_id]": targetPlanId,
      });

      const previousCredits = Number(user.credits || 0);
      const updatedUser = await applySubscriptionCreditAllocation(userId, targetPlanId);
      const nextCredits = Number(updatedUser?.credits || 0);
      await updateSubscriptionOrder(order.order_id, {
        plan_id: targetPlanId,
        status: "active",
        stripe_customer_id: updatedSubscription.customer || order.stripe_customer_id || null,
        payload: {
          ...(order.payload || {}),
          lastPlanChangeAt: nowIso(),
          previousPlanId: user.plan_id || "free",
          targetPlanId,
          source: "app.plan_change",
        },
      });
      if (updatedSubscription.customer) {
        await upsertBillingCustomer({
          userId,
          stripeCustomerId: String(updatedSubscription.customer),
          billingEmail: String(user.email || ""),
          payload: {
            source: "billing.change-plan",
            stripeSubscriptionId: String(updatedSubscription.id || order.stripe_subscription_id),
          },
        });
      }
      await appendCreditEvent(userId, "subscription_plan_changed", nextCredits - previousCredits, {
        previousPlanId: user.plan_id || "free",
        targetPlanId,
        stripeSubscriptionId: String(updatedSubscription.id || order.stripe_subscription_id),
      }, nextCredits);
      return json(200, {
        ok: true,
        user: mapUser(updatedUser),
        subscriptionOrder: mapSubscriptionOrder({
          ...order,
          plan_id: targetPlanId,
          status: "active",
          stripe_customer_id: updatedSubscription.customer || order.stripe_customer_id || null,
        }),
      });
    }

    if (method === "POST" && path === "/billing/customer-portal") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const returnUrl = String(body.returnUrl || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      if (!returnUrl) return json(400, { error: "returnUrl is required" });
      const billingCustomer = await resolveBillingCustomerForUser(userId);
      if (!billingCustomer?.stripe_customer_id) {
        return json(400, { error: "Stripe customer not found for this account" });
      }
      const session = await stripeRequest("/billing_portal/sessions", {
        customer: billingCustomer.stripe_customer_id,
        return_url: returnUrl,
        ...(STRIPE_BILLING_PORTAL_CONFIGURATION_ID
          ? { configuration: STRIPE_BILLING_PORTAL_CONFIGURATION_ID }
          : {}),
      });
      return json(200, { url: session.url || "", id: session.id || "" });
    }

    if (method === "POST" && path === "/billing/checkout-session") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const mode = String(body.mode || "").trim().toLowerCase();
      const planId = String(body.planId || "").trim().toLowerCase();
      const packCode = String(body.packCode || "").trim();
      const successUrl = String(body.successUrl || "").trim();
      const cancelUrl = String(body.cancelUrl || "").trim();
      if (!userId) return json(400, { error: "userId is required" });
      if (!successUrl || !cancelUrl) return json(400, { error: "successUrl and cancelUrl are required" });
      const user = await getUserById(userId);
      if (!user) return json(404, { error: "user not found" });

      if (mode === "subscription") {
        const priceId = SUBSCRIPTION_PRICE_BY_PLAN[planId];
        if (!priceId) return json(400, { error: "unsupported subscription plan" });
        const billingCustomer = await findBillingCustomerByUserId(userId);
        const amountYen =
          planId === "starter" ? 4900 :
          planId === "growth" ? 29800 :
          planId === "business" ? 98000 :
          planId === "enterprise" ? 198000 :
          null;
        const order = await createSubscriptionOrder({ userId, planId, interval: "month", amountYen });
        const orderId = order?.order_id || "";
        if (billingCustomer?.stripe_customer_id) {
          const billingProfile = await getStripeCustomerBillingProfile(billingCustomer.stripe_customer_id);
          if (billingProfile.defaultPaymentMethodId) {
            const subscription = await stripeRequest("/subscriptions", {
              customer: billingCustomer.stripe_customer_id,
              "items[0][price]": priceId,
              default_payment_method: billingProfile.defaultPaymentMethodId,
              payment_behavior: "error_if_incomplete",
              collection_method: "charge_automatically",
              "metadata[user_id]": userId,
              "metadata[purchase_kind]": "subscription",
              "metadata[plan_id]": planId,
              "metadata[order_id]": orderId,
            });
            const updatedUser = await applySubscriptionCreditAllocation(userId, planId);
            const nextCredits = Number(updatedUser?.credits || 0);
            if (orderId) {
              await updateSubscriptionOrder(orderId, {
                status: "active",
                stripe_subscription_id: subscription.id || null,
                stripe_customer_id: subscription.customer || billingCustomer.stripe_customer_id,
                stripe_latest_invoice_id: subscription.latest_invoice || null,
                payload: {
                  directSubscriptionCreatedAt: nowIso(),
                  source: "app.direct_subscription_create",
                },
              });
            }
            await upsertBillingCustomer({
              userId,
              stripeCustomerId: String(subscription.customer || billingCustomer.stripe_customer_id),
              billingEmail: billingProfile.billingEmail || String(user.email || ""),
              defaultPaymentMethodId: billingProfile.defaultPaymentMethodId,
              payload: {
                source: "direct_subscription_create",
                stripeSubscriptionId: String(subscription.id || ""),
                cardBrand: billingProfile.cardBrand || "",
                cardLast4: billingProfile.cardLast4 || "",
                cardExpMonth: billingProfile.cardExpMonth,
                cardExpYear: billingProfile.cardExpYear,
              },
            });
            await appendCreditEvent(userId, "subscription_cycle_reset", nextCredits - Number(user.credits || 0), {
              planId,
              stripeSubscriptionId: String(subscription.id || ""),
              source: "direct_subscription_create",
            }, nextCredits);
            return json(200, {
              ok: true,
              user: mapUser(updatedUser),
              subscriptionOrder: orderId ? mapSubscriptionOrder({
                ...order,
                plan_id: planId,
                status: "active",
                stripe_subscription_id: subscription.id || null,
                stripe_customer_id: subscription.customer || billingCustomer.stripe_customer_id,
                stripe_latest_invoice_id: subscription.latest_invoice || null,
              }) : null,
            });
          }
        }
        const session = await stripeRequest("/checkout/sessions", {
          mode: "subscription",
          success_url: successUrl,
          cancel_url: cancelUrl,
          ...(billingCustomer?.stripe_customer_id
            ? { customer: billingCustomer.stripe_customer_id }
            : { customer_email: String(user.email || "") }),
          client_reference_id: userId,
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          "metadata[user_id]": userId,
          "metadata[purchase_kind]": "subscription",
          "metadata[plan_id]": planId,
          "metadata[order_id]": orderId,
          "subscription_data[metadata][user_id]": userId,
          "subscription_data[metadata][purchase_kind]": "subscription",
          "subscription_data[metadata][plan_id]": planId,
          "subscription_data[metadata][order_id]": orderId,
        });
        if (orderId) {
          await updateSubscriptionOrder(orderId, {
            stripe_checkout_session_id: session.id,
          });
        }
        return json(200, { url: session.url, id: session.id, orderId });
      }

      if (mode === "payment") {
        const pack = CREDIT_PACK_CONFIG[packCode];
        if (!pack?.priceId) return json(400, { error: "unsupported credit pack" });
        const billingCustomer = await findBillingCustomerByUserId(userId);
        if (pack.planId === "free") {
          const eligible = Boolean(user.intro_pack_eligible);
          if (pack.introOnly && !eligible) return json(400, { error: "intro pack unavailable" });
          if (!pack.introOnly && eligible && packCode !== "free-intro-10") {
            // Allowing purchase, but UI should prefer intro pack first.
          }
        } else if (String(user.plan_id || "").toLowerCase() !== pack.planId) {
          return json(400, { error: "pack does not match current plan" });
        }

        const order = await createCreditPackOrder({
          userId,
          planId: pack.planId,
          packCode,
          credits: pack.credits,
          amountYen: pack.amountYen,
          introPackEligible: Boolean(user.intro_pack_eligible),
        });
        const orderId = order?.order_id || "";
        if (billingCustomer?.stripe_customer_id) {
          const billingProfile = await getStripeCustomerBillingProfile(billingCustomer.stripe_customer_id);
          if (billingProfile.defaultPaymentMethodId) {
            const paymentIntent = await stripeRequest("/payment_intents", {
              amount: String(pack.amountYen),
              currency: "jpy",
              customer: billingCustomer.stripe_customer_id,
              payment_method: billingProfile.defaultPaymentMethodId,
              confirm: "true",
              off_session: "true",
              "metadata[user_id]": userId,
              "metadata[purchase_kind]": "credit_pack",
              "metadata[pack_code]": packCode,
              "metadata[order_id]": orderId,
            });
            await creditUserFromPack({
              userId,
              packCode,
              orderId,
              stripePaymentIntentId: String(paymentIntent.id || ""),
              stripeCheckoutSessionId: "",
            });
            const refreshedUser = await getUserById(userId);
            await upsertBillingCustomer({
              userId,
              stripeCustomerId: String(paymentIntent.customer || billingCustomer.stripe_customer_id),
              billingEmail: billingProfile.billingEmail || String(user.email || ""),
              defaultPaymentMethodId: billingProfile.defaultPaymentMethodId,
              payload: {
                source: "direct_credit_pack_payment",
                cardBrand: billingProfile.cardBrand || "",
                cardLast4: billingProfile.cardLast4 || "",
                cardExpMonth: billingProfile.cardExpMonth,
                cardExpYear: billingProfile.cardExpYear,
              },
            });
            return json(200, {
              ok: true,
              user: mapUser(refreshedUser),
              creditPackOrder: orderId ? mapCreditPackOrder({
                ...order,
                status: "paid",
                stripe_payment_intent_id: paymentIntent.id || null,
              }) : null,
            });
          }
        }
        const session = await stripeRequest("/checkout/sessions", {
          mode: "payment",
          success_url: successUrl,
          cancel_url: cancelUrl,
          ...(billingCustomer?.stripe_customer_id
            ? { customer: billingCustomer.stripe_customer_id }
            : { customer_email: String(user.email || ""), customer_creation: "always" }),
          client_reference_id: userId,
          "line_items[0][price]": pack.priceId,
          "line_items[0][quantity]": "1",
          "metadata[user_id]": userId,
          "metadata[purchase_kind]": "credit_pack",
          "metadata[pack_code]": packCode,
          "metadata[order_id]": orderId,
          "payment_intent_data[metadata][user_id]": userId,
          "payment_intent_data[metadata][purchase_kind]": "credit_pack",
          "payment_intent_data[metadata][pack_code]": packCode,
          "payment_intent_data[metadata][order_id]": orderId,
          "payment_intent_data[setup_future_usage]": "off_session",
        });
        if (orderId) {
          await updateCreditPackOrder(orderId, {
            stripe_checkout_session_id: session.id,
          });
        }
        return json(200, { url: session.url, id: session.id, orderId });
      }

      return json(400, { error: "unsupported checkout mode" });
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
      const previousLibrary = await ensureAssetLibrary(userId);
      const compacted = await compactAssetLibraryForSupabase(userId, {
        studio: Array.isArray(body.studio) ? body.studio : [],
        models: Array.isArray(body.models) ? body.models : [],
        products: Array.isArray(body.products) ? body.products : [],
      });
      const counts = buildAssetLibraryCounts(compacted);
      const next = {
        user_id: userId,
        studio_assets: compacted.studio,
        model_assets: compacted.models,
        product_assets: compacted.products,
        studio_count: counts.studioCount,
        model_count: counts.modelCount,
        product_count: counts.productCount,
      };
      let rows;
      try {
        rows = await supabaseRequest("/app_asset_libraries?on_conflict=user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: next,
        });
      } catch (error) {
        if (!isMissingAssetLibraryCountColumnError(error)) throw error;
        rows = await supabaseRequest("/app_asset_libraries?on_conflict=user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: {
            user_id: userId,
            studio_assets: compacted.studio,
            model_assets: compacted.models,
            product_assets: compacted.products,
          },
        });
      }
      const row = Array.isArray(rows) ? rows[0] || null : null;
      await appendAssetLibraryEvents(userId, previousLibrary, compacted);
      return json(200, {
        library: {
          studio: Array.isArray(row?.studio_assets) ? row.studio_assets : [],
          models: Array.isArray(row?.model_assets) ? row.model_assets : [],
          products: Array.isArray(row?.product_assets) ? row.product_assets : [],
          stats: {
            studioCount: Number(row?.studio_count || counts.studioCount),
            modelCount: Number(row?.model_count || counts.modelCount),
            productCount: Number(row?.product_count || counts.productCount),
          },
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

    if (method === "POST" && path === "/jobs") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const style = String(body.style || "torso").trim();
      const files = Array.isArray(body.files) ? body.files : [];
      const outputPreset = String(body.outputPreset || "fourThree");
      const rawStyleConfig = typeof body.styleConfig === "object" && body.styleConfig ? body.styleConfig : null;
      const backgroundAssetIdRaw = body.backgroundAssetId ? String(body.backgroundAssetId) : null;
      const backgroundMode = String(body.backgroundMode || "solid");
      const backgroundColor = String(body.backgroundColor || "#FFFFFF");
      const modelAssetIdRaw = body.modelAssetId ? String(body.modelAssetId) : null;
      const modelReference = String(body.modelReference || "");
      const faceReference = String(body.faceReference || "");
      const modelRunStrategy = normalizeModelRunStrategy(body.modelRunStrategy || "auto");
      const backgroundReference = String(body.backgroundReference || "");
      const customPrompt = String(body.customPrompt || "");
      const randomModelPrompt = String(body.randomModelPrompt || "");

      const backgroundAssetId = isUuid(backgroundAssetIdRaw) ? backgroundAssetIdRaw : null;
      const modelAssetId = isUuid(modelAssetIdRaw) ? modelAssetIdRaw : null;

      if (!userId) return json(400, { error: "userId is required" });
      if (!CREDIT_BY_STYLE[style]) return json(400, { error: "invalid style" });
      if (!files.length) return json(400, { error: "files are required" });

      const user = await getUserById(userId);
      if (!user) return json(404, { error: "user not found" });

      const normalizedStyleConfig = normalizeStyleConfig(style, outputPreset, rawStyleConfig);
      const effectiveModelRunStrategy = resolveEffectiveRunStrategy(style, modelRunStrategy, normalizedStyleConfig);
      const qualitySurcharge = resolveQualitySurcharge(normalizedStyleConfig, effectiveModelRunStrategy);
      const modelReferenceSurcharge = resolveModelReferenceSurcharge(style, modelAssetId, effectiveModelRunStrategy);
      const backgroundEditSurcharge = resolveBackgroundEditSurcharge(backgroundMode, backgroundReference);

      if (qualitySurcharge > 0 && !HIGH_QUALITY_PLANS.has(String(user.plan_id || "growth").toLowerCase())) {
        return json(400, { error: "高画質はGrowth以上のプランで利用できます" });
      }
      if (backgroundMode === "image" && !backgroundReference.trim()) {
        return json(400, { error: "背景画像を選択してください" });
      }
      if (style === "model" && effectiveModelRunStrategy === "tryon-max" && !modelReference.trim()) {
        return json(400, { error: "Try-On Max には参照モデル画像が必要です" });
      }

      const normalizedFiles = files.map((file, index) => ({
        id: id("itm"),
        name: String(file?.name || `image-${index + 1}.jpg`),
        mime: String(file?.type || "image/jpeg"),
        inputRef: String(file?.url || file?.dataUrl || "").trim(),
        relativePath: String(file?.name || `image-${index + 1}.jpg`),
        outputSequence: index + 1,
      }));
      if (normalizedFiles.some((file) => !file.inputRef)) {
        return json(400, { error: "uploaded file URL is required" });
      }
      if (normalizedFiles.some((file) => file.name.toLowerCase().endsWith(".zip"))) {
        return json(400, { error: "ZIP はまだ Netlify Functions 版で未対応です。画像を直接アップロードしてください。" });
      }

      const baseStyleCreditRate = resolveBaseCreditRate(style, effectiveModelRunStrategy);
      const creditRate = baseStyleCreditRate + qualitySurcharge + modelReferenceSurcharge + backgroundEditSurcharge;
      const reservedCredits = normalizedFiles.length * creditRate;
      const currentCredits = Number(user.credits || 0);
      if (currentCredits < reservedCredits) {
        return json(400, { error: `クレジット不足です。必要 ${reservedCredits}cr / 残り ${currentCredits}cr` });
      }

      const jobId = id("job");
      const createdAt = nowIso();
      const reservation = await reserveUserCredits(userId, reservedCredits);
      const nextCredits = Number(reservation.user?.credits || 0);
      await appendCreditEvent(userId, "job_reserved", -reservedCredits, {
        jobId,
        imageCount: normalizedFiles.length,
        creditRate,
        style,
        subscriptionCreditsUsed: reservation.subscriptionUsed,
        purchasedCreditsUsed: reservation.purchasedUsed,
      }, nextCredits);

      await supabaseRequest("/app_jobs", {
        method: "POST",
        body: {
          job_id: jobId,
          user_id: userId,
          style,
          status: "queued",
          output_preset: outputPreset,
          style_config: {
            ...normalizedStyleConfig,
            requestSnapshot: {
              outputPreset,
              backgroundMode,
              backgroundColor,
              modelReference,
              faceReference,
              backgroundReference,
              customPrompt,
              randomModelPrompt,
              inputCount: normalizedFiles.length,
              effectiveModelRunStrategy,
            },
            creditBuckets: {
              subscription: reservation.subscriptionUsed,
              purchased: reservation.purchasedUsed,
            },
          },
          background_asset_id: backgroundAssetId,
          model_asset_id: modelAssetId,
          model_run_strategy: modelRunStrategy,
          credit_rate: creditRate,
          reserved_credits: reservedCredits,
          credit_used: 0,
          image_count: normalizedFiles.length,
          processed_count: 0,
          success_count: 0,
          error_count: 0,
          retry_attempt: 0,
          created_at: createdAt,
        },
      });

      await supabaseRequest("/app_job_items", {
        method: "POST",
        body: normalizedFiles.map((file) => ({
          item_id: file.id,
          job_id: jobId,
          user_id: userId,
          name: file.name,
          relative_path: file.relativePath,
          sku_guess: "",
          mime: file.mime,
          status: "queued",
          error: null,
          error_hint: null,
          input_url: file.inputRef,
          output_url: "",
          output_name: null,
          output_sequence: file.outputSequence,
          credit_used: 0,
          created_at: createdAt,
        })),
      });

      await appendJobEvent(userId, jobId, "job_created", {
        imageCount: normalizedFiles.length,
        style,
        outputPreset,
        backgroundMode,
        backgroundColor,
        modelRunStrategy,
        effectiveModelRunStrategy,
      });

      const job = {
        id: jobId,
        userId,
        style,
        outputPreset,
        creditRate,
        createdAt,
      };
      const requestOptions = {
        styleConfig: normalizedStyleConfig,
        backgroundMode,
        backgroundColor,
        modelReference,
        faceReference,
        backgroundReference,
        modelRunStrategy,
        effectiveModelRunStrategy,
        customPrompt,
        randomModelPrompt,
      };

      const results = [];
      for (const file of normalizedFiles) {
        results.push(await processJobItem(event, job, file, requestOptions));
      }

      const successCount = results.filter((result) => result.ok).length;
      const errorCount = results.length - successCount;
      const creditUsed = successCount * creditRate;
      const finalStatus = successCount > 0 ? "done" : "error";

      await updateJobRow(jobId, {
        status: finalStatus,
        processed_count: results.length,
        success_count: successCount,
        error_count: errorCount,
        credit_used: creditUsed,
      });

      if (errorCount > 0) {
        const refund = errorCount * creditRate;
        const refundedUser = await refundUserCredits(userId, refund);
        await appendCreditEvent(userId, "job_error_refund", refund, {
          jobId,
          refundedCount: errorCount,
          creditRate,
        }, Number(refundedUser?.credits || nextCredits + refund));
      }

      const finalJob = await getJobById(jobId);
      return json(200, { job: finalJob });
    }

    if (method === "POST" && path === "/models/generate") {
      const body = parseBody(event);
      const userId = String(body.userId || "").trim();
      const prompt = String(body.prompt || "").trim();
      const targetGender = normalizeTargetGender(body.targetGender);
      const effectivePrompt = withDefaultModelStylePrompt(prompt, targetGender);
      const numImages = Math.max(1, Math.min(4, Number(body.numImages || 1)));
      const resolution = String(body.resolution || "1k").toLowerCase() === "4k" ? "4k" : "1k";
      const faceReference = String(body.faceReference || "").trim();

      if (!userId) return json(400, { error: "userId is required" });
      if (!prompt) return json(400, { error: "prompt is required" });

      const user = await getUserById(userId);
      if (!user) return json(404, { error: "user not found" });

      const modelCreditRate = resolution === "4k" ? 2 : 1;
      const reservedCredits = numImages * modelCreditRate;
      const currentCredits = Number(user.credits || 0);
      if (currentCredits < reservedCredits) {
        return json(400, { error: `クレジット不足です。必要 ${reservedCredits}cr / 残り ${currentCredits}cr` });
      }

      const jobId = id("job");
      const createdAt = nowIso();
      const reservation = await reserveUserCredits(userId, reservedCredits);
      const nextCredits = Number(reservation.user?.credits || 0);
      await appendCreditEvent(userId, "model_generate_reserved", -reservedCredits, {
        jobId,
        numImages,
        resolution,
        targetGender,
        subscriptionCreditsUsed: reservation.subscriptionUsed,
        purchasedCreditsUsed: reservation.purchasedUsed,
      }, nextCredits);

      await supabaseRequest("/app_jobs", {
        method: "POST",
        body: {
          job_id: jobId,
          user_id: userId,
          style: "model",
          status: "processing",
          output_preset: "fourFive",
          style_config: {
            mode: "model",
            aspectRatio: "4:5",
            targetGender,
            framing: "full",
            orientation: "front",
            quality: resolution === "4k" ? "high" : "standard",
            customPrompt: prompt,
            generator: "model-create",
            creditBuckets: {
              subscription: reservation.subscriptionUsed,
              purchased: reservation.purchasedUsed,
            },
          },
          background_asset_id: null,
          model_asset_id: null,
          model_run_strategy: "model-create",
          credit_rate: modelCreditRate,
          reserved_credits: reservedCredits,
          credit_used: 0,
          image_count: numImages,
          processed_count: 0,
          success_count: 0,
          error_count: 0,
          retry_attempt: 0,
          created_at: createdAt,
        },
      });

      const pendingItems = Array.from({ length: numImages }).map((_, index) => ({
        item_id: id("itm"),
        job_id: jobId,
        user_id: userId,
        name: `model-generate-${index + 1}.png`,
        relative_path: `model-generate-${index + 1}.png`,
        sku_guess: "model-generate",
        mime: "image/png",
        status: "processing",
        error: null,
        error_hint: null,
        input_url: faceReference,
        output_url: "",
        output_name: null,
        output_sequence: index + 1,
        credit_used: 0,
        created_at: createdAt,
      }));
      await supabaseRequest("/app_job_items", {
        method: "POST",
        body: pendingItems,
      });
      await appendJobEvent(userId, jobId, "job_created", {
        imageCount: numImages,
        style: "model",
        generator: "model-create",
        resolution,
        targetGender,
      });

      const createdAtDate = new Date(createdAt);
      const createdDateLabel = createdAtDate.toLocaleDateString("ja-JP");
      const createdTimeLabel = createdAtDate
        .toLocaleTimeString("ja-JP", { hour12: false })
        .replace(/:/g, "");
      const models = [];
      let failedCount = 0;
      const usedSeeds = new Set();
      const nextUniqueSeed = () => {
        let seed = Math.floor(Math.random() * 0x100000000);
        while (usedSeeds.has(seed)) {
          seed = Math.floor(Math.random() * 0x100000000);
        }
        usedSeeds.add(seed);
        return seed;
      };

      for (let i = 0; i < pendingItems.length; i += 1) {
        const item = pendingItems[i];
        try {
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
            payload.inputs.face_reference = toAbsoluteUrl(event, faceReference);
          }
          const runRes = await fashnRequest("/run", {
            method: "POST",
            body: JSON.stringify(payload),
            timeoutMs: 45000,
          });
          await appendJobEvent(userId, jobId, "fashn_run_started", {
            itemId: item.item_id,
            predictionId: runRes.id,
            generator: "model-create",
          });
          const statusRes = await waitForPrediction(runRes.id, 90, 2000);
          if (!["completed", "complete", "succeeded", "success"].includes(String(statusRes?.status || "").toLowerCase())) {
            throw new Error(statusRes?.error || "model generation failed");
          }
          const outputUrlSource = extractOutputUrls(statusRes)[0];
          if (!outputUrlSource) throw new Error("model output is empty");
          const modelId = id("mdl");
          const storagePath = `${userId}/models/${modelId}.png`;
          const outputUrl = await persistRemoteImageToStorage(outputUrlSource, storagePath);
          const modelName = `モデル ${createdDateLabel}-${createdTimeLabel}-${i + 1}-${modelId.slice(-4)}`;
          models.push({
            id: modelId,
            name: modelName,
            outputUrl,
            sourceUrl: outputUrlSource,
            prompt: effectivePrompt,
            seed,
            favorite: false,
            createdAt,
          });
          await updateJobItemRow(item.item_id, {
            status: "done",
            output_url: outputUrl,
            output_name: modelName,
            credit_used: modelCreditRate,
            error: null,
            error_hint: null,
          });
          await appendJobEvent(userId, jobId, "item_done", { itemId: item.item_id, modelId });
        } catch (error) {
          failedCount += 1;
          const message = error instanceof Error ? error.message : String(error || "model generation failed");
          await updateJobItemRow(item.item_id, {
            status: "error",
            error: message,
            error_hint: itemErrorHint(message),
            credit_used: 0,
          });
          await appendJobEvent(userId, jobId, "item_error", { itemId: item.item_id, error: message });
        }
      }

      if (failedCount > 0) {
        const refundCredits = failedCount * modelCreditRate;
        const refundedUser = await refundUserCredits(userId, refundCredits);
        await appendCreditEvent(userId, "model_generate_refund", refundCredits, {
          jobId,
          numImages,
          failedCount,
          resolution,
          targetGender,
        }, Number(refundedUser?.credits || nextCredits + refundCredits));
      }

      await updateJobRow(jobId, {
        status: models.length > 0 ? "done" : "error",
        processed_count: pendingItems.length,
        success_count: models.length,
        error_count: failedCount,
        credit_used: models.length * modelCreditRate,
      });

      if (models.length === 0) {
        return json(502, { error: "model generation failed" });
      }

      const job = await getJobById(jobId);
      return json(200, { models, failedCount, job });
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
