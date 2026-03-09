import Logo from "../components/Logo";
import { C, JP, SANS } from "../theme";

const PRIVACY_NOTES = [
  "AI生成時に一時的なログが保存される場合があります。",
  "元画像は学習には使用されません。",
  "データ保存期間：最大30日",
  "失敗ジョブは約7日で削除されます。",
];

export default function InfoPage({ title, route, onLogin, onSignup }) {
  const isPrivacyPage = route === "/privacy";
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: JP, padding: "24px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: "rgba(255,255,255,0.8)",
          }}
        >
          <a href="/" style={{ textDecoration: "none", display: "inline-flex" }}>
            <Logo />
          </a>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onLogin}
              style={{
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.text,
                padding: "10px 16px",
                borderRadius: 999,
                fontFamily: SANS,
                cursor: "pointer",
              }}
            >
              ログイン
            </button>
            <button
              onClick={onSignup}
              style={{
                border: `1px solid ${C.text}`,
                background: C.text,
                color: C.bg,
                padding: "10px 16px",
                borderRadius: 999,
                fontFamily: SANS,
                cursor: "pointer",
              }}
            >
              新規会員登録
            </button>
          </div>
        </header>

        <main style={{ marginTop: 24, border: `1px solid ${C.border}`, borderRadius: 14, background: C.surface, padding: "36px 28px" }}>
          <p style={{ fontSize: 11, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Information</p>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{title}</h1>
          {isPrivacyPage ? (
            <div style={{ display: "grid", gap: 8 }}>
              {PRIVACY_NOTES.map((line) => (
                <p key={line} style={{ color: C.textMid, lineHeight: 1.8 }}>{line}</p>
              ))}
            </div>
          ) : (
            <p style={{ color: C.textMid, lineHeight: 1.8 }}>このページは現在準備中です。内容は後で反映します。</p>
          )}
        </main>
      </div>
    </div>
  );
}
