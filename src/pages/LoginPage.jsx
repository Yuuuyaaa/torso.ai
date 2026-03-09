import { useEffect, useState } from "react";
import Logo from "../components/Logo";
import SeoHead from "../components/SeoHead";
import { Btn, Divider } from "../components/ui";
import { C, SANS } from "../theme";

export default function LoginPage({ onLogin, onSignup, defaultTab = "login" }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState(defaultTab);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const handleAuth = async () => {
    if (isSubmitting) return;
    const effectiveEmail = email.trim() || "dev@local.test";
    const effectivePass = String(pass || "");
    setIsSubmitting(true);
    try {
      if (tab === "signup") {
        if (effectivePass.length < 8) {
          setError("パスワードは8桁以上で入力してください。");
          setIsSubmitting(false);
          return;
        }
        await onSignup({ email: effectiveEmail, password: effectivePass });
      } else {
        await onLogin({ email: effectiveEmail, password: effectivePass });
      }
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: `1px solid ${C.border}`,
    borderRadius: 1,
    fontSize: 13,
    fontFamily: SANS,
    color: C.text,
    background: C.bg,
    outline: "none",
  };

  return (
    <>
      <SeoHead title="ログイン | TORSO.AI" description="TORSO.AIのログインページです。" ogTitle="ログイン | TORSO.AI" />
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.surface,
            border: `1px solid ${C.border}`,
            padding: 28,
          }}
        >
        <div style={{ width: "100%" }}>
          <div style={{ marginBottom: 18 }}>
            <a href="/" style={{ textDecoration: "none", display: "inline-flex" }}>
              <Logo />
            </a>
          </div>
          <div style={{ display: "flex", marginBottom: 36, borderBottom: `1px solid ${C.border}` }}>
            {["login", "signup"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "none",
                  border: "none",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: SANS,
                  color: tab === t ? C.text : C.textSub,
                  borderBottom: `2px solid ${tab === t ? C.gold : "transparent"}`,
                  marginBottom: -1,
                  transition: "all 0.15s",
                }}
              >
                {t === "login" ? "ログイン" : "新規登録"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              style={inputStyle}
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inputStyle, paddingRight: 46 }}
                type={showPass ? "text" : "password"}
                placeholder="パスワード"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPass((prev) => !prev)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: C.textSub,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                aria-label={showPass ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M6.7 6.7A16.4 16.4 0 0 0 2.5 12s3.5 6 9.5 6c2 0 3.8-.6 5.3-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M9 4.6A9.8 9.8 0 0 1 12 4c6 0 9.5 6 9.5 8a16.8 16.8 0 0 1-3.3 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: 11, color: pass.length >= 8 ? C.green : C.textSub }}>
              パスワードは8桁以上で入力してください。
            </p>

            {tab === "login" && (
              <div style={{ textAlign: "right" }}>
                <a style={{ fontSize: 11, color: C.textSub, textDecoration: "none", letterSpacing: "0.04em" }}>
                  パスワードを忘れた方
                </a>
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <Btn variant="primary" full size="lg" onClick={handleAuth} disabled={isSubmitting}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {isSubmitting ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "1.5px solid currentColor",
                        borderTopColor: "transparent",
                        display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : null}
                  <span>{isSubmitting ? (tab === "login" ? "ログイン中..." : "作成中...") : (tab === "login" ? "ログイン" : "アカウントを作成")}</span>
                </span>
              </Btn>
              {tab === "login" && (
                <p style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>
                  空欄で押すと開発者用アカウントでログインします。
                </p>
              )}
            </div>

            <Divider label="または" />

            <button
              onClick={() => {
                void handleAuth();
              }}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "12px",
                border: `1px solid ${C.border}`,
                borderRadius: 1,
                background: C.surface,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontFamily: SANS,
                color: isSubmitting ? C.textSub : C.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              <span style={{ fontSize: 16 }}>G</span> Google で続ける
            </button>
            {error && <p style={{ fontSize: 12, color: C.red }}>{error}</p>}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
