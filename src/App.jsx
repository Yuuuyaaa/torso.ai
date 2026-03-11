import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  createJob,
  deleteGeneratedItems,
  downloadJobZip,
  fetchAssetLibrary,
  getBillingHistory,
  editImage,
  generateModelAssets,
  getCreditPackOffers,
  getCurrentUser,
  listCreditHistory,
  getPlanLabel,
  isDemoSession,
  listActiveJobs,
  listJobs,
  login,
  logout,
  pollJob,
  retryJob,
  saveAssetLibrary,
  signup,
  changeSubscriptionPlan,
  createCustomerPortalSession,
  createCheckoutSession,
  startDemoSession,
  updateUserName,
} from "./lib/mockApi";
import Logo from "./components/Logo";
import { Btn, Tag } from "./components/ui";
import SeoHead from "./components/SeoHead";
import LandingPage from "./pages/LandingPage";
import InfoPage from "./pages/InfoPage";
import LoginPage from "./pages/LoginPage";
import { C, JP, SANS, SERIF } from "./theme";

const PLAN_MAX_CREDITS = {
  starter: 30,
  free: 1,
  light: 30,
  growth: 200,
  standard: 200,
  business: 800,
  enterprise: 2000,
  pro: 2000,
  custom: 2000,
};
const MOBILE_BREAKPOINT = 900;
const MOBILE_PRIMARY_NAV_IDS = ["products", "upload", "history", "edit", "models"];
const DASHBOARD_CACHE_PREFIX = "torso-dashboard-cache-v1";
const DASHBOARD_CACHE_TTL_MS = 3 * 60 * 1000;

function getSubscriptionCreditsValue(user) {
  return Math.max(0, Number(user?.subscriptionCredits ?? user?.subscription_credits ?? 0));
}

function getTotalCreditsValue(user) {
  return Math.max(0, Number(user?.credits || 0));
}

function getPurchasedCreditsValue(user) {
  return Math.max(0, getTotalCreditsValue(user) - getSubscriptionCreditsValue(user));
}

// ─────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=Noto+Sans+JP:wght@400;500;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${C.bg}; overflow-x: hidden; }
    .num { font-family: ${JP}; font-variant-numeric: tabular-nums; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .fade-up { animation: fadeUp 0.4s ease forwards; }
    .models-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 14px;
      align-items: start;
    }
    .models-sidebar {
      position: sticky;
      top: 20px;
    }
    .models-gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }
    @media (max-width: 1080px) {
      .models-layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .models-sidebar {
        position: static;
      }
    }
    .btn-primary-glow:hover:not(:disabled) {
      box-shadow: 0 0 0 1px rgba(216,184,122,0.35), 0 6px 16px rgba(191,165,122,0.35), 0 0 22px rgba(214,195,165,0.38) !important;
      filter: brightness(1.04);
    }
    .btn-primary-glow:active:not(:disabled) {
      transform: translateY(1px);
    }
    input::placeholder, textarea::placeholder { color: #a79f95; }
  `}</style>
);

function MobileSheetHandle({ label = "設定", onClick, open = false, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        right: 0,
        top: "31vh",
        zIndex: 1180,
        border: `1px solid ${open ? C.goldBorder : C.border}`,
        borderRight: "none",
        background: open
          ? "linear-gradient(180deg, rgba(226,198,145,0.92), rgba(248,246,241,0.96))"
          : "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,240,234,0.96))",
        color: C.text,
        boxShadow: "-10px 12px 24px rgba(36,28,18,0.14)",
        padding: "14px 10px 14px 12px",
        borderTopLeftRadius: 18,
        borderBottomLeftRadius: 18,
        display: "grid",
        gap: 6,
        justifyItems: "center",
        width: 46,
        minWidth: 46,
        cursor: "pointer",
        ...style,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{open ? "›" : "‹"}</span>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", writingMode: "vertical-rl", textOrientation: "mixed" }}>
        {label}
      </span>
    </button>
  );
}

function MobileFixedLayer({ active = false, children }) {
  const root = typeof document !== "undefined" ? document.body : null;
  if (!active || !root) return children;
  return createPortal(children, root);
}

function BillingConfirmModal({
  open = false,
  title = "",
  body = "",
  amountLabel = "",
  confirmLabel = "確定する",
  cardLabel = "",
  note = "",
  busy = false,
  onCancel,
  onConfirm,
}) {
  const root = typeof document !== "undefined" ? document.body : null;
  if (!open || !root) return null;
  return createPortal(
    (
      <div
        onClick={() => {
          if (!busy) onCancel?.();
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3000,
          background: "rgba(26, 21, 15, 0.52)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(520px, 100%)",
            background: C.surface,
            border: `1px solid ${C.border}`,
            boxShadow: "0 22px 60px rgba(29, 23, 16, 0.18)",
            padding: 28,
          }}
        >
          <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 10 }}>Billing</p>
          <p style={{ fontFamily: SERIF, fontSize: 28, color: C.text, marginBottom: 12 }}>{title}</p>
          <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.85, marginBottom: 18, whiteSpace: "pre-line" }}>{body}</p>
          <div style={{ border: `1px solid ${C.borderLight}`, background: C.bg, padding: 16, marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>今回の決済</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>{amountLabel}</p>
            <p style={{ fontSize: 12, color: C.textMid }}>{cardLabel || "登録済みの支払い方法で決済します。"}</p>
          </div>
          {note ? (
            <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.75, marginBottom: 20, whiteSpace: "pre-line" }}>{note}</p>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="ghost" size="sm" onClick={onCancel} disabled={busy}>戻る</Btn>
            <Btn size="sm" onClick={onConfirm} disabled={busy}>{busy ? "処理中..." : confirmLabel}</Btn>
          </div>
        </div>
      </div>
    ),
    root,
  );
}

// ─────────────────────────────────────────────
// SIDEBAR NAV
// ─────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "products", icon: "◍", label: "商品" },
  { id: "upload", icon: "✦", label: "ルック生成" },
  { id: "history", icon: "◈", label: "生成履歴" },
  { id: "edit", icon: "✎", label: "編集" },
  { id: "models", icon: "◉", label: "モデル" },
  { id: "studio", icon: "▣", label: "スタジオ" },
  { id: "guide", icon: "?", label: "使い方" },
  { id: "pricing", icon: "◇", label: "プラン" },
  { id: "settings", icon: "⊙", label: "設定" },
];

function Sidebar({ page, setPage, user, onLogout, onSignup, onOpenCreditHistory, isMobile = false }) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const lowerNavOrder = ["pricing", "guide", "settings"];
  const topNavItemsBase = NAV_ITEMS.filter((item) => !lowerNavOrder.includes(item.id));
  const lowerNavItemsBase = lowerNavOrder
    .map((id) => NAV_ITEMS.find((item) => item.id === id))
    .filter(Boolean);
  const topNavItems = topNavItemsBase;
  const lowerNavItems = lowerNavItemsBase;
  const planKey = String(user?.plan || "").toLowerCase();
  const totalCredits = getTotalCreditsValue(user);
  const subscriptionCredits = getSubscriptionCreditsValue(user);
  const purchasedCredits = getPurchasedCreditsValue(user);
  const planMaxCredits = PLAN_MAX_CREDITS[planKey] || Math.max(1, totalCredits);
  const progressPercent = Math.max(4, Math.min(100, (subscriptionCredits / Math.max(1, planMaxCredits)) * 100));

  useEffect(() => {
    if (!isMobile && mobileMoreOpen) setMobileMoreOpen(false);
  }, [isMobile, mobileMoreOpen]);

  useEffect(() => {
    if (mobileMoreOpen) setMobileMoreOpen(false);
  }, [page]);

  if (isMobile) {
    const primaryItems = MOBILE_PRIMARY_NAV_IDS
      .map((id) => NAV_ITEMS.find((item) => item.id === id))
      .filter(Boolean);
    const moreMenuItems = [
      { id: "studio", label: "スタジオ", meta: "", action: () => setPage("studio"), active: page === "studio" },
      { id: "pricing", label: "プラン", meta: getPlanLabel(user?.plan), action: () => setPage("pricing"), active: page === "pricing" },
      { id: "credit-history", label: "クレジット履歴", meta: `${totalCredits} cr`, action: onOpenCreditHistory, active: false },
      { id: "guide", label: "使い方", meta: "", action: () => setPage("guide"), active: page === "guide" },
      { id: "settings", label: "設定", meta: "", action: () => setPage("settings"), active: page === "settings" },
    ];
    return (
      <>
        {mobileMoreOpen && (
          <div
            onClick={() => setMobileMoreOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(14,11,8,0.28)",
              zIndex: 1090,
            }}
          >
            <div
              data-testid="mobile-more-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 82,
                border: `1px solid ${C.border}`,
                background: "rgba(248,246,241,0.98)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 18px 42px rgba(44,34,20,0.18)",
                padding: 10,
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                {moreMenuItems.map((item) => (
                  <button
                    key={item.id}
                    data-testid={`mobile-more-item-${item.id}`}
                    onClick={() => {
                      item.action();
                      setMobileMoreOpen(false);
                    }}
                    style={{
                      border: `1px solid ${item.active ? C.goldBorder : C.borderLight}`,
                      background: item.active ? C.goldLight : C.surface,
                      color: item.active ? C.text : C.textSub,
                      cursor: "pointer",
                      padding: "12px 14px",
                      fontSize: 12,
                    }}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                        <span>{item.label}</span>
                      {item.meta ? (
                        <span style={{ color: C.textSub, fontSize: 11, whiteSpace: "nowrap" }}>{item.meta}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
                {user?.isDemo ? (
                  <button
                    data-testid="mobile-more-item-logout"
                    onClick={() => {
                      onSignup();
                      setMobileMoreOpen(false);
                    }}
                    style={{
                      border: `1px solid ${C.goldBorder}`,
                      background: C.text,
                      color: C.surface,
                      cursor: "pointer",
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    会員登録に進む
                  </button>
                ) : (
                  <button
                    data-testid="mobile-more-item-logout"
                    onClick={() => {
                      onLogout();
                      setMobileMoreOpen(false);
                    }}
                    style={{
                      border: `1px solid ${C.borderLight}`,
                      background: C.surface,
                      color: C.textSub,
                      cursor: "pointer",
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: 12,
                    }}
                    >
                      ログアウト
                    </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          maxWidth: "100vw",
          zIndex: 1100,
          padding: 0,
          boxSizing: "border-box",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 0,
            borderTop: `1px solid ${C.border}`,
            background: "rgba(248,246,241,0.98)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 -10px 28px rgba(44,34,20,0.12)",
            padding: "6px 6px calc(6px + env(safe-area-inset-bottom))",
          }}>
            {primaryItems.map((item) => (
              <button
                key={item.id}
                data-testid={`mobile-nav-${item.id}`}
                onClick={() => setPage(item.id)}
                style={{
                  border: "none",
                  borderTop: `2px solid ${!mobileMoreOpen && page === item.id ? C.gold : "transparent"}`,
                  background: !mobileMoreOpen && page === item.id ? "rgba(226,198,145,0.18)" : "transparent",
                  color: !mobileMoreOpen && page === item.id ? C.text : C.textSub,
                  minHeight: 58,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  gap: 3,
                  padding: "7px 2px 6px",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontSize: 10, lineHeight: 1.15, whiteSpace: "nowrap", fontWeight: 500 }}>{item.label}</span>
              </button>
            ))}
            <button
              data-testid="mobile-nav-more"
              onClick={() => setMobileMoreOpen((prev) => !prev)}
              style={{
                border: "none",
                borderTop: `2px solid ${mobileMoreOpen || ["studio", "guide", "pricing", "settings"].includes(page) ? C.gold : "transparent"}`,
                background: mobileMoreOpen || ["studio", "guide", "pricing", "settings"].includes(page) ? "rgba(226,198,145,0.18)" : "transparent",
                color: mobileMoreOpen || ["studio", "guide", "pricing", "settings"].includes(page) ? C.text : C.textSub,
                minHeight: 58,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                gap: 3,
                padding: "7px 2px 6px",
              }}
            >
              <span style={{ fontSize: 14 }}>⋯</span>
              <span style={{ fontSize: 10, lineHeight: 1.15, whiteSpace: "nowrap", fontWeight: 500 }}>その他</span>
            </button>
          </div>
        </div>
      </>
    );
  }
  return (
  <aside style={{
    width: 220,
    minHeight: "100vh",
    background: C.surface,
    borderRight: `1px solid ${C.border}`,
    display: "flex",
    flexDirection: "column",
    padding: "28px 0",
    position: "fixed",
    left: 0, top: 0,
  }}>
    <div style={{ padding: "0 24px", marginBottom: 40 }}>
      <a href="/" style={{ textDecoration: "none", display: "inline-flex" }} title="TORSO.AI LP を開く">
        <Logo />
      </a>
    </div>

    <nav style={{ flex: 1 }}>
      {topNavItems.map((item) => (
        <div
          key={item.id}
          onClick={() => setPage(item.id)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 24px",
            cursor: "pointer",
            background: page === item.id ? C.goldLight : "transparent",
            borderLeft: page === item.id ? `2px solid ${C.gold}` : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 14, color: page === item.id ? C.gold : C.textSub }}>{item.icon}</span>
          <span style={{
            fontSize: 13,
            fontFamily: SANS,
            fontWeight: page === item.id ? 500 : 400,
            color: page === item.id ? C.text : C.textMid,
            letterSpacing: "0.02em",
          }}>{item.label}</span>
        </div>
      ))}
    </nav>

    {user?.isDemo && (
      <div style={{ padding: "0 20px", marginBottom: 12 }}>
        <div style={{ background: C.goldLight, border: `1px solid ${C.goldBorder}`, padding: "10px 10px" }}>
          <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.5, marginBottom: 8 }}>
            デモが気に入って自社製品で試すなら、こちらから進めます。
          </p>
          <button
            onClick={onSignup}
            style={{
              width: "100%",
              border: `1px solid ${C.goldBorder}`,
              background: C.text,
              color: C.surface,
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 10px",
              cursor: "pointer",
            }}
          >
            会員登録に進む
          </button>
        </div>
      </div>
    )}

    <div style={{ marginBottom: 10 }}>
      {lowerNavItems.map((item) => (
        <div
          key={item.id}
          onClick={() => setPage(item.id)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 24px",
            cursor: "pointer",
            background: page === item.id ? C.goldLight : "transparent",
            borderLeft: page === item.id ? `2px solid ${C.gold}` : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 14, color: page === item.id ? C.gold : C.textSub }}>{item.icon}</span>
          <span style={{
            fontSize: 13,
            fontFamily: SANS,
            fontWeight: page === item.id ? 500 : 400,
            color: page === item.id ? C.text : C.textMid,
            letterSpacing: "0.02em",
          }}>{item.label}</span>
        </div>
      ))}
    </div>

    {/* Credit Widget */}
    <div style={{ padding: "0 20px", marginBottom: 20 }}>
      <button
        onClick={onOpenCreditHistory}
        style={{
          width: "100%",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          background: "transparent",
        }}
      >
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 2, padding: "14px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>クレジット</span>
          <Tag color={C.green} bg={C.greenLight}>{getPlanLabel(user.plan)}</Tag>
        </div>
        <div style={{ fontSize: 22, fontFamily: JP, fontWeight: 600, color: C.text, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
          {totalCredits.toLocaleString()}
          <span style={{ fontSize: 12, fontFamily: SANS, fontWeight: 300, color: C.textSub }}> 利用可能</span>
        </div>
        <p style={{ fontSize: 11, color: C.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          月額 {subscriptionCredits.toLocaleString()}cr / 追加 {purchasedCredits.toLocaleString()}cr
        </p>
          <div style={{ height: 3, background: C.borderLight, borderRadius: 2 }}>
            <div style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, ${C.gold}, ${C.goldBorder})`,
              borderRadius: 2,
            }} />
          </div>
      </div>
      </button>
    </div>

    <div style={{ padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: C.text, color: C.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 500,
        }}>{(user.name || "U").slice(0, 1).toUpperCase()}</div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{user.name || "User"}</p>
          <p style={{ fontSize: 10, color: C.textSub }}>{user.email}</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        style={{
          marginTop: 10,
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 11,
          color: C.textSub,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        ログアウト
      </button>
    </div>
  </aside>
  );
}

// ─────────────────────────────────────────────
// PAGE: UPLOAD
// ─────────────────────────────────────────────
const STYLE_OPTIONS = [
  { id: "torso", label: "トルソー", sub: "Torso", icon: "◈", desc: "上半身トルソーへの自然なフィット画像を生成します", credit: 1, previewImage: "/torso.png" },
  { id: "mannequin", label: "マネキン", sub: "Mannequin", icon: "◍", desc: "マネキン撮影風のEC向け画像を生成します", credit: 1, previewImage: "/mannequin.png" },
  { id: "hanger", label: "ハンガー", sub: "Hanger", icon: "◎", desc: "ハンガー掛けのEC向け商品画像を生成します", credit: 1, previewImage: "/hanger.png" },
  { id: "ghost", label: "ゴースト", sub: "Ghost", icon: "◌", desc: "ゴーストマネキン風に立体感を保って生成します", credit: 1, previewImage: "/ghost.png" },
  { id: "model", label: "モデル", sub: "Model", icon: "◉", desc: "実写風モデル画像を生成します", credit: 1 },
  { id: "custom", label: "カスタムプロンプト", sub: "Custom Prompt", icon: "✎", desc: "自分で細かい描写を設定して生成します", credit: 3 },
];
const OUTPUT_RATIO_OPTIONS = [
  { id: "oneOne", label: "1:1（デフォルト）" },
  { id: "fourThree", label: "4:3" },
  { id: "threeFour", label: "3:4" },
  { id: "nineSixteen", label: "9:16" },
  { id: "sixteenNine", label: "16:9" },
  { id: "twoThree", label: "2:3" },
  { id: "threeTwo", label: "3:2" },
  { id: "fourFive", label: "4:5" },
  { id: "fiveFour", label: "5:4" },
];
const ORIENTATION_OPTIONS = [
  { id: "auto", label: "自動" },
  { id: "front", label: "正面" },
  { id: "front45", label: "正面45°" },
  { id: "side", label: "横" },
  { id: "back", label: "背面" },
  { id: "back45", label: "背面45°" },
];
const FRAMING_OPTIONS = [
  { id: "focus", label: "商品フォーカス" },
  { id: "full", label: "全体" },
];
const GENERATION_QUALITY_OPTIONS = [
  { id: "standard", label: "標準" },
  { id: "highDetail", label: "高精細" },
];
const DEMO_ALLOWED_ORIENTATIONS_BY_SAMPLE = {
  demo_sample_1: ["auto", "front", "front45"],
  demo_sample_2: ["auto", "front", "front45"],
  demo_sample_3: ["auto", "front", "front45"],
  demo_sample_4: ["auto", "back", "back45"],
};
const SOLID_BACKGROUND_COLORS = [
  { id: "white", label: "ホワイト", hex: "#FFFFFF" },
  { id: "cream", label: "クリーム", hex: "#F6F1E8" },
  { id: "beige", label: "ベージュ", hex: "#E8DDCC" },
  { id: "sand", label: "サンド", hex: "#D9CCB6" },
  { id: "gray100", label: "ライトグレー", hex: "#F3F3F3" },
  { id: "gray300", label: "グレー", hex: "#D9D9D9" },
  { id: "charcoal", label: "チャコール", hex: "#4A4A4A" },
  { id: "black", label: "ブラック", hex: "#1F1F1F" },
  { id: "navy", label: "ネイビー", hex: "#243447" },
  { id: "olive", label: "オリーブ", hex: "#7A8260" },
  { id: "brown", label: "ブラウン", hex: "#7B5A46" },
  { id: "wine", label: "ワイン", hex: "#6B3A43" },
];
function builtInStorageUrl(_relPath, fallbackPublicPath) {
  return fallbackPublicPath;
}
function builtInPreviewUrl(fileName) {
  return `/optimized/${fileName.replace(/\.[^.]+$/, ".jpg")}`;
}
function getAssetThumbnailUrl(asset) {
  return asset?.previewUrl || asset?.outputUrl || asset?.dataUrl || "";
}
const DEFAULT_STUDIO_ASSETS = [
  { id: "bg1", name: "標準スタジオ 1", outputUrl: builtInStorageUrl("defaults/studio/bg3.png", "/bg3.png"), previewUrl: builtInPreviewUrl("bg3.png"), builtIn: true, favorite: false },
  { id: "bg2", name: "標準スタジオ 2", outputUrl: builtInStorageUrl("defaults/studio/bg7.png", "/bg7.png"), previewUrl: builtInPreviewUrl("bg7.png"), builtIn: true, favorite: false },
  { id: "bg3", name: "標準スタジオ 3", outputUrl: builtInStorageUrl("defaults/studio/bg1.png", "/bg1.png"), previewUrl: builtInPreviewUrl("bg1.png"), builtIn: true, favorite: false },
  { id: "bg4", name: "標準スタジオ 4", outputUrl: builtInStorageUrl("defaults/studio/bg4.png", "/bg4.png"), previewUrl: builtInPreviewUrl("bg4.png"), builtIn: true, favorite: false },
  { id: "bg5", name: "標準スタジオ 5", outputUrl: builtInStorageUrl("defaults/studio/bg5.png", "/bg5.png"), previewUrl: builtInPreviewUrl("bg5.png"), builtIn: true, favorite: false },
  { id: "bg6", name: "標準スタジオ 6", outputUrl: builtInStorageUrl("defaults/studio/bg6.png", "/bg6.png"), previewUrl: builtInPreviewUrl("bg6.png"), builtIn: true, favorite: false },
  { id: "bg7", name: "標準スタジオ 7", outputUrl: builtInStorageUrl("defaults/studio/bg2.png", "/bg2.png"), previewUrl: builtInPreviewUrl("bg2.png"), builtIn: true, favorite: false },
  { id: "bg8", name: "標準スタジオ 8", outputUrl: builtInStorageUrl("defaults/studio/bg8.png", "/bg8.png"), previewUrl: builtInPreviewUrl("bg8.png"), builtIn: true, favorite: false },
  { id: "bg9", name: "標準スタジオ 9", outputUrl: builtInStorageUrl("defaults/studio/bg9.png", "/bg9.png"), previewUrl: builtInPreviewUrl("bg9.png"), builtIn: true, favorite: false },
  { id: "bg10", name: "標準スタジオ 10", outputUrl: builtInStorageUrl("defaults/studio/bg10.png", "/bg10.png"), previewUrl: builtInPreviewUrl("bg10.png"), builtIn: true, favorite: false },
];
const DEMO_ALLOWED_BACKGROUND_IDS = new Set(["bg1", "bg2"]);
const DEMO_ALLOWED_SOLID_COLOR_IDS = new Set(["white", "cream"]);
const DEMO_SAMPLE_FILE_CANDIDATES = [
  ["/sample1.png", "/sample1.jpg", "/sample1.jpeg", "/sample1.webp"],
  ["/sample2.png", "/sample2.jpg", "/sample2.jpeg", "/sample2.webp"],
  ["/sample3.png", "/sample3.jpg", "/sample3.jpeg", "/sample3.webp"],
  ["/sample4.png", "/sample4.jpg", "/sample4.jpeg", "/sample4.webp"],
];
const DEMO_SAMPLE_CAPTIONS = {
  demo_sample_1: "ケーブルニットの質感やボリューム感も再現できます。",
  demo_sample_2: "複雑な柄も自然に再現できます。",
  demo_sample_3: "ドレスのエンブロイダリーも再現できます。",
  demo_sample_4: "服の背面をアップロードすればトルソーやモデルの背中向きの画像も生成できます。",
};
const DEFAULT_MODEL_ASSETS = [
  { id: "mdl_m01", name: "標準モデル 1", outputUrl: builtInStorageUrl("defaults/models/m1.png", "/m1.png"), previewUrl: builtInPreviewUrl("m1.png"), builtIn: true, favorite: false },
  { id: "mdl_m02", name: "標準モデル 2", outputUrl: builtInStorageUrl("defaults/models/m2.png", "/m2.png"), previewUrl: builtInPreviewUrl("m2.png"), builtIn: true, favorite: false },
  { id: "mdl_m03", name: "標準モデル 3", outputUrl: builtInStorageUrl("defaults/models/m3.png", "/m3.png"), previewUrl: builtInPreviewUrl("m3.png"), builtIn: true, favorite: false },
  { id: "mdl_m04", name: "標準モデル 4", outputUrl: builtInStorageUrl("defaults/models/m4.png", "/m4.png"), previewUrl: builtInPreviewUrl("m4.png"), builtIn: true, favorite: false },
  { id: "mdl_m05", name: "標準モデル 5", outputUrl: builtInStorageUrl("defaults/models/m5.png", "/m5.png"), previewUrl: builtInPreviewUrl("m5.png"), builtIn: true, favorite: false },
  { id: "mdl_m06", name: "標準モデル 6", outputUrl: builtInStorageUrl("defaults/models/m6.png", "/m6.png"), previewUrl: builtInPreviewUrl("m6.png"), builtIn: true, favorite: false },
  { id: "mdl_m07", name: "標準モデル 7", outputUrl: builtInStorageUrl("defaults/models/m7.png", "/m7.png"), previewUrl: builtInPreviewUrl("m7.png"), builtIn: true, favorite: false },
  { id: "mdl_m08", name: "標準モデル 8", outputUrl: builtInStorageUrl("defaults/models/m8.png", "/m8.png"), previewUrl: builtInPreviewUrl("m8.png"), builtIn: true, favorite: false },
  { id: "mdl_m09", name: "標準モデル 9", outputUrl: builtInStorageUrl("defaults/models/m9.png", "/m9.png"), previewUrl: builtInPreviewUrl("m9.png"), builtIn: true, favorite: false },
  { id: "mdl_m10", name: "標準モデル 10", outputUrl: builtInStorageUrl("defaults/models/m10.png", "/m10.png"), previewUrl: builtInPreviewUrl("m10.png"), builtIn: true, favorite: false },
  { id: "mdl_m11", name: "標準モデル 11", outputUrl: builtInStorageUrl("defaults/models/m11.png", "/m11.png"), previewUrl: builtInPreviewUrl("m11.png"), builtIn: true, favorite: false },
  { id: "mdl_m12", name: "標準モデル 12", outputUrl: builtInStorageUrl("defaults/models/m12.png", "/m12.png"), previewUrl: builtInPreviewUrl("m12.png"), builtIn: true, favorite: false },
];
const DEFAULT_MODEL_ORDER_MAP = new Map(DEFAULT_MODEL_ASSETS.map((asset, index) => [asset.id, index]));
const DEMO_ALLOWED_MODEL_IDS = new Set(["mdl_m01", "mdl_m02"]);
const PRODUCT_CATEGORY_OPTIONS = [
  { id: "unassigned", label: "未分類" },
  { id: "tops", label: "トップス" },
  { id: "jacket", label: "ジャケット" },
  { id: "bottoms", label: "ボトムス" },
  { id: "shoes", label: "シューズ" },
  { id: "accessories", label: "小物" },
];

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const EXPLICIT_BACKEND_PREVIEW_BASE_URL = String(import.meta.env.VITE_BACKEND_BASE_URL || "").trim();
const IS_LOCAL_BROWSER = typeof window === "undefined" || LOCAL_HOSTNAMES.has(window.location.hostname);
const DEFAULT_BACKEND_PREVIEW_BASE_URL = IS_LOCAL_BROWSER ? "http://localhost:8787" : "";
const USE_BACKEND_PREVIEW = import.meta.env.VITE_USE_BACKEND_API !== "false";
const BACKEND_PREVIEW_BASE_URL = (EXPLICIT_BACKEND_PREVIEW_BASE_URL || DEFAULT_BACKEND_PREVIEW_BASE_URL).replace(/\/$/, "");
const PREVIEW_CONVERT_MAX_RETRY = 2;
const PREVIEW_CONVERT_CONCURRENCY = 2;
const ASSET_STORAGE_PREFIX = "torso-asset-library-v1";
const PRODUCT_ASSET_DB_NAME = "torso-product-assets-v1";
const PRODUCT_ASSET_STORE = "items";
const PRODUCT_UPLOAD_MAX_PER_BATCH = 50;
const PRODUCT_UPLOAD_MAX_MP = 40;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`画像読込に失敗: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function preloadImage(src) {
  if (typeof window === "undefined" || !src) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

function readDashboardCache(userId) {
  if (!userId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${DASHBOARD_CACHE_PREFIX}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDashboardCache(userId, payload) {
  if (!userId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${DASHBOARD_CACHE_PREFIX}:${userId}`, JSON.stringify({
      savedAt: Date.now(),
      ...payload,
    }));
  } catch {
    // Ignore cache write failures.
  }
}

function clearDashboardCache(userId) {
  if (!userId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${DASHBOARD_CACHE_PREFIX}:${userId}`);
  } catch {
    // Ignore cache cleanup failures.
  }
}

function extractDroppedFiles(dataTransfer) {
  if (!dataTransfer) return [];
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files);
  }
  return [];
}

function openProductAssetDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb unavailable"));
      return;
    }
    const req = indexedDB.open(PRODUCT_ASSET_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRODUCT_ASSET_STORE)) {
        const store = db.createObjectStore(PRODUCT_ASSET_STORE, { keyPath: "key" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb open failed"));
  });
}

function productAssetKey(userId, assetId) {
  return `${userId}:${assetId}`;
}

function stripProductAssetsForMeta(products = []) {
  return (products || []).map((asset) => ({
    ...asset,
    dataUrl: "",
    outputUrl: "",
  }));
}

async function hydrateProductAssetsFromDb(userId, productMeta = []) {
  if (!userId) return productMeta || [];
  try {
    const db = await openProductAssetDb();
    const tx = db.transaction(PRODUCT_ASSET_STORE, "readonly");
    const store = tx.objectStore(PRODUCT_ASSET_STORE);
    const index = store.index("userId");
    const req = index.getAll(userId);
    const rows = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("indexeddb read failed"));
    });
    const map = new Map(rows.map((row) => [row.assetId, String(row.dataUrl || "")]));
    return (productMeta || []).map((asset) => ({
      ...asset,
      dataUrl: asset.dataUrl || map.get(asset.id) || "",
      outputUrl: asset.outputUrl || map.get(asset.id) || "",
    }));
  } catch {
    return productMeta || [];
  }
}

async function persistProductAssetsToDb(userId, products = []) {
  if (!userId) return;
  try {
    const db = await openProductAssetDb();
    const tx = db.transaction(PRODUCT_ASSET_STORE, "readwrite");
    const store = tx.objectStore(PRODUCT_ASSET_STORE);
    const index = store.index("userId");
    const existingReq = index.getAll(userId);
    const existing = await new Promise((resolve, reject) => {
      existingReq.onsuccess = () => resolve(Array.isArray(existingReq.result) ? existingReq.result : []);
      existingReq.onerror = () => reject(existingReq.error || new Error("indexeddb read failed"));
    });
    const keepIds = new Set((products || []).map((asset) => asset.id));
    existing.forEach((row) => {
      if (!keepIds.has(row.assetId)) {
        store.delete(row.key);
      }
    });
    const existingByAssetId = new Map(
      existing.map((row) => [String(row.assetId || ""), String(row.dataUrl || "")]),
    );
    (products || []).forEach((asset) => {
      const assetId = String(asset?.id || "");
      if (!assetId) return;
      const dataUrl = String(asset.dataUrl || asset.outputUrl || "");
      // Never overwrite a persisted product image with an empty value.
      if (!dataUrl) {
        if (!existingByAssetId.has(assetId)) return;
        return;
      }
      store.put({
        key: productAssetKey(userId, assetId),
        userId,
        assetId,
        dataUrl,
        updatedAt: new Date().toISOString(),
      });
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexeddb write failed"));
      tx.onabort = () => reject(tx.error || new Error("indexeddb write aborted"));
    });
  } catch {
    // noop
  }
}

async function ensureImageWithinMegapixels(dataUrl, maxMegapixels) {
  const mime = String(dataUrl || "").match(/^data:([^;]+);/i)?.[1]?.toLowerCase() || "";
  // HEIC/HEIF is often not decodable by browser Image even after fallback;
  // skip browser-side MP validation and let backend-side handling proceed.
  if (mime.includes("heic") || mime.includes("heif")) return;
  const img = await loadImageFromDataUrl(dataUrl);
  const megapixels = (img.width * img.height) / 1_000_000;
  if (megapixels > maxMegapixels) {
    throw new Error(`画像サイズが大きすぎます。1枚あたり最大${maxMegapixels}MPまで対応です。`);
  }
}

function isHeicLikeFile(file) {
  const name = String(file?.name || "");
  const type = String(file?.type || "");
  return /\.(heic|heif)$/i.test(name) || /image\/hei(c|f)/i.test(type);
}

async function convertPreviewDataUrlWithRetry(dataUrl) {
  let lastError = "";
  for (let attempt = 0; attempt <= PREVIEW_CONVERT_MAX_RETRY; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND_PREVIEW_BASE_URL}/api/preview/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.previewDataUrl) {
        throw new Error(data?.error || `preview convert failed (${response.status})`);
      }
      return String(data.previewDataUrl);
    } catch (e) {
      lastError = e instanceof Error ? e.message : "preview convert failed";
      if (attempt < PREVIEW_CONVERT_MAX_RETRY) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  throw new Error(lastError || "preview convert failed");
}

async function fileToRenderableDataUrl(file) {
  const dataUrl = await fileToDataUrl(file);
  if (!isHeicLikeFile(file) || !USE_BACKEND_PREVIEW) return dataUrl;
  try {
    return await convertPreviewDataUrlWithRetry(dataUrl);
  } catch {
    // fallback: keep original data url (may not render on some browsers)
    return dataUrl;
  }
}

function dataUrlToFile(dataUrl, filename = `asset-${Date.now()}.png`) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("無効な画像データです");
  const mime = match[1] || "image/png";
  const binary = atob(match[2] || "");
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime, lastModified: Date.now() });
}

async function resolveCanvasSafeImageSource(source) {
  const raw = String(source || "");
  if (!raw) throw new Error("画像の読み込みに失敗しました");
  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return { src: raw, crossOrigin: null, revoke: null };
  }
  if (raw.startsWith("/")) {
    return { src: raw, crossOrigin: "anonymous", revoke: null };
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const response = await fetch(raw, {
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        return {
          src: objectUrl,
          crossOrigin: null,
          revoke: () => URL.revokeObjectURL(objectUrl),
        };
      }
    } catch {
      // fallback below
    }
    return { src: raw, crossOrigin: "anonymous", revoke: null };
  }
  return { src: raw, crossOrigin: null, revoke: null };
}

async function loadImageFromDataUrl(dataUrl) {
  const resolved = await resolveCanvasSafeImageSource(dataUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (resolved.crossOrigin) img.crossOrigin = resolved.crossOrigin;
    img.onload = () => {
      resolve(img);
      if (resolved.revoke) {
        setTimeout(() => resolved.revoke(), 0);
      }
    };
    img.onerror = () => {
      if (resolved.revoke) {
        resolved.revoke();
      }
      reject(new Error("画像の読み込みに失敗しました"));
    };
    img.src = resolved.src;
  });
}

function drawContain(ctx, img, box) {
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const drawW = Math.max(1, Math.round(img.width * scale));
  const drawH = Math.max(1, Math.round(img.height * scale));
  const x = Math.round(box.x + (box.w - drawW) / 2);
  const y = Math.round(box.y + (box.h - drawH) / 2);
  ctx.drawImage(img, x, y, drawW, drawH);
}

async function buildCoordinateCompositeFile({ topDataUrl, bottomDataUrl, shoesDataUrl = "" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("コーデ画像の生成に失敗しました");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const topImage = await loadImageFromDataUrl(topDataUrl);
  const bottomImage = await loadImageFromDataUrl(bottomDataUrl);
  const shoesImage = shoesDataUrl ? await loadImageFromDataUrl(shoesDataUrl) : null;

  drawContain(ctx, topImage, { x: 120, y: 70, w: 1296, h: 860 });
  drawContain(ctx, bottomImage, { x: 150, y: 860, w: 1236, h: 760 });
  if (shoesImage) {
    drawContain(ctx, shoesImage, { x: 300, y: 1590, w: 936, h: 380 });
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("コーデ画像の生成に失敗しました");
  return new File([blob], `styling-${Date.now()}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

async function buildCoordinateCompositeFromList(dataUrls = []) {
  const cleanUrls = (dataUrls || []).filter(Boolean).slice(0, 4);
  if (cleanUrls.length === 0) throw new Error("コーデに使う画像を選択してください");
  const images = await Promise.all(cleanUrls.map((url) => loadImageFromDataUrl(url)));
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("コーデ画像の生成に失敗しました");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (images.length === 1) {
    drawContain(ctx, images[0], { x: 70, y: 70, w: 1396, h: 1908 });
    const blobSingle = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blobSingle) throw new Error("コーデ画像の生成に失敗しました");
    return new File([blobSingle], `styling-${Date.now()}.png`, {
      type: "image/png",
      lastModified: Date.now(),
    });
  }

  const cells = [
    { x: 60, y: 60, w: 678, h: 924 },
    { x: 798, y: 60, w: 678, h: 924 },
    { x: 60, y: 1064, w: 678, h: 924 },
    { x: 798, y: 1064, w: 678, h: 924 },
  ];
  images.forEach((img, idx) => drawContain(ctx, img, cells[idx]));

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("コーデ画像の生成に失敗しました");
  return new File([blob], `styling-${Date.now()}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

async function buildCompositeFilesFromEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  if (entries.length > 4) {
    throw new Error("複数商品の一発生成は最大4枚までです。");
  }
  const dataUrls = await Promise.all(entries.map(async (entry) => fileToDataUrl(entry.file)));
  const composite = await buildCoordinateCompositeFromList(dataUrls);
  const renamed = new File([composite], "bundle-01.png", {
    type: composite.type || "image/png",
    lastModified: Date.now(),
  });
  return [{ id: `bundle_${Date.now()}_1`, file: renamed }];
}

async function createFileFromPublicPath(path, fallbackName) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`sample fetch failed: ${path}`);
  const blob = await response.blob();
  const inferredName = path.split("/").pop() || fallbackName;
  return new File([blob], inferredName, { type: blob.type || "image/png", lastModified: Date.now() });
}

function readAssetLibrary(userId) {
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

function writeAssetLibrary(userId, payload) {
  if (!userId) return;
  const storageKey = `${ASSET_STORAGE_PREFIX}:${userId}`;
  const isDataUrl = (value) => typeof value === "string" && value.startsWith("data:");
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));
  const trimByCount = (arr, count) => (Array.isArray(arr) ? arr.slice(0, count) : []);
  const stripHeavyFields = (asset) => {
    const next = { ...(asset || {}) };
    if (isDataUrl(next.dataUrl)) next.dataUrl = "";
    if (isDataUrl(next.outputUrl)) next.outputUrl = "";
    if (isDataUrl(next.faceReferenceDataUrl)) next.faceReferenceDataUrl = "";
    return next;
  };

  const full = clone(payload);
  const noFaceRef = clone(payload);
  noFaceRef.models = (noFaceRef.models || []).map((asset) => ({ ...asset, faceReferenceDataUrl: "" }));
  const strippedDataUrls = clone(payload);
  strippedDataUrls.studio = (strippedDataUrls.studio || []).map(stripHeavyFields);
  strippedDataUrls.models = (strippedDataUrls.models || []).map(stripHeavyFields);
  strippedDataUrls.products = (strippedDataUrls.products || []).map(stripHeavyFields);
  const compact40 = {
    studio: trimByCount((strippedDataUrls.studio || []), 40),
    models: trimByCount((strippedDataUrls.models || []), 40),
    products: trimByCount((strippedDataUrls.products || []), 80),
  };
  const compact20 = {
    studio: trimByCount((compact40.studio || []), 20),
    models: trimByCount((compact40.models || []), 20),
    products: trimByCount((compact40.products || []), 40),
  };
  const attempts = [full, noFaceRef, strippedDataUrls, compact40, compact20, { studio: [], models: [], products: [] }];

  for (const nextPayload of attempts) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextPayload));
      return;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
        console.error("[writeAssetLibrary] failed", error);
        return;
      }
    }
  }
  console.warn("[writeAssetLibrary] skipped due to quota limits");
}

function mergeDefaultStudioAssets(studioAssets = []) {
  const existing = Array.isArray(studioAssets) ? studioAssets : [];
  const favoriteMap = new Map(existing.map((asset) => [asset.id, Boolean(asset.favorite)]));
  const nonBuiltIn = existing.filter((asset) => !DEFAULT_STUDIO_ASSETS.some((base) => base.id === asset.id));
  const mergedBuiltIn = DEFAULT_STUDIO_ASSETS.map((base) => ({
    ...base,
    favorite: favoriteMap.get(base.id) || false,
  }));
  return [...mergedBuiltIn, ...nonBuiltIn.map((asset) => ({ ...asset, builtIn: false }))];
}

function mergeDefaultModelAssets(modelAssets = []) {
  const existing = Array.isArray(modelAssets) ? modelAssets : [];
  const existingMap = new Map(existing.map((asset) => [asset.id, asset]));
  const defaultModelUrls = new Set(DEFAULT_MODEL_ASSETS.map((asset) => String(asset.outputUrl || "")));
  const legacyDefaultUrls = new Set(["/mannequin.png", "/ghost.png", "/m0.1.png", "/m0.2.png"]);
  const nonBuiltIn = existing.filter((asset) => (
    !DEFAULT_MODEL_ASSETS.some((base) => base.id === asset.id)
    && !defaultModelUrls.has(String(asset.outputUrl || ""))
    && !legacyDefaultUrls.has(String(asset.outputUrl || ""))
  ));
  const mergedBuiltIn = DEFAULT_MODEL_ASSETS.map((base) => ({
    ...base,
    favorite: Boolean(existingMap.get(base.id)?.favorite),
    faceReferenceDataUrl: String(existingMap.get(base.id)?.faceReferenceDataUrl || ""),
    faceReferenceName: String(existingMap.get(base.id)?.faceReferenceName || ""),
  }));
  return [...mergedBuiltIn, ...nonBuiltIn.map((asset) => ({ ...asset, builtIn: false }))];
}

function mergeProductAssets(productAssets = []) {
  const existing = Array.isArray(productAssets) ? productAssets : [];
  return existing.map((asset) => ({
    ...asset,
    category: PRODUCT_CATEGORY_OPTIONS.some((opt) => opt.id === asset.category) ? asset.category : "unassigned",
    builtIn: false,
  }));
}

function UploadZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef();

  const isAllowedFile = useCallback((file) => {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".zip")) return true;
    if (/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name)) return true;
    return (file.type || "").startsWith("image/");
  }, []);

  const handle = useCallback((files) => {
    onFiles(files.filter((f) => isAllowedFile(f)));
  }, [isAllowedFile, onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(Array.from(e.dataTransfer.files)); }}
      onClick={() => ref.current?.click()}
      style={{
        border: `1.5px dashed ${dragging ? C.goldBorder : C.border}`,
        background: dragging ? C.goldLight : C.bg,
        borderRadius: 2, padding: "52px 32px",
        textAlign: "center", cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      <input ref={ref} type="file" multiple accept="image/*,.zip,application/zip" style={{ display: "none" }}
        onChange={(e) => handle(Array.from(e.target.files))} />
      {/* Corner marks */}
      {[
        { top: 12, left: 12 }, { top: 12, right: 12 },
        { bottom: 12, left: 12 }, { bottom: 12, right: 12 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: "absolute", width: 14, height: 14,
          borderColor: C.goldBorder, borderStyle: "solid",
          borderWidth: `${i < 2 ? 1 : 0}px 0 ${i >= 2 ? 1 : 0}px`,
          borderLeftWidth: i % 2 === 0 ? 1 : 0,
          borderRightWidth: i % 2 === 1 ? 1 : 0,
          ...pos,
        }} />
      ))}
      <div style={{ fontSize: 28, color: C.gold, marginBottom: 12, fontFamily: SERIF }}>+</div>
      <p style={{ fontFamily: SERIF, fontSize: 19, color: C.text, marginBottom: 6, letterSpacing: "0.03em" }}>
        画像をドロップ、またはクリックして選択
      </p>
      <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        JPG · PNG · WEBP · HEIC · ZIP — iPhone写真サイズ対応
      </p>
      <p style={{ fontSize: 11, color: C.textSub, marginTop: 7 }}>
        複数画像は最大4枚を1枚のコラージュに合成して送信します。
      </p>
    </div>
  );
}

function ImageCard({
  entry,
  status,
  onRetryPreview,
  onRemove,
  selectable = false,
  selected = false,
  onSelect,
  selectLockedMessage = "",
  canRemove = true,
  sampleCaption = "",
}) {
  const { file, previewUrl, localPreviewUrl, previewLoading, previewError } = entry;
  const isZip = file.name.toLowerCase().endsWith(".zip");
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei(c|f)/i.test(file.type || "");
  const extLabel = (file.name.split(".").pop() || "FILE").toUpperCase();
  const [imgLoadError, setImgLoadError] = useState(false);
  const previewSrc = previewUrl || localPreviewUrl || "";

  const cfg = {
    waiting: { label: "未生成", color: C.textSub, bg: C.borderLight },
    queued: { label: "キュー待ち", color: C.textSub, bg: C.borderLight },
    processing: { label: "生成中", color: C.gold, bg: C.goldLight },
    done: { label: "完了", color: C.green, bg: C.greenLight },
    error: { label: "エラー", color: C.red, bg: C.redLight },
  }[status] || { label: "待機", color: C.textSub, bg: C.borderLight };

  return (
    <div
      onClick={() => onSelect?.(entry)}
      style={{
        background: C.surface,
        border: `1px solid ${selected ? C.goldBorder : C.border}`,
        borderRadius: 1,
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
        boxShadow: selected ? "0 0 0 1px rgba(184,155,106,0.45), 0 0 14px rgba(184,155,106,0.2)" : "none",
      }}
    >
      <div style={{ aspectRatio: "3/4", position: "relative", background: C.bg }}>
        {canRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.textMid,
              fontSize: 12,
              lineHeight: "20px",
              textAlign: "center",
              cursor: "pointer",
              zIndex: 2,
            }}
            aria-label="この画像を削除"
            title="削除"
          >
            ×
          </button>
        )}
        {selected && (
          <div style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 2,
            border: `1px solid ${C.goldBorder}`,
            background: C.goldLight,
            color: C.text,
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
          }}
          >
            選択中
          </div>
        )}
        {isZip ? (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ fontSize: 30, color: C.gold }}>ZIP</div>
            <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>Bulk Upload</p>
          </div>
        ) : (!previewSrc || (previewLoading && (isHeic || imgLoadError))) ? (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 8, textAlign: "center" }}>
            <div style={{ width: 24, height: 24, border: `1.5px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
              {isHeic ? "HEICを変換中..." : "プレビューを準備中..."}
            </p>
          </div>
        ) : imgLoadError ? (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: 8, textAlign: "center" }}>
            <div style={{ fontSize: 26, color: C.textSub }}>{extLabel}</div>
            <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
              プレビューを表示できません
              <br />
              {previewError ? "再試行できます" : "生成処理は実行できます"}
            </p>
            {previewError && (
              <button
                onClick={() => onRetryPreview(entry.id)}
                style={{
                  fontSize: 10,
                  padding: "5px 8px",
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  cursor: "pointer",
                }}
              >
                再試行
              </button>
            )}
          </div>
        ) : (
          <img
            src={previewSrc}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onLoad={() => setImgLoadError(false)}
            onError={() => setImgLoadError(true)}
          />
        )}
        {status === "processing" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(184,148,60,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, border: `1.5px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
        {status === "done" && (
          <div style={{ position: "absolute", top: 8, left: 8, width: 22, height: 22, background: C.green, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, zIndex: 2 }}>✓</div>
        )}
        {sampleCaption && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.72) 56%, rgba(0,0,0,0.88) 100%)",
              color: "#f5f5f5",
              padding: "18px 10px 8px",
              fontSize: 10,
              lineHeight: 1.45,
              zIndex: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.45)",
            }}
          >
            {sampleCaption}
          </div>
        )}
        {selectLockedMessage && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            textAlign: "center",
            pointerEvents: "none",
          }}
          >
            <p style={{ fontSize: 10, color: C.red, lineHeight: 1.45, fontWeight: 600 }}>
              {selectLockedMessage}
            </p>
          </div>
        )}
      </div>
      <div style={{ padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
          {file.name}
        </span>
        <Tag color={cfg.color} bg={cfg.bg}>{cfg.label}</Tag>
      </div>
      {selectable && !selected && (
        <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.textSub }}>
          クリックして選択
        </div>
      )}
      {previewError && (
        <div style={{ padding: "0 10px 8px", fontSize: 10, color: C.red, lineHeight: 1.45 }}>
          {previewError.length > 90 ? `${previewError.slice(0, 90)}...` : previewError}
        </div>
      )}
    </div>
  );
}

function UploadPage({ user, jobs, onDataRefresh, onJobCreated, studioAssets = [], modelAssets = [], productAssets = [], isMobile = false, isActive = true }) {
  const mobileLayerRoot = typeof document !== "undefined" ? document.body : null;
  const lookFileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [selectedDemoInputId, setSelectedDemoInputId] = useState("");
  const [style, setStyle] = useState("torso");
  const [backgroundMode, setBackgroundMode] = useState("solid");
  const [backgroundColorId, setBackgroundColorId] = useState("white");
  const [targetGender, setTargetGender] = useState("mens");
  const [orientation, setOrientation] = useState("auto");
  const [framing, setFraming] = useState("focus");
  const [outputPreset, setOutputPreset] = useState("oneOne");
  const [ratioPickerOpen, setRatioPickerOpen] = useState(false);
  const [generationQuality, setGenerationQuality] = useState("standard");
  const [modelDevPipeline, setModelDevPipeline] = useState("auto");
  const [forceTryonV16Basic, setForceTryonV16Basic] = useState(false);
  const [outputQuality, setOutputQuality] = useState("standard");
  const [backgroundInPrompt, setBackgroundInPrompt] = useState(false);
  const [targetHelpOpen, setTargetHelpOpen] = useState(false);
  const [framingHelpOpen, setFramingHelpOpen] = useState(false);
  const [orientationHelpOpen, setOrientationHelpOpen] = useState(false);
  const [orientationPickerOpen, setOrientationPickerOpen] = useState(false);
  const [ratioHelpOpen, setRatioHelpOpen] = useState(false);
  const [generationModeHelpOpen, setGenerationModeHelpOpen] = useState(false);
  const [qualityHelpOpen, setQualityHelpOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [lookFilter, setLookFilter] = useState("all");
  const [lookSelectedIds, setLookSelectedIds] = useState([]);
  const [lookLocalAssets, setLookLocalAssets] = useState([]);
  const [lookFocusHintPrompt, setLookFocusHintPrompt] = useState("");
  const [lookError, setLookError] = useState("");
  const [modelRunStrategy, setModelRunStrategy] = useState("auto");
  const [backgroundAssetId, setBackgroundAssetId] = useState("");
  const [backgroundReferenceMode, setBackgroundReferenceMode] = useState("studio");
  const [randomBackgroundPrompt, setRandomBackgroundPrompt] = useState("");
  const [modelAssetId, setModelAssetId] = useState("");
  const [modelReferenceMode, setModelReferenceMode] = useState("image");
  const [randomModelPrompt, setRandomModelPrompt] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [favoriteOnlyModel, setFavoriteOnlyModel] = useState(false);
  const [favoriteOnlyBackground, setFavoriteOnlyBackground] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [demoResultVisible, setDemoResultVisible] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [optimisticEntryStatus, setOptimisticEntryStatus] = useState({});
  const previewQueueRef = useRef([]);
  const previewActiveRef = useRef(0);
  const targetHelpRef = useRef(null);
  const framingHelpRef = useRef(null);
  const orientationHelpRef = useRef(null);
  const orientationPickerRef = useRef(null);
  const ratioHelpRef = useRef(null);
  const ratioPickerRef = useRef(null);
  const generationModeHelpRef = useRef(null);
  const qualityHelpRef = useRef(null);

  useEffect(() => {
    if (!isMobile && mobileSettingsOpen) setMobileSettingsOpen(false);
  }, [isMobile, mobileSettingsOpen]);

  const availableStyleOptions = useMemo(
    () => (user?.isDemo
      ? STYLE_OPTIONS.filter((opt) => ["torso", "mannequin", "hanger", "ghost", "model", "custom"].includes(opt.id))
      : STYLE_OPTIONS),
    [user?.isDemo],
  );
  const activeStyle = availableStyleOptions.some((opt) => opt.id === style)
    ? style
    : (availableStyleOptions[0]?.id || "torso");
  const selectedStyleFromActive = availableStyleOptions.find((opt) => opt.id === activeStyle) || availableStyleOptions[0] || STYLE_OPTIONS[0];
  const outputPresetLabel = (OUTPUT_RATIO_OPTIONS.find((opt) => opt.id === outputPreset)?.label) || "1:1（デフォルト）";
  const activeJob = jobs.find((job) => job.id === currentJobId) || null;
  const hasInFlightJob = Boolean(
    activeJob
      && (
        activeJob.status === "queued"
        || activeJob.status === "processing"
        || (Array.isArray(activeJob.items)
          && activeJob.items.some((item) => item.status === "queued" || item.status === "processing"))
      ),
  );
  const running = Boolean(
    activeJob && Array.isArray(activeJob.items)
      && activeJob.items.some((item) => item.status === "queued" || item.status === "processing"),
  );
  const done = activeJob ? activeJob.items.filter((item) => item.status === "done").length : 0;
  const failed = activeJob ? activeJob.items.filter((item) => item.status === "error") : [];
  const selectedBackground = studioAssets.find((asset) => asset.id === backgroundAssetId) || null;
  const selectedBackgroundColor = SOLID_BACKGROUND_COLORS.find((c) => c.id === backgroundColorId) || SOLID_BACKGROUND_COLORS[0];
  const selectedModel = modelAssets.find((asset) => asset.id === modelAssetId) || null;
  const useRandomModelReference = style === "model" && modelReferenceMode === "random";
  const favoriteModels = modelAssets.filter((asset) => asset.favorite);
  const favoriteBackgrounds = studioAssets.filter((asset) => asset.favorite);
  const selectableModels = user?.isDemo
    ? modelAssets
    : (favoriteOnlyModel && favoriteModels.length > 0 ? favoriteModels : modelAssets);
  const selectableBackgrounds = user?.isDemo
    ? studioAssets
    : (favoriteOnlyBackground && favoriteBackgrounds.length > 0 ? favoriteBackgrounds : studioAssets);
  const highQualityEnabledPlans = new Set(["growth", "business", "enterprise", "custom", "standard", "pro"]);
  const canUseHighQuality = !user?.isDemo && highQualityEnabledPlans.has(String(user?.plan || "").toLowerCase());
  const selectedInputFiles = useMemo(() => {
    const base = user?.isDemo
      ? files.filter((entry) => entry.source === "sample" && entry.id === selectedDemoInputId)
      : files;
    if (!user?.isDemo && style === "hanger" && base.length > 1) {
      // Hanger mode supports single-item generation only.
      return [base[base.length - 1]];
    }
    return base;
  }, [files, selectedDemoInputId, style, user?.isDemo]);
  const demoSampleCount = useMemo(
    () => files.filter((entry) => entry.source === "sample").length,
    [files],
  );
  const demoGeneratedItems = useMemo(() => {
    if (!user?.isDemo) return [];
    return jobs
      .flatMap((job) => (
        (job.items || [])
          .filter((item) => item.status === "done" && item.outputUrl)
          .map((item) => ({
            ...item,
            jobCreatedAt: job.createdAt,
          }))
      ))
      .sort((a, b) => +new Date(b.jobCreatedAt || 0) - +new Date(a.jobCreatedAt || 0));
  }, [jobs, user?.isDemo]);
  const latestDemoGeneratedItem = demoGeneratedItems[0] || null;
  const demoAllowedOrientationIds = useMemo(() => {
    if (!user?.isDemo) return ORIENTATION_OPTIONS.map((opt) => opt.id);
    return DEMO_ALLOWED_ORIENTATIONS_BY_SAMPLE[selectedDemoInputId] || ["front", "front45"];
  }, [selectedDemoInputId, user?.isDemo]);
  const requiresModelReference = style === "model";
  const requiresImageModelReference = requiresModelReference && !useRandomModelReference;
  const selectedInputUnitCount = selectedInputFiles.reduce((sum, entry) => (
    sum + (entry.file.name.toLowerCase().endsWith(".zip") ? 10 : 1)
  ), 0);
  const generationImageCount = selectedInputFiles.length;
  const generationInputReady = selectedInputFiles.length > 0;
  const hasLookCompositeInput = selectedInputFiles.some((entry) => /^styling-\d+\.png$/i.test(String(entry?.file?.name || "")));
  const usePromptBackground = activeStyle === "custom" && backgroundInPrompt;
  const useRandomBackgroundReference = !usePromptBackground
    && backgroundMode === "image"
    && backgroundReferenceMode === "random";
  const effectiveBackgroundMode = usePromptBackground ? "solid" : backgroundMode;
  const effectiveBackgroundReference = (usePromptBackground || useRandomBackgroundReference)
    ? ""
    : (selectedBackground?.outputUrl || selectedBackground?.dataUrl || "");
  const normalizedRandomBackgroundPrompt = String(randomBackgroundPrompt || "").trim();
  const shouldApplyLookFocusHint = framing === "focus"
    && (activeStyle === "torso" || activeStyle === "mannequin" || activeStyle === "model")
    && hasLookCompositeInput
    && String(lookFocusHintPrompt || "").trim().length > 0;
  const combinedCustomPrompt = [
    String(customPrompt || "").trim(),
    shouldApplyLookFocusHint ? lookFocusHintPrompt : "",
    (useRandomBackgroundReference && normalizedRandomBackgroundPrompt)
      ? `Background requirements: ${normalizedRandomBackgroundPrompt}`
      : "",
  ].filter(Boolean).join("\n");
  const lookFilteredAssets = useMemo(() => {
    if (lookFilter === "all") return productAssets;
    return productAssets.filter((asset) => String(asset.category || "unassigned") === lookFilter);
  }, [lookFilter, productAssets]);

  useEffect(() => {
    if ((!requiresModelReference || useRandomModelReference) && modelAssetId) {
      setModelAssetId("");
    }
  }, [requiresModelReference, useRandomModelReference, modelAssetId]);

  useEffect(() => {
    const idSet = new Set((productAssets || []).map((asset) => asset.id));
    setLookSelectedIds((prev) => prev.filter((id) => (id.startsWith("look_local_") || idSet.has(id))));
  }, [productAssets]);

  useEffect(() => {
    if (style !== "model" && forceTryonV16Basic) {
      setForceTryonV16Basic(false);
    }
    if (style !== "model" && modelDevPipeline !== "auto") {
      setModelDevPipeline("auto");
    }
  }, [forceTryonV16Basic, modelDevPipeline, style]);

  useEffect(() => {
    if (style === "model") {
      if (useRandomModelReference) {
        setModelRunStrategy("product-to-model");
        setForceTryonV16Basic(false);
        return;
      }
      if (modelDevPipeline === "tryon-v1.6") {
        setModelRunStrategy("tryon-v1.6");
        setForceTryonV16Basic(true);
        return;
      }
      if (modelDevPipeline === "tryon-max") {
        setModelRunStrategy("tryon-max");
        setForceTryonV16Basic(false);
        return;
      }
      if (modelDevPipeline === "product-to-model-model") {
        setModelRunStrategy("product-to-model");
        setForceTryonV16Basic(false);
        return;
      }
      setForceTryonV16Basic(false);
      if (generationQuality === "highDetail") {
        setModelRunStrategy("tryon-max");
        return;
      }
      const hasModelExtraTryonInstructions = Boolean(String(customPrompt || "").trim())
        || orientation !== "front"
        || framing !== "focus";
      setModelRunStrategy(hasModelExtraTryonInstructions ? "tryon-max" : "tryon-v1.6");
      return;
    }
    if (style === "torso" || style === "mannequin" || style === "hanger") {
      setModelRunStrategy(generationQuality === "highDetail" ? "tryon-max" : "product-to-model");
      return;
    }
    if (modelRunStrategy !== "auto") setModelRunStrategy("auto");
  }, [customPrompt, forceTryonV16Basic, framing, generationQuality, modelDevPipeline, modelRunStrategy, orientation, style, useRandomModelReference]);

  useEffect(() => {
    if (!user?.isDemo) return;
    if (!requiresImageModelReference) return;
    if (modelAssetId && DEMO_ALLOWED_MODEL_IDS.has(modelAssetId)) return;
    const fallback = modelAssets.find((asset) => DEMO_ALLOWED_MODEL_IDS.has(asset.id));
    if (fallback) setModelAssetId(fallback.id);
  }, [modelAssetId, modelAssets, requiresImageModelReference, user?.isDemo]);

  useEffect(() => {
    if (style !== "model" && modelReferenceMode !== "image") {
      setModelReferenceMode("image");
    }
  }, [modelReferenceMode, style]);

  useEffect(() => {
    if (activeStyle !== style) {
      setStyle(activeStyle);
    }
  }, [activeStyle, style]);

  useEffect(() => {
    if (style === "torso" || style === "mannequin" || style === "model" || style === "hanger") {
      setFraming("focus");
      return;
    }
    setFraming("full");
  }, [style]);

  useEffect(() => {
    if (backgroundMode === "solid" && backgroundAssetId) {
      setBackgroundAssetId("");
    }
  }, [backgroundMode, backgroundAssetId]);

  useEffect(() => {
    if (backgroundMode !== "image" && backgroundReferenceMode !== "studio") {
      setBackgroundReferenceMode("studio");
    }
  }, [backgroundMode, backgroundReferenceMode]);

  useEffect(() => {
    if (activeStyle !== "custom" && backgroundInPrompt) {
      setBackgroundInPrompt(false);
    }
  }, [activeStyle, backgroundInPrompt]);

  useEffect(() => {
    if (!user?.isDemo) return;
    if (!DEMO_ALLOWED_SOLID_COLOR_IDS.has(backgroundColorId)) {
      setBackgroundColorId("white");
    }
  }, [backgroundColorId, user?.isDemo]);

  useEffect(() => {
    if (!user?.isDemo) return;
    if (backgroundMode === "image" && backgroundAssetId && !DEMO_ALLOWED_BACKGROUND_IDS.has(backgroundAssetId)) {
      setBackgroundAssetId("bg1");
    }
  }, [backgroundAssetId, backgroundMode, user?.isDemo]);

  useEffect(() => {
    if (!canUseHighQuality && outputQuality === "high") {
      setOutputQuality("standard");
    }
  }, [canUseHighQuality, outputQuality]);

  useEffect(() => {
    if (!user?.isDemo) return;
    if (demoAllowedOrientationIds.includes(orientation)) return;
    setOrientation(demoAllowedOrientationIds[0] || "front");
  }, [demoAllowedOrientationIds, orientation, user?.isDemo]);

  useEffect(() => {
    if (user?.isDemo && outputPreset !== "fourThree") {
      setOutputPreset("fourThree");
    }
  }, [outputPreset, user?.isDemo]);

  useEffect(() => {
    if (!targetHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = targetHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setTargetHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [targetHelpOpen]);

  useEffect(() => {
    if (!framingHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = framingHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setFramingHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [framingHelpOpen]);

  useEffect(() => {
    if (!orientationHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = orientationHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setOrientationHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [orientationHelpOpen]);

  useEffect(() => {
    if (!orientationPickerOpen) return undefined;
    const onPointerDown = (e) => {
      const root = orientationPickerRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setOrientationPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [orientationPickerOpen]);

  useEffect(() => {
    if (!ratioHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = ratioHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setRatioHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [ratioHelpOpen]);

  useEffect(() => {
    if (!qualityHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = qualityHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setQualityHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [qualityHelpOpen]);

  useEffect(() => {
    if (!generationModeHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = generationModeHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setGenerationModeHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [generationModeHelpOpen]);

  useEffect(() => {
    if (!ratioPickerOpen) return undefined;
    const onPointerDown = (e) => {
      const root = ratioPickerRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setRatioPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [ratioPickerOpen]);

  useEffect(() => {
    if (!user?.isDemo) return undefined;
    const existingSampleIds = new Set(
      files.filter((entry) => entry.source === "sample").map((entry) => entry.id),
    );
    const requiredSampleIds = ["demo_sample_1", "demo_sample_2", "demo_sample_3", "demo_sample_4"];
    const hasAllSamples = requiredSampleIds.every((id) => existingSampleIds.has(id));
    if (hasAllSamples) return undefined;

    let cancelled = false;

    const loadDemoSamples = async () => {
      const loaded = [];
      for (let i = 0; i < DEMO_SAMPLE_FILE_CANDIDATES.length; i += 1) {
        const candidates = DEMO_SAMPLE_FILE_CANDIDATES[i];
        for (const path of candidates) {
          try {
            const file = await createFileFromPublicPath(path, `sample${i + 1}.png`);
            loaded.push({
              id: `demo_sample_${i + 1}`,
              file,
              previewUrl: path,
              localPreviewUrl: "",
              previewLoading: false,
              previewError: "",
              source: "sample",
            });
            break;
          } catch {
            // try next extension candidate
          }
        }
      }

      if (cancelled) return;

      setFiles((prev) => {
        const uploads = prev.filter((entry) => entry.source !== "sample");
        return [...loaded, ...uploads];
      });
      setSelectedDemoInputId((prev) => (
        prev && loaded.some((item) => item.id === prev)
          ? prev
          : (loaded[0]?.id || "")
      ));
      if (loaded.length === 0) {
        setError("デモ用サンプル画像が見つかりません。public に sample1 を追加してください。");
      }
    };

    void loadDemoSamples();
    return () => { cancelled = true; };
  }, [files, user?.isDemo]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      pollJob(currentJobId).finally(() => onDataRefresh());
    }, 900);
    return () => clearInterval(timer);
  }, [currentJobId, onDataRefresh, running]);

  useEffect(() => {
    if (!currentJobId) {
      setOptimisticEntryStatus({});
    }
  }, [currentJobId]);

  useEffect(() => {
    const validIds = new Set((files || []).map((entry) => entry.id));
    setOptimisticEntryStatus((prev) => {
      const next = {};
      let changed = false;
      Object.entries(prev || {}).forEach(([id, status]) => {
        if (validIds.has(id)) {
          next[id] = status;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [files]);

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "done" || activeJob.status === "error") {
      setOptimisticEntryStatus({});
      return;
    }
    const refs = new Set((activeJob.items || []).map((item) => String(item.clientRef || "")).filter(Boolean));
    if (refs.size === 0) return;
    setOptimisticEntryStatus((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };
      refs.forEach((id) => {
        if (id in next) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeJob]);

  const createLocalPreview = useCallback(async (entryId, file) => {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    if (isZip) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setFiles((prev) => prev.map((entry) => (
        entry.id === entryId ? { ...entry, localPreviewUrl: dataUrl } : entry
      )));
    } catch {
      // noop
    }
  }, []);

  const createPreviewIfNeeded = useCallback(async (entryId, file) => {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei(c|f)/i.test(file.type || "");
    if (isZip || !isHeic || !USE_BACKEND_PREVIEW) return;

    setFiles((prev) => prev.map((entry) => (
      entry.id === entryId ? { ...entry, previewLoading: true, previewError: "" } : entry
    )));

    const dataUrl = await fileToDataUrl(file);

    let lastError = "";
    for (let attempt = 0; attempt <= PREVIEW_CONVERT_MAX_RETRY; attempt += 1) {
      try {
        const response = await fetch(`${BACKEND_PREVIEW_BASE_URL}/api/preview/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.previewDataUrl) {
          throw new Error(data?.error || `preview convert failed (${response.status})`);
        }
        setFiles((prev) => prev.map((entry) => (
          entry.id === entryId
            ? { ...entry, previewLoading: false, previewUrl: data.previewDataUrl, previewError: "" }
            : entry
        )));
        return;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "preview convert failed";
        if (attempt < PREVIEW_CONVERT_MAX_RETRY) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    setFiles((prev) => prev.map((entry) => (
      entry.id === entryId
        ? { ...entry, previewLoading: false, previewError: lastError || "preview convert failed" }
        : entry
    )));
  }, []);

  const drainPreviewQueue = useCallback(() => {
    while (
      previewActiveRef.current < PREVIEW_CONVERT_CONCURRENCY
      && previewQueueRef.current.length > 0
    ) {
      const task = previewQueueRef.current.shift();
      if (!task) return;
      previewActiveRef.current += 1;
      void (async () => {
        try {
          await createPreviewIfNeeded(task.entryId, task.file);
        } finally {
          previewActiveRef.current = Math.max(0, previewActiveRef.current - 1);
          drainPreviewQueue();
        }
      })();
    }
  }, [createPreviewIfNeeded]);

  const enqueuePreviewConvert = useCallback((entryId, file, priority = false) => {
    if (priority) previewQueueRef.current.unshift({ entryId, file });
    else previewQueueRef.current.push({ entryId, file });
    drainPreviewQueue();
  }, [drainPreviewQueue]);

  const retryPreview = useCallback((entryId) => {
    const target = files.find((entry) => entry.id === entryId);
    if (!target) return;
    enqueuePreviewConvert(entryId, target.file, true);
  }, [enqueuePreviewConvert, files]);

  const addFiles = (newFiles) => {
    const seen = new Set(files.map((entry) => `${entry.file.name}:${entry.file.size}:${entry.file.lastModified || 0}`));
    const incoming = [];
    newFiles.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified || 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      incoming.push({
        id: `local_${Math.random().toString(36).slice(2, 10)}`,
        file,
        previewUrl: "",
        localPreviewUrl: "",
        previewLoading: false,
        previewError: "",
        source: "upload",
      });
    });

    if (incoming.length === 0) return;
    setSubmitLocked(false);
    setIsSubmitting(false);
    setFiles((prev) => [...prev, ...incoming]);

    incoming.forEach((entry) => {
      void createLocalPreview(entry.id, entry.file);
      enqueuePreviewConvert(entry.id, entry.file);
    });
  };

  const removeFile = (entryId) => {
    setFiles((prev) => {
      const target = prev.find((entry) => entry.id === entryId);
      if (user?.isDemo && target?.source === "sample") return prev;
      const next = prev.filter((entry) => entry.id !== entryId);
      if (next.length === 0) {
        setCurrentJobId(null);
        setError("");
        setSubmitLocked(false);
        setIsSubmitting(false);
      }
      return next;
    });
  };

  const getStatus = (entry) => {
    if (!activeJob) return optimisticEntryStatus[entry.id] || "waiting";
    const item = activeJob.items.find((v) => v.clientRef === entry.id);
    if (item?.status) return item.status;
    return optimisticEntryStatus[entry.id] || "waiting";
  };

  const hasExtraTryonInstructions = useCallback(() => {
    if (String(customPrompt || "").trim()) return true;
    if (orientation !== "front" && orientation !== "auto") return true;
    if (framing !== "focus") return true;
    return false;
  }, [customPrompt, framing, orientation]);

  const resolveEffectiveRunStrategy = useCallback(() => {
    const selected = String(modelRunStrategy || "auto");
    if (activeStyle === "model") {
      if (selected === "product-to-model") return "product-to-model";
      if (selected === "tryon-v1.6" || selected === "tryon-max") return selected;
      return hasExtraTryonInstructions() ? "tryon-max" : "tryon-v1.6";
    }
    if (activeStyle === "torso" || activeStyle === "mannequin") {
      return selected === "tryon-max" ? "tryon-max" : "product-to-model";
    }
    return "product-to-model";
  }, [activeStyle, hasExtraTryonInstructions, modelRunStrategy]);

  const effectiveModelStrategy = resolveEffectiveRunStrategy();
  const qualityExtra = outputQuality === "high"
    && !(effectiveModelStrategy === "tryon-v1.6" || effectiveModelStrategy === "tryon-max")
    ? 1
    : 0;
  const modelReferenceExtra = (requiresImageModelReference && modelAssetId) && activeStyle !== "model" && effectiveModelStrategy !== "tryon-max" ? 1 : 0;
  const backgroundEditExtra = effectiveBackgroundMode === "image" && effectiveBackgroundReference ? 1 : 0;
  const baseCredit = (activeStyle === "model" || effectiveModelStrategy === "tryon-max")
    ? (effectiveModelStrategy === "tryon-max" ? 4 : 1)
    : selectedStyleFromActive.credit;
  const hasZipInSelection = selectedInputFiles.some((entry) => entry.file.name.toLowerCase().endsWith(".zip"));
  const estimateUnitCount = (!user?.isDemo && !hasZipInSelection && selectedInputFiles.length > 1) ? 1 : selectedInputUnitCount;
  const estimateCredits = estimateUnitCount * (baseCredit + qualityExtra + modelReferenceExtra + backgroundEditExtra);

  const run = async () => {
    if (!generationInputReady || running || hasInFlightJob || isSubmitting || submitLocked) return;
    if (user?.isDemo && activeStyle === "custom") {
      setError("カスタムプロンプトは有料プランでのみ利用できます。");
      return;
    }
    if (activeStyle === "custom" && !customPrompt.trim()) {
      setError("カスタムプロンプトを入力してください");
      return;
    }
    if (requiresImageModelReference && !modelAssetId) {
      setError("モデルが選択されていません。モデルを選択してください。");
      return;
    }
    if (effectiveBackgroundMode === "image") {
      if (useRandomBackgroundReference && !normalizedRandomBackgroundPrompt) {
        setError("ランダム背景のプロンプトを入力してください。");
        return;
      }
      if (!useRandomBackgroundReference && !effectiveBackgroundReference) {
        setError("背景画像を選択してください。");
        return;
      }
    }
    if (user?.isDemo && !selectedDemoInputId) {
      setError("デモ用サンプル画像を1枚選択してください。");
      return;
    }
    try {
      setIsSubmitting(true);
      setSubmitLocked(true);
      const pendingEntryIds = selectedInputFiles.map((entry) => entry.id);
      setOptimisticEntryStatus((prev) => ({
        ...(prev || {}),
        ...Object.fromEntries(pendingEntryIds.map((id) => [id, "processing"])),
      }));
      if (user?.isDemo) setDemoResultVisible(true);
      const styleConfig = {
        mode: activeStyle,
        aspectRatio:
          outputPreset === "oneOne" ? "1:1"
            : outputPreset === "fourFive" ? "4:5"
              : outputPreset === "sixteenNine" ? "16:9"
                : outputPreset === "nineSixteen" ? "9:16"
                  : outputPreset === "threeFour" ? "3:4"
                    : outputPreset === "fourThree" ? "4:3"
                      : outputPreset === "twoThree" ? "2:3"
                        : outputPreset === "threeTwo" ? "3:2"
                          : outputPreset === "fiveFour" ? "5:4"
                            : "4:3",
        background: {
          type: useRandomBackgroundReference
            ? "outdoor"
            : (effectiveBackgroundMode === "image" ? "studio" : "solid"),
          color: selectedBackgroundColor.hex,
        },
        targetGender,
        orientation,
        framing,
        lighting: "soft",
        quality: outputQuality,
        preserveDetails: true,
        customPrompt: combinedCustomPrompt,
      };
      const requestBackgroundMode = useRandomBackgroundReference ? "solid" : effectiveBackgroundMode;

      let inputEntries = selectedInputFiles.map((entry) => ({
        id: entry.id,
        file: entry.file,
      }));
      if (!user?.isDemo) {
        const hasZip = inputEntries.some((entry) => entry.file.name.toLowerCase().endsWith(".zip"));
        if (activeStyle !== "hanger" && !hasZip && inputEntries.length > 1) {
          inputEntries = await buildCompositeFilesFromEntries(inputEntries);
        }
      }

      const job = await createJob({
        userId: user.id,
        style: activeStyle,
        outputPreset,
        styleConfig,
        backgroundAssetId: (requestBackgroundMode === "image" && backgroundReferenceMode === "studio") ? (backgroundAssetId || null) : null,
        backgroundMode: requestBackgroundMode,
        backgroundColor: selectedBackgroundColor.hex,
        modelAssetId: requiresImageModelReference ? (modelAssetId || null) : null,
        modelReference: requiresImageModelReference ? (selectedModel?.outputUrl || selectedModel?.dataUrl || "") : "",
        faceReference: "",
        modelRunStrategy,
        forceTryonV16Basic: style === "model" && forceTryonV16Basic,
        useModelImagePrompt: style === "model" && modelDevPipeline === "product-to-model-model" && requiresImageModelReference,
        backgroundReference: requestBackgroundMode === "image" ? effectiveBackgroundReference : "",
        customPrompt: combinedCustomPrompt,
        randomModelPrompt: useRandomModelReference ? randomModelPrompt.trim() : "",
        files: inputEntries.map((entry) => ({
          name: entry.file.name,
          size: entry.file.size,
          type: entry.file.type,
          clientRef: entry.id,
          rawFile: entry.file,
        })),
      });
      if (typeof onJobCreated === "function" && job) {
        onJobCreated(job);
      }
      const itemStatusByClientRef = new Map((job?.items || [])
        .map((item) => [String(item?.clientRef || ""), String(item?.status || "")])
        .filter(([ref]) => Boolean(ref)));
      setOptimisticEntryStatus((prev) => {
        const next = { ...(prev || {}) };
        pendingEntryIds.forEach((id) => {
          const status = itemStatusByClientRef.get(id) || "processing";
          next[id] = status;
        });
        return next;
      });
      setCurrentJobId(job.id);
      setError("");
      await onDataRefresh();
      setSubmitLocked(false);
    } catch (e) {
      const pendingEntryIds = selectedInputFiles.map((entry) => entry.id);
      setOptimisticEntryStatus((prev) => ({
        ...(prev || {}),
        ...Object.fromEntries(pendingEntryIds.map((id) => [id, "error"])),
      }));
      setSubmitLocked(false);
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLookItem = useCallback((assetId) => {
    setLookSelectedIds((prev) => {
      if (!assetId || prev.includes(assetId)) return prev;
      if (prev.length >= 4) return prev;
      return [...prev, assetId];
    });
  }, []);

  const removeLookItem = useCallback((assetId) => {
    setLookSelectedIds((prev) => prev.filter((id) => id !== assetId));
  }, []);

  const clearLookItems = useCallback(() => setLookSelectedIds([]), []);

  const addLookLocalFiles = useCallback(async (newFiles) => {
    const imageFiles = (newFiles || []).filter((file) => (
      (file.type || "").startsWith("image/")
      || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    ));
    if (imageFiles.length === 0) return;
    const converted = await Promise.all(imageFiles.map(async (file, idx) => ({
      id: `look_local_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      name: file.name || `local-${idx + 1}.png`,
      dataUrl: await fileToRenderableDataUrl(file),
    })));
    setLookLocalAssets((prev) => [...converted, ...prev]);
    setLookSelectedIds((prev) => {
      const next = [...prev];
      for (const asset of converted) {
        if (next.length >= 4) break;
        if (!next.includes(asset.id)) next.push(asset.id);
      }
      return next;
    });
  }, []);

  const findLookAsset = useCallback((assetId) => {
    return productAssets.find((asset) => asset.id === assetId)
      || lookLocalAssets.find((asset) => asset.id === assetId)
      || null;
  }, [lookLocalAssets, productAssets]);
  const selectedLookAssets = useMemo(
    () => lookSelectedIds.map((id) => findLookAsset(id)).filter(Boolean),
    [findLookAsset, lookSelectedIds],
  );

  useEffect(() => {
    if (!isMobile || !lookOpen || typeof document === "undefined") return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobile, lookOpen]);

  const createLookInput = useCallback(async () => {
    if (!Array.isArray(lookSelectedIds) || lookSelectedIds.length === 0) {
      setLookError("ルックに使う商品を追加してください。");
      return;
    }
    try {
      setLookError("");
      const selectedAssets = lookSelectedIds
        .map((id) => findLookAsset(id))
        .filter(Boolean);
      const selectedProductCategories = selectedAssets
        .map((asset) => String(asset.category || ""))
        .filter(Boolean);
      if (selectedProductCategories.length > 0) {
        const hasTopLike = selectedProductCategories.some((cat) => cat === "tops" || cat === "jacket");
        const hasBottomLike = selectedProductCategories.some((cat) => cat === "bottoms");
        const hasShoes = selectedProductCategories.some((cat) => cat === "shoes");
        let hint = "";
        if (hasTopLike && !hasBottomLike && !hasShoes) {
          hint = "Framing priority: upper body only. Crop from shoulder to waist/chest area. Avoid full-body composition.";
        } else if (!hasTopLike && (hasBottomLike || hasShoes)) {
          hint = "Framing priority: lower body only. Crop from waist to ankle/feet area. Avoid full-body composition.";
        }
        setLookFocusHintPrompt(hint);
      } else {
        setLookFocusHintPrompt("");
      }
      const urls = selectedAssets
        .map((asset) => asset.outputUrl || asset.dataUrl || "")
        .filter(Boolean);
      const lookFile = await buildCoordinateCompositeFromList(urls);
      addFiles([lookFile]);
      setLookSelectedIds([]);
      setLookLocalAssets([]);
      setLookOpen(false);
    } catch (e) {
      setLookError(e instanceof Error ? e.message : "ルック作成に失敗しました");
    }
  }, [addFiles, findLookAsset, lookSelectedIds]);

  const handleRetry = async () => {
    if (!activeJob) return;
    try {
      await retryJob(activeJob.id, (activeJob.retryAttempt || 0) + 1);
      setError("");
      await onDataRefresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>
          Look Generation
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, color: C.text, lineHeight: 1.15, marginBottom: 10 }}>
          ルック生成
        </h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7 }}>
          平置きやハンガーにかかった状態の服の画像を用意するだけで、プロ品質のファッションEC用画像やモデル着用画像を生成します。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1fr 300px", gap: isMobile ? 18 : 28, position: "relative" }}>
        <div>
          {user?.isDemo ? (
            <UploadZone onFiles={addFiles} />
          ) : (
            <div
              onClick={() => setLookOpen(true)}
              style={{
                border: `1.5px dashed ${C.border}`,
                background: C.surface,
                borderRadius: 2,
                padding: "52px 32px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
              }}
            >
              {[
                { top: 12, left: 12 }, { top: 12, right: 12 },
                { bottom: 12, left: 12 }, { bottom: 12, right: 12 },
              ].map((pos, i) => (
                <div key={`look_corner_${i}`} style={{
                  position: "absolute", width: 14, height: 14,
                  borderColor: C.goldBorder, borderStyle: "solid",
                  borderWidth: `${i < 2 ? 1 : 0}px 0 ${i >= 2 ? 1 : 0}px`,
                  borderLeftWidth: i % 2 === 0 ? 1 : 0,
                  borderRightWidth: i % 2 === 1 ? 1 : 0,
                  ...pos,
                }} />
              ))}
              <div style={{ fontSize: 28, color: C.gold, marginBottom: 12, fontFamily: SERIF }}>+</div>
              <p style={{ fontFamily: SERIF, fontSize: 19, color: C.text, marginBottom: 6, letterSpacing: "0.03em" }}>
                スタイリング
              </p>
              <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                商品画像を選んで、最大4点まで組み合わせて生成できます。
                <br />
                ディテール重視の場合は、1点ずつの生成が最適です。
              </p>
            </div>
          )}
          {user?.isDemo && demoResultVisible && (
            <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.border}`, padding: 12 }}>
              <p style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>デモ生成結果</p>
              {running ? (
                <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: 24, height: 24, border: `1.5px solid ${C.gold}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <p style={{ fontSize: 11, color: C.textSub }}>生成中... 約5秒で結果が表示されます</p>
                </div>
              ) : latestDemoGeneratedItem ? (
                <div style={{ background: C.bg, border: `1px solid ${C.borderLight}` }}>
                  <div style={{ aspectRatio: "3/4", background: C.borderLight }}>
                    <img
                      src={latestDemoGeneratedItem.outputUrl}
                      alt={latestDemoGeneratedItem.outputName || latestDemoGeneratedItem.name || "demo result"}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                  <div style={{ padding: "7px 9px", borderTop: `1px solid ${C.borderLight}` }}>
                    <p style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {latestDemoGeneratedItem.outputName || latestDemoGeneratedItem.name || "生成結果"}
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 11, color: C.textSub }}>まだ生成結果がありません</p>
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {generationImageCount} / {files.length} ファイル選択中{done > 0 ? ` — ${done} 件完了` : ""}
                </span>
                <button
                  onClick={() => {
                    if (user?.isDemo) {
                      setFiles((prev) => prev.filter((entry) => entry.source === "sample"));
                    } else {
                      setFiles([]);
                    }
                    setCurrentJobId(null);
                    setError("");
                    setSubmitLocked(false);
                    setIsSubmitting(false);
                  }}
                  style={{ fontSize: 11, color: C.textSub, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  {user?.isDemo ? "追加画像を削除" : "すべて削除"}
                </button>
              </div>
              {user?.isDemo && (
                <p style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>
                  サンプル画像の中から1枚を選択してください。（現在 {demoSampleCount} 枚）
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(136px, 1fr))", gap: 10 }}>
                {files.map((entry) => (
                  <ImageCard
                    key={entry.id}
                    entry={entry}
                    status={getStatus(entry)}
                    onRetryPreview={retryPreview}
                    onRemove={removeFile}
                    selectable={Boolean(user?.isDemo && entry.source === "sample")}
                    selected={Boolean(user?.isDemo && entry.id === selectedDemoInputId)}
                    canRemove={!user?.isDemo || entry.source !== "sample"}
                    onSelect={user?.isDemo ? (clicked) => {
                      if (clicked.source === "sample") {
                        setSelectedDemoInputId(clicked.id);
                        setError("");
                        return;
                      }
                      setError("デモ版ではサンプル画像のみ生成に使用できます。自社製品で試す場合は会員登録後に選択できます。");
                    } : undefined}
                    selectLockedMessage={user?.isDemo && entry.source !== "sample" ? "会員登録後に選択できます" : ""}
                    sampleCaption={user?.isDemo && entry.source === "sample" ? DEMO_SAMPLE_CAPTIONS[entry.id] || "" : ""}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <MobileFixedLayer active={isMobile && isActive}>
        <>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          ...(isMobile ? {
            pointerEvents: mobileSettingsOpen ? "auto" : "none",
            position: "fixed",
            top: 0,
            right: 0,
            width: "min(360px, 88vw)",
            height: "100dvh",
            padding: "18px 14px 22px",
            background: C.bg,
            borderLeft: `1px solid ${C.border}`,
            boxShadow: "-20px 0 40px rgba(25,18,10,0.16)",
            overflowY: "auto",
            zIndex: 1200,
            transform: mobileSettingsOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform 0.24s ease",
          } : {}),
        }}
          data-testid="upload-mobile-settings-sheet"
          data-open={mobileSettingsOpen ? "true" : "false"}
        >
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: -4 }}>
              <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase" }}>ルック生成</p>
              <button
                onClick={() => setMobileSettingsOpen(false)}
                style={{ border: "none", background: "transparent", color: C.textSub, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          )}
          {/* Style */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: 20 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, marginBottom: 14 }}>スタイル</p>
            {availableStyleOptions.map((opt) => (
              <div key={opt.id} onClick={() => setStyle(opt.id)} style={{
                padding: "11px 13px",
                border: `1px solid ${style === opt.id ? C.goldBorder : C.borderLight}`,
                borderRadius: 1, marginBottom: 7, cursor: "pointer",
                background: style === opt.id ? C.goldLight : "transparent",
                transition: "all 0.15s",
              }}>
                {style === opt.id && opt.previewImage ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 140, alignItems: "stretch" }}>
                    <div style={{ paddingRight: 10, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, color: C.gold }}>{opt.icon}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{opt.label}</p>
                          <p style={{ fontSize: 10, color: C.textSub, letterSpacing: "0.06em" }}>{opt.sub}</p>
                        </div>
                      </div>
                      <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6, marginTop: 10 }}>
                        {opt.desc}
                      </p>
                    </div>
                    <div style={{ borderLeft: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: C.bg }}>
                      <img
                        src={opt.previewImage}
                        alt={`${opt.label}イメージ`}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16, color: style === opt.id ? C.gold : C.textSub }}>{opt.icon}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{opt.label}</p>
                        <p style={{ fontSize: 10, color: C.textSub, letterSpacing: "0.06em" }}>{opt.sub}</p>
                      </div>
                    </div>
                    {style === opt.id && (
                      <p style={{ fontSize: 11, color: C.textMid, marginTop: 8, lineHeight: 1.6 }}>{opt.desc}</p>
                    )}
                  </>
                )}
              </div>
            ))}
            {style === "model" && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
                {requiresModelReference && (
                  <>
                    <p style={{ fontSize: 11, color: C.textMid, marginBottom: 6 }}>モデル参照方式</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <button
                        onClick={() => setModelReferenceMode("image")}
                        style={{
                          border: `1px solid ${modelReferenceMode === "image" ? C.goldBorder : C.border}`,
                          background: modelReferenceMode === "image" ? C.goldLight : C.bg,
                          color: modelReferenceMode === "image" ? C.text : C.textSub,
                          fontSize: 11,
                          padding: "8px 10px",
                          cursor: "pointer",
                        }}
                      >
                        モデル画像
                      </button>
                      <button
                        onClick={() => setModelReferenceMode("random")}
                        style={{
                          border: `1px solid ${modelReferenceMode === "random" ? C.goldBorder : C.border}`,
                          background: modelReferenceMode === "random" ? C.goldLight : C.bg,
                          color: modelReferenceMode === "random" ? C.text : C.textSub,
                          fontSize: 11,
                          padding: "8px 10px",
                          cursor: "pointer",
                        }}
                      >
                        モデル生成
                      </button>
                    </div>
                    {useRandomModelReference && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: C.textMid, marginBottom: 6 }}>モデルプロンプト</p>
                        <textarea
                          value={randomModelPrompt}
                          onChange={(e) => setRandomModelPrompt(e.target.value)}
                          rows={4}
                          placeholder="例）20代の日本人女性、ロング黒髪、ナチュラルメイク、スリム体型、落ち着いた表情"
                          style={{
                            width: "100%",
                            resize: "vertical",
                            padding: "10px 12px",
                            border: `1px solid ${C.border}`,
                            background: C.bg,
                            color: C.text,
                            fontSize: 12,
                            lineHeight: 1.6,
                          }}
                        />
                        <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 6 }}>
                          背景参照と一緒に使う場合は、画像参照ではなくこのテキスト指定を使います。
                        </p>
                      </div>
                    )}
                    {!useRandomModelReference && (
                      <>
                    <p style={{ fontSize: 11, color: C.textMid, marginBottom: 6 }}>モデル参照</p>
                    <p style={{ fontSize: 11, color: modelAssetId ? C.textSub : C.red, marginBottom: 8 }}>
                      {modelAssetId ? "モデルを選択済みです。" : "モデルを選択してください。"}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                      {selectableModels.map((asset) => {
                        const selected = modelAssetId === asset.id;
                        const lockedInDemo = Boolean(user?.isDemo && !DEMO_ALLOWED_MODEL_IDS.has(asset.id));
                        return (
                          <button
                            key={asset.id}
                            onClick={() => { if (!lockedInDemo) setModelAssetId(asset.id); }}
                            disabled={lockedInDemo}
                            style={{
                              position: "relative",
                              border: `1px solid ${selected ? C.goldBorder : C.borderLight}`,
                              background: C.surface,
                              cursor: lockedInDemo ? "not-allowed" : "pointer",
                              padding: 0,
                              textAlign: "left",
                              opacity: lockedInDemo ? 0.48 : 1,
                              boxShadow: selected ? "0 0 0 1px rgba(184,155,106,0.45), 0 0 16px rgba(184,155,106,0.28)" : "none",
                              transition: "box-shadow 0.15s, border-color 0.15s",
                            }}
                          >
                            <div style={{ aspectRatio: "3/4", background: C.borderLight }}>
                              <img
                                src={getAssetThumbnailUrl(asset)}
                                alt={asset.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              />
                            </div>
                            <div style={{ padding: "6px 7px" }}>
                              <p style={{ fontSize: 10, color: selected ? C.text : C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {asset.name}
                              </p>
                            </div>
                            {lockedInDemo && (
                              <div style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(255,255,255,0.2)",
                                color: "#6e675c",
                                fontSize: 22,
                                fontWeight: 700,
                                pointerEvents: "none",
                              }}
                              >
                                ×
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {!user?.isDemo && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSub, marginTop: 8 }}>
                        <input
                          type="checkbox"
                          checked={favoriteOnlyModel}
                          onChange={(e) => setFavoriteOnlyModel(e.target.checked)}
                        />
                        お気に入りモデルだけ表示
                      </label>
                    )}
                    {user?.isDemo && (
                      <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5, marginTop: 8 }}>
                        デモ版では標準モデル2人から選択できます。
                      </p>
                    )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {style === "custom" && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
                <p style={{ fontSize: 11, color: C.textMid, marginBottom: 6 }}>カスタムプロンプト</p>
                {user?.isDemo && (
                  <div style={{ background: C.goldLight, border: `1px solid ${C.goldBorder}`, padding: "8px 10px", marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: C.textMid }}>
                      カスタムプロンプトは有料プランでのみ利用できます。
                    </p>
                  </div>
                )}
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={user?.isDemo}
                  rows={7}
                  placeholder={"例）\n20代後半の日本人女性モデル。スリム体型、肩までの黒髪ストレート、ナチュラルメイク、落ち着いた表情。\nこの服をデザイン変更せず正確に着用。\n背景は昼過ぎの公園、柔らかい自然光、奥行きのあるボケ感。\nEC向けの高精細な全身写真、質感を自然に、ロゴや柄の崩れなし。"}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "10px 12px",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    fontSize: 12,
                    lineHeight: 1.6,
                    opacity: user?.isDemo ? 0.6 : 1,
                  }}
                />
                <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 6 }}>
                  カスタム時は、定型文を使わず入力した内容で細かく描写を指定できます。
                </p>
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
              <div ref={targetHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>対象</p>
                <button
                  onClick={() => setTargetHelpOpen((prev) => !prev)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.textSub,
                    fontSize: 11,
                    lineHeight: "16px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ?
                </button>
                {targetHelpOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 8,
                      width: 264,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      padding: 10,
                      zIndex: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>対象について</p>
                      <button onClick={() => setTargetHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                    </div>
                    <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                      メンズ／レディースの選択は、生成されるトルソー／マネキンの体型・肩幅・骨格バランスにも反映されます。
                      <br />
                      服のターゲットに合わせて選択してください。
                      <br />
                      ※衣類自体のデザインは変えません。
                    </p>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => setTargetGender("mens")}
                  style={{
                    border: `1px solid ${targetGender === "mens" ? C.goldBorder : C.border}`,
                    background: targetGender === "mens" ? C.goldLight : C.bg,
                    color: targetGender === "mens" ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "8px 6px",
                    cursor: "pointer",
                  }}
                >
                  メンズ
                </button>
                <button
                  onClick={() => setTargetGender("womens")}
                  style={{
                    border: `1px solid ${targetGender === "womens" ? C.goldBorder : C.border}`,
                    background: targetGender === "womens" ? C.goldLight : C.bg,
                    color: targetGender === "womens" ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "8px 6px",
                    cursor: "pointer",
                  }}
                >
                  レディース
                </button>
              </div>
            </div>
            {(style === "torso" || style === "mannequin" || style === "model") && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
                <div ref={framingHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>出力範囲</p>
                  <button
                    onClick={() => setFramingHelpOpen((prev) => !prev)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.bg,
                      color: C.textSub,
                      fontSize: 11,
                      lineHeight: "16px",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ?
                  </button>
                  {framingHelpOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: 24,
                        right: 8,
                        width: 264,
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                        padding: 10,
                        zIndex: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>出力範囲について</p>
                        <button onClick={() => setFramingHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                      </div>
                      <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                        全体を選ぶと、対象全体が収まる構図を優先します。
                        <br />
                        トルソー：いちばん上から土台まで入るように表示
                        <br />
                        マネキン：頭頂からいちばん下の土台のシルバー部分まで入るように表示
                        <br />
                        商品フォーカスを選ぶと、アイテムが最も見やすい範囲に自動で寄ります。
                        <br />
                        トップス：上半身中心
                        <br />
                        ボトムス：下半身中心
                        <br />
                        靴：足元中心
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {FRAMING_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setFraming(opt.id)}
                      style={{
                        border: `1px solid ${framing === opt.id ? C.goldBorder : C.border}`,
                        background: framing === opt.id ? C.goldLight : C.bg,
                        color: framing === opt.id ? C.text : C.textSub,
                        fontSize: 11,
                        padding: "8px 6px",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
              <div ref={orientationHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>向き</p>
                <button
                  onClick={() => setOrientationHelpOpen((prev) => !prev)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.textSub,
                    fontSize: 11,
                    lineHeight: "16px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ?
                </button>
                {orientationHelpOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 8,
                      width: 264,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      padding: 10,
                      zIndex: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>向きについて</p>
                      <button onClick={() => setOrientationHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                    </div>
                    <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                      選択した角度に合わせて構図を調整します。
                      <br />
                      正面・45°は正面画像のみで生成可能です。
                      <br />
                      背面を再現するときは、商品の背面画像でスタイリングしてください。
                    </p>
                  </div>
                )}
              </div>
              <div ref={orientationPickerRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setOrientationPickerOpen((prev) => !prev)}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                    border: `1px solid ${orientationPickerOpen ? C.goldBorder : C.border}`,
                    background: orientationPickerOpen ? C.goldLight : C.bg,
                    color: C.text,
                    fontSize: 12,
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    letterSpacing: "0.02em",
                  }}
                >
                  <span>{ORIENTATION_OPTIONS.find((opt) => opt.id === orientation)?.label || "正面"}</span>
                  <span style={{ color: C.textSub, fontSize: 11 }}>{orientationPickerOpen ? "▲" : "▼"}</span>
                </button>
                {orientationPickerOpen && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    zIndex: 30,
                    border: `1px solid ${C.goldBorder}`,
                    background: "rgba(248,246,241,0.94)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 14px 28px rgba(56,44,24,0.18)",
                    padding: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                  }}>
                    {ORIENTATION_OPTIONS.map((opt) => {
                      const selected = orientation === opt.id;
                      const lockedInDemo = Boolean(user?.isDemo && !demoAllowedOrientationIds.includes(opt.id));
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            if (lockedInDemo) return;
                            setOrientation(opt.id);
                            setOrientationPickerOpen(false);
                          }}
                          disabled={lockedInDemo}
                          style={{
                            border: `1px solid ${selected ? C.goldBorder : C.border}`,
                            background: selected ? C.goldLight : C.surface,
                            color: selected ? C.text : C.textSub,
                            cursor: lockedInDemo ? "not-allowed" : "pointer",
                            opacity: lockedInDemo ? 0.42 : 1,
                            padding: "10px 8px",
                            textAlign: "left",
                            fontSize: 11,
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {user?.isDemo && (
                <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5, marginTop: 7 }}>
                  デモ版では選択中サンプルに応じた向きのみ選択できます。
                </p>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, marginBottom: 10 }}>
                  背景
                </p>
                {activeStyle === "custom" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.textSub, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={backgroundInPrompt}
                      onChange={(e) => setBackgroundInPrompt(e.target.checked)}
                    />
                    背景はプロンプト内で指定
                  </label>
                )}
                {usePromptBackground && (
                  <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginBottom: 8 }}>
                    背景はカスタムプロンプトの記述を優先します。
                  </p>
                )}
                <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, opacity: usePromptBackground ? 0.45 : 1 }}>
                  <button
                    onClick={() => {
                      if (usePromptBackground) return;
                      setBackgroundMode("solid");
                      setBackgroundReferenceMode("studio");
                    }}
                    style={{
                      border: `1px solid ${backgroundMode === "solid" ? C.goldBorder : C.border}`,
                      background: backgroundMode === "solid" ? C.goldLight : C.bg,
                      color: backgroundMode === "solid" ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "8px 6px",
                      cursor: usePromptBackground ? "not-allowed" : "pointer",
                    }}
                  >
                    単色背景
                  </button>
                  <button
                    onClick={() => {
                      if (usePromptBackground) return;
                      setBackgroundMode("image");
                      setBackgroundReferenceMode("studio");
                    }}
                    style={{
                      border: `1px solid ${backgroundMode === "image" && backgroundReferenceMode === "studio" ? C.goldBorder : C.border}`,
                      background: backgroundMode === "image" && backgroundReferenceMode === "studio" ? C.goldLight : C.bg,
                      color: backgroundMode === "image" && backgroundReferenceMode === "studio" ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "8px 6px",
                      cursor: usePromptBackground ? "not-allowed" : "pointer",
                    }}
                  >
                    背景画像
                  </button>
                  <button
                    onClick={() => {
                      if (usePromptBackground) return;
                      setBackgroundMode("image");
                      setBackgroundReferenceMode("random");
                    }}
                    style={{
                      border: `1px solid ${backgroundMode === "image" && backgroundReferenceMode === "random" ? C.goldBorder : C.border}`,
                      background: backgroundMode === "image" && backgroundReferenceMode === "random" ? C.goldLight : C.bg,
                      color: backgroundMode === "image" && backgroundReferenceMode === "random" ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "8px 6px",
                      cursor: usePromptBackground ? "not-allowed" : "pointer",
                    }}
                  >
                    背景生成
                  </button>
                </div>
                {!usePromptBackground && backgroundMode === "solid" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 }}>
                    {SOLID_BACKGROUND_COLORS.map((color) => {
                      const selected = backgroundColorId === color.id;
                      const lockedInDemo = Boolean(user?.isDemo && !DEMO_ALLOWED_SOLID_COLOR_IDS.has(color.id));
                      return (
                        <button
                          key={color.id}
                          onClick={() => { if (!lockedInDemo) setBackgroundColorId(color.id); }}
                          disabled={lockedInDemo}
                          title={color.label}
                          style={{
                            position: "relative",
                            width: "100%",
                            aspectRatio: "1/1",
                            border: `1px solid ${selected ? C.goldBorder : C.borderLight}`,
                            background: color.hex,
                            cursor: lockedInDemo ? "not-allowed" : "pointer",
                            opacity: lockedInDemo ? 0.35 : 1,
                            boxShadow: selected ? "0 0 0 1px rgba(184,155,106,0.45), 0 0 10px rgba(184,155,106,0.22)" : "none",
                          }}
                        >
                          {lockedInDemo && (
                            <span style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%)",
                              color: "#7f7b72",
                              fontSize: 14,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                            >
                              ×
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!usePromptBackground && user?.isDemo && backgroundMode === "solid" && (
                  <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5 }}>
                    デモ版では2色からお選びください。
                  </p>
                )}
                {!usePromptBackground && backgroundMode === "image" && (
                  <>
                    {backgroundReferenceMode === "random" && (
                      <div>
                        <p style={{ fontSize: 11, color: C.textMid, marginBottom: 6 }}>背景プロンプト</p>
                        <textarea
                          value={randomBackgroundPrompt}
                          onChange={(e) => setRandomBackgroundPrompt(e.target.value)}
                          rows={3}
                          placeholder="例）白壁のミニマルスタジオ、柔らかい自然光、床の写り込みなし"
                          style={{
                            width: "100%",
                            border: `1px solid ${C.border}`,
                            background: C.bg,
                            color: C.text,
                            fontSize: 12,
                            lineHeight: 1.55,
                            padding: "9px 10px",
                            resize: "vertical",
                          }}
                        />
                        <p style={{ fontSize: 10, color: C.textSub, marginTop: 6, lineHeight: 1.45 }}>
                          ここに書いた背景条件をテキストでAPIに送信します（背景画像は送信しません）。
                        </p>
                      </div>
                    )}
                    {backgroundReferenceMode === "studio" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                        {selectableBackgrounds.map((asset) => {
                          const selected = backgroundAssetId === asset.id;
                          const lockedInDemo = Boolean(user?.isDemo && !DEMO_ALLOWED_BACKGROUND_IDS.has(asset.id));
                          return (
                            <button
                              key={asset.id}
                              onClick={() => { if (!lockedInDemo) setBackgroundAssetId(asset.id); }}
                              disabled={lockedInDemo}
                              style={{
                                position: "relative",
                                border: `1px solid ${selected ? C.goldBorder : C.borderLight}`,
                                background: C.surface,
                                cursor: lockedInDemo ? "not-allowed" : "pointer",
                                padding: 0,
                                textAlign: "left",
                                opacity: lockedInDemo ? 0.48 : 1,
                                boxShadow: selected ? "0 0 0 1px rgba(184,155,106,0.45), 0 0 16px rgba(184,155,106,0.28)" : "none",
                              }}
                            >
                              <div style={{ aspectRatio: "3/4", background: C.borderLight }}>
                                <img
                                  src={getAssetThumbnailUrl(asset)}
                                  alt={asset.name}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              </div>
                              <div style={{ padding: "6px 7px" }}>
                                <p style={{ fontSize: 10, color: selected ? C.text : C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {asset.name}
                                </p>
                              </div>
                              {lockedInDemo && (
                                <div style={{
                                  position: "absolute",
                                  inset: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(255,255,255,0.2)",
                                  color: "#6e675c",
                                  fontSize: 22,
                                  fontWeight: 700,
                                  pointerEvents: "none",
                                }}
                                >
                                  ×
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                {!usePromptBackground && user?.isDemo && backgroundMode === "image" && backgroundReferenceMode === "studio" && (
                  <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5 }}>
                    デモ版では{DEMO_ALLOWED_BACKGROUND_IDS.size}つの背景画像からお選びください。
                  </p>
                )}
                {!user?.isDemo && !usePromptBackground && backgroundMode === "image" && backgroundReferenceMode === "studio" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSub }}>
                    <input
                      type="checkbox"
                      checked={favoriteOnlyBackground}
                      onChange={(e) => setFavoriteOnlyBackground(e.target.checked)}
                    />
                    お気に入り背景だけ表示
                  </label>
                )}
                {!user?.isDemo && !usePromptBackground && backgroundMode === "image" && backgroundReferenceMode === "studio" && (
                  <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
                    背景画像は +1クレジット/枚。
                  </p>
                )}
                <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
                  {usePromptBackground
                    ? "背景はプロンプト指定"
                    : backgroundMode === "solid"
                    ? `単色背景を選択中: ${selectedBackgroundColor.label}`
                    : (backgroundReferenceMode === "random"
                      ? `ランダム背景プロンプト${normalizedRandomBackgroundPrompt ? "を設定済み" : "が未入力"}`
                      : "スタジオで登録した背景画像から選択できます。")}
                  {backgroundReferenceMode === "studio" && favoriteOnlyBackground && favoriteBackgrounds.length === 0 ? "（お気に入りがないため全背景を表示中）" : ""}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
              <div ref={ratioHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>縦横比率</p>
                <button
                  onClick={() => setRatioHelpOpen((prev) => !prev)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.textSub,
                    fontSize: 11,
                    lineHeight: "16px",
                    textAlign: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label="縦横比率の説明"
                >
                  ?
                </button>
                {ratioHelpOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 0,
                      width: 240,
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                      padding: 10,
                      zIndex: 30,
                    }}
                  >
                    <p style={{ fontSize: 11, color: C.text, lineHeight: 1.6 }}>
                      比率の表記は「左が縦（高さ）・右が横（幅）」です。<br />
                      4:3は、縦4・横3の縦長です。
                    </p>
                  </div>
                )}
              </div>
              <div ref={ratioPickerRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setRatioPickerOpen((prev) => !prev)}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                    border: `1px solid ${ratioPickerOpen ? C.goldBorder : C.border}`,
                    background: ratioPickerOpen ? C.goldLight : C.bg,
                    color: C.text,
                    fontSize: 12,
                    padding: "10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    letterSpacing: "0.02em",
                  }}
                >
                  <span>{outputPresetLabel}</span>
                  <span style={{ color: C.textSub, fontSize: 11 }}>{ratioPickerOpen ? "▲" : "▼"}</span>
                </button>
                {ratioPickerOpen && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    zIndex: 30,
                    border: `1px solid ${C.goldBorder}`,
                    background: "rgba(248,246,241,0.94)",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 14px 28px rgba(56,44,24,0.18)",
                    padding: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                  }}>
                    {OUTPUT_RATIO_OPTIONS.map((ratio) => {
                      const selected = outputPreset === ratio.id;
                      const lockedInDemo = Boolean(user?.isDemo && ratio.id !== "fourThree");
                      const ratioText = ratio.label.replace("（デフォルト）", "");
                      return (
                        <button
                          key={ratio.id}
                          onClick={() => {
                            if (lockedInDemo) return;
                            setOutputPreset(ratio.id);
                            setRatioPickerOpen(false);
                          }}
                          disabled={lockedInDemo}
                          title={ratio.label}
                          style={{
                            border: `1px solid ${selected ? C.goldBorder : C.border}`,
                            background: selected ? C.goldLight : C.surface,
                            color: selected ? C.text : C.textSub,
                            cursor: lockedInDemo ? "not-allowed" : "pointer",
                            opacity: lockedInDemo ? 0.38 : 1,
                            padding: "8px 6px",
                            display: "grid",
                            gap: 6,
                            justifyItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 10, lineHeight: 1 }}>{ratioText}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {user?.isDemo && (
                <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5, marginTop: 7 }}>
                  デモ版では4:3のみ選択できます。
                </p>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
              <div ref={generationModeHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>生成モード</p>
                <button
                  onClick={() => setGenerationModeHelpOpen((prev) => !prev)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.textSub,
                    fontSize: 11,
                    lineHeight: "16px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ?
                </button>
                {generationModeHelpOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 8,
                      width: 264,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      padding: 10,
                      zIndex: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>生成モードの目安</p>
                      <button onClick={() => setGenerationModeHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                    </div>
                    <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                      標準モードは、ほとんどの商品において自然で高品質な仕上がりを実現します。
                      <br />
                      高精細モードは、素材感や縫製、金具などの細部までより忠実に再現したい場合に適しています。
                      <br />
                      高級商材や広告用途には高精細モードをおすすめします。
                    </p>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {GENERATION_QUALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setGenerationQuality(opt.id)}
                    disabled={!(style === "torso" || style === "mannequin" || style === "model")}
                    style={{
                      border: `1px solid ${generationQuality === opt.id ? C.goldBorder : C.border}`,
                      background: generationQuality === opt.id ? C.goldLight : C.bg,
                      color: generationQuality === opt.id ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "9px 6px",
                      cursor: (style === "torso" || style === "mannequin" || style === "model") ? "pointer" : "not-allowed",
                      opacity: (style === "torso" || style === "mannequin" || style === "model") ? 1 : 0.55,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(style === "torso" || style === "mannequin" || style === "model") && generationQuality === "standard" && (
                <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 7 }}>
                  ディテールや素材感の再現には高精細がおすすめです。
                </p>
              )}
              {(style === "torso" || style === "mannequin" || style === "model") && generationQuality === "highDetail" && (
                <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 7 }}>
                  高精細モードは +3クレジット/枚。
                </p>
              )}
              {style === "model" && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 10, color: C.textSub, marginBottom: 6 }}>モデル合成方式（開発）</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { id: "auto", label: "自動" },
                      { id: "tryon-v1.6", label: "Try-On 1.6" },
                      { id: "tryon-max", label: "Try-On Max" },
                      { id: "product-to-model-model", label: "Product to Model" },
                    ].map((opt) => (
                      <button
                        key={`model_dev_${opt.id}`}
                        onClick={() => setModelDevPipeline(opt.id)}
                        style={{
                          border: `1px solid ${modelDevPipeline === opt.id ? C.goldBorder : C.border}`,
                          background: modelDevPipeline === opt.id ? C.goldLight : C.bg,
                          color: modelDevPipeline === opt.id ? C.text : C.textSub,
                          fontSize: 11,
                          padding: "8px 6px",
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {modelDevPipeline === "tryon-v1.6" && (
                    <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 6 }}>
                      文章プロンプトは送信せず、Try-On 1.6向けパラメータのみ送信します。
                    </p>
                  )}
                  {modelDevPipeline === "product-to-model-model" && (
                    <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 6 }}>
                      選択モデル画像を image_prompt として送信します。
                    </p>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
              <div ref={qualityHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>画質</p>
                <button
                  onClick={() => setQualityHelpOpen((prev) => !prev)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.textSub,
                    fontSize: 11,
                    lineHeight: "16px",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ?
                </button>
                {qualityHelpOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 8,
                      width: 264,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      padding: 10,
                      zIndex: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>画質の目安</p>
                      <button onClick={() => setQualityHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                    </div>
                    <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                      通常のEC用途なら1Kで十分です。
                      <br />
                      大きく使う画像（バナー・拡大表示・印刷寄り）には4Kがおすすめです。
                      <br />
                      1Kは1024×1024の約1MP、4Kは約16MPです。
                      <br />
                      4Kは生成にかかる時間も長くなります。
                    </p>
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => setOutputQuality("standard")}
                  style={{
                    border: `1px solid ${outputQuality === "standard" ? C.goldBorder : C.border}`,
                    background: outputQuality === "standard" ? C.goldLight : C.bg,
                    color: outputQuality === "standard" ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "9px 6px",
                    cursor: "pointer",
                  }}
                >
                  1K
                </button>
                <button
                  onClick={() => canUseHighQuality && setOutputQuality("high")}
                  disabled={!canUseHighQuality}
                  style={{
                    border: `1px solid ${outputQuality === "high" ? C.goldBorder : C.border}`,
                    background: outputQuality === "high" ? C.goldLight : C.bg,
                    color: outputQuality === "high" ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "9px 6px",
                    cursor: canUseHighQuality ? "pointer" : "not-allowed",
                    opacity: canUseHighQuality ? 1 : 0.55,
                  }}
                >
                  4K
                </button>
              </div>
              {user?.isDemo && (
                <p style={{ fontSize: 10, color: C.red, lineHeight: 1.5, marginTop: 7 }}>
                  デモ版では1Kのみ選択できます。
                </p>
              )}
              {!user?.isDemo && outputQuality === "high" && (
                <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginTop: 7 }}>
                  4Kは +2クレジット/枚。
                </p>
              )}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>予定消費クレジット</p>
              <p style={{ fontSize: 12, color: C.text, fontWeight: 600 }} className="num">{estimateCredits} cr</p>
            </div>
          </div>

          <Btn
            variant="primary"
            full
            size="lg"
            onClick={run}
              disabled={!generationInputReady || running || hasInFlightJob || isSubmitting || submitLocked || (user?.isDemo && activeStyle === "custom") || (!user?.isDemo && activeStyle === "custom" && !customPrompt.trim()) || (!user?.isDemo && requiresImageModelReference && !modelAssetId)}
          >
            {(generationInputReady && (running || hasInFlightJob || isSubmitting)) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, border: "1.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                {`生成中 ${done}/${generationImageCount}`}
                </span>
              ) : "ルックを生成"}
            </Btn>

          {/* Summary */}
          {files.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: 20 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, marginBottom: 12 }}>処理概要</p>
              {[
                ["画像枚数", `${generationImageCount} 枚`],
                ["選択スタイル", selectedStyleFromActive.label],
                [
                  "背景",
                  usePromptBackground
                    ? "プロンプト指定"
                    : effectiveBackgroundMode === "image"
                    ? (backgroundReferenceMode === "random"
                      ? `ランダム背景${normalizedRandomBackgroundPrompt ? "（プロンプト設定済み）" : "（未入力）"}`
                      : (selectedBackground ? selectedBackground.name : "背景画像 未選択"))
                    : `単色: ${selectedBackgroundColor.label}`,
                ],
                ["対象", targetGender === "mens" ? "メンズ" : "レディース"],
                ["向き", ORIENTATION_OPTIONS.find((opt) => opt.id === orientation)?.label || "正面"],
                ...(style === "torso" || style === "mannequin" || style === "model"
                  ? [["出力範囲", (FRAMING_OPTIONS.find((opt) => opt.id === framing)?.label || "全体")]]
                  : []),
                ["縦横比率", outputPresetLabel],
                ...(style === "torso" || style === "mannequin" || style === "model"
                  ? [["生成モード", generationQuality === "highDetail" ? "高精細（+3クレジット/枚）" : "標準"]]
                  : []),
                ["画質", outputQuality === "high" ? "4K / +2クレジット/枚" : "1K"],
                ["モデル参照", requiresModelReference
                  ? (useRandomModelReference
                    ? `ランダムモデル${randomModelPrompt.trim() ? "（容姿プロンプト設定済み）" : ""}`
                    : (selectedModel ? selectedModel.name : "未選択"))
                  : "利用しない"],
                ["カスタムプロンプト", style === "custom" ? (customPrompt.trim() ? "設定済み" : "未入力") : "利用しない"],
                ["使用クレジット", `${estimateCredits} cr`],
                ["残クレジット", `${Math.max(0, user.credits - estimateCredits)} cr`],
                ["推定完了時間", user?.isDemo ? "約 5 秒" : `約 ${Math.ceil(files.length * 1.5)} 秒`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 12, color: C.textSub }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{v}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: C.textSub, marginTop: 10 }}>
                課金ルール: 生成成功（done）分のみ確定課金。失敗分は自動返却されます。
              </p>
              {user?.isDemo && (
                <p style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                  デモ版: API送信は行わず、登録済みサンプル結果を表示します。
                </p>
              )}
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: C.red, background: C.redLight, border: `1px solid ${C.red}`, padding: "10px 12px", borderRadius: 2 }}>
              {error}
            </div>
          )}

          {!!failed.length && (
            <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 2, padding: 12 }}>
              <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>失敗 {failed.length} 件: リトライできます</p>
              <p style={{ fontSize: 11, color: C.textMid, marginBottom: 8 }}>
                原因の可能性: 画像サイズ過大 / 背景が複雑 / 服が見切れ
              </p>
              <Btn size="sm" variant="secondary" onClick={handleRetry}>失敗分をリトライ</Btn>
              {failed.slice(0, 2).map((item) => (
                <p key={item.id} style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                  {item.name}: {item.errorHint || item.error || "unknown error"}
                </p>
              ))}
            </div>
          )}

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: 12 }}>
            <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
              注意: AI生成画像はロゴ/柄の崩れが起きる場合があります。元画像は学習利用しません。データ保持は30日、失敗ジョブは7日を目安に削除します。
            </p>
          </div>
        </div>
      {isMobile && !lookOpen && (
        <MobileSheetHandle
          label="ルック生成"
          open={mobileSettingsOpen}
          onClick={() => setMobileSettingsOpen((prev) => !prev)}
          style={{
            top: 84,
            right: mobileSettingsOpen ? "min(360px, 88vw)" : 0,
            zIndex: 1210,
            transition: "right 0.24s ease",
          }}
        />
      )}
      </>
      </MobileFixedLayer>
      </div>

      {lookOpen && !user?.isDemo && mobileLayerRoot && createPortal((
        <div
          onClick={() => setLookOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.68)",
            zIndex: 2200,
            display: "flex",
            alignItems: isMobile ? "stretch" : "flex-start",
            justifyContent: "center",
            padding: isMobile ? 0 : "40px 24px 24px",
            overflow: "hidden",
          }}
        >
          {isMobile ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100vw",
                height: "100dvh",
                background: C.surface,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <input
                ref={lookFileInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                style={{ display: "none" }}
                onChange={(e) => {
                  const next = Array.from(e.target.files || []);
                  void addLookLocalFiles(next);
                  e.target.value = "";
                }}
              />
              <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${C.borderLight}`, background: "rgba(248,246,241,0.98)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase" }}>Styling</p>
                    <p style={{ fontSize: 17, color: C.text, fontFamily: SERIF, marginTop: 4 }}>商品を選んで組み合わせる</p>
                  </div>
                  <button onClick={() => setLookOpen(false)} style={{ border: "none", background: "transparent", color: C.textSub, fontSize: 24, lineHeight: 1, cursor: "pointer", padding: 0 }}>×</button>
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <p style={{ fontSize: 11, color: C.textSub }}>最大4点まで選択可能</p>
                  <p style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{lookSelectedIds.length} / 4</p>
                </div>
              </div>

              <div style={{ padding: "8px 16px 10px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: C.textSub }}>選択中のスタイリング</p>
                  {lookSelectedIds.length > 0 ? (
                    <button onClick={clearLookItems} style={{ border: "none", background: "none", fontSize: 11, color: C.textSub, cursor: "pointer", textDecoration: "underline" }}>クリア</button>
                  ) : null}
                </div>
                {selectedLookAssets.length > 0 ? (
                  <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "78px", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                    {selectedLookAssets.map((asset) => (
                      <div key={`look_selected_mobile_${asset.id}`} style={{ border: `1px solid ${C.border}`, background: C.surface, position: "relative" }}>
                        <button
                          onClick={() => removeLookItem(asset.id)}
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: `1px solid ${C.border}`,
                            background: "rgba(255,255,255,0.95)",
                            color: C.red,
                            fontSize: 12,
                            lineHeight: "18px",
                            cursor: "pointer",
                            zIndex: 2,
                            padding: 0,
                          }}
                          aria-label="この画像を外す"
                        >
                          ×
                        </button>
                        <div style={{ aspectRatio: "1 / 1.08", background: C.borderLight }}>
                          <img src={asset.outputUrl || asset.dataUrl || ""} alt={asset.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => lookFileInputRef.current?.click()}
                      style={{
                        border: `1px dashed ${C.goldBorder}`,
                        background: C.surface,
                        color: C.text,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      <div style={{ aspectRatio: "1 / 1.08", display: "grid", placeItems: "center", background: C.bg }}>
                        <div style={{ textAlign: "center", padding: 8 }}>
                          <div style={{ fontSize: 22, color: C.gold, marginBottom: 6 }}>+</div>
                          <p style={{ fontSize: 10 }}>画像追加</p>
                        </div>
                      </div>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => lookFileInputRef.current?.click()}
                    style={{
                      width: "100%",
                      border: `1px dashed ${C.border}`,
                      background: C.surface,
                      color: C.textSub,
                      padding: "16px 12px",
                      textAlign: "center",
                      cursor: "pointer",
                      fontSize: 11,
                      lineHeight: 1.7,
                    }}
                  >
                    商品をタップして追加するか、画像をアップロード
                  </button>
                )}
              </div>

              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.borderLight}`, background: "rgba(245,242,236,0.98)" }}>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                  {[
                    { id: "all", label: "すべて" },
                    ...PRODUCT_CATEGORY_OPTIONS,
                  ].map((opt) => (
                    <button
                      key={`look_filter_mobile_${opt.id}`}
                      onClick={() => setLookFilter(opt.id)}
                      style={{
                        border: `1px solid ${lookFilter === opt.id ? C.goldBorder : C.border}`,
                        background: lookFilter === opt.id ? C.goldLight : C.surface,
                        color: lookFilter === opt.id ? C.text : C.textSub,
                        fontSize: 11,
                        padding: "7px 12px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flex: "0 0 auto",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: C.bg }}>
                <div style={{ padding: "12px 16px calc(96px + env(safe-area-inset-bottom))", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, alignContent: "start" }}>
                {lookFilteredAssets.map((asset) => {
                  const selected = lookSelectedIds.includes(asset.id);
                  return (
                    <button
                      key={`look_asset_mobile_${asset.id}`}
                      onClick={() => (selected ? removeLookItem(asset.id) : addLookItem(asset.id))}
                      style={{
                        border: `1px solid ${selected ? C.goldBorder : C.borderLight}`,
                        background: selected ? C.goldLight : C.surface,
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        position: "relative",
                        boxShadow: selected ? "0 0 0 1px rgba(184,155,106,0.25)" : "none",
                      }}
                    >
                      <div style={{ aspectRatio: "1 / 1.08", background: C.borderLight, position: "relative" }}>
                        <img src={asset.outputUrl || asset.dataUrl || ""} alt={asset.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <div style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: `1px solid ${selected ? C.goldBorder : "rgba(255,255,255,0.9)"}`,
                          background: selected ? C.goldLight : "rgba(255,255,255,0.9)",
                          color: selected ? C.text : C.textSub,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          fontWeight: 700,
                        }}>
                          {selected ? "✓" : "+"}
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>

              {lookError && (
                <p style={{ fontSize: 11, color: C.red, padding: "10px 16px 0" }}>{lookError}</p>
              )}
              <div style={{ padding: "12px 16px calc(18px + env(safe-area-inset-bottom))", borderTop: `1px solid ${C.borderLight}`, background: "rgba(248,246,241,0.98)", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 8, boxShadow: "0 -8px 24px rgba(36,28,18,0.08)" }}>
                <button onClick={() => setLookOpen(false)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSub, fontSize: 12, padding: "12px 10px", cursor: "pointer" }}>
                  閉じる
                </button>
                <button onClick={() => void createLookInput()} style={{ border: `1px solid ${C.goldBorder}`, background: C.goldLight, color: C.text, fontSize: 12, padding: "12px 10px", cursor: "pointer", fontWeight: 600 }}>
                  スタイリングとして追加
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(960px, 92vw)",
                height: "88vh",
                background: C.surface,
                border: `1px solid ${C.border}`,
                display: "grid",
                gridTemplateColumns: "1fr 320px",
                gap: 0,
                overflow: "hidden",
              }}
            >
              <div style={{ borderRight: `1px solid ${C.borderLight}`, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <p style={{ fontSize: 12, color: C.text }}>商品を選択</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {[
                      { id: "all", label: "すべて" },
                      ...PRODUCT_CATEGORY_OPTIONS,
                    ].map((opt) => (
                      <button
                        key={`look_filter_${opt.id}`}
                        onClick={() => setLookFilter(opt.id)}
                        style={{
                          border: `1px solid ${lookFilter === opt.id ? C.goldBorder : C.border}`,
                          background: lookFilter === opt.id ? C.goldLight : C.bg,
                          color: lookFilter === opt.id ? C.text : C.textSub,
                          fontSize: 11,
                          padding: "6px 10px",
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: 12, overflowY: "auto", overflowX: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, alignContent: "start", gridAutoRows: "max-content" }}>
                  {lookFilteredAssets.map((asset) => (
                    <button
                      key={`look_asset_${asset.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", asset.id);
                      }}
                      onClick={() => addLookItem(asset.id)}
                      style={{
                        border: `1px solid ${C.borderLight}`,
                        background: C.bg,
                        padding: 0,
                        cursor: "grab",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ aspectRatio: "3/4", background: C.borderLight }}>
                        <img src={asset.outputUrl || asset.dataUrl || ""} alt={asset.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: 12, color: C.text }}>スタイリング（最大4点）</p>
                  <button onClick={clearLookItems} style={{ border: "none", background: "none", fontSize: 11, color: C.textSub, cursor: "pointer", textDecoration: "underline" }}>クリア</button>
                </div>
                <div
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedFiles = Array.from(e.dataTransfer.files || []);
                    if (droppedFiles.length > 0) {
                      void addLookLocalFiles(droppedFiles);
                      return;
                    }
                    const assetId = e.dataTransfer.getData("text/plain");
                    addLookItem(assetId);
                  }}
                  onClick={() => lookFileInputRef.current?.click()}
                  style={{
                    flex: 1,
                    padding: 12,
                    overflowY: "auto",
                    background: C.bg,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    alignContent: "start",
                    cursor: "pointer",
                  }}
                >
                  <input
                    ref={lookFileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.heic,.heif"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const next = Array.from(e.target.files || []);
                      void addLookLocalFiles(next);
                      e.target.value = "";
                    }}
                  />
                  {lookSelectedIds.map((assetId) => {
                    const asset = findLookAsset(assetId);
                    if (!asset) return null;
                    return (
                      <div key={`look_selected_${assetId}`} style={{ border: `1px solid ${C.border}`, background: C.surface, position: "relative" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeLookItem(asset.id); }}
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: `1px solid ${C.border}`,
                            background: "rgba(255,255,255,0.95)",
                            color: C.red,
                            fontSize: 12,
                            lineHeight: "18px",
                            cursor: "pointer",
                            zIndex: 2,
                            padding: 0,
                          }}
                          aria-label="この画像を外す"
                          title="外す"
                        >
                          ×
                        </button>
                        <div style={{ aspectRatio: "3/4", background: C.borderLight }}>
                          <img src={asset.outputUrl || asset.dataUrl || ""} alt={asset.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      </div>
                    );
                  })}
                  {lookSelectedIds.length === 0 && (
                    <div style={{ gridColumn: "1 / -1", border: `1px dashed ${C.border}`, padding: 16, textAlign: "center", fontSize: 11, color: C.textSub }}>
                      ここにドラッグ&ドロップ、クリックでファイル選択、または左の商品をクリックして追加
                    </div>
                  )}
                </div>
                {lookError && (
                  <p style={{ fontSize: 11, color: C.red, padding: "8px 12px 0" }}>{lookError}</p>
                )}
                <div style={{ padding: 12, borderTop: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => setLookOpen(false)} style={{ border: `1px solid ${C.border}`, background: C.surface, color: C.textSub, fontSize: 12, padding: "9px 10px", cursor: "pointer" }}>
                    閉じる
                  </button>
                  <button onClick={() => void createLookInput()} style={{ border: `1px solid ${C.goldBorder}`, background: C.goldLight, color: C.text, fontSize: 12, padding: "9px 10px", cursor: "pointer" }}>
                    追加
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ), mobileLayerRoot)}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: HISTORY
// ─────────────────────────────────────────────
function HistoryPage({ user, jobs, onRefresh, isMobile = false }) {
  const visibleJobs = useMemo(
    () => (jobs || []).filter((job) => {
      const styleConfig = job?.styleConfig && typeof job.styleConfig === "object" ? job.styleConfig : {};
      const isModelGenerateJob = String(job?.style || "") === "model"
        && (String(job?.modelRunStrategy || "") === "model-create" || String(styleConfig?.generator || "") === "model-create");
      return !isModelGenerateJob;
    }),
    [jobs],
  );
  const [selected, setSelected] = useState(null);
  const [viewer, setViewer] = useState({ open: false, items: [], index: 0, title: "" });
  const viewerCanvasRef = useRef(null);
  const prevViewerZoomRef = useRef(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [showAllGallery, setShowAllGallery] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const deleteConfirmRef = useRef(null);
  const savePickerRef = useRef(null);
  const [saveFormat, setSaveFormat] = useState("png");
  const [viewerZoom, setViewerZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [viewerViewportSize, setViewerViewportSize] = useState({ width: 0, height: 0 });
  const [viewerImageNaturalSize, setViewerImageNaturalSize] = useState({ width: 0, height: 0 });
  const generatedItems = visibleJobs.flatMap((job) => (
    (job.items || [])
      .map((item) => ({
        id: item.id,
        jobId: job.id,
        name: item.name,
        style: job.style,
        status: item.status || "queued",
        outputUrl: item.outputUrl || null,
        outputName: item.outputName || "",
        createdAt: job.createdAt,
      }))
      .filter((item) => item.status !== "error")
  ));
  const savableItems = useMemo(
    () => generatedItems.filter((item) => Boolean(item.outputUrl)),
    [generatedItems],
  );
  const visibleGeneratedItems = useMemo(
    () => (showAllGallery ? generatedItems : generatedItems.slice(0, 6)),
    [generatedItems, showAllGallery],
  );
  const resolveLocalDateKey = useCallback((dateLike) => {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "unknown";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const groupedGeneratedItems = useMemo(() => {
    const groups = [];
    const indexByKey = new Map();
    generatedItems.forEach((item) => {
      const key = resolveLocalDateKey(item.createdAt);
      const idx = indexByKey.get(key);
      if (idx === undefined) {
        indexByKey.set(key, groups.length);
        groups.push({ key, items: [item] });
      } else {
        groups[idx].items.push(item);
      }
    });
    return groups;
  }, [generatedItems, resolveLocalDateKey]);
  const formatJaDateLabel = useCallback((dateLike) => {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "日付不明";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(d);
  }, []);

  const openViewer = useCallback((items, index = 0, title = "") => {
    if (!Array.isArray(items) || items.length === 0) return;
    setViewerZoom(1);
    setViewer({
      open: true,
      items,
      index: Math.max(0, Math.min(items.length - 1, index)),
      title,
    });
  }, []);

  const closeViewer = useCallback(() => {
    setSavePickerOpen(false);
    setConfirmDeleteOpen(false);
    setViewer({ open: false, items: [], index: 0, title: "" });
  }, []);

  const goPrev = useCallback(() => {
    setViewerZoom(1);
    setViewer((prev) => ({
      ...prev,
      index: prev.items.length ? (prev.index - 1 + prev.items.length) % prev.items.length : 0,
    }));
  }, []);

  const goNext = useCallback(() => {
    setViewerZoom(1);
    setViewer((prev) => ({
      ...prev,
      index: prev.items.length ? (prev.index + 1) % prev.items.length : 0,
    }));
  }, []);
  const zoomMin = 1;
  const zoomMax = 3;
  const renderedImageSize = useMemo(() => {
    const naturalW = viewerImageNaturalSize.width;
    const naturalH = viewerImageNaturalSize.height;
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!naturalW || !naturalH || !viewportW || !viewportH) return null;
    const fitScale = Math.min(viewportW / naturalW, viewportH / naturalH);
    const baseW = Math.max(1, naturalW * fitScale);
    const baseH = Math.max(1, naturalH * fitScale);
    return {
      width: baseW * viewerZoom,
      height: baseH * viewerZoom,
    };
  }, [viewerImageNaturalSize.height, viewerImageNaturalSize.width, viewerViewportSize.height, viewerViewportSize.width, viewerZoom]);
  const canvasSize = useMemo(() => {
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!viewportW || !viewportH) return null;
    const renderW = renderedImageSize?.width || viewportW;
    const renderH = renderedImageSize?.height || viewportH;
    return {
      width: Math.max(viewportW, renderW),
      height: Math.max(viewportH, renderH),
    };
  }, [renderedImageSize?.height, renderedImageSize?.width, viewerViewportSize.height, viewerViewportSize.width]);
  const downloadModelAsset = useCallback((asset) => {
    const sourceUrl = String(asset?.outputUrl || asset?.dataUrl || "");
    if (!sourceUrl || typeof document === "undefined") return;
    const safeBase = String(asset?.name || "model")
      .replace(/\.[^.]+$/i, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .trim() || "model";
    let ext = "jpg";
    if (sourceUrl.startsWith("data:image/png")) ext = "png";
    else if (sourceUrl.startsWith("data:image/webp")) ext = "webp";
    else if (sourceUrl.startsWith("data:image/jpeg")) ext = "jpg";
    else {
      const match = sourceUrl.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
      if (match && match[1]) ext = match[1].toLowerCase();
    }
    const anchor = document.createElement("a");
    anchor.href = sourceUrl;
    anchor.download = `${safeBase}.${ext}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);
  const currentViewerItem = viewer.items[viewer.index] || null;

  const toggleSelectImage = useCallback((imageId) => {
    setSelectedImageIds((prev) => (
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    ));
  }, []);

  const selectAllImages = useCallback(() => {
    setSelectedImageIds(generatedItems.map((item) => item.id));
  }, [generatedItems]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedImageIds([]);
  }, []);

  const normalizeFileNameForFormat = useCallback((filename, format) => {
    const base = String(filename || "image").replace(/\.[a-z0-9]+$/i, "");
    return `${base}.${format}`;
  }, []);

  const convertBlobFormat = useCallback(async (blob, targetMime) => {
    if (blob.type === targetMime) return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const converted = await new Promise((resolve) => {
      canvas.toBlob((out) => resolve(out || blob), targetMime, targetMime === "image/jpeg" ? 0.92 : 1);
    });
    return converted;
  }, []);

  const downloadImage = useCallback(async (url, filename, format = "png") => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    const blob = await response.blob();
    const targetMime = format === "jpg" ? "image/jpeg" : "image/png";
    const finalBlob = await convertBlobFormat(blob, targetMime);
    const objectUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = normalizeFileNameForFormat(filename || "image", format);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, [convertBlobFormat, normalizeFileNameForFormat]);

  const downloadImagesZip = useCallback(async (targets, format = "png") => {
    const payload = {
      format,
      items: targets.map((item) => ({
        url: item.outputUrl,
        filename: item.outputName || item.name || `${item.id}.png`,
      })),
    };
    const response = await fetch(`${BACKEND_PREVIEW_BASE_URL}/api/export/images-zip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `zip export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `torso-ai-selected-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }, []);

  const saveTargets = useCallback(async (targets, format = saveFormat) => {
    if (!Array.isArray(targets) || targets.length === 0) return;
    setSaveError("");
    setSaving(true);
    try {
      if (targets.length === 1) {
        const item = targets[0];
        await downloadImage(item.outputUrl, item.outputName || item.name || `${item.id}.png`, format);
        return;
      }
      await downloadImagesZip(targets, format);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [downloadImage, downloadImagesZip, saveFormat]);

  const saveSelectedImages = useCallback(async (format = saveFormat) => {
    const targets = savableItems.filter((item) => selectedImageIds.includes(item.id));
    setSaveFormat(format);
    await saveTargets(targets, format);
    setSavePickerOpen(false);
  }, [saveFormat, saveTargets, savableItems, selectedImageIds]);
  const deleteSelectedImages = useCallback(async () => {
    if (!user?.id || selectedImageIds.length === 0 || deleting) return;
    setSaveError("");
    setDeleting(true);
    try {
      await deleteGeneratedItems(user.id, selectedImageIds);
      setSelectedImageIds([]);
      setConfirmDeleteOpen(false);
      await onRefresh?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }, [user?.id, selectedImageIds, deleting, onRefresh]);
  const deleteCurrentViewerItem = useCallback(async () => {
    if (!user?.id || !currentViewerItem?.id || deleting) return;
    setSaveError("");
    setDeleting(true);
    try {
      await deleteGeneratedItems(user.id, [currentViewerItem.id]);
      setConfirmDeleteOpen(false);
      closeViewer();
      await onRefresh?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }, [closeViewer, currentViewerItem?.id, deleting, onRefresh, user?.id]);

  useEffect(() => {
    if (!savePickerOpen) return undefined;
    const onPointerDown = (e) => {
      const root = savePickerRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setSavePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [savePickerOpen]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  useEffect(() => {
    if (!viewer.open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewer.open, closeViewer, goPrev, goNext]);
  useEffect(() => {
    const el = viewerCanvasRef.current;
    if (!el || !viewer.open || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      setViewerViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewer.open]);
  useEffect(() => {
    const viewport = viewerCanvasRef.current;
    if (!viewport) {
      prevViewerZoomRef.current = viewerZoom;
      return;
    }
    const prevZoom = prevViewerZoomRef.current;
    if (Math.abs(prevZoom - viewerZoom) < 0.0001) return;
    const clientW = viewport.clientWidth;
    const clientH = viewport.clientHeight;
    const prevScrollW = Math.max(viewport.scrollWidth, 1);
    const prevScrollH = Math.max(viewport.scrollHeight, 1);
    const centerXRatio = (viewport.scrollLeft + clientW / 2) / prevScrollW;
    const centerYRatio = (viewport.scrollTop + clientH / 2) / prevScrollH;
    requestAnimationFrame(() => {
      const nextScrollW = Math.max(viewport.scrollWidth, 1);
      const nextScrollH = Math.max(viewport.scrollHeight, 1);
      viewport.scrollLeft = Math.max(0, Math.min(nextScrollW - clientW, centerXRatio * nextScrollW - clientW / 2));
      viewport.scrollTop = Math.max(0, Math.min(nextScrollH - clientH, centerYRatio * nextScrollH - clientH / 2));
      prevViewerZoomRef.current = viewerZoom;
    });
  }, [viewerZoom]);
  useEffect(() => {
    setViewerImageNaturalSize({ width: 0, height: 0 });
    prevViewerZoomRef.current = viewerZoom;
  }, [viewer.index]);

  useEffect(() => {
    if (!confirmDeleteOpen) return undefined;
    const onPointerDown = (e) => {
      const root = deleteConfirmRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setConfirmDeleteOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [confirmDeleteOpen]);

  const renderGeneratedCard = useCallback((item) => (
    <div
      key={item.id}
      onClick={() => {
        if (selectionMode) {
          toggleSelectImage(item.id);
          return;
        }
        if (!item.outputUrl) return;
        const viewerItems = generatedItems.filter((g) => Boolean(g.outputUrl));
        const absoluteIndex = viewerItems.findIndex((g) => g.id === item.id);
        openViewer(viewerItems, Math.max(0, absoluteIndex), "生成画像一覧");
      }}
      style={{
        border: `1px solid ${selectedImageIds.includes(item.id) ? C.goldBorder : C.borderLight}`,
        background: C.bg,
        cursor: "default",
      }}
    >
      <div style={{ aspectRatio: "3/4", background: C.borderLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {item.outputUrl ? (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <div style={{ display: "block", width: "100%", height: "100%" }}>
              <img src={item.outputUrl} alt={item.outputName || item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            {selectionMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectImage(item.id);
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: `1px solid ${C.border}`,
                  background: selectedImageIds.includes(item.id) ? C.gold : C.surface,
                  color: selectedImageIds.includes(item.id) ? "#fff" : C.textSub,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {selectedImageIds.includes(item.id) ? "✓" : ""}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
            {item.status === "processing" || item.status === "queued" ? (
              <>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: `2px solid ${C.gold}`,
                    borderTopColor: "transparent",
                    animation: "spin 0.8s linear infinite",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 10, color: C.textSub }}>生成中...</span>
              </>
            ) : item.status === "error" ? (
              <span style={{ fontSize: 10, color: C.red }}>エラー</span>
            ) : (
              <span style={{ fontSize: 10, color: C.textSub }}>プレビューなし</span>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: "6px 8px" }}>
        <p style={{ fontSize: 10, color: C.textSub, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{item.outputName || item.name}</p>
        <p style={{ fontSize: 10, color: C.textSub }}>
          {item.status === "done" ? "完了" : item.status === "error" ? "エラー" : "生成中"} / Job: {item.jobId}
        </p>
      </div>
    </div>
  ), [generatedItems, openViewer, selectedImageIds, selectionMode, toggleSelectImage]);

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>History</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400 }}>生成履歴</h1>
          <Btn size="sm" variant="secondary" onClick={() => { void handleRefresh(); }} disabled={refreshing}>
            {refreshing ? "更新中..." : "更新"}
          </Btn>
        </div>
      </div>

      {/* Generated gallery */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>すべての生成履歴</p>
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: 18, marginBottom: 24, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "nowrap" }}>
            <Btn size="sm" variant="secondary" onClick={() => setShowAllGallery((prev) => !prev)} style={{ whiteSpace: "nowrap", minWidth: 88, height: 34 }}>
              {showAllGallery ? "閉じる" : "全て見る"}
            </Btn>
            {!selectionMode ? (
              <Btn size="sm" variant="ghost" onClick={() => setSelectionMode(true)} style={{ whiteSpace: "nowrap", minWidth: 74, height: 34 }}>選択</Btn>
            ) : (
              <>
                <Btn size="sm" variant="ghost" onClick={cancelSelection} style={{ whiteSpace: "nowrap", minWidth: 94, height: 34 }}>選択解除</Btn>
                <Btn size="sm" variant="secondary" onClick={selectAllImages} style={{ whiteSpace: "nowrap", minWidth: 96, height: 34 }}>全て選択</Btn>
                <span style={{ fontSize: 11, color: C.textSub, whiteSpace: "nowrap" }}>{selectedImageIds.length} 件選択中</span>
              </>
            )}
            <p style={{ fontSize: 11, color: C.textSub, marginLeft: 8, whiteSpace: "nowrap" }}>{generatedItems.length} 件</p>
          </div>
          <div ref={deleteConfirmRef} style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", position: "relative", flexWrap: "nowrap" }}>
            {selectionMode && (
              <>
                <div ref={savePickerRef} style={{ position: "relative" }}>
                  <Btn
                    size="sm"
                    variant="primary"
                    onClick={() => setSavePickerOpen((prev) => !prev)}
                    disabled={saving || selectedImageIds.length === 0}
                    style={{ whiteSpace: "nowrap", minWidth: 96, height: 34 }}
                  >
                    {saving ? "保存中..." : "保存"}
                  </Btn>
                  {savePickerOpen && (
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: 220,
                      border: `1px solid ${C.border}`,
                      background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,240,234,0.98))",
                      boxShadow: "0 18px 40px rgba(50,38,22,0.16)",
                      padding: 8,
                      zIndex: 20,
                    }}>
                      <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>
                        Save Format
                      </p>
                      <div style={{ display: "grid", gap: 6 }}>
                        {[
                          { id: "png", label: "PNGで保存" },
                          { id: "jpg", label: "JPGで保存" },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => { void saveSelectedImages(opt.id); }}
                            style={{
                              border: `1px solid ${saveFormat === opt.id ? C.goldBorder : C.borderLight}`,
                              background: saveFormat === opt.id ? "linear-gradient(135deg, rgba(226,198,145,0.34), rgba(248,246,241,0.98))" : C.surface,
                              color: C.text,
                              fontSize: 12,
                              padding: "10px 12px",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            {selectionMode && (
              <Btn
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleting || selectedImageIds.length === 0}
                style={{ whiteSpace: "nowrap", minWidth: 62, height: 34 }}
              >
                {deleting ? "削除中..." : "削除"}
              </Btn>
            )}
            {confirmDeleteOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 38,
                  right: 0,
                  width: 300,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                  padding: 12,
                  zIndex: 25,
                }}
              >
                <p style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
                  本当に削除しますか？
                </p>
                <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6, marginBottom: 10 }}>
                  選択した {selectedImageIds.length} 件を削除します。生成時に消費したクレジットは戻りません。
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => setConfirmDeleteOpen(false)}
                    disabled={deleting}
                    style={{
                      border: `1px solid ${C.border}`,
                      background: C.bg,
                      color: C.textSub,
                      fontSize: 12,
                      padding: "8px 10px",
                      cursor: deleting ? "not-allowed" : "pointer",
                    }}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => { void deleteSelectedImages(); }}
                    disabled={deleting}
                    style={{
                      border: `1px solid ${C.red}`,
                      background: C.red,
                      color: C.surface,
                      fontSize: 12,
                      padding: "8px 10px",
                      cursor: deleting ? "not-allowed" : "pointer",
                    }}
                  >
                    {deleting ? "削除中..." : "削除する"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {selectionMode && saveError && (
          <p style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>{saveError}</p>
        )}
        {generatedItems.length > 0 ? (
          <>
            {!showAllGallery ? (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))", gap: 10 }}>
                {visibleGeneratedItems.map((item) => renderGeneratedCard(item))}
              </div>
            ) : (
              <div style={{ maxHeight: 720, overflowY: "auto", paddingRight: 6 }}>
                {groupedGeneratedItems.map((group) => (
                  <div key={group.key} style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 12, color: C.textMid, fontWeight: 600, marginBottom: 8 }}>
                      {formatJaDateLabel(group.key)}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))", gap: 10 }}>
                      {group.items.map((item) => renderGeneratedCard(item))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: C.textSub }}>まだ履歴がありません。</p>
        )}
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "140px 1fr 80px 90px 100px 100px",
          padding: "10px 20px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
        }}>
          {["JobID", "受付時刻", "進捗", "クレジット", "ステータス", ""].map((h) => (
            <span key={h} style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, fontFamily: SANS }}>{h}</span>
          ))}
        </div>
        {visibleJobs.map((row) => {
          const isOpen = selected === row.id;
          const rowDoneItems = (row.items || []).filter((item) => item.status === "done");
          return (
            <div key={row.id}>
              <div
                onClick={() => setSelected(isOpen ? null : row.id)}
                style={{
                  display: "grid", gridTemplateColumns: "140px 1fr 80px 90px 100px 100px",
                  padding: "14px 20px",
                  borderBottom: `1px solid ${C.borderLight}`,
                  background: isOpen ? C.goldLight : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 11, color: C.textSub, fontFamily: "monospace" }}>{row.id}</span>
                <span style={{ fontSize: 12, color: C.textMid }}>
                  {new Date(row.createdAt).toLocaleString("ja-JP")} / {STYLE_OPTIONS.find((opt) => opt.id === row.style)?.label || row.style}
                </span>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{row.processedCount ?? 0}/{row.items.length}</span>
                <span style={{ fontSize: 13, color: C.textMid }}>{row.creditUsed} cr</span>
                <div>
                  <Tag
                    color={row.status === "done" ? C.green : row.status === "error" ? C.red : C.gold}
                    bg={row.status === "done" ? C.greenLight : row.status === "error" ? C.redLight : C.goldLight}
                  >{row.status === "done" ? "完了" : row.status === "error" ? "エラー" : "処理中"}</Tag>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {row.status === "done" && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => { void downloadJobZip(row.id); }}
                    >
                      保存
                    </Btn>
                  )}
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "12px 20px 16px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
                  <p style={{ fontSize: 10, color: C.textSub, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    Job Generated Images
                  </p>
                  {rowDoneItems.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                      {rowDoneItems.map((item, itemIndex) => (
                        <div key={item.id} style={{ border: `1px solid ${C.borderLight}`, background: C.surface }}>
                          <div style={{ aspectRatio: "3/4", background: C.borderLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {item.outputUrl ? (
                              <button
                                onClick={() => openViewer(rowDoneItems, itemIndex, `Job ${row.id}`)}
                                style={{ display: "block", width: "100%", height: "100%", padding: 0, margin: 0, border: "none", background: "transparent", cursor: "default" }}
                              >
                                <img src={item.outputUrl} alt={item.outputName || item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </button>
                            ) : (
                              <span style={{ fontSize: 10, color: C.textSub }}>画像なし</span>
                            )}
                          </div>
                          <div style={{ padding: "6px 8px" }}>
                            <p style={{ fontSize: 10, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.outputName || item.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: C.textSub }}>このジョブに完了画像はまだありません。</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visibleJobs.length === 0 && (
          <div style={{ padding: 24, color: C.textSub, textAlign: "center", fontSize: 13 }}>
            まだ生成ジョブがありません。
          </div>
        )}
      </div>

      {viewer.open && viewer.items.length > 0 && typeof document !== "undefined" && createPortal((
        <div
          onClick={closeViewer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,10,8,0.78)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
            overflow: "hidden",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "calc(100vw - 28px)",
              height: "calc(100vh - 28px)",
              background: C.surface,
              border: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
              <div />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                }}
              >
                <button
                  onClick={() => setViewerZoom((z) => Math.max(zoomMin, Math.round((z - 0.2) * 5) / 5))}
                  disabled={viewerZoom <= zoomMin}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom <= zoomMin ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom <= zoomMin ? 0.5 : 1,
                  }}
                >
                  −
                </button>
                <p style={{ fontSize: 12, color: C.textMid, minWidth: 56, textAlign: "center" }}>
                  {Math.round(viewerZoom * 100)}%
                </p>
                <button
                  onClick={() => setViewerZoom((z) => Math.min(zoomMax, Math.round((z + 0.2) * 5) / 5))}
                  disabled={viewerZoom >= zoomMax}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom >= zoomMax ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom >= zoomMax ? 0.5 : 1,
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
                <p style={{ fontSize: 12, color: C.textMid }}>
                  {viewer.index + 1}/{viewer.items.length}
                </p>
                {currentViewerItem?.outputUrl && (
                  <div ref={savePickerRef} style={{ position: "relative" }}>
                    <Btn
                      size="sm"
                      variant="secondary"
                      onClick={() => setSavePickerOpen((prev) => !prev)}
                      disabled={saving}
                    >
                      {saving ? "保存中..." : "保存"}
                    </Btn>
                    {savePickerOpen && (
                      <div style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        width: 220,
                        border: `1px solid ${C.border}`,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,240,234,0.98))",
                        boxShadow: "0 18px 40px rgba(50,38,22,0.16)",
                        padding: 8,
                        zIndex: 20,
                      }}>
                        <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>
                          Save Format
                        </p>
                        <div style={{ display: "grid", gap: 6 }}>
                          {[
                            { id: "png", label: "PNGで保存" },
                            { id: "jpg", label: "JPGで保存" },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => {
                                setSaveFormat(opt.id);
                                setSavePickerOpen(false);
                                void saveTargets([currentViewerItem], opt.id);
                              }}
                              style={{
                                border: `1px solid ${saveFormat === opt.id ? C.goldBorder : C.borderLight}`,
                                background: saveFormat === opt.id ? "linear-gradient(135deg, rgba(226,198,145,0.34), rgba(248,246,241,0.98))" : C.surface,
                                color: C.text,
                                fontSize: 12,
                                padding: "10px 12px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {currentViewerItem?.id && (
                  <div ref={deleteConfirmRef} style={{ position: "relative" }}>
                    <Btn size="sm" variant="ghost" onClick={() => setConfirmDeleteOpen(true)} disabled={deleting}>
                      {deleting ? "削除中..." : "削除"}
                    </Btn>
                    {confirmDeleteOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 8px)",
                          right: 0,
                          width: 300,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                          padding: 12,
                          zIndex: 25,
                        }}
                      >
                        <p style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
                          この画像を削除しますか？
                        </p>
                        <p style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6, marginBottom: 10 }}>
                          生成時に消費したクレジットは戻りません。
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            onClick={() => setConfirmDeleteOpen(false)}
                            disabled={deleting}
                            style={{
                              border: `1px solid ${C.border}`,
                              background: C.bg,
                              color: C.textSub,
                              fontSize: 12,
                              padding: "8px 10px",
                              cursor: deleting ? "not-allowed" : "pointer",
                            }}
                          >
                            キャンセル
                          </button>
                          <button
                            onClick={() => { void deleteCurrentViewerItem(); }}
                            disabled={deleting}
                            style={{
                              border: `1px solid ${C.red}`,
                              background: C.red,
                              color: C.surface,
                              fontSize: 12,
                              padding: "8px 10px",
                              cursor: deleting ? "not-allowed" : "pointer",
                            }}
                          >
                            {deleting ? "削除中..." : "削除する"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={closeViewer} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: C.textMid }}>×</button>
              </div>
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: 0, background: C.bg, overflow: "hidden" }}>
              <div
                style={{
                  position: "relative",
                  height: "100%",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: 0,
                  overflow: viewerZoom > 1.0001 ? "auto" : "hidden",
                  scrollbarGutter: "stable both-edges",
                }}
                ref={viewerCanvasRef}
              >
                <div
                  style={{
                    position: "relative",
                    width: canvasSize ? `${canvasSize.width}px` : "100%",
                    height: canvasSize ? `${canvasSize.height}px` : "100%",
                  }}
                >
                  <img
                    src={viewer.items[viewer.index]?.outputUrl || ""}
                    alt={viewer.items[viewer.index]?.outputName || viewer.items[viewer.index]?.name || "preview"}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setViewerImageNaturalSize({
                        width: img.naturalWidth || 0,
                        height: img.naturalHeight || 0,
                      });
                    }}
                    style={{
                      position: "absolute",
                      left: canvasSize && renderedImageSize ? `${(canvasSize.width - renderedImageSize.width) / 2}px` : 0,
                      top: canvasSize && renderedImageSize ? `${(canvasSize.height - renderedImageSize.height) / 2}px` : 0,
                      width: renderedImageSize ? `${renderedImageSize.width}px` : "100%",
                      height: renderedImageSize ? `${renderedImageSize.height}px` : "100%",
                      objectFit: "contain",
                      border: "2px solid transparent",
                      boxSizing: "border-box",
                      display: "block",
                    }}
                  />
                </div>
              </div>
              {viewer.items.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={goNext}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
              <p style={{ fontSize: 11, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewer.items[viewer.index]?.outputName || viewer.items[viewer.index]?.name || ""}
              </p>
            </div>
          </div>
        </div>
      ), document.body)}

    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: EDIT
// ─────────────────────────────────────────────
function EditPage({ jobs, user, onDataRefresh, onJobCreated, studioAssets = [], modelAssets = [], isMobile = false }) {
  const EDIT_TYPES = [
    { id: "partial", label: "部分修正", desc: "ロゴ・文字・小さな崩れの修正" },
    { id: "background", label: "背景変更", desc: "背景差し替え（人物保持）" },
  ];
  const inputRef = useRef(null);
  const [activeEditType, setActiveEditType] = useState("partial");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [partialPrompt, setPartialPrompt] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState("history");
  const [dragging, setDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [editPreviewZoom, setEditPreviewZoom] = useState(1);
  const [editImageNaturalSize, setEditImageNaturalSize] = useState({ width: 0, height: 0 });
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [maskBrushMode, setMaskBrushMode] = useState("white");
  const [maskBrushSize, setMaskBrushSize] = useState(32);
  const [maskPreviewOpacity, setMaskPreviewOpacity] = useState(0.55);
  const [selectedStudioItemId, setSelectedStudioItemId] = useState("");
  const [backgroundReferenceImage, setBackgroundReferenceImage] = useState(null);
  const [editBackgroundReferenceMode, setEditBackgroundReferenceMode] = useState("upload");
  const [backgroundKeepSubject, setBackgroundKeepSubject] = useState(true);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [referenceDropActive, setReferenceDropActive] = useState(false);
  const [editResultCards, setEditResultCards] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const editPreviewViewportRef = useRef(null);
  const editImageRef = useRef(null);
  const backgroundReferenceInputRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const maskDrawingRef = useRef(false);
  const lastMaskPointRef = useRef(null);
  const prevEditPreviewZoomRef = useRef(1);

  const historyItems = useMemo(
    () => jobs
      .flatMap((job) => (job.items || []).map((item) => ({
        id: `hist_${item.id}`,
        rawId: item.id,
        name: item.outputName || item.name || "generated",
        imageUrl: item.outputUrl || "",
        source: "history",
        jobId: job.id,
        createdAt: job.createdAt,
      })))
      .filter((item) => Boolean(item.imageUrl)),
    [jobs],
  );
  const studioItems = useMemo(
    () => (studioAssets || [])
      .map((asset) => ({
        id: `std_${asset.id}`,
        rawId: asset.id,
        name: asset.name || "studio",
        imageUrl: asset.outputUrl || asset.dataUrl || "",
        source: "studio",
      }))
      .filter((item) => Boolean(item.imageUrl)),
    [studioAssets],
  );
  const modelItems = useMemo(
    () => (modelAssets || [])
      .map((asset) => ({
        id: `mdl_${asset.id}`,
        rawId: asset.id,
        name: asset.name || "model",
        imageUrl: asset.outputUrl || asset.dataUrl || "",
        source: "model",
      }))
      .filter((item) => Boolean(item.imageUrl)),
    [modelAssets],
  );

  useEffect(() => {
    if (selectedImage) return;
    if (historyItems[0]) setSelectedImage(historyItems[0]);
  }, [historyItems, selectedImage]);

  const pickerItems = useMemo(() => {
    if (pickerTab === "studio") return studioItems;
    if (pickerTab === "model") return modelItems;
    return historyItems;
  }, [pickerTab, historyItems, modelItems, studioItems]);

  const promptPlaceholderByType = {
    background: "例: 背景を日中の白スタジオに変更し、人物と服はそのまま維持してください。",
    partial: "例: 胸のロゴを参照画像のロゴに変更してください。服本体の形・色・しわ・背景は変えないでください。",
  };
  const supportsMask = false;
  const activePromptValue = activeEditType === "background" ? backgroundPrompt : partialPrompt;

  const onPickLocalFiles = useCallback(async (files) => {
    const imageFiles = (files || []).filter((file) => (
      (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    ));
    if (imageFiles.length === 0) return;
    const file = imageFiles[0];
    const dataUrl = await fileToRenderableDataUrl(file);
    setEditPreviewZoom(1);
    setMaskEnabled(false);
    setEditImageNaturalSize({ width: 0, height: 0 });
    setSelectedImage({
      id: `upl_${Date.now()}`,
      rawId: `upl_${Date.now()}`,
      name: file.name || "upload",
      imageUrl: dataUrl,
      source: "upload",
    });
  }, []);

  const resetMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    if (!editImageNaturalSize.width || !editImageNaturalSize.height) return;
    if (canvas.width !== editImageNaturalSize.width) canvas.width = editImageNaturalSize.width;
    if (canvas.height !== editImageNaturalSize.height) canvas.height = editImageNaturalSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [editImageNaturalSize.height, editImageNaturalSize.width]);

  const drawMaskStroke = useCallback((fromPoint, toPoint) => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !editImageNaturalSize.width || !editImageNaturalSize.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = maskBrushMode === "white" ? "rgb(255,255,255)" : "rgb(0,0,0)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, Number(maskBrushSize || 1));
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    ctx.stroke();
  }, [editImageNaturalSize.height, editImageNaturalSize.width, maskBrushMode, maskBrushSize]);

  const pointerToMaskCoord = useCallback((clientX, clientY) => {
    const target = maskCanvasRef.current || editImageRef.current;
    if (!target || !editImageNaturalSize.width || !editImageNaturalSize.height) return null;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.max(0, Math.min(editImageNaturalSize.width, ((clientX - rect.left) / rect.width) * editImageNaturalSize.width));
    const y = Math.max(0, Math.min(editImageNaturalSize.height, ((clientY - rect.top) / rect.height) * editImageNaturalSize.height));
    return { x, y };
  }, [editImageNaturalSize.height, editImageNaturalSize.width]);

  const downloadMaskPng = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !selectedImage || !editImageNaturalSize.width || !editImageNaturalSize.height) return;
    const link = document.createElement("a");
    const baseName = String(selectedImage.name || "mask").replace(/\.[^.]+$/, "");
    link.href = canvas.toDataURL("image/png");
    link.download = `${baseName}-mask.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [editImageNaturalSize.height, editImageNaturalSize.width, selectedImage]);
  const onPickBackgroundReferenceFile = useCallback(async (files) => {
    const imageFiles = (files || []).filter((file) => (
      (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    ));
    if (imageFiles.length === 0) return;
    const file = imageFiles[0];
    const dataUrl = await fileToRenderableDataUrl(file);
    setBackgroundReferenceImage({
      id: `bgref_${Date.now()}`,
      name: file.name || "background-reference",
      imageUrl: dataUrl,
      source: "upload",
    });
  }, []);

  useEffect(() => {
    const viewport = editPreviewViewportRef.current;
    if (!viewport) {
      prevEditPreviewZoomRef.current = editPreviewZoom;
      return;
    }
    const prevZoom = prevEditPreviewZoomRef.current;
    if (Math.abs(prevZoom - editPreviewZoom) < 0.0001) return;
    const clientW = viewport.clientWidth;
    const clientH = viewport.clientHeight;
    const prevScrollW = Math.max(viewport.scrollWidth, 1);
    const prevScrollH = Math.max(viewport.scrollHeight, 1);
    const centerXRatio = (viewport.scrollLeft + clientW / 2) / prevScrollW;
    const centerYRatio = (viewport.scrollTop + clientH / 2) / prevScrollH;
    requestAnimationFrame(() => {
      const nextScrollW = Math.max(viewport.scrollWidth, 1);
      const nextScrollH = Math.max(viewport.scrollHeight, 1);
      viewport.scrollLeft = Math.max(0, Math.min(nextScrollW - clientW, centerXRatio * nextScrollW - clientW / 2));
      viewport.scrollTop = Math.max(0, Math.min(nextScrollH - clientH, centerYRatio * nextScrollH - clientH / 2));
      prevEditPreviewZoomRef.current = editPreviewZoom;
    });
  }, [editPreviewZoom]);
  useEffect(() => {
    prevEditPreviewZoomRef.current = editPreviewZoom;
  }, [selectedImage?.id, editPreviewZoom]);
  useEffect(() => {
    if (!selectedImage?.imageUrl) return;
    resetMaskCanvas();
  }, [resetMaskCanvas, selectedImage?.id]);
  useEffect(() => {
    if (!maskEnabled) return;
    if (!editImageNaturalSize.width || !editImageNaturalSize.height) return;
    resetMaskCanvas();
  }, [editImageNaturalSize.height, editImageNaturalSize.width, maskEnabled, resetMaskCanvas]);
  useEffect(() => {
    if (!supportsMask && maskEnabled) {
      setMaskEnabled(false);
    }
  }, [maskEnabled, supportsMask]);
  useEffect(() => {
    if (!selectedStudioItemId && studioItems[0]) {
      setSelectedStudioItemId(studioItems[0].id);
    }
  }, [selectedStudioItemId, studioItems]);
  useEffect(() => {
    if (!isMobile && mobileSettingsOpen) setMobileSettingsOpen(false);
  }, [isMobile, mobileSettingsOpen]);

  const selectedStudioBackground = useMemo(
    () => studioItems.find((item) => item.id === selectedStudioItemId) || null,
    [selectedStudioItemId, studioItems],
  );
  const effectiveBackgroundReference = backgroundReferenceImage?.imageUrl
    || selectedStudioBackground?.imageUrl
    || "";
  const effectivePartialReference = backgroundReferenceImage?.imageUrl || "";
  const effectiveEditReference = activeEditType === "background"
    ? (editBackgroundReferenceMode === "upload"
      ? (backgroundReferenceImage?.imageUrl || "")
      : (selectedStudioBackground?.imageUrl || ""))
    : effectivePartialReference;

  const runEdit = useCallback(async () => {
    if (!selectedImage?.imageUrl || editing) return;
    if (!effectiveEditReference) {
      setEditError(activeEditType === "background" ? "背景画像を選択してください。" : "参照画像を選択してください。");
      return;
    }
    setEditing(true);
    setEditError("");
    const runId = `edit_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setEditResultCards((prev) => ([
      {
        id: runId,
        status: "processing",
        inputPreviewUrl: selectedImage.imageUrl,
        outputUrl: "",
        name: "編集中...",
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 12)));
    const optimisticJobId = `job_edit_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (typeof onJobCreated === "function") {
      const now = new Date().toISOString();
      onJobCreated({
        id: optimisticJobId,
        userId: user?.id || "",
        style: "edit",
        status: "processing",
        imageCount: 1,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        creditUsed: 0,
        createdAt: now,
        updatedAt: now,
        items: [{
          id: `itm_${optimisticJobId}`,
          name: selectedImage?.name || "edit-input",
          status: "processing",
          outputUrl: "",
          outputName: "",
        }],
      });
    }
    try {
      const result = await editImage({
        userId: user?.id || "",
        image: selectedImage.imageUrl,
        imageContext: effectiveEditReference,
        prompt: activeEditType === "background" ? backgroundPrompt : partialPrompt,
        editType: "background",
        preserveSubject: backgroundKeepSubject,
        outputPreset: "fourThree",
      });
      const outputUrl = String(result?.outputUrl || "").trim();
      if (!outputUrl) throw new Error("編集結果の取得に失敗しました");
      if (result?.job && typeof onJobCreated === "function") {
        onJobCreated(result.job);
      }
      setEditPreviewZoom(1);
      setMaskEnabled(false);
      setEditImageNaturalSize({ width: 0, height: 0 });
      setSelectedImage({
        id: `edit_${Date.now()}`,
        rawId: `edit_${Date.now()}`,
        name: `edit-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
        imageUrl: outputUrl,
        source: "edited",
      });
      setEditResultCards((prev) => prev.map((card) => (
        card.id === runId
          ? {
            ...card,
            status: "done",
            outputUrl,
            name: `edit-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
          }
          : card
      )));
      if (typeof onDataRefresh === "function") {
        await onDataRefresh();
      }
    } catch (error) {
      setEditResultCards((prev) => prev.map((card) => (
        card.id === runId
          ? {
            ...card,
            status: "error",
            error: error instanceof Error ? error.message : "編集に失敗しました",
          }
          : card
      )));
      setEditError(error instanceof Error ? error.message : "編集に失敗しました");
    } finally {
      setEditing(false);
    }
  }, [
    activeEditType,
    backgroundKeepSubject,
    backgroundPrompt,
    editing,
    effectiveEditReference,
    onJobCreated,
    onDataRefresh,
    partialPrompt,
    selectedImage,
    user?.id,
  ]);

  const renderReferenceDropzone = (title, helperText, emptyTitle) => (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 11, color: C.textSub, marginBottom: 6 }}>{title}</p>
      <input
        ref={backgroundReferenceInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          void onPickBackgroundReferenceFile(files);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => backgroundReferenceInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setReferenceDropActive(true);
        }}
        onDragLeave={() => setReferenceDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setReferenceDropActive(false);
          const files = Array.from(e.dataTransfer.files || []);
          void onPickBackgroundReferenceFile(files);
        }}
        style={{
          marginTop: 8,
          border: `1px dashed ${referenceDropActive ? C.goldBorder : C.border}`,
          background: referenceDropActive ? "linear-gradient(135deg, rgba(226,198,145,0.22), rgba(248,246,241,0.96))" : "linear-gradient(135deg, rgba(255,255,255,0.72), rgba(244,240,234,0.92))",
          borderRadius: 16,
          padding: 12,
          cursor: "pointer",
          transition: "all 0.18s ease",
          boxShadow: referenceDropActive ? "0 10px 24px rgba(191,165,122,0.16)" : "inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        {backgroundReferenceImage ? (
          <div style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ width: 72, aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <img src={backgroundReferenceImage.imageUrl} alt={backgroundReferenceImage.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: C.text, fontWeight: 600, marginBottom: 4 }}>参照画像を設定中</p>
              <p style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {backgroundReferenceImage.name}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBackgroundReferenceImage(null);
              }}
              style={{
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.textSub,
                fontSize: 10,
                padding: "7px 10px",
                cursor: "pointer",
              }}
            >
              クリア
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: C.surface, border: `1px solid ${C.borderLight}`, display: "grid", placeItems: "center", color: C.gold, fontSize: 17 }}>
              ＋
            </div>
            <div>
              <p style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 3 }}>{emptyTitle}</p>
              <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>
                クリックまたはドラッグ&ドロップ
              </p>
            </div>
          </div>
        )}
      </div>
      <p style={{ marginTop: 6, fontSize: 10, color: C.textSub, lineHeight: 1.55 }}>
        {helperText}
      </p>
    </div>
  );

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>
          Edit
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, marginBottom: 10 }}>編集</h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7 }}>
          中央で編集対象画像を確定し、右側で編集内容を指定します。履歴・スタジオ・モデル登録画像、またはローカル画像を利用できます。
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 360px", gap: 18, position: "relative" }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: C.textSub }}>編集対象画像</p>
            {selectedImage?.imageUrl && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                }}
              >
                <button
                  onClick={() => setEditPreviewZoom((z) => Math.max(1, Math.round((z - 0.2) * 5) / 5))}
                  disabled={editPreviewZoom <= 1}
                  style={{
                    width: 26,
                    height: 26,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: editPreviewZoom <= 1 ? "not-allowed" : "pointer",
                    fontSize: 14,
                    opacity: editPreviewZoom <= 1 ? 0.5 : 1,
                  }}
                >
                  −
                </button>
                <p style={{ fontSize: 11, color: C.textMid, minWidth: 48, textAlign: "center" }}>
                  {Math.round(editPreviewZoom * 100)}%
                </p>
                <button
                  onClick={() => setEditPreviewZoom((z) => Math.min(6, Math.round((z + 0.2) * 5) / 5))}
                  disabled={editPreviewZoom >= 6}
                  style={{
                    width: 26,
                    height: 26,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: editPreviewZoom >= 6 ? "not-allowed" : "pointer",
                    fontSize: 14,
                    opacity: editPreviewZoom >= 6 ? 0.5 : 1,
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>
          <div
            onClick={() => {
              if (!selectedImage?.imageUrl) inputRef.current?.click();
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const files = extractDroppedFiles(e.dataTransfer);
              void onPickLocalFiles(files);
            }}
            style={{
              border: `1.5px dashed ${dragging ? C.goldBorder : C.border}`,
              background: dragging ? C.goldLight : C.bg,
              minHeight: 520,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              cursor: selectedImage?.imageUrl ? "default" : "pointer",
              overflow: "auto",
            }}
            ref={editPreviewViewportRef}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                void onPickLocalFiles(files);
                e.target.value = "";
              }}
            />
            {selectedImage?.imageUrl ? (
              <div
                style={{
                  position: "relative",
                  display: "inline-block",
                  margin: "0 auto",
                  lineHeight: 0,
                }}
              >
                <img
                  ref={editImageRef}
                  src={selectedImage.imageUrl}
                  alt={selectedImage.name}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setEditImageNaturalSize({
                      width: img.naturalWidth || 0,
                      height: img.naturalHeight || 0,
                    });
                  }}
                  style={{
                    maxWidth: editPreviewZoom > 1 ? "none" : "100%",
                    maxHeight: editPreviewZoom > 1 ? "none" : 500,
                    width: editPreviewZoom > 1 ? `${Math.round(editPreviewZoom * 100)}%` : "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
                {maskEnabled && supportsMask && (
                  <canvas
                    ref={maskCanvasRef}
                    onPointerDown={(e) => {
                      const point = pointerToMaskCoord(e.clientX, e.clientY);
                      if (!point) return;
                      maskDrawingRef.current = true;
                      lastMaskPointRef.current = point;
                      drawMaskStroke(point, point);
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!maskDrawingRef.current) return;
                      const point = pointerToMaskCoord(e.clientX, e.clientY);
                      const prev = lastMaskPointRef.current;
                      if (!point || !prev) return;
                      drawMaskStroke(prev, point);
                      lastMaskPointRef.current = point;
                    }}
                    onPointerUp={(e) => {
                      maskDrawingRef.current = false;
                      lastMaskPointRef.current = null;
                      e.currentTarget.releasePointerCapture?.(e.pointerId);
                    }}
                    onPointerLeave={() => {
                      maskDrawingRef.current = false;
                      lastMaskPointRef.current = null;
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "crosshair",
                      opacity: maskPreviewOpacity,
                      mixBlendMode: "screen",
                      touchAction: "none",
                    }}
                  />
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 14, color: C.text, marginBottom: 6 }}>クリックまたはドロップで画像を追加</p>
                <p style={{ fontSize: 11, color: C.textSub }}>JPG / PNG / WEBP / HEIC</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <Btn size="sm" variant="secondary" onClick={() => { setEditPreviewZoom(1); setPickerOpen(true); }}>ライブラリから選択</Btn>
            <Btn size="sm" variant="ghost" onClick={() => { setEditPreviewZoom(1); setSelectedImage(null); }}>クリア</Btn>
            {selectedImage && (
              <span style={{ fontSize: 11, color: C.textSub, alignSelf: "center", marginLeft: 4 }}>
                {selectedImage.name}
              </span>
            )}
          </div>
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.borderLight}`, paddingTop: 10 }}>
            <p style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>編集結果</p>
            {editResultCards.length === 0 ? (
              <p style={{ fontSize: 11, color: C.textSub }}>編集を実行するとここに結果が表示されます。</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {editResultCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      if (!card.outputUrl) return;
                      setEditPreviewZoom(1);
                      setSelectedImage({
                        id: `result_${card.id}`,
                        rawId: `result_${card.id}`,
                        name: card.name || "edit-result",
                        imageUrl: card.outputUrl,
                        source: "edited",
                      });
                    }}
                    style={{
                      border: `1px solid ${C.borderLight}`,
                      background: C.surface,
                      padding: 0,
                      textAlign: "left",
                      cursor: card.outputUrl ? "pointer" : "default",
                    }}
                  >
                    <div style={{ aspectRatio: "3/4", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      {(card.outputUrl || card.inputPreviewUrl) ? (
                        <img
                          src={card.outputUrl || card.inputPreviewUrl}
                          alt={card.name || "edit-result"}
                          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: card.status === "processing" ? 0.72 : 1 }}
                        />
                      ) : null}
                      {card.status === "processing" && (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.28)" }}>
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              border: `2px solid ${C.gold}`,
                              borderTopColor: "transparent",
                              animation: "spin 0.8s linear infinite",
                              display: "inline-block",
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "6px 7px" }}>
                      <p style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {card.name || "edit-result"}
                      </p>
                      <p style={{ fontSize: 10, color: card.status === "error" ? C.red : C.textSub }}>
                        {card.status === "done" ? "完了" : card.status === "error" ? "エラー" : "生成中..."}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <MobileFixedLayer active={isMobile}>
        <>
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          padding: 14,
          ...(isMobile ? {
            pointerEvents: mobileSettingsOpen ? "auto" : "none",
            position: "fixed",
            top: 0,
            right: 0,
            width: "min(360px, 88vw)",
            height: "100dvh",
            background: C.bg,
            borderLeft: `1px solid ${C.border}`,
            boxShadow: "-20px 0 40px rgba(25,18,10,0.16)",
            overflowY: "auto",
            zIndex: 1200,
            transform: mobileSettingsOpen ? "translateX(0)" : "translateX(100%)",
            transition: "transform 0.24s ease",
          } : {}),
        }}
          data-testid="edit-mobile-settings-sheet"
          data-open={mobileSettingsOpen ? "true" : "false"}
        >
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase" }}>設定</p>
              <button
                onClick={() => setMobileSettingsOpen(false)}
                style={{ border: "none", background: "transparent", color: C.textSub, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          )}
          <p style={{ fontSize: 11, color: C.textSub, marginBottom: 10 }}>編集タイプ</p>
          <div style={{ display: "grid", gap: 8 }}>
            {EDIT_TYPES.map((type) => (
              <div key={type.id} style={{ border: `1px solid ${activeEditType === type.id ? C.goldBorder : C.border}`, background: C.bg }}>
                <button
                  onClick={() => setActiveEditType(type.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: activeEditType === type.id ? C.goldLight : C.surface,
                    color: C.text,
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{type.label}</p>
                  <p style={{ marginTop: 2, fontSize: 10, color: C.textSub }}>{type.desc}</p>
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderLight}` }}>
            <p style={{ fontSize: 11, color: C.textSub, marginBottom: 6 }}>
              {activeEditType === "background" ? "背景変更プロンプト" : "修正内容プロンプト"}
            </p>
            <textarea
              value={activePromptValue}
              onChange={(e) => {
                if (activeEditType === "background") setBackgroundPrompt(e.target.value);
                else setPartialPrompt(e.target.value);
              }}
              rows={5}
              placeholder={promptPlaceholderByType[activeEditType] || "編集内容を入力してください。"}
              style={{ width: "100%", border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, padding: 10, resize: "vertical" }}
            />

            {activeEditType === "partial" && (
              renderReferenceDropzone(
                "参照画像",
                "修正したいロゴ・文字・ディテールの参照画像を `image_context` として送信します。",
                "参照画像を追加",
              )
            )}

            {activeEditType === "background" && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 11, color: C.textSub, marginBottom: 6 }}>参照方法</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <button
                    onClick={() => setEditBackgroundReferenceMode("upload")}
                    style={{
                      border: `1px solid ${editBackgroundReferenceMode === "upload" ? C.goldBorder : C.border}`,
                      background: editBackgroundReferenceMode === "upload" ? C.goldLight : C.surface,
                      color: editBackgroundReferenceMode === "upload" ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "9px 10px",
                      cursor: "pointer",
                    }}
                  >
                    画像を追加
                  </button>
                  <button
                    onClick={() => setEditBackgroundReferenceMode("studio")}
                    style={{
                      border: `1px solid ${editBackgroundReferenceMode === "studio" ? C.goldBorder : C.border}`,
                      background: editBackgroundReferenceMode === "studio" ? C.goldLight : C.surface,
                      color: editBackgroundReferenceMode === "studio" ? C.text : C.textSub,
                      fontSize: 11,
                      padding: "9px 10px",
                      cursor: "pointer",
                    }}
                  >
                    背景を選択
                  </button>
                </div>
                {editBackgroundReferenceMode === "upload" && renderReferenceDropzone(
                  "参照背景画像",
                  "アップロードした背景画像を `image_context` として送信します。",
                  "背景画像を追加",
                )}
                {editBackgroundReferenceMode === "studio" && (
                  <>
                    <p style={{ fontSize: 11, color: C.textSub, marginTop: 10, marginBottom: 6 }}>スタジオ選択</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, maxHeight: 220, overflowY: "auto", border: `1px solid ${C.borderLight}`, padding: 8, background: C.bg }}>
                      {studioItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedStudioItemId(item.id)}
                          style={{
                            border: `1px solid ${selectedStudioItemId === item.id ? C.goldBorder : C.border}`,
                            background: selectedStudioItemId === item.id ? C.goldLight : C.surface,
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ aspectRatio: "1 / 1", background: C.bg }}>
                            <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                          <p style={{ fontSize: 9, color: C.textSub, padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.name}
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <label style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.textSub }}>
                  <input type="checkbox" checked={backgroundKeepSubject} onChange={(e) => setBackgroundKeepSubject(Boolean(e.target.checked))} />
                  顔/服は維持（ポーズ・立ち位置は調整可）
                </label>
              </div>
            )}

          </div>
          <div style={{ marginTop: 12 }}>
            <Btn
              variant="primary"
              full
              onClick={runEdit}
              disabled={
                editing
                || !selectedImage
                || !effectiveEditReference
              }
            >
              {editing ? "編集中..." : "編集を実行"}
            </Btn>
            {editError && (
              <p style={{ marginTop: 8, fontSize: 11, color: C.red }}>{editError}</p>
            )}
          </div>
        </div>
      {isMobile && (
        <MobileSheetHandle
          label="編集"
          open={mobileSettingsOpen}
          onClick={() => setMobileSettingsOpen((prev) => !prev)}
          style={{
            top: 84,
            right: mobileSettingsOpen ? "min(360px, 88vw)" : 0,
            zIndex: 1210,
            transition: "right 0.24s ease",
          }}
        />
      )}
      </>
      </MobileFixedLayer>
      </div>

      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 94vw)",
              maxHeight: "82vh",
              background: C.surface,
              border: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}` }}>
              <p style={{ fontSize: 12, color: C.text }}>画像を選択</p>
              <button onClick={() => setPickerOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: C.textMid }}>×</button>
            </div>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.borderLight}`, display: "flex", gap: 8 }}>
              {[
                { id: "history", label: "生成履歴" },
                { id: "studio", label: "スタジオ" },
                { id: "model", label: "モデル" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setPickerTab(opt.id)}
                  style={{
                    border: `1px solid ${pickerTab === opt.id ? C.goldBorder : C.border}`,
                    background: pickerTab === opt.id ? C.goldLight : C.surface,
                    color: pickerTab === opt.id ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "7px 10px",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 12, overflowY: "auto", maxHeight: "64vh" }}>
              {pickerItems.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {pickerItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setEditPreviewZoom(1);
                        setSelectedImage(item);
                        setPickerOpen(false);
                      }}
                      style={{ border: `1px solid ${C.borderLight}`, background: C.surface, padding: 0, textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={{ aspectRatio: "3/4", background: C.bg }}>
                        <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div style={{ padding: "7px 8px" }}>
                        <p style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: C.textSub }}>選択できる画像がありません。</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetLibraryPage({
  title,
  subtitle,
  emptyText,
  assets,
  setAssets,
  favoriteEnabled = false,
  isDemo = false,
  uploadStyle = "default",
  cardStyle = "default",
}) {
  const inputRef = useRef(null);
  const viewerCanvasRef = useRef(null);
  const prevViewerZoomRef = useRef(1);
  const [viewer, setViewer] = useState(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [viewerViewportSize, setViewerViewportSize] = useState({ width: 0, height: 0 });
  const [viewerImageNaturalSize, setViewerImageNaturalSize] = useState({ width: 0, height: 0 });

  const addAssets = useCallback(async (newFiles) => {
    const imageFiles = (newFiles || []).filter((file) => (file.type || "").startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ""));
    if (imageFiles.length === 0) return;

    const converted = await Promise.all(imageFiles.map(async (file) => ({
      id: `asset_${Math.random().toString(36).slice(2, 10)}`,
      name: file.name,
      dataUrl: await fileToRenderableDataUrl(file),
      builtIn: false,
      favorite: false,
      createdAt: new Date().toISOString(),
    })));

    setAssets((prev) => [...converted, ...prev]);
  }, [setAssets]);

  const removeAsset = useCallback((assetId) => {
    setAssets((prev) => prev.filter((asset) => !(asset.id === assetId && !asset.builtIn)));
  }, [setAssets]);

  const toggleFavorite = useCallback((assetId) => {
    setAssets((prev) => prev.map((asset) => (
      asset.id === assetId ? { ...asset, favorite: !asset.favorite } : asset
    )));
  }, [setAssets]);

  const openViewer = useCallback((index) => {
    if (!assets.length) return;
    setViewerZoom(1);
    setViewer({
      items: assets,
      index,
      title: title || "画像",
    });
  }, [assets, title]);

  const closeViewer = useCallback(() => {
    setViewer(null);
    setViewerZoom(1);
  }, []);

  const goPrev = useCallback(() => {
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      const nextIndex = (prev.index - 1 + prev.items.length) % prev.items.length;
      return { ...prev, index: nextIndex };
    });
  }, []);

  const goNext = useCallback(() => {
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      const nextIndex = (prev.index + 1) % prev.items.length;
      return { ...prev, index: nextIndex };
    });
  }, []);
  const deleteViewerAssetAndGoNext = useCallback(() => {
    if (isDemo) return;
    let targetId = "";
    setViewer((prev) => {
      if (!prev || !prev.items.length) return prev;
      const current = prev.items[prev.index];
      if (!current || current.builtIn) return prev;
      targetId = current.id;
      const nextItems = prev.items.filter((asset) => asset.id !== current.id);
      if (nextItems.length === 0) return null;
      const nextIndex = Math.min(prev.index, nextItems.length - 1);
      return { ...prev, items: nextItems, index: nextIndex };
    });
    if (targetId) removeAsset(targetId);
  }, [isDemo, removeAsset]);
  const zoomMin = 1;
  const zoomMax = 6;
  const renderedImageSize = useMemo(() => {
    const naturalW = viewerImageNaturalSize.width;
    const naturalH = viewerImageNaturalSize.height;
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!naturalW || !naturalH || !viewportW || !viewportH) return null;
    const fitScale = Math.min(viewportW / naturalW, viewportH / naturalH);
    const baseW = Math.max(1, naturalW * fitScale);
    const baseH = Math.max(1, naturalH * fitScale);
    return {
      width: baseW * viewerZoom,
      height: baseH * viewerZoom,
    };
  }, [viewerImageNaturalSize.height, viewerImageNaturalSize.width, viewerViewportSize.height, viewerViewportSize.width, viewerZoom]);
  const canvasSize = useMemo(() => {
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!viewportW || !viewportH) return null;
    const renderW = renderedImageSize?.width || viewportW;
    const renderH = renderedImageSize?.height || viewportH;
    return {
      width: Math.max(viewportW, renderW),
      height: Math.max(viewportH, renderH),
    };
  }, [renderedImageSize?.height, renderedImageSize?.width, viewerViewportSize.height, viewerViewportSize.width]);
  const downloadModelAsset = useCallback(async (asset) => {
    const sourceUrl = String(asset?.outputUrl || asset?.dataUrl || "");
    if (!sourceUrl || typeof document === "undefined") return;
    const toCompactStamp = (value) => {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(+d)) return `${Date.now()}`;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${ms}`;
    };
    const createdStamp = toCompactStamp(asset?.createdAt);
    const saveStamp = toCompactStamp();
    const assetToken = String(asset?.id || "na").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "na";
    const rand = Math.random().toString(36).slice(2, 8);
    const safeBase = `model-${createdStamp}-${assetToken}-${saveStamp}-${rand}`;
    let ext = "jpg";
    if (sourceUrl.startsWith("data:image/png")) ext = "png";
    else if (sourceUrl.startsWith("data:image/webp")) ext = "webp";
    else if (sourceUrl.startsWith("data:image/jpeg")) ext = "jpg";
    else {
      const match = sourceUrl.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
      if (match && match[1]) ext = match[1].toLowerCase();
    }

    try {
      const response = await fetch(sourceUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${safeBase}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const fallback = document.createElement("a");
      fallback.href = sourceUrl;
      fallback.download = `${safeBase}.${ext}`;
      fallback.rel = "noopener";
      document.body.appendChild(fallback);
      fallback.click();
      document.body.removeChild(fallback);
    }
  }, []);
  useEffect(() => {
    const el = viewerCanvasRef.current;
    if (!el || !viewer || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      setViewerViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewer]);
  useEffect(() => {
    const viewport = viewerCanvasRef.current;
    if (!viewport) {
      prevViewerZoomRef.current = viewerZoom;
      return;
    }
    const prevZoom = prevViewerZoomRef.current;
    if (Math.abs(prevZoom - viewerZoom) < 0.0001) return;
    const clientW = viewport.clientWidth;
    const clientH = viewport.clientHeight;
    const prevScrollW = Math.max(viewport.scrollWidth, 1);
    const prevScrollH = Math.max(viewport.scrollHeight, 1);
    const centerXRatio = (viewport.scrollLeft + clientW / 2) / prevScrollW;
    const centerYRatio = (viewport.scrollTop + clientH / 2) / prevScrollH;
    requestAnimationFrame(() => {
      const nextScrollW = Math.max(viewport.scrollWidth, 1);
      const nextScrollH = Math.max(viewport.scrollHeight, 1);
      viewport.scrollLeft = Math.max(0, Math.min(nextScrollW - clientW, centerXRatio * nextScrollW - clientW / 2));
      viewport.scrollTop = Math.max(0, Math.min(nextScrollH - clientH, centerYRatio * nextScrollH - clientH / 2));
      prevViewerZoomRef.current = viewerZoom;
    });
  }, [viewerZoom]);
  useEffect(() => {
    setViewerImageNaturalSize({ width: 0, height: 0 });
    prevViewerZoomRef.current = viewerZoom;
  }, [viewer?.index]);
  useEffect(() => {
    if (!viewer) return;
    if (!assets.length) {
      setViewer(null);
      return;
    }
    const currentId = viewer.items?.[viewer.index]?.id;
    if (!currentId) {
      setViewer((prev) => {
        if (!prev) return prev;
        return { ...prev, items: assets, index: 0 };
      });
      return;
    }
    const nextIndex = assets.findIndex((asset) => asset.id === currentId);
    if (nextIndex < 0) {
      const fallbackIndex = Math.min(viewer.index, assets.length - 1);
      setViewer((prev) => {
        if (!prev) return prev;
        if (prev.items === assets && prev.index === fallbackIndex) return prev;
        return { ...prev, items: assets, index: fallbackIndex };
      });
      return;
    }
    setViewer((prev) => {
      if (!prev) return prev;
      if (prev.items === assets && prev.index === nextIndex) return prev;
      return { ...prev, items: assets, index: nextIndex };
    });
  }, [assets, viewer]);

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>
          Library
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, marginBottom: 10 }}>{title}</h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7 }}>{subtitle}</p>
      </div>

      <div
        onClick={() => { if (!isDemo) inputRef.current?.click(); }}
        onDragOver={(e) => {
          if (isDemo) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (isDemo) return;
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          if (isDemo) return;
          e.preventDefault();
          setDragging(false);
          const files = extractDroppedFiles(e.dataTransfer);
          void addAssets(files);
        }}
        style={{
          border: `1.5px dashed ${dragging ? C.goldBorder : C.border}`,
          background: dragging ? C.goldLight : C.surface,
          borderRadius: uploadStyle === "productLike" ? 2 : 0,
          padding: uploadStyle === "productLike" ? "42px 32px" : "24px 22px",
          marginBottom: 18,
          textAlign: uploadStyle === "productLike" ? "center" : "left",
          cursor: isDemo ? "not-allowed" : "pointer",
          opacity: isDemo ? 0.7 : 1,
          position: uploadStyle === "productLike" ? "relative" : "static",
          transition: "all 0.12s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          style={{ display: "none" }}
          onChange={(e) => {
            if (isDemo) return;
            const next = Array.from(e.target.files || []);
            void addAssets(next);
            e.target.value = "";
          }}
        />
        {uploadStyle === "productLike" ? (
          <>
            {[
              { top: 12, left: 12 }, { top: 12, right: 12 },
              { bottom: 12, left: 12 }, { bottom: 12, right: 12 },
            ].map((pos, i) => (
              <div key={`asset_corner_${i}`} style={{
                position: "absolute", width: 14, height: 14,
                borderColor: C.goldBorder, borderStyle: "solid",
                borderWidth: `${i < 2 ? 1 : 0}px 0 ${i >= 2 ? 1 : 0}px`,
                borderLeftWidth: i % 2 === 0 ? 1 : 0,
                borderRightWidth: i % 2 === 1 ? 1 : 0,
                ...pos,
              }} />
            ))}
            <div style={{ fontSize: 28, color: C.gold, marginBottom: 10, fontFamily: SERIF }}>+</div>
            <p style={{ fontFamily: SERIF, fontSize: 19, color: C.text, marginBottom: 6, letterSpacing: "0.03em" }}>
              画像をドロップ、またはクリックして選択
            </p>
            <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              JPG · PNG · WEBP · HEIC
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>画像を追加</p>
            <p style={{ fontSize: 11, color: C.textSub }}>JPG / PNG / WEBP / HEIC 対応</p>
          </>
        )}
      </div>
      {isDemo && (
        <div style={{ background: C.goldLight, border: `1px solid ${C.goldBorder}`, padding: "10px 12px", marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: C.textMid }}>
            背景登録は有料プランでのみ利用できます。
          </p>
        </div>
      )}

      {assets.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {assets.map((asset, idx) => (
            <div key={asset.id} style={{ background: C.surface, border: `1px solid ${favoriteEnabled && asset.favorite ? C.goldBorder : C.border}` }}>
              <button
                onClick={() => openViewer(idx)}
                style={{ aspectRatio: "3/4", background: C.bg, border: "none", padding: 0, width: "100%", display: "block", cursor: "default", position: "relative" }}
              >
                <img
                  src={getAssetThumbnailUrl(asset)}
                  alt={asset.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: cardStyle === "modelLike" ? "center top" : "center",
                    display: "block",
                  }}
                />
                {favoriteEnabled && cardStyle === "modelLike" && (
                  <button
                    disabled={isDemo}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(asset.id);
                    }}
                    aria-label={asset.favorite ? "お気に入り解除" : "お気に入り"}
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: `1px solid ${asset.favorite ? "rgba(188,57,69,0.35)" : "rgba(255,255,255,0.65)"}`,
                      background: "rgba(255,255,255,0.9)",
                      color: asset.favorite ? "#d14b58" : "rgba(82,72,58,0.58)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      lineHeight: 1,
                      cursor: isDemo ? "not-allowed" : "pointer",
                      boxShadow: "0 8px 18px rgba(38,30,20,0.14)",
                      backdropFilter: "blur(8px)",
                      padding: 0,
                      opacity: isDemo ? 0.55 : 1,
                    }}
                  >
                    ♥
                  </button>
                )}
              </button>
              {cardStyle !== "modelLike" && (
                <div style={{ padding: "8px 9px", borderTop: `1px solid ${C.borderLight}` }}>
                  <p style={{ fontSize: 10, color: C.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {favoriteEnabled && (
                      <button
                        disabled={isDemo}
                        onClick={() => toggleFavorite(asset.id)}
                        style={{ background: "none", border: "none", color: asset.favorite ? C.gold : C.textSub, fontSize: 11, cursor: isDemo ? "not-allowed" : "pointer", padding: 0, opacity: isDemo ? 0.55 : 1 }}
                      >
                        {asset.favorite ? "★ お気に入り" : "☆ お気に入り"}
                      </button>
                    )}
                    {!asset.builtIn && !isDemo && (
                      <button
                        onClick={() => removeAsset(asset.id)}
                        style={{ background: "none", border: "none", color: C.red, fontSize: 11, cursor: "pointer", padding: 0 }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 20, color: C.textSub, fontSize: 13 }}>
          {emptyText}
        </div>
      )}

      {viewer && viewer.items.length > 0 && typeof document !== "undefined" && createPortal((
        <div
          onClick={closeViewer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,10,8,0.78)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            overflow: "hidden",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "calc(100vw - 28px)",
              height: "calc(100vh - 28px)",
              background: C.surface,
              border: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {viewer.items[viewer.index]?.name || ""}
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                }}
              >
                <button
                  onClick={() => setViewerZoom((z) => Math.max(zoomMin, Math.round((z - 0.2) * 5) / 5))}
                  disabled={viewerZoom <= zoomMin}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom <= zoomMin ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom <= zoomMin ? 0.5 : 1,
                  }}
                >
                  −
                </button>
                <p style={{ fontSize: 12, color: C.textMid, minWidth: 56, textAlign: "center" }}>
                  {Math.round(viewerZoom * 100)}%
                </p>
                <button
                  onClick={() => setViewerZoom((z) => Math.min(zoomMax, Math.round((z + 0.2) * 5) / 5))}
                  disabled={viewerZoom >= zoomMax}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom >= zoomMax ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom >= zoomMax ? 0.5 : 1,
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
                <p style={{ fontSize: 12, color: C.textMid }}>{viewer.index + 1}/{viewer.items.length}</p>
                {!isDemo && !viewer.items[viewer.index]?.builtIn && (
                  <button
                    onClick={deleteViewerAssetAndGoNext}
                    style={{
                      border: `1px solid ${C.red}`,
                      background: C.red,
                      color: C.surface,
                      cursor: "pointer",
                      fontSize: 11,
                      height: 28,
                      padding: "0 10px",
                    }}
                  >
                    削除
                  </button>
                )}
                <button onClick={closeViewer} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: C.textMid }}>×</button>
              </div>
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: 0, background: C.bg, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: 0,
                  overflow: viewerZoom > 1.0001 ? "auto" : "hidden",
                  scrollbarGutter: "stable both-edges",
                }}
                ref={viewerCanvasRef}
              >
                <div
                  style={{
                    position: "relative",
                    width: canvasSize ? `${canvasSize.width}px` : "100%",
                    height: canvasSize ? `${canvasSize.height}px` : "100%",
                  }}
                >
                  <img
                    src={viewer.items[viewer.index]?.outputUrl || viewer.items[viewer.index]?.dataUrl || ""}
                    alt={viewer.items[viewer.index]?.name || "preview"}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setViewerImageNaturalSize({
                        width: img.naturalWidth || 0,
                        height: img.naturalHeight || 0,
                      });
                    }}
                    style={{
                      position: "absolute",
                      left: canvasSize && renderedImageSize ? `${(canvasSize.width - renderedImageSize.width) / 2}px` : 0,
                      top: canvasSize && renderedImageSize ? `${(canvasSize.height - renderedImageSize.height) / 2}px` : 0,
                      width: renderedImageSize ? `${renderedImageSize.width}px` : "100%",
                      height: renderedImageSize ? `${renderedImageSize.height}px` : "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </div>
              </div>
              {viewer.items.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={goNext}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
              <p style={{ fontSize: 11, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewer.items[viewer.index]?.name || ""}
              </p>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function ProductsLibraryPage({ user, assets, setAssets }) {
  const inputRef = useRef(null);
  const viewerCanvasRef = useRef(null);
  const categoryMenuRef = useRef(null);
  const prevViewerZoomRef = useRef(1);
  const [viewer, setViewer] = useState(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerViewportSize, setViewerViewportSize] = useState({ width: 0, height: 0 });
  const [viewerImageNaturalSize, setViewerImageNaturalSize] = useState({ width: 0, height: 0 });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [draggingProduct, setDraggingProduct] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const addAssets = useCallback(async (newFiles) => {
    const imageFiles = (newFiles || []).filter((file) => (
      (file.type || "").startsWith("image/")
      || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "")
    ));
    if (imageFiles.length === 0) return;
    if (imageFiles.length > PRODUCT_UPLOAD_MAX_PER_BATCH) {
      setUploadError(`一度に追加できるのは最大${PRODUCT_UPLOAD_MAX_PER_BATCH}枚までです。`);
      return;
    }
    setUploadError("");

    const converted = [];
    for (const file of imageFiles) {
      try {
        const dataUrl = await fileToRenderableDataUrl(file);
        await ensureImageWithinMegapixels(dataUrl, PRODUCT_UPLOAD_MAX_MP);
        converted.push({
          id: `prd_${Math.random().toString(36).slice(2, 10)}`,
          name: file.name,
          dataUrl,
          category: "unassigned",
          builtIn: false,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "画像の追加に失敗しました。");
        return;
      }
    }

    setAssets((prev) => [...converted, ...prev]);
  }, [setAssets]);

  const removeAsset = useCallback((assetId) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  }, [setAssets]);
  const removeAssets = useCallback((assetIds) => {
    const idSet = new Set(Array.isArray(assetIds) ? assetIds : []);
    if (idSet.size === 0) return;
    setAssets((prev) => prev.filter((asset) => !idSet.has(asset.id)));
    setSelectedAssetIds((prev) => prev.filter((id) => !idSet.has(id)));
  }, [setAssets]);

  const updateCategory = useCallback((assetId, nextCategory) => {
    setAssets((prev) => prev.map((asset) => (
      asset.id === assetId ? { ...asset, category: nextCategory } : asset
    )));
  }, [setAssets]);

  const openViewer = useCallback((index) => {
    if (!assets.length) return;
    setViewerZoom(1);
    setViewer({
      items: assets,
      index,
      title: "商品",
    });
  }, [assets]);

  const closeViewer = useCallback(() => {
    setViewer(null);
    setViewerZoom(1);
  }, []);
  const currentViewerItem = viewer?.items?.[viewer.index] || null;

  const goPrev = useCallback(() => {
    setViewerZoom(1);
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      return { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length };
    });
  }, []);

  const goNext = useCallback(() => {
    setViewerZoom(1);
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      return { ...prev, index: (prev.index + 1) % prev.items.length };
    });
  }, []);
  const zoomMin = 1;
  const zoomMax = 6;

  useEffect(() => {
    setViewerImageNaturalSize({ width: 0, height: 0 });
  }, [viewer?.index]);
  useEffect(() => {
    const viewport = viewerCanvasRef.current;
    if (!viewport) {
      prevViewerZoomRef.current = viewerZoom;
      return;
    }
    const prevZoom = prevViewerZoomRef.current;
    if (Math.abs(prevZoom - viewerZoom) < 0.0001) return;

    const clientW = viewport.clientWidth;
    const clientH = viewport.clientHeight;
    const prevScrollW = Math.max(viewport.scrollWidth, 1);
    const prevScrollH = Math.max(viewport.scrollHeight, 1);
    const centerXRatio = (viewport.scrollLeft + clientW / 2) / prevScrollW;
    const centerYRatio = (viewport.scrollTop + clientH / 2) / prevScrollH;

    requestAnimationFrame(() => {
      const nextScrollW = Math.max(viewport.scrollWidth, 1);
      const nextScrollH = Math.max(viewport.scrollHeight, 1);
      const nextLeft = Math.max(0, Math.min(nextScrollW - clientW, centerXRatio * nextScrollW - clientW / 2));
      const nextTop = Math.max(0, Math.min(nextScrollH - clientH, centerYRatio * nextScrollH - clientH / 2));
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
      prevViewerZoomRef.current = viewerZoom;
    });
  }, [viewerZoom]);
  useEffect(() => {
    prevViewerZoomRef.current = viewerZoom;
    const viewport = viewerCanvasRef.current;
    if (!viewport) return;
    if (viewerZoom <= 1.0001) {
      const centerLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      const centerTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
      viewport.scrollLeft = centerLeft;
      viewport.scrollTop = centerTop;
    }
  }, [viewer?.index, viewer?.items?.length, viewerZoom]);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!viewer) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [viewer]);
  useEffect(() => {
    const el = viewerCanvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      setViewerViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewer]);
  useEffect(() => {
    if (!openCategoryMenuId) return undefined;
    const onPointerDown = (e) => {
      const root = categoryMenuRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setOpenCategoryMenuId("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openCategoryMenuId]);

  const renderedImageSize = useMemo(() => {
    const naturalW = viewerImageNaturalSize.width;
    const naturalH = viewerImageNaturalSize.height;
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!naturalW || !naturalH || !viewportW || !viewportH) return null;
    const fitScale = Math.min(viewportW / naturalW, viewportH / naturalH);
    const baseW = Math.max(1, naturalW * fitScale);
    const baseH = Math.max(1, naturalH * fitScale);
    return {
      width: baseW * viewerZoom,
      height: baseH * viewerZoom,
    };
  }, [viewerImageNaturalSize.height, viewerImageNaturalSize.width, viewerViewportSize.height, viewerViewportSize.width, viewerZoom]);
  const canvasSize = useMemo(() => {
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!viewportW || !viewportH) return null;
    const renderW = renderedImageSize?.width || viewportW;
    const renderH = renderedImageSize?.height || viewportH;
    return {
      width: Math.max(viewportW, renderW),
      height: Math.max(viewportH, renderH),
    };
  }, [renderedImageSize?.height, renderedImageSize?.width, viewerViewportSize.height, viewerViewportSize.width]);

  const filteredAssets = useMemo(() => {
    if (categoryFilter === "all") return assets;
    return assets.filter((asset) => (asset.category || "unassigned") === categoryFilter);
  }, [assets, categoryFilter]);
  const toggleSelectAsset = useCallback((assetId) => {
    setSelectedAssetIds((prev) => (
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId]
    ));
  }, []);
  const selectAllFilteredAssets = useCallback(() => {
    setSelectedAssetIds(filteredAssets.map((asset) => asset.id));
  }, [filteredAssets]);
  const clearSelectedAssets = useCallback(() => setSelectedAssetIds([]), []);
  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>
          Products
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, marginBottom: 10 }}>商品</h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7 }}>
          自社商品を先に登録して、必要に応じてカテゴリをつけておくとルック生成で選びやすくなります。カテゴリ未設定でも利用できます。
        </p>
      </div>

      <div
        onClick={() => { if (!user?.isDemo) inputRef.current?.click(); }}
        onDragOver={(e) => {
          if (user?.isDemo) return;
          e.preventDefault();
          setDraggingProduct(true);
        }}
        onDragLeave={(e) => {
          if (user?.isDemo) return;
          e.preventDefault();
          setDraggingProduct(false);
        }}
        onDrop={(e) => {
          if (user?.isDemo) return;
          e.preventDefault();
          setDraggingProduct(false);
          const files = extractDroppedFiles(e.dataTransfer);
          void addAssets(files);
        }}
        style={{
          border: `1.5px dashed ${draggingProduct ? C.goldBorder : C.border}`,
          background: draggingProduct ? C.goldLight : C.surface,
          borderRadius: 2,
          padding: "42px 32px",
          marginBottom: 18,
          textAlign: "center",
          cursor: user?.isDemo ? "not-allowed" : "pointer",
          opacity: user?.isDemo ? 0.7 : 1,
          position: "relative",
          transition: "all 0.12s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          style={{ display: "none" }}
          onChange={(e) => {
            if (user?.isDemo) return;
            const next = Array.from(e.target.files || []);
            void addAssets(next);
            e.target.value = "";
          }}
        />
        {[
          { top: 12, left: 12 }, { top: 12, right: 12 },
          { bottom: 12, left: 12 }, { bottom: 12, right: 12 },
        ].map((pos, i) => (
          <div key={`prd_corner_${i}`} style={{
            position: "absolute", width: 14, height: 14,
            borderColor: C.goldBorder, borderStyle: "solid",
            borderWidth: `${i < 2 ? 1 : 0}px 0 ${i >= 2 ? 1 : 0}px`,
            borderLeftWidth: i % 2 === 0 ? 1 : 0,
            borderRightWidth: i % 2 === 1 ? 1 : 0,
            ...pos,
          }} />
        ))}
        <div style={{ fontSize: 28, color: C.gold, marginBottom: 10, fontFamily: SERIF }}>+</div>
        <p style={{ fontFamily: SERIF, fontSize: 19, color: C.text, marginBottom: 6, letterSpacing: "0.03em" }}>
          商品画像をアップロード
        </p>
        <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          JPG · PNG · WEBP · HEIC
        </p>
      </div>
      {uploadError && (
        <p style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>{uploadError}</p>
      )}

      {assets.length > 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "all", label: "すべて" },
                ...PRODUCT_CATEGORY_OPTIONS,
              ].map((opt) => (
                <button
                  key={`product_filter_${opt.id}`}
                  onClick={() => setCategoryFilter(opt.id)}
                  style={{
                    border: `1px solid ${categoryFilter === opt.id ? C.goldBorder : C.border}`,
                    background: categoryFilter === opt.id ? C.goldLight : C.surface,
                    color: categoryFilter === opt.id ? C.text : C.textSub,
                    fontSize: 11,
                    padding: "7px 10px",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {!user?.isDemo && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {!selectionMode ? (
                  <Btn size="sm" variant="ghost" onClick={() => setSelectionMode(true)}>選択</Btn>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: C.textSub }}>{selectedAssetIds.length} 件選択中</span>
                    <Btn size="sm" variant="ghost" onClick={cancelSelection}>選択解除</Btn>
                    <Btn size="sm" variant="ghost" onClick={selectAllFilteredAssets} disabled={filteredAssets.length === 0}>全て選択</Btn>
                    <Btn
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (selectedAssetIds.length === 0) return;
                        if (window.confirm(`選択した ${selectedAssetIds.length} 件の商品画像を削除しますか？`)) {
                          removeAssets(selectedAssetIds);
                          setSelectionMode(false);
                        }
                      }}
                      disabled={selectedAssetIds.length === 0}
                    >
                      選択を削除
                    </Btn>
                  </>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {filteredAssets.map((asset, idx) => (
            <div key={asset.id} style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <button
                onClick={() => {
                  if (selectionMode) {
                    toggleSelectAsset(asset.id);
                    return;
                  }
                  openViewer(assets.findIndex((v) => v.id === asset.id));
                }}
                style={{ aspectRatio: "3/4", background: C.bg, border: "none", padding: 0, width: "100%", display: "block", cursor: "pointer", position: "relative" }}
              >
                <img src={getAssetThumbnailUrl(asset)} alt={asset.name} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {selectionMode && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: `1px solid ${selectedAssetIds.includes(asset.id) ? C.goldBorder : C.border}`,
                      background: selectedAssetIds.includes(asset.id) ? C.gold : "rgba(255,255,255,0.92)",
                      color: selectedAssetIds.includes(asset.id) ? "#fff" : "transparent",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
              <div style={{ padding: "8px 9px", borderTop: `1px solid ${C.borderLight}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    ref={openCategoryMenuId === asset.id ? categoryMenuRef : null}
                    style={{
                      position: "relative",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <button
                      onClick={() => setOpenCategoryMenuId((prev) => (prev === asset.id ? "" : asset.id))}
                      style={{
                        width: "100%",
                        border: `1px solid ${openCategoryMenuId === asset.id ? C.goldBorder : C.border}`,
                        background: openCategoryMenuId === asset.id
                          ? "linear-gradient(135deg, rgba(226,198,145,0.24), rgba(248,246,241,0.98))"
                          : "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(244,240,234,0.96))",
                        color: C.text,
                        fontSize: 11,
                        padding: "8px 34px 8px 10px",
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        textAlign: "left",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                      }}
                    >
                      {PRODUCT_CATEGORY_OPTIONS.find((opt) => opt.id === (asset.category || "unassigned"))?.label || "未分類"}
                    </button>
                    <span style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: C.textSub,
                      fontSize: 10,
                      pointerEvents: "none",
                    }}
                    >
                      {openCategoryMenuId === asset.id ? "▲" : "▼"}
                    </span>
                    {openCategoryMenuId === asset.id && (
                      <div style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        border: `1px solid ${C.goldBorder}`,
                        background: "rgba(248,246,241,0.96)",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 16px 32px rgba(42,32,18,0.16)",
                        padding: 6,
                        display: "grid",
                        gap: 4,
                      }}>
                        {PRODUCT_CATEGORY_OPTIONS.map((opt) => {
                          const selected = (asset.category || "unassigned") === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                updateCategory(asset.id, opt.id);
                                setOpenCategoryMenuId("");
                              }}
                              style={{
                                border: `1px solid ${selected ? C.goldBorder : "transparent"}`,
                                background: selected ? C.goldLight : "transparent",
                                color: selected ? C.text : C.textSub,
                                cursor: "pointer",
                                padding: "9px 10px",
                                textAlign: "left",
                                fontSize: 11,
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 20, color: C.textSub, fontSize: 13 }}>
          まだ商品画像がありません。最初に商品画像をまとめて登録してください。
        </div>
      )}

      {viewer && viewer.items.length > 0 && typeof document !== "undefined" && createPortal((
        <div
          onClick={closeViewer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,10,8,0.78)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            overflow: "hidden",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "calc(100vw - 28px)",
              height: "calc(100vh - 28px)",
              background: C.surface,
              border: `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
              <div />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                }}
              >
                <button
                  onClick={() => setViewerZoom((z) => Math.max(zoomMin, Math.round((z - 0.2) * 5) / 5))}
                  disabled={viewerZoom <= zoomMin}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom <= zoomMin ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom <= zoomMin ? 0.5 : 1,
                  }}
                >
                  −
                </button>
                <p style={{ fontSize: 12, color: C.textMid, minWidth: 56, textAlign: "center" }}>
                  {Math.round(viewerZoom * 100)}%
                </p>
                <button
                  onClick={() => setViewerZoom((z) => Math.min(zoomMax, Math.round((z + 0.2) * 5) / 5))}
                  disabled={viewerZoom >= zoomMax}
                  style={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    color: C.text,
                    cursor: viewerZoom >= zoomMax ? "not-allowed" : "pointer",
                    fontSize: 16,
                    lineHeight: "24px",
                    opacity: viewerZoom >= zoomMax ? 0.5 : 1,
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
                <p style={{ fontSize: 12, color: C.textMid }}>{viewer.index + 1}/{viewer.items.length}</p>
                {!user?.isDemo && currentViewerItem && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (!currentViewerItem) return;
                      if (window.confirm("この商品画像を削除しますか？")) {
                        removeAssets([currentViewerItem.id]);
                        closeViewer();
                      }
                    }}
                  >
                    削除
                  </Btn>
                )}
                <button onClick={closeViewer} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: C.textMid }}>×</button>
              </div>
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: 0, background: C.bg, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  minHeight: 0,
                  padding: 0,
                  overflowX: viewerZoom > 1.0001 ? "auto" : "hidden",
                  overflowY: viewerZoom > 1.0001 ? "auto" : "hidden",
                  scrollbarGutter: "stable both-edges",
                }}
                ref={viewerCanvasRef}
              >
                <div
                  style={{
                    position: "relative",
                    width: canvasSize ? `${canvasSize.width}px` : "100%",
                    height: canvasSize ? `${canvasSize.height}px` : "100%",
                  }}
                >
                  <img
                    src={viewer.items[viewer.index]?.outputUrl || viewer.items[viewer.index]?.dataUrl || ""}
                    alt={viewer.items[viewer.index]?.name || "preview"}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setViewerImageNaturalSize({
                        width: img.naturalWidth || 0,
                        height: img.naturalHeight || 0,
                      });
                    }}
                    style={{
                      position: "absolute",
                      left: canvasSize && renderedImageSize ? `${(canvasSize.width - renderedImageSize.width) / 2}px` : 0,
                      top: canvasSize && renderedImageSize ? `${(canvasSize.height - renderedImageSize.height) / 2}px` : 0,
                      width: renderedImageSize ? `${renderedImageSize.width}px` : "100%",
                      height: renderedImageSize ? `${renderedImageSize.height}px` : "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </div>
              </div>
              {viewer.items.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={goNext}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                      color: C.text,
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
              <p style={{ fontSize: 12, color: C.text, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {viewer.items[viewer.index]?.name || ""}
              </p>
              <p style={{ fontSize: 11, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                カテゴリ: {PRODUCT_CATEGORY_OPTIONS.find((opt) => opt.id === (viewer.items[viewer.index]?.category || "unassigned"))?.label || "未分類"}
              </p>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function ModelsLibraryPage({ user, assets, setAssets, isMobile = false }) {
  const modelQualityHelpRef = useRef(null);
  const numImagesHelpRef = useRef(null);
  const viewerCanvasRef = useRef(null);
  const prevViewerZoomRef = useRef(1);
  const isMountedRef = useRef(true);
  const modelGenerateAbortRef = useRef(null);
  const modelGenerateTimeoutRef = useRef(null);
  const pendingModelIdsRef = useRef([]);
  const [viewerViewportSize, setViewerViewportSize] = useState({ width: 0, height: 0 });
  const [viewerImageNaturalSize, setViewerImageNaturalSize] = useState({ width: 0, height: 0 });
  const [prompt, setPrompt] = useState("");
  const [numImages, setNumImages] = useState(1);
  const [modelGenResolution, setModelGenResolution] = useState("1k");
  const [modelTargetGender, setModelTargetGender] = useState("womens");
  const [modelQualityHelpOpen, setModelQualityHelpOpen] = useState(false);
  const [numImagesHelpOpen, setNumImagesHelpOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [modelSaveFormat, setModelSaveFormat] = useState("png");
  const [modelSavePickerOpen, setModelSavePickerOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [confirmModelDeleteOpen, setConfirmModelDeleteOpen] = useState(false);
  const modelSavePickerRef = useRef(null);

  const toggleFavorite = useCallback((assetId) => {
    setAssets((prev) => prev.map((asset) => (
      asset.id === assetId ? { ...asset, favorite: !asset.favorite } : asset
    )));
  }, [setAssets]);

  const removeAsset = useCallback((assetId) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  }, [setAssets]);

  const displayedAssets = useMemo(() => (
    [...(assets || [])].sort((a, b) => {
      const favDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favDiff !== 0) return favDiff;
      const aBuiltIn = Boolean(a.builtIn);
      const bBuiltIn = Boolean(b.builtIn);
      // After favorites, show user-created models before built-ins.
      if (aBuiltIn !== bBuiltIn) return aBuiltIn ? 1 : -1;
      if (aBuiltIn && bBuiltIn) {
        const aOrder = DEFAULT_MODEL_ORDER_MAP.has(a.id) ? DEFAULT_MODEL_ORDER_MAP.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bOrder = DEFAULT_MODEL_ORDER_MAP.has(b.id) ? DEFAULT_MODEL_ORDER_MAP.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      const tA = +new Date(a.createdAt || 0);
      const tB = +new Date(b.createdAt || 0);
      if (tA !== tB) return tB - tA;
      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    })
  ), [assets]);
  const modelGenCreditPerImage = modelGenResolution === "4k" ? 2 : 1;
  const modelGenEstimatedCredits = modelGenCreditPerImage * numImages;
  const showModelGenerateError = Boolean(error && !running && !String(error).includes("停止しました"));
  const modelGenerateErrorMessage = "エラーが出ました。プロンプトを修正して再度お試しください。";

  const openViewer = useCallback((index) => {
    if (!displayedAssets.length) return;
    setViewerZoom(1);
    setViewer({
      items: displayedAssets,
      index,
      title: "モデル",
    });
  }, [displayedAssets]);

  const closeViewer = useCallback(() => {
    setViewer(null);
    setViewerZoom(1);
    setModelSavePickerOpen(false);
    setConfirmModelDeleteOpen(false);
  }, []);

  const goPrev = useCallback(() => {
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      const nextIndex = (prev.index - 1 + prev.items.length) % prev.items.length;
      return { ...prev, index: nextIndex };
    });
  }, []);

  const goNext = useCallback(() => {
    setViewer((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      const nextIndex = (prev.index + 1) % prev.items.length;
      return { ...prev, index: nextIndex };
    });
  }, []);
  const zoomMin = 1;
  const zoomMax = 6;
  const normalizeFileNameForFormat = useCallback((filename, format) => {
    const base = String(filename || "model").replace(/\.[a-z0-9]+$/i, "");
    return `${base}.${format}`;
  }, []);

  const convertBlobFormat = useCallback(async (blob, targetMime) => {
    if (blob.type === targetMime) return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const converted = await new Promise((resolve) => {
      canvas.toBlob((out) => resolve(out || blob), targetMime, targetMime === "image/jpeg" ? 0.92 : 1);
    });
    return converted;
  }, []);

  const downloadModelAsset = useCallback(async (asset, format = "png") => {
    const sourceUrl = String(asset?.outputUrl || asset?.dataUrl || "");
    if (!sourceUrl || typeof document === "undefined") return;
    const toCompactStamp = (value) => {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(+d)) return `${Date.now()}`;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      const ms = String(d.getMilliseconds()).padStart(3, "0");
      return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${ms}`;
    };
    const createdStamp = toCompactStamp(asset?.createdAt);
    const saveStamp = toCompactStamp();
    const assetToken = String(asset?.id || "na").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "na";
    const rand = Math.random().toString(36).slice(2, 8);
    const safeBase = `model-${createdStamp}-${assetToken}-${saveStamp}-${rand}`;
    const ext = format === "jpg" ? "jpg" : "png";

    try {
      const response = await fetch(sourceUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      const blob = await response.blob();
      const targetMime = format === "jpg" ? "image/jpeg" : "image/png";
      const finalBlob = await convertBlobFormat(blob, targetMime);
      const objectUrl = URL.createObjectURL(finalBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = normalizeFileNameForFormat(safeBase, ext);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      const fallback = document.createElement("a");
      fallback.href = sourceUrl;
      fallback.download = normalizeFileNameForFormat(safeBase, ext);
      fallback.rel = "noopener";
      document.body.appendChild(fallback);
      fallback.click();
      document.body.removeChild(fallback);
    }
  }, [convertBlobFormat, normalizeFileNameForFormat]);

  const runGenerate = useCallback(async () => {
    if (user?.isDemo) return;
    if (!prompt.trim() || !user?.id || running) return;
    if (modelGenerateTimeoutRef.current) {
      clearTimeout(modelGenerateTimeoutRef.current);
      modelGenerateTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setRunning(true);
      setError("");
    }
    const pendingIds = Array.from({ length: numImages }).map((_, idx) => `mdl_pending_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`);
    pendingModelIdsRef.current = pendingIds;
    const controller = new AbortController();
    modelGenerateAbortRef.current = controller;
    modelGenerateTimeoutRef.current = setTimeout(() => {
      controller.abort();
    }, 180000);
    const pendingAssets = pendingIds.map((id, idx) => ({
      id,
      name: `モデル生成中 ${idx + 1}`,
      outputUrl: "",
      dataUrl: "",
      prompt: prompt.trim(),
      favorite: false,
      createdAt: new Date().toISOString(),
      isGenerating: true,
    }));
    setAssets((prev) => [...pendingAssets, ...prev]);
    try {
      const generated = await generateModelAssets({
        userId: user.id,
        prompt: prompt.trim(),
        numImages,
        resolution: modelGenResolution,
        targetGender: modelTargetGender,
        signal: controller.signal,
      });
      const generatedList = Array.isArray(generated)
        ? generated
        : (generated && typeof generated === "object" ? [generated] : []);
      const normalized = generatedList.map((item, idx) => ({
        id: item.id || `mdl_${Math.random().toString(36).slice(2, 10)}`,
        name: item.name || `モデル ${idx + 1}`,
        outputUrl: item.outputUrl || "",
        dataUrl: item.outputUrl || "",
        prompt: item.prompt || prompt.trim(),
        favorite: Boolean(item.favorite),
        createdAt: item.createdAt || new Date().toISOString(),
      }));
      setAssets((prev) => {
        let index = 0;
        const pendingSet = new Set(pendingIds);
        return prev
          .map((asset) => {
            if (!pendingSet.has(asset.id)) return asset;
            const next = normalized[index];
            index += 1;
            return next || null;
          })
          .filter(Boolean);
      });
    } catch (e) {
      setAssets((prev) => prev.filter((asset) => !pendingIds.includes(asset.id)));
      if (isMountedRef.current) {
        if (e?.name === "AbortError") {
          setError("モデル生成を停止しました。");
        } else {
          setError(e instanceof Error ? e.message : "モデル生成に失敗しました");
        }
      }
    } finally {
      if (modelGenerateTimeoutRef.current) {
        clearTimeout(modelGenerateTimeoutRef.current);
        modelGenerateTimeoutRef.current = null;
      }
      modelGenerateAbortRef.current = null;
      pendingModelIdsRef.current = [];
      if (isMountedRef.current) {
        setRunning(false);
      }
    }
  }, [modelGenResolution, modelTargetGender, numImages, prompt, running, setAssets, user?.id, user?.isDemo]);

  const stopGenerate = useCallback(() => {
    modelGenerateAbortRef.current?.abort();
    if (modelGenerateTimeoutRef.current) {
      clearTimeout(modelGenerateTimeoutRef.current);
      modelGenerateTimeoutRef.current = null;
    }
    const pendingSet = new Set(pendingModelIdsRef.current);
    if (pendingSet.size > 0) {
      setAssets((prev) => prev.filter((asset) => !pendingSet.has(asset.id)));
    } else {
      setAssets((prev) => prev.filter((asset) => !asset.isGenerating));
    }
    pendingModelIdsRef.current = [];
    setRunning(false);
    setError("モデル生成を停止しました。");
  }, [setAssets]);

  useEffect(() => {
    if (!modelQualityHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = modelQualityHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setModelQualityHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [modelQualityHelpOpen]);
  useEffect(() => {
    if (!numImagesHelpOpen) return undefined;
    const onPointerDown = (e) => {
      const root = numImagesHelpRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setNumImagesHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [numImagesHelpOpen]);
  useEffect(() => {
    if (!modelSavePickerOpen) return undefined;
    const onPointerDown = (e) => {
      const root = modelSavePickerRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setModelSavePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [modelSavePickerOpen]);
  useEffect(() => {
    if (!isMobile && mobileSettingsOpen) setMobileSettingsOpen(false);
  }, [isMobile, mobileSettingsOpen]);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!viewer || !viewer.items?.length) return;
    if (!displayedAssets.length) {
      setViewer(null);
      return;
    }
    const currentId = viewer.items[viewer.index]?.id;
    if (!currentId) {
      setViewer((prev) => {
        if (!prev) return prev;
        return { ...prev, items: displayedAssets, index: 0 };
      });
      return;
    }
    const nextIndex = displayedAssets.findIndex((asset) => asset.id === currentId);
    if (nextIndex < 0) {
      const fallbackIndex = Math.min(viewer.index, displayedAssets.length - 1);
      setViewer((prev) => {
        if (!prev) return prev;
        if (prev.items === displayedAssets && prev.index === fallbackIndex) return prev;
        return { ...prev, items: displayedAssets, index: fallbackIndex };
      });
      return;
    }
    setViewer((prev) => {
      if (!prev) return prev;
      if (prev.items === displayedAssets && prev.index === nextIndex) return prev;
      return { ...prev, items: displayedAssets, index: nextIndex };
    });
  }, [displayedAssets, viewer]);

  useEffect(() => {
    setConfirmModelDeleteOpen(false);
  }, [viewer?.index]);
  useEffect(() => {
    setViewerImageNaturalSize({ width: 0, height: 0 });
  }, [viewer?.index]);
  useEffect(() => {
    const viewport = viewerCanvasRef.current;
    if (!viewport) {
      prevViewerZoomRef.current = viewerZoom;
      return;
    }
    const prevZoom = prevViewerZoomRef.current;
    if (Math.abs(prevZoom - viewerZoom) < 0.0001) return;

    const clientW = viewport.clientWidth;
    const clientH = viewport.clientHeight;
    const prevScrollW = Math.max(viewport.scrollWidth, 1);
    const prevScrollH = Math.max(viewport.scrollHeight, 1);
    const centerXRatio = (viewport.scrollLeft + clientW / 2) / prevScrollW;
    const centerYRatio = (viewport.scrollTop + clientH / 2) / prevScrollH;

    requestAnimationFrame(() => {
      const nextScrollW = Math.max(viewport.scrollWidth, 1);
      const nextScrollH = Math.max(viewport.scrollHeight, 1);
      const nextLeft = Math.max(0, Math.min(nextScrollW - clientW, centerXRatio * nextScrollW - clientW / 2));
      const nextTop = Math.max(0, Math.min(nextScrollH - clientH, centerYRatio * nextScrollH - clientH / 2));
      viewport.scrollLeft = nextLeft;
      viewport.scrollTop = nextTop;
      prevViewerZoomRef.current = viewerZoom;
    });
  }, [viewerZoom]);
  useEffect(() => {
    prevViewerZoomRef.current = viewerZoom;
    const viewport = viewerCanvasRef.current;
    if (!viewport) return;
    if (viewerZoom <= 1.0001) {
      const centerLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      const centerTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
      viewport.scrollLeft = centerLeft;
      viewport.scrollTop = centerTop;
    }
  }, [viewer?.index, viewer?.items?.length, viewerZoom]);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!viewer) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [viewer]);
  useEffect(() => {
    const el = viewerCanvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      setViewerViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewer]);

  const renderedImageSize = useMemo(() => {
    const naturalW = viewerImageNaturalSize.width;
    const naturalH = viewerImageNaturalSize.height;
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!naturalW || !naturalH || !viewportW || !viewportH) return null;
    const fitScale = Math.min(viewportW / naturalW, viewportH / naturalH);
    const baseW = Math.max(1, naturalW * fitScale);
    const baseH = Math.max(1, naturalH * fitScale);
    return {
      width: baseW * viewerZoom,
      height: baseH * viewerZoom,
    };
  }, [viewerImageNaturalSize.height, viewerImageNaturalSize.width, viewerViewportSize.height, viewerViewportSize.width, viewerZoom]);
  const canvasSize = useMemo(() => {
    const viewportW = viewerViewportSize.width;
    const viewportH = viewerViewportSize.height;
    if (!viewportW || !viewportH) return null;
    const renderW = renderedImageSize?.width || viewportW;
    const renderH = renderedImageSize?.height || viewportH;
    return {
      width: Math.max(viewportW, renderW),
      height: Math.max(viewportH, renderH),
    };
  }, [renderedImageSize?.height, renderedImageSize?.width, viewerViewportSize.height, viewerViewportSize.width]);
  const mobileLayerRoot = typeof document !== "undefined" ? document.body : null;
  const modelSettingsPanel = (
    <aside
      className="models-sidebar"
      style={{
        minWidth: 0,
        ...(isMobile ? {
          pointerEvents: mobileSettingsOpen ? "auto" : "none",
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(360px, 88vw)",
          height: "100dvh",
          padding: "18px 14px 22px",
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          boxShadow: "-20px 0 40px rgba(25,18,10,0.16)",
          overflowY: "auto",
          zIndex: 1200,
          transform: mobileSettingsOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.24s ease",
        } : {}),
      }}
      data-testid="models-mobile-settings-sheet"
      data-open={mobileSettingsOpen ? "true" : "false"}
    >
      {isMobile && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase" }}>設定</p>
          <button
            onClick={() => setMobileSettingsOpen(false)}
            style={{ border: "none", background: "transparent", color: C.textSub, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 16 }}>
        <p style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>モデル生成</p>
        {user?.isDemo && (
          <div style={{ background: C.goldLight, border: `1px solid ${C.goldBorder}`, padding: "8px 10px", marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: C.textMid }}>
              モデル生成は有料プランでのみ利用できます。
            </p>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={user?.isDemo}
          rows={4}
          placeholder="20代の日本人女性。ロングの黒髪。自然なナチュラルメイク。モデル体型でスリム。落ち着いた雰囲気で軽く微笑む表情。"
          style={{ width: "100%", border: `1px solid ${C.border}`, background: C.bg, color: C.textMid, padding: 10, resize: "vertical", fontSize: 12, opacity: user?.isDemo ? 0.65 : 1 }}
        />
        <p style={{ marginTop: 8, fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
          モデルの容姿の特徴だけ入力してください。
          <br />
          服装・背景・ポーズは自動で統一されます。
        </p>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
          <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>性別</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "mens", label: "男性" },
              { id: "womens", label: "女性" },
            ].map((opt) => (
              <button
                key={`model_gen_target_${opt.id}`}
                onClick={() => !user?.isDemo && setModelTargetGender(opt.id)}
                disabled={user?.isDemo}
                style={{
                  border: `1px solid ${modelTargetGender === opt.id ? C.goldBorder : C.border}`,
                  background: modelTargetGender === opt.id ? C.goldLight : C.bg,
                  color: modelTargetGender === opt.id ? C.text : C.textSub,
                  fontSize: 11,
                  padding: "8px 6px",
                  cursor: user?.isDemo ? "not-allowed" : "pointer",
                  opacity: user?.isDemo ? 0.55 : 1,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
          <div ref={modelQualityHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>画質</p>
            <button
              onClick={() => setModelQualityHelpOpen((prev) => !prev)}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.textSub,
                fontSize: 11,
                lineHeight: "16px",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ?
            </button>
            {modelQualityHelpOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 24,
                  right: 8,
                  width: 264,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                  padding: 10,
                  zIndex: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: C.text }}>画質の目安</p>
                  <button onClick={() => setModelQualityHelpOpen(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: C.textSub, padding: 0 }}>×</button>
                </div>
                <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                  通常のEC用途なら1Kで十分です。
                  <br />
                  大きく使う画像（バナー・拡大表示・印刷寄り）には4Kがおすすめです。
                  <br />
                  1Kは1024×1024の約1MP、4Kは約16MPです。
                  <br />
                  4Kは生成にかかる時間も長くなります。
                </p>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "1k", label: "1K" },
              { id: "4k", label: "4K" },
            ].map((opt) => (
              <button
                key={`model_gen_resolution_${opt.id}`}
                onClick={() => !user?.isDemo && setModelGenResolution(opt.id)}
                disabled={user?.isDemo}
                style={{
                  border: `1px solid ${modelGenResolution === opt.id ? C.goldBorder : C.border}`,
                  background: modelGenResolution === opt.id ? C.goldLight : C.bg,
                  color: modelGenResolution === opt.id ? C.text : C.textSub,
                  fontSize: 11,
                  padding: "8px 6px",
                  cursor: user?.isDemo ? "not-allowed" : "pointer",
                  opacity: user?.isDemo ? 0.55 : 1,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
          <div ref={numImagesHelpRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>生成枚数</p>
            <button
              onClick={() => setNumImagesHelpOpen((prev) => !prev)}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.textSub,
                fontSize: 11,
                lineHeight: "16px",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ?
            </button>
            {numImagesHelpOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 24,
                  right: 8,
                  width: 264,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                  padding: 10,
                  zIndex: 10,
                }}
              >
                <p style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>
                  同一条件で複数のモデルを生成し、比較・保存できます。
                  <br />
                  1回につき最大4枚まで生成可能です。
                  <br />
                  生成枚数分のクレジットが消費されます。
                </p>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={`model_gen_num_${n}`}
                onClick={() => !user?.isDemo && setNumImages(n)}
                disabled={user?.isDemo}
                style={{
                  border: `1px solid ${numImages === n ? C.goldBorder : C.border}`,
                  background: numImages === n ? C.goldLight : C.bg,
                  color: numImages === n ? C.text : C.textSub,
                  fontSize: 11,
                  padding: "9px 6px",
                  cursor: user?.isDemo ? "not-allowed" : "pointer",
                  opacity: user?.isDemo ? 0.55 : 1,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>予定消費クレジット</p>
          <p style={{ fontSize: 12, color: C.text, fontWeight: 600 }} className="num">{modelGenEstimatedCredits} cr</p>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn
          variant="primary"
          full
          size="lg"
          onClick={runGenerate}
          disabled={user?.isDemo || running || !prompt.trim()}
        >
          {running ? "生成中..." : "モデルを生成"}
        </Btn>
        {running && (
          <div style={{ marginTop: 8 }}>
            <Btn variant="ghost" full size="sm" onClick={stopGenerate}>
              生成を停止
            </Btn>
          </div>
        )}
        {error && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: C.red }}>
              {showModelGenerateError ? modelGenerateErrorMessage : error}
            </p>
            {showModelGenerateError && error !== modelGenerateErrorMessage && (
              <p style={{ marginTop: 4, fontSize: 10, color: C.textSub }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>
          Model Library
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, marginBottom: 10 }}>モデル</h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7 }}>
          モデルの容姿の特徴を具体的に指定すると、より精度の高いモデルが生成されます。気に入ったモデルはお気に入り登録をして ルック生成時に選択できます。
        </p>
      </div>

      <div className="models-layout" style={{ marginBottom: 16, position: "relative" }}>
        <section style={{ minWidth: 0 }}>
          {showModelGenerateError && (
            <div style={{ maxWidth: 980, margin: "0 auto 14px" }}>
              <div style={{ background: C.surface, border: `1px solid ${C.red}`, padding: "18px 20px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: C.red, lineHeight: 1.7 }}>
                  {modelGenerateErrorMessage}
                </p>
              </div>
            </div>
          )}
          {displayedAssets.length > 0 ? (
            <div style={{ maxWidth: 980, margin: "0 auto" }}>
              <div className="models-gallery-grid">
          {displayedAssets.map((asset, idx) => (
            <div key={asset.id} style={{ background: C.surface, border: `1px solid ${asset.favorite ? C.goldBorder : C.border}` }}>
              <button
                onClick={() => { if (!asset.isGenerating) openViewer(idx); }}
                style={{ aspectRatio: "3/4", background: C.bg, border: "none", padding: 0, width: "100%", display: "block", cursor: asset.isGenerating ? "wait" : "default", position: "relative" }}
              >
                {asset.isGenerating ? (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: C.bg }}>
                    <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: `2px solid ${C.gold}`,
                          borderTopColor: "transparent",
                          animation: "spin 0.8s linear infinite",
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontSize: 11, color: C.textSub }}>生成中...</span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={getAssetThumbnailUrl(asset)}
                    alt={asset.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "center top",
                      transform: "scale(1.01)",
                      transformOrigin: "center center",
                      display: "block",
                    }}
                  />
                )}
                {!asset.isGenerating && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(asset.id);
                    }}
                    aria-label={asset.favorite ? "お気に入り解除" : "お気に入り"}
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: `1px solid ${asset.favorite ? "rgba(188,57,69,0.35)" : "rgba(255,255,255,0.65)"}`,
                      background: "rgba(255,255,255,0.9)",
                      color: asset.favorite ? "#d14b58" : "rgba(82,72,58,0.58)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      lineHeight: 1,
                      cursor: "pointer",
                      boxShadow: "0 8px 18px rgba(38,30,20,0.14)",
                      backdropFilter: "blur(8px)",
                      padding: 0,
                    }}
                  >
                    ♥
                  </button>
                )}
              </button>
            </div>
          ))}
              </div>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 20, color: C.textSub, fontSize: 13 }}>
              まだモデルがありません。右側の設定で「モデルを生成」を実行してください。
            </div>
          )}
        </section>

        {!isMobile && modelSettingsPanel}
      </div>
      {isMobile && mobileLayerRoot && createPortal(
        <>
          {modelSettingsPanel}
          <MobileSheetHandle
            label="モデル生成"
            open={mobileSettingsOpen}
            onClick={() => setMobileSettingsOpen((prev) => !prev)}
            style={{
              top: 84,
              right: mobileSettingsOpen ? "min(360px, 88vw)" : 0,
              zIndex: 1210,
              transition: "right 0.24s ease",
            }}
          />
        </>,
        mobileLayerRoot,
      )}

      {viewer && viewer.items.length > 0 && typeof document !== "undefined" && createPortal((
        <div
          onClick={closeViewer}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,10,8,0.78)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            overflow: "hidden",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isMobile ? "100vw" : "calc(100vw - 28px)",
              height: isMobile ? "100dvh" : "calc(100vh - 28px)",
              background: C.surface,
              border: isMobile ? "none" : `1px solid ${C.border}`,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "auto 1fr auto" : "1fr auto 1fr", alignItems: "center", padding: isMobile ? "10px 12px" : "11px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg, gap: isMobile ? 10 : 0 }}>
              {isMobile ? (
                <>
                  <button onClick={closeViewer} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: C.textMid, padding: 0 }}>×</button>
                  <p style={{ fontSize: 12, color: C.textMid, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {viewer.items[viewer.index]?.name || ""}
                  </p>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                    {!viewer.items[viewer.index]?.builtIn && (
                      <>
                        <div ref={modelSavePickerRef} style={{ position: "relative" }}>
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => setModelSavePickerOpen((prev) => !prev)}
                          >
                            保存
                          </Btn>
                          {modelSavePickerOpen && (
                            <div style={{
                              position: "absolute",
                              top: "calc(100% + 8px)",
                              right: 0,
                              width: 220,
                              border: `1px solid ${C.border}`,
                              background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,240,234,0.98))",
                              boxShadow: "0 18px 40px rgba(50,38,22,0.16)",
                              padding: 8,
                              zIndex: 20,
                            }}>
                              <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>
                                Save Format
                              </p>
                              <div style={{ display: "grid", gap: 6 }}>
                                {[
                                  { id: "png", label: "PNGで保存" },
                                  { id: "jpg", label: "JPGで保存" },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    onClick={() => {
                                      setModelSaveFormat(opt.id);
                                      setModelSavePickerOpen(false);
                                      void downloadModelAsset(viewer.items[viewer.index], opt.id);
                                    }}
                                    style={{
                                      border: `1px solid ${modelSaveFormat === opt.id ? C.goldBorder : C.borderLight}`,
                                      background: modelSaveFormat === opt.id ? "linear-gradient(135deg, rgba(226,198,145,0.34), rgba(248,246,241,0.98))" : C.surface,
                                      color: C.text,
                                      fontSize: 12,
                                      padding: "10px 12px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <Btn size="sm" variant="ghost" onClick={() => setConfirmModelDeleteOpen(true)}>削除</Btn>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 8px",
                      border: `1px solid ${C.border}`,
                      background: C.surface,
                    }}
                  >
                    <button
                      onClick={() => setViewerZoom((z) => Math.max(zoomMin, Math.round((z - 0.2) * 5) / 5))}
                      disabled={viewerZoom <= zoomMin}
                      style={{
                        width: 28,
                        height: 28,
                        border: `1px solid ${C.border}`,
                        background: C.bg,
                        color: C.text,
                        cursor: viewerZoom <= zoomMin ? "not-allowed" : "pointer",
                        fontSize: 16,
                        lineHeight: "24px",
                        opacity: viewerZoom <= zoomMin ? 0.5 : 1,
                      }}
                    >
                      −
                    </button>
                    <p style={{ fontSize: 12, color: C.textMid, minWidth: 56, textAlign: "center" }}>
                      {Math.round(viewerZoom * 100)}%
                    </p>
                    <button
                      onClick={() => setViewerZoom((z) => Math.min(zoomMax, Math.round((z + 0.2) * 5) / 5))}
                      disabled={viewerZoom >= zoomMax}
                      style={{
                        width: 28,
                        height: 28,
                        border: `1px solid ${C.border}`,
                        background: C.bg,
                        color: C.text,
                        cursor: viewerZoom >= zoomMax ? "not-allowed" : "pointer",
                        fontSize: 16,
                        lineHeight: "24px",
                        opacity: viewerZoom >= zoomMax ? 0.5 : 1,
                      }}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
                    <p style={{ fontSize: 12, color: C.textMid }}>{viewer.index + 1}/{viewer.items.length}</p>
                    {!viewer.items[viewer.index]?.builtIn && (
                      <>
                        <div ref={modelSavePickerRef} style={{ position: "relative" }}>
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => setModelSavePickerOpen((prev) => !prev)}
                          >
                            保存
                          </Btn>
                          {modelSavePickerOpen && (
                            <div style={{
                              position: "absolute",
                              top: "calc(100% + 8px)",
                              right: 0,
                              width: 220,
                              border: `1px solid ${C.border}`,
                              background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,240,234,0.98))",
                              boxShadow: "0 18px 40px rgba(50,38,22,0.16)",
                              padding: 8,
                              zIndex: 20,
                            }}>
                              <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>
                                Save Format
                              </p>
                              <div style={{ display: "grid", gap: 6 }}>
                                {[
                                  { id: "png", label: "PNGで保存" },
                                  { id: "jpg", label: "JPGで保存" },
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    onClick={() => {
                                      setModelSaveFormat(opt.id);
                                      setModelSavePickerOpen(false);
                                      void downloadModelAsset(viewer.items[viewer.index], opt.id);
                                    }}
                                    style={{
                                      border: `1px solid ${modelSaveFormat === opt.id ? C.goldBorder : C.borderLight}`,
                                      background: modelSaveFormat === opt.id ? "linear-gradient(135deg, rgba(226,198,145,0.34), rgba(248,246,241,0.98))" : C.surface,
                                      color: C.text,
                                      fontSize: 12,
                                      padding: "10px 12px",
                                      textAlign: "left",
                                      cursor: "pointer",
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{ position: "relative" }}>
                          <Btn size="sm" variant="ghost" onClick={() => setConfirmModelDeleteOpen(true)}>
                            削除
                          </Btn>
                          {confirmModelDeleteOpen && (
                            <div
                              style={{
                                position: "absolute",
                                top: "calc(100% + 8px)",
                                right: 0,
                                width: 300,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                                boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                                padding: 12,
                                zIndex: 25,
                              }}
                            >
                              <p style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
                                このモデル画像を削除しますか？
                              </p>
                              <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5, marginBottom: 8 }}>
                                削除した画像は元に戻せません。
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <button
                                  onClick={() => setConfirmModelDeleteOpen(false)}
                                  style={{
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    color: C.textSub,
                                    fontSize: 11,
                                    padding: "7px 8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  キャンセル
                                </button>
                                <button
                                  onClick={() => {
                                    const target = viewer.items[viewer.index];
                                    if (!target?.id) return;
                                    removeAsset(target.id);
                                    setConfirmModelDeleteOpen(false);
                                  }}
                                  style={{
                                    border: `1px solid ${C.red}`,
                                    background: C.red,
                                    color: C.surface,
                                    fontSize: 11,
                                    padding: "7px 8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  削除する
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <button onClick={closeViewer} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: C.textMid }}>×</button>
                  </div>
                </>
              )}
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: 0, background: C.bg, overflow: "hidden" }}>
              <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 280px" }}>
                <div
                  style={{
                    position: "relative",
                    height: "100%",
                    minHeight: 0,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "stretch",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      minHeight: 0,
                      padding: 0,
                      overflowX: viewerZoom > 1.0001 ? "auto" : "hidden",
                      overflowY: viewerZoom > 1.0001 ? "auto" : "hidden",
                      scrollbarGutter: "stable both-edges",
                    }}
                    ref={viewerCanvasRef}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: canvasSize ? `${canvasSize.width}px` : "100%",
                        height: canvasSize ? `${canvasSize.height}px` : "100%",
                      }}
                    >
                      <img
                        src={viewer.items[viewer.index]?.outputUrl || viewer.items[viewer.index]?.dataUrl || ""}
                        alt={viewer.items[viewer.index]?.name || "preview"}
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          setViewerImageNaturalSize({
                            width: img.naturalWidth || 0,
                            height: img.naturalHeight || 0,
                          });
                        }}
                        style={{
                          position: "absolute",
                          left: canvasSize && renderedImageSize ? `${(canvasSize.width - renderedImageSize.width) / 2}px` : 0,
                          top: canvasSize && renderedImageSize ? `${(canvasSize.height - renderedImageSize.height) / 2}px` : 0,
                          width: renderedImageSize ? `${renderedImageSize.width}px` : "100%",
                          height: renderedImageSize ? `${renderedImageSize.height}px` : "100%",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </div>
                  </div>
                  {viewer.items.length > 1 && (
                    <>
                      <button
                        onClick={goPrev}
                        style={{
                          position: "absolute",
                          left: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          color: C.text,
                          cursor: "pointer",
                          fontSize: 18,
                        }}
                      >
                        ‹
                      </button>
                      <button
                        onClick={goNext}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          color: C.text,
                          cursor: "pointer",
                          fontSize: 18,
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            {!isMobile && (
            <div style={{ padding: "9px 14px", borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
              <p style={{ fontSize: 11, color: C.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewer.items[viewer.index]?.name || ""}
              </p>
            </div>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: GUIDE
// ─────────────────────────────────────────────
function GuidePage({ isMobile = false, setPage }) {
  const sections = [
    { id: "intro", num: "01", title: "はじめに" },
    { id: "quickstart", num: "02", title: "クイックスタート" },
    { id: "modes", num: "03", title: "モード別ガイド" },
    { id: "prompting", num: "04", title: "プロンプトの書き方" },
    { id: "credits", num: "05", title: "クレジットの仕組み" },
    { id: "template", num: "06", title: "商品説明文テンプレート" },
    { id: "faq", num: "07", title: "よくある質問" },
    { id: "checklist", num: "08", title: "公開前チェック" },
  ];
  const inputSpecs = [
    ["撮影スタイル", "平置き・ハンガー吊り・白背景でのシンプルな商品撮影"],
    ["背景", "白または単色が推奨。複雑な背景は認識精度が下がる場合があります。"],
    ["ファイル形式", "JPG / PNG（1枚あたり最大 10MB）"],
    ["推奨解像度", "長辺 1000px 以上"],
  ];
  const quickSteps = [
    ["商品を登録する", "サイドバーの「商品」から画像を追加します。商品名やカテゴリも入れておくと、後から探しやすくなります。"],
    ["ルック生成を開く", "「ルック生成」で対象の商品を選びます。最大4点まで組み合わせて使えます。"],
    ["モードを選ぶ", "トルソー / マネキン / ゴースト / モデルから用途に合う見せ方を選択します。"],
    ["プロンプトを入力する", "主対象 → 条件 → 背景 → 仕上げ、の順で短く指定すると安定します。"],
    ["生成して確認する", "まず1枚でテストし、問題なければZIP一括処理で量産するのが効率的です。"],
  ];
  const modeCards = [
    {
      name: "Torso",
      label: "トルソー",
      body: "上半身の立体感を自然に出したいトップス・シャツ・ジャケット向け。",
      prompt: "上半身トルソーに自然にフィット。柄・ロゴ・色は完全保持。白背景。",
      input: "平置きまたはハンガー、上半身が分かる画像",
    },
    {
      name: "Mannequin",
      label: "マネキン",
      body: "全身のバランスや丈感を見せたい商品向け。EC一覧でも使いやすいです。",
      prompt: "全身マネキンに着用。立ち姿。商品比率を維持。",
      input: "全体が写る平置き・ハンガー画像",
    },
    {
      name: "Ghost",
      label: "ゴースト",
      body: "インビジブルマネキン仕上げ。胴元や内側の構造を見せたい商品向け。",
      prompt: "ゴーストマネキン。首元と内側構造は自然に。白背景EC用。",
      input: "平置き。裏返し画像があると精度向上",
    },
    {
      name: "Model",
      label: "モデル",
      body: "SNS・特集・ブランドページ用の着用ビジュアルを作りたいとき向け。",
      prompt: "日本人女性、170cm、細身、自然光風、ECカタログ品質。",
      input: "平置き・ハンガーの全体画像",
    },
  ];
  const promptRows = [
    ["主対象", "女性モデル、20代、日本人 / 上半身トルソー"],
    ["条件", "細身、自然な立ち姿、柄・ロゴ保持"],
    ["背景", "白背景、自然光、スタジオ"],
    ["仕上げ", "ECカタログ品質、高解像度、布の質感を保持"],
  ];
  const creditRows = [
    ["1枚生成（単体）", "1 クレジット"],
    ["ZIP一括処理", "枚数 × 1 クレジット"],
    ["生成失敗（エラー）", "消費なし"],
  ];
  const faqs = [
    ["生成に失敗した場合、クレジットは消費されますか？", "いいえ。エラーで生成が完了しなかった場合は消費されません。"],
    ["商品のロゴやプリントは保持されますか？", "プロンプトに「柄・ロゴ・色は完全保持」と明記すると再現精度が上がります。ただし完全再現を保証するものではありません。"],
    ["ZIP一括処理の上限枚数はありますか？", "1回の一括処理で最大50枚までを想定しています。多い場合は分けて実行してください。"],
    ["対応していない画像形式はありますか？", "JPGとPNG以外は非対応です。HEICやWEBPは変換してからアップロードしてください。"],
    ["同じ商品で複数パターンを生成できますか？", "できます。モードやプロンプトを変えて何度でも生成でき、履歴から見返せます。"],
  ];
  const checklist = [
    "商品色・柄が実物に近いか",
    "縫い目・タグ・首元などに不自然な破綻がないか",
    "背景が掲載先の用途に合っているか",
    "解像度が掲載先の推奨サイズを満たしているか",
    "サイズ感・プロポーションに違和感がないか",
    "背景や小物に権利上の問題がないか",
  ];
  const previewTiles = [
    { title: "Torso", sub: "白背景で立体感を補完", image: "/optimized/torso.jpg", badge: "EC Basic" },
    { title: "Mannequin", sub: "丈感と全体バランスを確認", image: "/optimized/mannequin.jpg", badge: "Full Body" },
    { title: "Ghost", sub: "構造を見せる商品向け", image: "/optimized/ghost.jpg", badge: "Invisible" },
    { title: "Model", sub: "着用イメージを一気に作る", image: "/optimized/m3.jpg", badge: "Campaign" },
  ];
  const workflowCards = [
    { label: "Input", title: "商品画像を登録", body: "平置き・ハンガー画像を商品ライブラリに追加。背景はシンプルなほど安定します。" },
    { label: "Generate", title: "モードと条件を指定", body: "用途に応じてトルソー・マネキン・モデルを選択。必要なら柄保持や背景も追記します。" },
    { label: "Scale", title: "確認後に一括処理", body: "1枚で方向性が合えばZIP処理へ。量産前にプロンプトを固定すると運用がぶれません。" },
  ];

  const cardStyle = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,245,239,0.98))",
    border: `1px solid ${C.border}`,
    boxShadow: "0 16px 36px rgba(39,31,22,0.06)",
  };
  const sectionTitle = (num, title) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.12em", color: C.gold, fontFamily: SANS, fontWeight: 600 }}>{num}</span>
      <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 28 : 32, fontWeight: 400, color: C.text, lineHeight: 1.1 }}>{title}</h2>
    </div>
  );

  return (
    <div className="fade-up">
      <div
        style={{
          ...cardStyle,
          padding: isMobile ? "24px 18px" : "34px 34px 30px",
          marginBottom: isMobile ? 18 : 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto -12% -38% auto",
            width: isMobile ? 220 : 320,
            height: isMobile ? 220 : 320,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(184,148,60,0.16) 0%, rgba(184,148,60,0.05) 38%, rgba(184,148,60,0) 72%)",
            pointerEvents: "none",
          }}
        />
        <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.gold, marginBottom: 10, fontFamily: SANS, fontWeight: 600 }}>
          Guide
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: isMobile ? 38 : 54, fontWeight: 400, color: C.text, lineHeight: 0.98, marginBottom: 14 }}>
          使い方
        </h1>
        <p style={{ maxWidth: 760, fontSize: isMobile ? 13 : 15, color: C.textMid, lineHeight: 1.9, marginBottom: 20 }}>
          TORSO.AIは、商品の平置き・ハンガー画像からトルソー・マネキン・ゴースト・モデル着用画像を生成するアパレル向けツールです。
          はじめてのテストから本番運用まで、このページだけで流れを掴めるように整理しています。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <Btn size="sm" onClick={() => setPage?.("upload")}>ルック生成を開く</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setPage?.("products")}>商品を登録する</Btn>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["まず1枚で試す", "結果確認後に一括処理", "白背景と商品全体が基本"].map((item) => (
            <span
              key={item}
              style={{
                fontSize: 11,
                letterSpacing: "0.06em",
                color: C.text,
                background: C.goldLight,
                border: `1px solid ${C.goldBorder}`,
                padding: "7px 10px",
              }}
            >
              {item}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "1.15fr 0.85fr 0.85fr", gridAutoRows: isMobile ? 150 : 180, gap: 12 }}>
          {previewTiles.map((tile, index) => (
            <div
              key={tile.title}
              style={{
                position: "relative",
                overflow: "hidden",
                border: `1px solid ${C.border}`,
                background: C.bg,
                gridRow: !isMobile && index === 0 ? "span 2" : "span 1",
                minHeight: 0,
              }}
            >
              <img
                src={tile.image}
                alt={tile.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(28,25,22,0.02) 0%, rgba(28,25,22,0.18) 42%, rgba(28,25,22,0.72) 100%)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  padding: 14,
                }}
              >
                <span style={{ alignSelf: "flex-start", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", border: "1px solid rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.08)", padding: "4px 7px", marginBottom: 10 }}>
                  {tile.badge}
                </span>
                <p style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 28, color: "#fff", lineHeight: 1, marginBottom: 6 }}>{tile.title}</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.82)", lineHeight: 1.6 }}>{tile.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) 250px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gap: isMobile ? 16 : 18 }}>
          <section style={{ ...cardStyle, padding: isMobile ? 18 : 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {workflowCards.map((card) => (
                <div key={card.label} style={{ background: "linear-gradient(180deg, rgba(245,243,239,0.92), rgba(255,255,255,0.82))", border: `1px solid ${C.border}`, padding: "16px 16px 15px" }}>
                  <p style={{ fontSize: 10, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{card.label}</p>
                  <p style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 7 }}>{card.title}</p>
                  <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>{card.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="intro" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("01", "はじめに")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.9, marginBottom: 18 }}>
              画像を1枚アップロードし、モードとプロンプトを設定するだけで生成が始まります。まず1枚で品質を確認し、問題なければZIP一括処理に進むのが最も効率的です。
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 520 : 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, padding: "0 0 10px", borderBottom: `1px solid ${C.border}` }}>条件</th>
                    <th style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, padding: "0 0 10px", borderBottom: `1px solid ${C.border}` }}>詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {inputSpecs.map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text, fontWeight: 500, verticalAlign: "top" }}>{label}</td>
                      <td style={{ padding: "12px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textMid, lineHeight: 1.8 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 18, background: C.goldLight, borderLeft: `2px solid ${C.gold}`, padding: "14px 16px" }}>
              <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>
                <span style={{ color: C.text, fontWeight: 600 }}>注意:</span> 商品が小さく写っている場合や背景が複雑な場合は生成品質が下がります。できるだけ商品を大きく、背景を整理した画像を使ってください。
              </p>
            </div>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {[
                ["おすすめ", "白背景 / 商品全体 / シワや柄が見える画像"],
                ["避けたい", "背景が散らかっている / 商品が遠い / 影が強すぎる"],
                ["運用上のコツ", "商品ごとにプロンプトを固定しておくと、量産時の品質差が減ります。"],
              ].map(([title, body]) => (
                <div key={title} style={{ background: C.surface, border: `1px solid ${C.borderLight}`, padding: "12px 13px" }}>
                  <p style={{ fontSize: 11, color: C.text, fontWeight: 600, marginBottom: 6 }}>{title}</p>
                  <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.75 }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="quickstart" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("02", "クイックスタート")}
            <div style={{ display: "grid", gap: 0 }}>
              {quickSteps.map(([title, body], index) => (
                <div
                  key={title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px minmax(0, 1fr)",
                    gap: 14,
                    padding: "16px 0",
                    borderBottom: index === quickSteps.length - 1 ? "none" : `1px solid ${C.borderLight}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: C.gold, letterSpacing: "0.12em", fontFamily: SANS, fontWeight: 600, paddingTop: 3 }}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, color: C.text, marginBottom: 6, fontWeight: 600 }}>{title}</h3>
                    <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.85 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="modes" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("03", "モード別ガイド")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 18 }}>
              用途と商品カテゴリに合わせてモードを選んでください。細かい柄やロゴがある商品は、プロンプト側でも保持条件を明記した方が安定します。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {modeCards.map((mode) => (
                <article key={mode.name} style={{ background: "rgba(245,243,239,0.92)", border: `1px solid ${C.border}`, padding: "18px 18px 16px" }}>
                  <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 6, fontFamily: SANS, fontWeight: 600 }}>
                    {mode.name}
                  </p>
                  <h3 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 400, color: C.text, marginBottom: 10 }}>{mode.label}</h3>
                  <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 14 }}>{mode.body}</p>
                  <div style={{ background: C.surface, border: `1px solid ${C.borderLight}`, padding: "10px 12px", marginBottom: 10 }}>
                    <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Prompt</p>
                    <p style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>{mode.prompt}</p>
                  </div>
                  <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>
                    <span style={{ color: C.textSub }}>推奨入力:</span> {mode.input}
                  </p>
                </article>
              ))}
            </div>
            <div style={{ marginTop: 14, background: "linear-gradient(135deg, rgba(226,198,145,0.18), rgba(255,255,255,0.8))", border: `1px solid ${C.goldBorder}`, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>
                最初の運用では、<span style={{ color: C.text, fontWeight: 600 }}>EC商品詳細はトルソー or マネキン、SNSや特集はモデル</span> と役割を分けると迷いません。
              </p>
            </div>
          </section>

          <section id="prompting" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("04", "プロンプトの書き方")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.9, marginBottom: 18 }}>
              迷ったら <span style={{ color: C.text, fontWeight: 600 }}>主対象 → 条件 → 背景 → 仕上げ</span> の順で並べてください。短くても要点が揃っていれば十分伝わります。
            </p>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 520 : 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, padding: "0 0 10px", borderBottom: `1px solid ${C.border}` }}>要素</th>
                    <th style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub, padding: "0 0 10px", borderBottom: `1px solid ${C.border}` }}>例</th>
                  </tr>
                </thead>
                <tbody>
                  {promptRows.map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text, fontWeight: 500, verticalAlign: "top" }}>{label}</td>
                      <td style={{ padding: "12px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textMid, lineHeight: 1.8 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                "女性モデル、20代、日本人、自然な立ち姿、白背景、ECカタログ品質。布の柄とロゴは保持。",
                "上半身トルソー、自然フィット、白背景。プリント・カラーは完全保持。高解像度。",
              ].map((example) => (
                <div key={example} style={{ background: "rgba(245,243,239,0.95)", border: `1px solid ${C.border}`, padding: "14px 16px", fontSize: 12, color: C.text, lineHeight: 1.9 }}>
                  {example}
                </div>
              ))}
            </div>
          </section>

          <section id="credits" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("05", "クレジットの仕組み")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 18 }}>
              生成はクレジットを消費します。基本は1枚につき1クレジットで、失敗時は消費されません。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {creditRows.map(([label, value]) => (
                <div key={label} style={{ background: "rgba(245,243,239,0.92)", border: `1px solid ${C.border}`, padding: "16px 16px 14px" }}>
                  <p style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 8 }}>{label}</p>
                  <p style={{ fontFamily: SERIF, fontSize: 26, color: C.text, lineHeight: 1 }}>{value}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.borderLight}`, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>
                残クレジットはサイドバー下部から確認できます。上限に達した場合はプラン変更または追加購入を使う前提で設計されています。
              </p>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn size="sm" variant="ghost" onClick={() => setPage?.("pricing")}>プランを見る</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setPage?.("history")}>生成履歴を見る</Btn>
            </div>
          </section>

          <section id="template" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("06", "商品説明文テンプレート")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 14 }}>
              生成画像と合わせてEC掲載に流用しやすい、最小限のテンプレートです。
            </p>
            <div style={{ background: "rgba(245,243,239,0.95)", border: `1px solid ${C.border}`, padding: isMobile ? "16px 14px" : "20px 22px", fontSize: 12, color: C.text, lineHeight: 2 }}>
              『◯◯素材を使用した◯◯。シルエットは◯◯で、日常使いからお出かけまで対応。モデル身長◯◯cm / 着用サイズ◯◯。』
            </div>
            <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.8, marginTop: 12 }}>
              素材・シルエット・着用サイズを埋めるだけで使えます。モデルモードの画像と組み合わせると情報の整合性が取りやすくなります。
            </p>
          </section>

          <section id="faq" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("07", "よくある質問")}
            <div style={{ display: "grid", gap: 0 }}>
              {faqs.map(([question, answer], index) => (
                <div key={question} style={{ padding: "16px 0", borderBottom: index === faqs.length - 1 ? "none" : `1px solid ${C.borderLight}` }}>
                  <p style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 7 }}>{question}</p>
                  <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.85 }}>{answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="checklist" style={{ ...cardStyle, padding: isMobile ? 18 : 26, scrollMarginTop: 24 }}>
            {sectionTitle("08", "公開前チェック")}
            <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 14 }}>
              EC掲載やカタログ入稿の前に、最低限ここだけは確認してください。
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {checklist.map((item) => (
                <div key={item} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 10, alignItems: "start", padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ color: C.gold, fontSize: 12, paddingTop: 2 }}>○</span>
                  <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8 }}>{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...cardStyle, padding: isMobile ? 20 : 28, background: "linear-gradient(160deg, #1f1b17 0%, #2a241d 55%, #3a3228 100%)", borderColor: "#322b23" }}>
            <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(245,237,216,0.78)", marginBottom: 10, fontWeight: 600 }}>
              Get Started
            </p>
            <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 30 : 38, fontWeight: 400, color: "#fff8ee", lineHeight: 1.12, marginBottom: 10 }}>
              最初の1枚を作って、
              <br />
              運用の型を固める。
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,248,238,0.72)", lineHeight: 1.9, maxWidth: 720, marginBottom: 16 }}>
              使い方ページは読むだけだと弱いので、すぐ試せる導線を最後に置いています。商品登録から始めるか、そのままルック生成へ進めます。
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn size="sm" onClick={() => setPage?.("products")}>商品を登録</Btn>
              <Btn size="sm" variant="secondary" onClick={() => setPage?.("upload")}>ルック生成へ</Btn>
            </div>
          </section>
        </div>

        {!isMobile && (
          <aside style={{ position: "sticky", top: 24 }}>
            <div style={{ ...cardStyle, padding: "16px 16px 14px" }}>
              <p style={{ fontSize: 10, color: C.textSub, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                このページ
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px minmax(0, 1fr)",
                      gap: 8,
                      textDecoration: "none",
                      padding: "8px 0",
                      borderBottom: `1px solid ${C.borderLight}`,
                    }}
                  >
                    <span style={{ fontSize: 10, color: C.gold, letterSpacing: "0.12em", fontWeight: 600 }}>{section.num}</span>
                    <span style={{ fontSize: 12, color: C.textMid, lineHeight: 1.45 }}>{section.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: PRICING
// ─────────────────────────────────────────────
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    nameJa: "スターター",
    nameEn: "STARTER",
    monthlyPrice: 4900,
    annualEligible: false,
    credits: "30",
    tag: null,
    features: [
      "30クレジット / 月",
      "トルソー / マネキン / ゴースト / モデル",
      "標準解像度出力",
      "メールサポート",
    ],
    target: "テスト・小規模・個人向け",
    cta: "Starterを選ぶ",
    variant: "secondary",
  },
  {
    id: "growth",
    name: "Growth",
    nameJa: "グロース",
    nameEn: "GROWTH",
    monthlyPrice: 29800,
    annualEligible: true,
    credits: "200",
    tag: "人気",
    features: [
      "200クレジット / 月",
      "3スタイルすべて利用可能",
      "一括アップロード処理",
      "高解像度出力",
      "優先サポート",
    ],
    target: "月50〜300SKU規模のブランド / 古着店 / リユース業者向け",
    cta: "Growthを選ぶ",
    variant: "gold",
  },
  {
    id: "business",
    name: "Business",
    nameJa: "ビジネス",
    nameEn: "BUSINESS",
    monthlyPrice: 98000,
    annualEligible: true,
    credits: "800",
    tag: null,
    features: [
      "800クレジット / 月",
      "全機能アクセス",
      "高解像度出力",
      "API直接連携",
      "専任サポート担当",
      "バッチ最適化",
    ],
    target: "大量出品・法人運営向け（中古EC / OEM / ブランド）",
    cta: "Businessを選ぶ",
    variant: "primary",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    nameJa: "エンタープライズ",
    nameEn: "ENTERPRISE",
    monthlyPrice: 198000,
    annualEligible: true,
    credits: "2,000",
    tag: null,
    features: [
      "2,000クレジット / 月",
      "専用インフラ/優先キュー",
      "監査ログ・SLA対応",
      "専任CS / 導入支援",
      "カスタム連携開発",
    ],
    target: "モール運営・大規模EC向け",
    cta: "Enterpriseを選ぶ",
    variant: "primary",
  },
  {
    id: "custom",
    name: "Custom",
    nameJa: "カスタム",
    nameEn: "CUSTOM",
    monthlyPrice: null,
    annualEligible: false,
    credits: "2,000+",
    tag: "要相談",
    features: [
      "2,000クレジット以上",
      "利用量に応じた個別設計",
      "専任導入支援",
      "SLA / セキュリティ要件対応",
      "運用体制まで最適化",
    ],
    target: "2000cr以上の大規模運用向け",
    cta: "カスタムは相談する",
    variant: "primary",
  },
];

function PricingPage({ user, onUserUpdate }) {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const formatYen = useCallback((value) => `¥${Number(value || 0).toLocaleString("ja-JP")}`, []);
  const [checkoutBusy, setCheckoutBusy] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [billingCustomer, setBillingCustomer] = useState(null);
  const [confirmPlan, setConfirmPlan] = useState(null);
  const hasPaidPlan = ["starter", "growth", "business", "enterprise"].includes(String(user?.plan || "").toLowerCase());
  const hasSavedCard = Boolean(
    billingCustomer?.defaultPaymentMethodId
    || billingCustomer?.payload?.cardLast4
    || billingCustomer?.stripeCustomerId,
  );
  const topupRows = [
    { planId: "free", label: "Free 初回限定", note: "最初の1回のみ", offer: getCreditPackOffers("free", true)[0] },
    { planId: "free-repeat", label: "Free 通常追加", note: "2回目以降", offer: getCreditPackOffers("free", false)[0] },
    { planId: "starter", label: "Starter", note: "加入中のみ", offer: getCreditPackOffers("starter")[0] },
    { planId: "growth", label: "Growth", note: "加入中のみ", offer: getCreditPackOffers("growth")[0] },
    { planId: "business", label: "Business", note: "加入中のみ", offer: getCreditPackOffers("business")[0] },
    { planId: "enterprise", label: "Enterprise", note: "加入中のみ", offer: getCreditPackOffers("enterprise")[0] },
  ];

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setBillingCustomer(null);
      return undefined;
    }
    getBillingHistory(user.id)
      .then((data) => {
        if (!cancelled) setBillingCustomer(data?.billingCustomer || null);
      })
      .catch(() => {
        if (!cancelled) setBillingCustomer(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const getMonthlyPrice = useCallback((planId) => {
    const plan = PLANS.find((item) => item.id === planId);
    return Number(plan?.monthlyPrice || 0);
  }, []);
  const cardLabel = useMemo(() => {
    const brand = String(billingCustomer?.payload?.cardBrand || "").toUpperCase();
    const last4 = String(billingCustomer?.payload?.cardLast4 || "");
    if (brand && last4) return `${brand} •••• ${last4} で決済します。`;
    if (last4) return `登録済みのカード（•••• ${last4}）で決済します。`;
    return "以前の決済に使ったカードでそのまま決済します。";
  }, [billingCustomer?.payload?.cardBrand, billingCustomer?.payload?.cardLast4]);

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 48, maxWidth: 980 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>Pricing</p>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: "clamp(18px, 2.8vw, 38px)",
            fontWeight: 400,
            marginBottom: 16,
            whiteSpace: "nowrap",
            lineHeight: 1.15,
          }}
        >
          ビジネスの規模に合わせた<em style={{ fontStyle: "italic" }}>プラン選択</em>
        </h1>
        <p style={{ fontSize: "clamp(12px, 1.25vw, 14px)", color: C.textMid, lineHeight: 1.7 }}>
          新作ブランドから、古着・リユース事業者まで。1枚の商品写真を売れるビジュアルへ。<br />
          Growthプランのケースでは、200ルックをスタジオ撮影（カメラマン・モデル・ヘアメイク・スタイリスト・アシスタント等）すると通常は安くても<strong style={{ color: C.text }}>500,000〜1,000,000円</strong>。<br />
          現実では1枚単価<strong style={{ color: C.text }}>2,500〜5,000円</strong>かかるところを、<strong style={{ color: C.text }}>100〜300円</strong>で数秒で作れます。約<strong style={{ color: C.text }}>30,000円</strong>で運用可能です。
        </p>
      </div>

      {/* Cost comparison */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: "28px 32px", marginBottom: 32 }}>
        <p style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 20 }}>従来コストとの比較</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            { label: "従来の撮影外注", cost: "¥800〜¥3,000", unit: "/ 着", note: "撮影・加工・修正を含む" },
            { label: "社内マネキン撮影", cost: "5〜10分", unit: "/ 着", note: "人件費と着せ替え工数が重い" },
            { label: "本サービス", cost: "¥100〜¥300", unit: "/ 着", note: "自動生成を数秒で完了", highlight: true },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "16px 20px",
              background: item.highlight ? C.goldLight : C.bg,
              border: `1px solid ${item.highlight ? C.goldBorder : C.borderLight}`,
              borderRadius: 1,
            }}>
              <p style={{ fontSize: 11, color: item.highlight ? C.gold : C.textSub, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>{item.label}</p>
              <p style={{ fontFamily: JP, fontSize: 26, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{item.cost}</p>
              <p style={{ fontSize: 12, color: C.textSub }}>{item.unit}</p>
              <p style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, background: C.surface, padding: 4 }}>
          <button
            onClick={() => setBillingCycle("yearly")}
            style={{
              border: "none",
              background: billingCycle === "yearly" ? C.goldLight : "transparent",
              color: billingCycle === "yearly" ? C.text : C.textSub,
              fontSize: 12,
              fontWeight: 500,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            年額
          </button>
          <button
            onClick={() => setBillingCycle("monthly")}
            style={{
              border: "none",
              background: billingCycle === "monthly" ? C.goldLight : "transparent",
              color: billingCycle === "monthly" ? C.text : C.textSub,
              fontSize: 12,
              fontWeight: 500,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            月額
          </button>
        </div>
        {billingCycle === "yearly" && (
          <span style={{ fontSize: 12, color: C.green }}>2ヶ月分お得（年額は月額×10）</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 48 }}>
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            style={{
              background: C.surface,
              border: `1px solid ${plan.id === "growth" ? C.goldBorder : C.border}`,
              borderRadius: 2,
              padding: 28,
              position: "relative",
              boxShadow: plan.id === "growth" ? `0 0 0 1px ${C.goldBorder}` : "none",
            }}
          >
            {plan.tag && (
              <div style={{ position: "absolute", top: -1, left: 24 }}>
                <Tag color={plan.id === "growth" ? C.gold : C.textSub}
                  bg={plan.id === "growth" ? C.goldLight : C.borderLight}>
                  {plan.tag}
                </Tag>
              </div>
            )}
            <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textSub, marginBottom: 8, marginTop: plan.tag ? 16 : 0 }}>{plan.nameEn}</p>
            <p style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, marginBottom: 6 }}>{plan.nameJa || plan.name}</p>
            <p style={{ fontSize: 11, color: C.textSub, marginBottom: 20, lineHeight: 1.5 }}>
              {plan.target}
            </p>

            <div style={{ marginBottom: 24 }}>
              {(() => {
                const useYearly = billingCycle === "yearly" && plan.annualEligible && Number.isFinite(plan.monthlyPrice);
                const monthly = Number(plan.monthlyPrice || 0);
                const annual = monthly * 10;
                const save = monthly * 12 - annual;
                const priceText = Number.isFinite(plan.monthlyPrice)
                  ? formatYen(useYearly ? annual : monthly)
                  : "個別見積";
                const periodText = Number.isFinite(plan.monthlyPrice)
                  ? useYearly ? "/年" : "/月"
                  : "";
                return (
                  <>
                    <span style={{ fontFamily: JP, fontSize: 36, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{priceText}</span>
                    <span style={{ fontSize: 12, color: C.textSub }}>{periodText}</span>
                    {useYearly && save > 0 && (
                      <p style={{ fontSize: 11, color: C.green, marginTop: 6 }}>
                        {formatYen(save)} お得
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <div style={{ padding: "12px 0", borderTop: `1px solid ${C.borderLight}`, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 24 }}>
              <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>クレジット</p>
              <p style={{ fontFamily: JP, fontSize: 26, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{plan.credits}<span style={{ fontSize: 12, fontFamily: SANS, color: C.textSub, fontWeight: 300 }}> / 月</span></p>
              {getCreditPackOffers(plan.id)[0] ? (
                <p style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                  追加 10cr {formatYen(getCreditPackOffers(plan.id)[0].priceYen)}
                </p>
              ) : null}
            </div>

            <div style={{ marginBottom: 24 }}>
              {plan.features.map((f) => (
                <div key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ color: C.gold, fontSize: 12, marginTop: 2 }}>✦</span>
                  <span style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{f}</span>
                </div>
              ))}
            </div>

            <Btn
              variant={plan.id === "growth" ? "gold" : plan.id === "enterprise" ? "primary" : "secondary"}
              full
              disabled={checkoutBusy === plan.id || user?.plan === plan.id}
              onClick={async () => {
                if (!user?.id || user?.plan === plan.id) return;
                setCheckoutError("");
                if (hasSavedCard) {
                  setConfirmPlan(plan.id);
                  return;
                }
                setCheckoutBusy(plan.id);
                try {
                  const result = await createCheckoutSession({
                    userId: user.id,
                    mode: "subscription",
                    planId: plan.id,
                  });
                  if (result?.user) {
                    onUserUpdate?.(result.user);
                  } else if (result?.url) {
                    window.location.assign(result.url);
                  }
                } catch (error) {
                  setCheckoutError(error instanceof Error ? error.message : hasPaidPlan ? "プラン変更ページの起動に失敗しました。" : "決済ページの起動に失敗しました。");
                } finally {
                  setCheckoutBusy("");
                }
              }}
            >
              {user?.plan === plan.id ? "加入中" : checkoutBusy === plan.id ? "移動中..." : hasPaidPlan ? "このプランに変更" : plan.cta}
            </Btn>
          </div>
        ))}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: "28px 32px", marginBottom: 48 }}>
        <p style={{ fontFamily: SERIF, fontSize: 20, marginBottom: 10 }}>追加クレジット</p>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, marginBottom: 20 }}>
          月額プランの基本クレジットを使い切ったあとも、現在加入中のプラン単価に応じて 10 クレジットずつ追加できます。
          Free は初回だけ特別価格、その後は通常価格で追加します。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {topupRows.map((row) => (
            <div key={row.planId} style={{ border: `1px solid ${row.planId === "growth" ? C.goldBorder : C.borderLight}`, background: row.planId === "growth" ? C.goldLight : C.bg, padding: "16px 18px" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: row.planId === "growth" ? C.gold : C.textSub, marginBottom: 8 }}>
                {row.note}
              </p>
              <p style={{ fontSize: 16, color: C.text, fontWeight: 600, marginBottom: 6 }}>{row.label}</p>
              <p style={{ fontFamily: JP, fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginBottom: 6 }}>
                {formatYen(row.offer.priceYen)}
              </p>
              <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>
                10クレジット追加
              </p>
            </div>
          ))}
        </div>
        {checkoutError ? (
          <p style={{ fontSize: 12, color: C.red, marginTop: 14 }}>{checkoutError}</p>
        ) : null}
      </div>
      <BillingConfirmModal
        open={Boolean(confirmPlan)}
        title={confirmPlan ? `${getPlanLabel(confirmPlan)} に変更` : ""}
        body={
          confirmPlan
            ? (
              hasPaidPlan
                ? `月額プランを ${getPlanLabel(user?.plan)} から ${getPlanLabel(confirmPlan)} に変更します。`
                : `${getPlanLabel(confirmPlan)} へ加入します。`
            )
            : ""
        }
        amountLabel={confirmPlan ? `${formatYen(getMonthlyPrice(confirmPlan))} / 月` : ""}
        cardLabel={cardLabel}
        note={
          confirmPlan
            ? (
              hasPaidPlan
                ? `変更は即時反映されます。\n未使用期間分と新プラン料金は Stripe の日割り計算で調整され、差額がすぐに請求または充当されます。`
                : `登録済みカードで初回の月額料金を決済します。\nカード番号の再入力は不要です。`
            )
            : ""
        }
        confirmLabel={hasPaidPlan ? "この内容で変更" : "この内容で加入"}
        busy={Boolean(confirmPlan && checkoutBusy === confirmPlan)}
        onCancel={() => {
          if (!checkoutBusy) setConfirmPlan(null);
        }}
        onConfirm={async () => {
          if (!confirmPlan || !user?.id) return;
          setCheckoutBusy(confirmPlan);
          setCheckoutError("");
          try {
            if (hasPaidPlan) {
              const result = await changeSubscriptionPlan(user.id, confirmPlan);
              onUserUpdate?.(result.user);
            } else {
              const result = await createCheckoutSession({
                userId: user.id,
                mode: "subscription",
                planId: confirmPlan,
              });
              if (result?.user) {
                onUserUpdate?.(result.user);
              } else if (result?.url) {
                window.location.assign(result.url);
                return;
              }
            }
            setConfirmPlan(null);
          } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : "決済ページの起動に失敗しました。");
          } finally {
            setCheckoutBusy("");
          }
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: SETTINGS
// ─────────────────────────────────────────────
function SettingsPage({ user, setPage, onUserUpdate }) {
  const [notifications, setNotifications] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);
  const [quality, setQuality] = useState("high");
  const creditOffers = getCreditPackOffers(user?.plan, Boolean(user?.introPackEligible));
  const currentOffer = creditOffers[0] || null;
  const formatYen = useCallback((value) => `¥${Number(value || 0).toLocaleString("ja-JP")}`, []);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingCustomer, setBillingCustomer] = useState(null);
  const [creditPackOrders, setCreditPackOrders] = useState([]);
  const [subscriptionOrders, setSubscriptionOrders] = useState([]);
  const [confirmTopupOpen, setConfirmTopupOpen] = useState(false);

  const formatDateTime = useCallback(
    (value) => {
      if (!value) return "-";
      return new Date(value).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setBillingCustomer(null);
      setCreditPackOrders([]);
      setSubscriptionOrders([]);
      return undefined;
    }
    setBillingLoading(true);
    setBillingError("");
    getBillingHistory(user.id)
      .then((data) => {
        if (cancelled) return;
        setBillingCustomer(data?.billingCustomer || null);
        setCreditPackOrders(Array.isArray(data?.creditPackOrders) ? data.creditPackOrders : []);
        setSubscriptionOrders(Array.isArray(data?.subscriptionOrders) ? data.subscriptionOrders : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setBillingError(error instanceof Error ? error.message : "購入履歴の取得に失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const recentBillingItems = useMemo(() => (
    [...subscriptionOrders, ...creditPackOrders]
      .sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0))
      .slice(0, 8)
  ), [creditPackOrders, subscriptionOrders]);
  const portalReady = useMemo(
    () => Boolean(
      billingCustomer?.stripeCustomerId
      || subscriptionOrders.some((order) => String(order?.stripeCustomerId || "").trim()),
    ),
    [billingCustomer?.stripeCustomerId, subscriptionOrders],
  );
  const hasSavedCard = Boolean(
    billingCustomer?.defaultPaymentMethodId
    || billingCustomer?.payload?.cardLast4
    || billingCustomer?.stripeCustomerId,
  );
  const cardLabel = useMemo(() => {
    const brand = String(billingCustomer?.payload?.cardBrand || "").toUpperCase();
    const last4 = String(billingCustomer?.payload?.cardLast4 || "");
    if (brand && last4) return `${brand} •••• ${last4} で決済します。`;
    if (last4) return `登録済みのカード（•••• ${last4}）で決済します。`;
    return "以前の決済に使ったカードでそのまま決済します。";
  }, [billingCustomer?.payload?.cardBrand, billingCustomer?.payload?.cardLast4]);
  const totalCredits = getTotalCreditsValue(user);
  const subscriptionCredits = getSubscriptionCreditsValue(user);
  const purchasedCredits = getPurchasedCreditsValue(user);

  const billingStatusMeta = useCallback((status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "paid" || normalized === "active" || normalized === "processed") {
      return { label: "完了", color: C.green, bg: C.greenLight };
    }
    if (normalized === "failed") {
      return { label: "失敗", color: C.red, bg: "#FCEDEA" };
    }
    if (normalized === "pending") {
      return { label: "処理中", color: C.gold, bg: C.goldLight };
    }
    if (normalized === "ignored") {
      return { label: "無視", color: C.textSub, bg: C.borderLight };
    }
    return { label: status || "-", color: C.textSub, bg: C.borderLight };
  }, []);

  const describeBillingItem = useCallback((item) => {
    if (item.kind === "subscription") {
      return {
        title: `${getPlanLabel(item.planId)} プラン`,
        detail: `月額 ${item.amountYen == null ? "-" : formatYen(item.amountYen)}`,
      };
    }
    return {
      title: item.packCode === "free-intro-10" ? "初回限定 10クレジット" : "追加 10クレジット",
      detail: `${formatYen(item.amountYen)} / ${Number(item.credits || 0)}cr`,
    };
  }, [formatYen]);

  const Toggle = ({ value, onChange }) => (
    <div onClick={() => onChange(!value)} style={{
      width: 40, height: 22, borderRadius: 11,
      background: value ? C.gold : C.border,
      position: "relative", cursor: "pointer", transition: "background 0.2s",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s",
      }} />
    </div>
  );

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 8, fontFamily: SANS }}>Settings</p>
        <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400 }}>設定</h1>
      </div>

      <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Account */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>アカウント</p>
          </div>
          <div style={{ padding: "0 24px" }}>
            {[
              { label: "名前", value: user.name || "User" },
              { label: "メールアドレス", value: user.email },
              { label: "プラン", value: getPlanLabel(user.plan) },
              { label: "登録日", value: new Date(user.createdAt).toLocaleDateString("ja-JP") },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 0", borderBottom: `1px solid ${C.borderLight}`,
              }}>
                <span style={{ fontSize: 13, color: C.textMid }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>追加クレジット</p>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
              {[
                { label: "合計利用可能", value: `${totalCredits.toLocaleString()}cr` },
                { label: "月額残高", value: `${subscriptionCredits.toLocaleString()}cr` },
                { label: "追加購入残高", value: `${purchasedCredits.toLocaleString()}cr` },
              ].map((item) => (
                <div key={item.label} style={{ border: `1px solid ${C.borderLight}`, background: C.bg, padding: 14 }}>
                  <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{item.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{item.value}</p>
                </div>
              ))}
            </div>
            {currentOffer ? (
              <>
                <div style={{ border: `1px solid ${user?.plan === "free" && user?.introPackEligible ? C.goldBorder : C.borderLight}`, background: user?.plan === "free" && user?.introPackEligible ? C.goldLight : C.bg, padding: "18px 18px 16px", marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    {user?.plan === "free" && user?.introPackEligible ? "初回限定オファー" : "現在の追加パック"}
                  </p>
                  <p style={{ fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 8 }}>
                    {currentOffer.label}
                  </p>
                  <p style={{ fontFamily: JP, fontSize: 30, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginBottom: 6 }}>
                    {formatYen(currentOffer.priceYen)}
                  </p>
                  <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>
                    10クレジット追加
                    {user?.plan !== "free" ? ` / ${getPlanLabel(user?.plan)} 単価` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8, maxWidth: 420 }}>
                    決済完了後に 10 クレジットを加算する追加購入枠です。Free で初回限定オファーが残っている場合は、通常価格より先にこちらが優先されます。
                  </p>
                  <Btn
                    size="sm"
                    onClick={async () => {
                      if (!user?.id || !currentOffer || topupBusy) return;
                      if (hasSavedCard) {
                        setConfirmTopupOpen(true);
                        return;
                      }
                      setTopupBusy(true);
                      setTopupError("");
                      try {
                        const result = await createCheckoutSession({
                          userId: user.id,
                          mode: "payment",
                          packCode: currentOffer.id,
                        });
                        if (result?.user) {
                          onUserUpdate?.(result.user);
                        } else if (result?.url) {
                          window.location.assign(result.url);
                        }
                      } catch (error) {
                        setTopupError(error instanceof Error ? error.message : "決済ページの起動に失敗しました。");
                      } finally {
                        setTopupBusy(false);
                      }
                    }}
                    disabled={topupBusy}
                  >
                    {topupBusy ? "移動中..." : "Stripeで購入"}
                  </Btn>
                </div>
                {topupError ? <p style={{ fontSize: 12, color: C.red, marginTop: 12 }}>{topupError}</p> : null}
              </>
            ) : (
              <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>
                Custom プランの追加クレジットは個別見積にします。
              </p>
            )}
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>請求管理</p>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>カード・請求書・サブスク管理</p>
                <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.8 }}>
                  初回課金後のカード情報は保持されます。以後のプラン変更はアプリ内で行い、解約時のみ Stripe へ移動します。
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ border: `1px solid ${C.borderLight}`, padding: 16, background: C.bg }}>
                <p style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>Stripe Customer</p>
                <p style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>
                  {billingCustomer?.stripeCustomerId || "未作成"}
                </p>
                <p style={{ fontSize: 12, color: C.textMid }}>{billingCustomer?.billingEmail || user?.email || "-"}</p>
              </div>
              <div style={{ border: `1px solid ${C.borderLight}`, padding: 16, background: C.bg }}>
                <p style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>購入件数</p>
                <p style={{ fontSize: 22, color: C.text, fontWeight: 700, marginBottom: 4 }}>{creditPackOrders.length + subscriptionOrders.length}</p>
                <p style={{ fontSize: 12, color: C.textMid }}>追加購入 {creditPackOrders.length}件 / 月額 {subscriptionOrders.length}件</p>
              </div>
            </div>
            {portalError ? <p style={{ fontSize: 12, color: C.red, marginTop: 12 }}>{portalError}</p> : null}
            {!portalReady ? (
              <p style={{ fontSize: 12, color: C.textMid, marginTop: 12, lineHeight: 1.8 }}>
                最初の決済が完了すると Stripe Customer が作成され、ここから請求管理ページを開けます。
              </p>
            ) : null}
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>購入履歴</p>
          </div>
          <div style={{ padding: 24 }}>
            {billingLoading ? (
              <p style={{ fontSize: 12, color: C.textMid }}>購入履歴を読み込み中です。</p>
            ) : billingError ? (
              <p style={{ fontSize: 12, color: C.red }}>{billingError}</p>
            ) : recentBillingItems.length === 0 ? (
              <p style={{ fontSize: 12, color: C.textMid }}>まだ購入履歴はありません。</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentBillingItems.map((item) => {
                  const meta = billingStatusMeta(item.status);
                  const desc = describeBillingItem(item);
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      style={{
                        border: `1px solid ${C.borderLight}`,
                        background: C.bg,
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 14,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{desc.title}</p>
                          <Tag color={meta.color} bg={meta.bg}>{meta.label}</Tag>
                        </div>
                        <p style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>{desc.detail}</p>
                        <p style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                          {formatDateTime(item.createdAt)}
                          {item.kind === "subscription" && item.stripeLatestInvoiceId ? ` / Invoice ${item.stripeLatestInvoiceId}` : ""}
                          {item.kind === "credit_pack" && item.stripePaymentIntentId ? ` / PI ${item.stripePaymentIntentId}` : ""}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                          {item.amountYen == null ? "-" : formatYen(item.amountYen)}
                        </p>
                        <p style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>
                          {item.kind === "subscription" ? "月額" : `${Number(item.credits || 0)}cr`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Preferences */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textSub }}>出力設定</p>
          </div>
          <div style={{ padding: "0 24px" }}>
            {[
              { label: "生成完了通知", sub: "ブラウザ通知でお知らせ", value: notifications, onChange: setNotifications },
              { label: "自動ダウンロード", sub: "生成完了後に自動保存", value: autoDownload, onChange: setAutoDownload },
            ].map(({ label, sub, value, onChange }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 0", borderBottom: `1px solid ${C.borderLight}`,
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>{label}</p>
                  <p style={{ fontSize: 11, color: C.textSub }}>{sub}</p>
                </div>
                <Toggle value={value} onChange={onChange} />
              </div>
            ))}

            <div style={{ padding: "16px 0" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 12 }}>出力解像度</p>
              <div style={{ display: "flex", gap: 8 }}>
                {["standard", "high", "ultra"].map((q) => (
                  <div key={q} onClick={() => setQuality(q)} style={{
                    flex: 1, padding: "9px 0", textAlign: "center",
                    border: `1px solid ${quality === q ? C.goldBorder : C.borderLight}`,
                    borderRadius: 1, cursor: "pointer",
                    background: quality === q ? C.goldLight : "transparent",
                    fontSize: 11, letterSpacing: "0.06em",
                    color: quality === q ? C.gold : C.textSub,
                    textTransform: "uppercase",
                  }}>
                    {q === "standard" ? "標準" : q === "high" ? "高解像度" : "Ultra"}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
            <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.red }}>アカウント管理</p>
          </div>
          <div style={{ padding: "20px 24px", display: "flex", gap: 12 }}>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => setPage?.("pricing")}
            >
              プランを変更
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!user?.id || portalBusy || !portalReady) return;
                setPortalBusy(true);
                setPortalError("");
                try {
                  const session = await createCustomerPortalSession(user.id);
                  window.location.assign(session.url);
                } catch (error) {
                  setPortalError(error instanceof Error ? error.message : "カード情報変更ページを開けませんでした。");
                } finally {
                  setPortalBusy(false);
                }
              }}
              disabled={portalBusy || !portalReady}
            >
              {portalBusy ? "移動中..." : "クレジットカード変更"}
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!user?.id || portalBusy || !portalReady) return;
                setPortalBusy(true);
                setPortalError("");
                try {
                  const session = await createCustomerPortalSession(user.id);
                  window.location.assign(session.url);
                } catch (error) {
                  setPortalError(error instanceof Error ? error.message : "請求管理ページを開けませんでした。");
                } finally {
                  setPortalBusy(false);
                }
              }}
              disabled={portalBusy || !portalReady}
            >
              {portalBusy ? "移動中..." : "プランをキャンセル"}
            </Btn>
          </div>
        </div>

        <Btn variant="primary">変更を保存</Btn>
      </div>
      <BillingConfirmModal
        open={confirmTopupOpen}
        title={currentOffer ? currentOffer.label : ""}
        body="以前の決済に使ったカードで追加クレジットを購入します。カード番号の再入力は不要です。"
        amountLabel={currentOffer ? formatYen(currentOffer.priceYen) : ""}
        cardLabel={cardLabel}
        note="決済が完了すると、すぐに 10 クレジットを加算します。"
        confirmLabel="この内容で購入"
        busy={topupBusy}
        onCancel={() => {
          if (!topupBusy) setConfirmTopupOpen(false);
        }}
        onConfirm={async () => {
          if (!user?.id || !currentOffer || topupBusy) return;
          setTopupBusy(true);
          setTopupError("");
          try {
            const result = await createCheckoutSession({
              userId: user.id,
              mode: "payment",
              packCode: currentOffer.id,
            });
            if (result?.user) {
              onUserUpdate?.(result.user);
            } else if (result?.url) {
              window.location.assign(result.url);
              return;
            }
            setConfirmTopupOpen(false);
          } catch (error) {
            setTopupError(error instanceof Error ? error.message : "決済ページの起動に失敗しました。");
          } finally {
            setTopupBusy(false);
          }
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(() => window.location.pathname || "/");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [studioAssets, setStudioAssets] = useState([]);
  const [modelAssets, setModelAssets] = useState([]);
  const [productAssets, setProductAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("upload");
  const [showNameSetup, setShowNameSetup] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [nameSetupError, setNameSetupError] = useState("");
  const [creditHistory, setCreditHistory] = useState([]);
  const [creditHistoryOpen, setCreditHistoryOpen] = useState(false);
  const [assetLibraryReady, setAssetLibraryReady] = useState(false);
  const hasLoadedRemoteAssetLibraryRef = useRef(false);
  const assetSaveChainRef = useRef(Promise.resolve());
  const assetSaveSeqRef = useRef(0);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname || "/");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const navigate = useCallback((path) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, "", path);
    setRoute(path);
  }, []);

  const refreshData = useCallback(async ({ preferCache = false, userHint = null } = {}) => {
    if (!preferCache) setAssetLibraryReady(false);
    try {
      const currentUser = userHint || await getCurrentUser();
      setUser(currentUser);
      if (currentUser) {
        const cached = readDashboardCache(currentUser.id);
        if (cached) {
          setJobs(Array.isArray(cached.jobs) ? cached.jobs : []);
          setCreditHistory(Array.isArray(cached.creditHistory) ? cached.creditHistory : []);
          setStudioAssets(mergeDefaultStudioAssets(Array.isArray(cached.studioAssets) ? cached.studioAssets : []));
          setModelAssets(mergeDefaultModelAssets(Array.isArray(cached.modelAssets) ? cached.modelAssets : []));
          setProductAssets(mergeProductAssets(Array.isArray(cached.productAssets) ? cached.productAssets : []));
          setAssetLibraryReady(true);
          hasLoadedRemoteAssetLibraryRef.current = true;
          setLoading(false);
          if (preferCache && Date.now() - Number(cached.savedAt || 0) < DASHBOARD_CACHE_TTL_MS) {
            return;
          }
        }
        const [nextJobs, nextCreditHistory] = await Promise.all([
          listJobs(currentUser.id),
          listCreditHistory(currentUser.id),
        ]);
        setJobs(nextJobs);
        setCreditHistory(nextCreditHistory);
        try {
          const localLib = readAssetLibrary(currentUser.id);
          const localProductMeta = mergeProductAssets(localLib.products);
          const [remoteLib, localHydratedProducts] = await Promise.all([
            fetchAssetLibrary(currentUser.id),
            hydrateProductAssetsFromDb(currentUser.id, localProductMeta),
          ]);
          const localHasAssets = (localLib.studio || []).length > 0
            || (localLib.models || []).length > 0
            || (localHydratedProducts || []).length > 0;
          if (localHasAssets) {
            // Only bootstrap remote from local when remote is empty for that category.
            // This avoids resurrecting assets the user intentionally deleted on remote.
            const shouldBootstrapRemote = (remoteArr = [], localArr = []) => (
              Array.isArray(remoteArr) && Array.isArray(localArr)
              && remoteArr.length === 0
              && localArr.length > 0
            );
            const needsMigration = shouldBootstrapRemote(remoteLib.studio, localLib.studio)
              || shouldBootstrapRemote(remoteLib.models, localLib.models)
              || shouldBootstrapRemote(remoteLib.products, localHydratedProducts);
            if (needsMigration) {
              const mergeMissingById = (remoteArr = [], localArr = []) => {
                const merged = [...(remoteArr || [])];
                const idSet = new Set(merged.map((asset) => asset.id));
                (localArr || []).forEach((asset) => {
                  if (!idSet.has(asset.id)) {
                    merged.push(asset);
                    idSet.add(asset.id);
                  }
                });
                return merged;
              };
              const migratedLib = await saveAssetLibrary(currentUser.id, {
                studio: mergeMissingById(remoteLib.studio, localLib.studio),
                models: mergeMissingById(remoteLib.models, localLib.models),
                products: mergeMissingById(remoteLib.products, localHydratedProducts),
              });
              setStudioAssets(mergeDefaultStudioAssets(migratedLib.studio));
              setModelAssets(mergeDefaultModelAssets(migratedLib.models));
              setProductAssets(mergeProductAssets(migratedLib.products));
              writeDashboardCache(currentUser.id, {
                jobs: nextJobs,
                creditHistory: nextCreditHistory,
                studioAssets: migratedLib.studio,
                modelAssets: migratedLib.models,
                productAssets: migratedLib.products,
              });
              hasLoadedRemoteAssetLibraryRef.current = true;
              setAssetLibraryReady(true);
              return;
            }
          }
          const mergedStudioAssets = mergeDefaultStudioAssets(remoteLib.studio);
          const mergedModelAssets = mergeDefaultModelAssets(remoteLib.models);
          setStudioAssets(mergedStudioAssets);
          setModelAssets(mergedModelAssets);
          const remoteProductMeta = mergeProductAssets(remoteLib.products);
          const remoteHydratedProducts = await hydrateProductAssetsFromDb(currentUser.id, remoteProductMeta);
          setProductAssets(remoteHydratedProducts);
          writeDashboardCache(currentUser.id, {
            jobs: nextJobs,
            creditHistory: nextCreditHistory,
            studioAssets: mergedStudioAssets,
            modelAssets: mergedModelAssets,
            productAssets: remoteHydratedProducts,
          });
          hasLoadedRemoteAssetLibraryRef.current = true;
        } catch {
          // If remote has succeeded at least once in this session, keep current UI state on transient failures.
          // Falling back to local after remote success can resurrect deleted assets from stale cache.
          if (!hasLoadedRemoteAssetLibraryRef.current) {
            const lib = readAssetLibrary(currentUser.id);
            const mergedStudioAssets = mergeDefaultStudioAssets(lib.studio);
            const mergedModelAssets = mergeDefaultModelAssets(lib.models);
            setStudioAssets(mergedStudioAssets);
            setModelAssets(mergedModelAssets);
            const productMeta = mergeProductAssets(lib.products);
            const hydratedProducts = await hydrateProductAssetsFromDb(currentUser.id, productMeta);
            setProductAssets(hydratedProducts);
            writeDashboardCache(currentUser.id, {
              jobs: nextJobs,
              creditHistory: nextCreditHistory,
              studioAssets: mergedStudioAssets,
              modelAssets: mergedModelAssets,
              productAssets: hydratedProducts,
            });
          }
        }
        setAssetLibraryReady(true);
      } else {
        setJobs([]);
        setCreditHistory([]);
        setStudioAssets([]);
        setModelAssets([]);
        setProductAssets([]);
        setAssetLibraryReady(false);
        hasLoadedRemoteAssetLibraryRef.current = false;
        clearDashboardCache(userHint?.id);
      }
    } catch (error) {
      console.error("[refreshData] failed", error);
      setAssetLibraryReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    STYLE_OPTIONS.forEach((opt) => preloadImage(opt.previewImage));
  }, [user]);

  const openDemo = useCallback(async () => {
    startDemoSession();
    setPage("upload");
    await refreshData();
    navigate("/demo");
  }, [navigate, refreshData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshData({ preferCache: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshData]);

  useEffect(() => {
    if (route !== "/demo") return;
    const timer = setTimeout(() => {
      if (!isDemoSession()) {
        startDemoSession();
      }
      void refreshData({ preferCache: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshData, route]);

  useEffect(() => {
    if ((route !== "/login" && route !== "/signup") || !user?.isDemo) return;
    void (async () => {
      await logout();
      await refreshData();
    })();
  }, [refreshData, route, user?.isDemo]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => {
      void (async () => {
        const activeJobs = await listActiveJobs(user.id);
        if (activeJobs.length === 0) return;
        await Promise.all(activeJobs.map((job) => pollJob(job.id)));
        await refreshData();
      })();
    }, 1200);
    return () => clearInterval(timer);
  }, [refreshData, user]);

  useEffect(() => {
    // Safety reset: if a fullscreen viewer left body scroll locked,
    // always restore page scrolling after navigation/page switch.
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [page, route]);

  useEffect(() => {
    if (!user?.id) return;
    if (user?.isDemo) return;
    if (!assetLibraryReady) return;
    const userId = user.id;
    const snapshot = {
      studio: studioAssets,
      models: modelAssets,
      products: productAssets,
    };
    const seq = ++assetSaveSeqRef.current;
    assetSaveChainRef.current = assetSaveChainRef.current
      .catch(() => {})
      .then(async () => {
        // Skip stale snapshots; only latest state should be persisted.
        if (seq !== assetSaveSeqRef.current) return;
        let persistedSnapshot = snapshot;
        try {
          persistedSnapshot = await saveAssetLibrary(userId, snapshot);
        } catch {
          // Keep local backup even when remote save fails.
          persistedSnapshot = snapshot;
        }
        // Always keep local durable backup so a reload never drops freshly added assets.
        writeAssetLibrary(userId, {
          studio: persistedSnapshot.studio,
          models: persistedSnapshot.models,
          products: stripProductAssetsForMeta(persistedSnapshot.products),
        });
        await persistProductAssetsToDb(userId, persistedSnapshot.products);
      });
  }, [assetLibraryReady, user?.id, user?.isDemo, studioAssets, modelAssets, productAssets]);

  if (route === "/") {
    return (
      <>
        <GlobalStyles />
        <LandingPage onLogin={() => navigate("/login")} onSignup={() => navigate("/signup")} onTryDemo={() => { void openDemo(); }} />
      </>
    );
  }

  if (infoPageMap[route]) {
    return (
      <>
        <GlobalStyles />
        <InfoPage
          title={infoPageMap[route]}
          route={route}
          onLogin={() => navigate("/login")}
          onSignup={() => navigate("/signup")}
          onTryDemo={() => { void openDemo(); }}
        />
      </>
    );
  }

  if (route !== "/app" && route !== "/demo" && route !== "/login" && route !== "/signup") {
    return (
      <>
        <GlobalStyles />
        <LandingPage onLogin={() => navigate("/login")} onSignup={() => navigate("/signup")} onTryDemo={() => { void openDemo(); }} />
      </>
    );
  }

  if (route === "/login" || route === "/signup") return (
    <>
      <GlobalStyles />
      <LoginPage
        defaultTab={route === "/signup" ? "signup" : "login"}
        onLogin={async ({ email, password }) => {
          const loggedInUser = await login({ email, password });
          await refreshData({ preferCache: true, userHint: loggedInUser });
          navigate("/app");
        }}
        onSignup={async ({ email, password }) => {
          const signedUpUser = await signup({ email, password });
          await refreshData({ userHint: signedUpUser });
          setPendingName("");
          setNameSetupError("");
          setShowNameSetup(true);
          navigate("/app");
        }}
      />
    </>
  );

  if (loading) {
    return (
      <>
        <GlobalStyles />
        <SeoHead title="TORSO.AI" description="アパレル向けAI商品画像生成プラットフォーム" />
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: C.textSub }}>Loading...</div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <GlobalStyles />
        <LoginPage
          defaultTab="login"
          onLogin={async ({ email, password }) => {
            const loggedInUser = await login({ email, password });
            await refreshData({ preferCache: true, userHint: loggedInUser });
            navigate("/app");
          }}
          onSignup={async ({ email, password }) => {
            const signedUpUser = await signup({ email, password });
            await refreshData({ userHint: signedUpUser });
            setPendingName("");
            setNameSetupError("");
            setShowNameSetup(true);
            navigate("/app");
          }}
        />
      </>
    );
  }

  const handleJobCreated = (job) => {
    if (!job?.id) return;
    setJobs((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const idx = next.findIndex((row) => row.id === job.id);
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...job };
      } else {
        next.unshift(job);
      }
      return next.sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
    });
  };

  const pages = {
    history: <HistoryPage user={user} jobs={jobs} onRefresh={refreshData} isMobile={isMobile} />,
    products: (
      <ProductsLibraryPage
        user={user}
        assets={productAssets}
        setAssets={setProductAssets}
      />
    ),
    edit: <EditPage jobs={jobs} user={user} onDataRefresh={refreshData} onJobCreated={handleJobCreated} studioAssets={studioAssets} modelAssets={modelAssets} isMobile={isMobile} />,
    studio: (
      <AssetLibraryPage
        title="スタジオ"
        subtitle="背景画像を登録して、生成時の背景参照として使えます。"
        emptyText="背景画像がまだありません。画像を追加すると生成画面で選択できます。"
        assets={studioAssets}
        setAssets={setStudioAssets}
        favoriteEnabled
        isDemo={Boolean(user?.isDemo)}
        uploadStyle="productLike"
        cardStyle="modelLike"
      />
    ),
    models: (
      <ModelsLibraryPage
        user={user}
        assets={modelAssets}
        setAssets={setModelAssets}
        isMobile={isMobile}
      />
    ),
    guide: <GuidePage isMobile={isMobile} setPage={setPage} />,
    pricing: <PricingPage user={user} onUserUpdate={setUser} />,
    settings: <SettingsPage user={user} setPage={setPage} onUserUpdate={setUser} />,
  };

  return (
    <>
      <GlobalStyles />
      <SeoHead title="ダッシュボード | TORSO.AI" description="TORSO.AIの生成管理ダッシュボード" ogTitle="ダッシュボード | TORSO.AI" />
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: SANS, width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
        <Sidebar
          page={page}
          setPage={setPage}
          user={user}
          isMobile={isMobile}
          onOpenCreditHistory={() => {
            setCreditHistoryOpen(true);
            void (async () => {
              try {
                if (!user?.id) return;
                const [nextCreditHistory, nextUser] = await Promise.all([
                  listCreditHistory(user.id),
                  getCurrentUser(),
                ]);
                setCreditHistory(nextCreditHistory);
                if (nextUser) setUser(nextUser);
              } catch {
                // Keep modal open even if history refresh fails.
              }
            })();
          }}
          onSignup={async () => {
            if (user?.isDemo) {
              clearDashboardCache(user.id);
              await logout();
              await refreshData();
            }
            navigate("/signup");
          }}
          onLogout={async () => {
            if (user?.id) clearDashboardCache(user.id);
            await logout();
            await refreshData();
          }}
        />
        <main style={{
          marginLeft: isMobile ? 0 : 220, flex: 1,
          padding: isMobile ? "22px 16px 108px" : "44px 48px",
          minHeight: "100vh",
          background: C.bg,
          minWidth: 0,
          width: "100%",
          maxWidth: "100vw",
          overflowX: "hidden",
        }}>
          <div style={{ display: page === "upload" ? "block" : "none" }}>
            <UploadPage user={user} jobs={jobs} onDataRefresh={refreshData} onJobCreated={handleJobCreated} studioAssets={studioAssets} modelAssets={modelAssets} productAssets={productAssets} isMobile={isMobile} isActive={page === "upload"} />
          </div>
          {page !== "upload" ? pages[page] : null}
        </main>
      </div>
      {creditHistoryOpen && (
        <div
          onClick={() => setCreditHistoryOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1300,
            display: "grid",
            placeItems: "center",
            padding: isMobile ? 12 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: isMobile ? "100vw" : 720,
              maxHeight: isMobile ? "calc(100vh - 24px)" : "78vh",
              overflow: "auto",
              background: C.surface,
              border: `1px solid ${C.border}`,
              padding: isMobile ? 14 : 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 8 : 10, gap: 12 }}>
              <p style={{ fontFamily: SERIF, fontSize: isMobile ? 19 : 24, color: C.text, lineHeight: 1.2 }}>クレジット履歴</p>
              <button onClick={() => setCreditHistoryOpen(false)} style={{ border: "none", background: "transparent", fontSize: 20, color: C.textSub, cursor: "pointer" }}>×</button>
            </div>
            <p style={{ fontSize: isMobile ? 10 : 11, color: C.textSub, marginBottom: 12, lineHeight: 1.6 }}>
              画像を削除しても、この履歴は消えません。
            </p>
            {creditHistory.length === 0 ? (
              <div style={{ border: `1px solid ${C.border}`, background: C.bg, padding: 14, fontSize: 12, color: C.textSub }}>
                履歴はまだありません。
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}` }}>
                {creditHistory.map((event) => {
                  const d = new Date(event.createdAt || Date.now());
                  const delta = Number(event.delta || 0);
                  const labelByType = {
                    model_generate_reserved: "モデル生成",
                    model_generate_refund: "モデル生成 返金",
                    job_reserved: "画像生成ジョブ",
                    job_retry_reserved: "リトライ",
                    job_error_refund: "失敗返金",
                  };
                  const action = labelByType[event.type] || event.type || "credit";
                  const detail = [
                    event?.payload?.style ? `style: ${event.payload.style}` : "",
                    Number.isFinite(Number(event?.payload?.imageCount)) ? `枚数: ${event.payload.imageCount}` : "",
                    Number.isFinite(Number(event?.payload?.numImages)) ? `枚数: ${event.payload.numImages}` : "",
                    Number.isFinite(Number(event?.payload?.creditRate)) ? `単価: ${event.payload.creditRate}cr` : "",
                  ].filter(Boolean).join(" / ");
                  return (
                    <div
                      key={event.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr auto" : "170px 1fr 140px",
                        gap: isMobile ? 8 : 10,
                        alignItems: isMobile ? "start" : "center",
                        padding: isMobile ? "12px 14px" : "10px 12px",
                        borderTop: `1px solid ${C.borderLight}`,
                      }}
                    >
                      {isMobile ? (
                        <>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 10, color: C.textSub, marginBottom: 6, lineHeight: 1.5 }}>
                              {`${d.toLocaleDateString("ja-JP")} ${d.toLocaleTimeString("ja-JP", { hour12: false })}`}
                            </p>
                            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.45, marginBottom: detail ? 4 : 0 }}>
                              {action}
                            </p>
                            {detail ? (
                              <p style={{ fontSize: 10, color: C.textSub, lineHeight: 1.6, wordBreak: "break-word" }}>
                                {detail}
                              </p>
                            ) : null}
                          </div>
                          <span style={{ fontSize: 13, textAlign: "right", color: delta < 0 ? C.red : C.green, whiteSpace: "nowrap", alignSelf: "start" }}>
                            {delta > 0 ? `+${delta}` : `${delta}`} cr
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: C.textSub }}>{`${d.toLocaleDateString("ja-JP")} ${d.toLocaleTimeString("ja-JP", { hour12: false })}`}</span>
                          <div>
                            <p style={{ fontSize: 12, color: C.text }}>{action}</p>
                            {detail ? <p style={{ fontSize: 10, color: C.textSub, marginTop: 3 }}>{detail}</p> : null}
                          </div>
                          <span style={{ fontSize: 12, textAlign: "right", color: delta < 0 ? C.red : C.green }}>
                            {delta > 0 ? `+${delta}` : `${delta}`} cr
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {showNameSetup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1200,
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div style={{ width: "100%", maxWidth: 420, background: C.surface, border: `1px solid ${C.border}`, padding: 20 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textSub, marginBottom: 8 }}>
              Profile Setup
            </p>
            <h3 style={{ fontSize: 20, fontFamily: SERIF, fontWeight: 500, color: C.text, marginBottom: 8 }}>
              お名前を入力してください
            </h3>
            <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, marginBottom: 12 }}>
              新規登録ありがとうございます。表示名として使います。
            </p>
            <input
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder="例: 山田 太郎"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 13,
                marginBottom: 10,
              }}
            />
            {nameSetupError && (
              <p style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{nameSetupError}</p>
            )}
            <Btn
              variant="primary"
              full
              onClick={async () => {
                try {
                  if (!user?.id) throw new Error("ユーザー情報が見つかりません");
                  await updateUserName(user.id, pendingName);
                  setShowNameSetup(false);
                  setPendingName("");
                  setNameSetupError("");
                  await refreshData();
                } catch (e) {
                  setNameSetupError(e instanceof Error ? e.message : "名前の保存に失敗しました");
                }
              }}
              disabled={!pendingName.trim()}
            >
              保存して開始
            </Btn>
          </div>
        </div>
      )}
    </>
  );
}
  const infoPageMap = {
    "/company": "会社概要",
    "/terms": "利用規約",
    "/privacy": "プライバシーポリシー",
    "/commerce": "特定商取引法に基づく表記",
  };
