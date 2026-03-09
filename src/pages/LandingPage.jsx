import { useEffect, useRef, useState } from "react";
import Logo from "../components/Logo";
import SeoHead from "../components/SeoHead";

const P = {
  bg: "#f7f4ef",
  cream: "#fffefb",
  warm: "#f4efe7",
  gold: "#b89b6a",
  goldLight: "#d4be8e",
  text: "#1a1814",
  textMid: "#4a453c",
  textSub: "#8a8378",
  border: "#e5dfd5",
  borderLight: "#eee9df",
};

const DISPLAY = "'Playfair Display', 'Noto Serif JP', serif";
const BODY = "'Noto Sans JP', 'Helvetica Neue', sans-serif";
const NUM = "'Noto Sans JP', 'Helvetica Neue', sans-serif";
const sectionPad = { padding: "0 24px" };

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, visible];
}

function Reveal({ children, delay = 0, style = {} }) {
  const [ref, visible] = useInView(0.12);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}s, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Btn({ children, variant = "primary", onClick, style = {} }) {
  const [hover, setHover] = useState(false);
  const base = {
    fontFamily: BODY,
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    borderRadius: 100,
    padding: "13px 32px",
    transition: "all 0.3s ease",
    letterSpacing: "0.02em",
  };
  const variants = {
    primary: {
      background: P.text,
      color: P.cream,
      boxShadow: hover ? "0 6px 24px rgba(26,24,20,0.25)" : "0 2px 8px rgba(26,24,20,0.12)",
      transform: hover ? "translateY(-1px)" : "none",
    },
    secondary: {
      background: hover ? P.warm : "transparent",
      color: P.text,
      border: `1.5px solid ${P.border}`,
      padding: "11.5px 30px",
    },
    ghost: {
      background: "transparent",
      color: P.textMid,
      padding: "13px 20px",
      textDecoration: hover ? "underline" : "none",
      textUnderlineOffset: 4,
    },
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

function Marquee() {
  const items = [
    "AI MODEL GENERATION",
    "NO STUDIO REQUIRED",
    "COST -85%",
    "TIME -90%",
    "UNLIMITED VARIATIONS",
    "INSTANT DOWNLOAD",
  ];

  return (
    <div
      style={{
        overflow: "hidden",
        borderTop: `1px solid ${P.border}`,
        borderBottom: `1px solid ${P.border}`,
        padding: "14px 0",
        marginBottom: 64,
      }}
    >
      <div style={{ display: "flex", gap: 48, animation: "marquee 28s linear infinite", whiteSpace: "nowrap" }}>
        {[...items, ...items, ...items].map((text, i) => (
          <span
            key={`${text}-${i}`}
            style={{
              fontFamily: NUM,
              fontSize: 13,
              letterSpacing: "0.18em",
              color: P.textSub,
              textTransform: "uppercase",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {text} <span style={{ color: P.goldLight, margin: "0 8px" }}>+</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AnimatedNumber({ value, suffix = "", prefix = "" }) {
  const [ref, visible] = useInView(0.3);
  const [display, setDisplay] = useState(0);
  const num = parseInt(value, 10);

  useEffect(() => {
    if (!visible) return undefined;
    if (Number.isNaN(num)) return undefined;

    let start = 0;
    const dur = 1200;
    const step = 16;
    const inc = num / (dur / step);

    const timer = setInterval(() => {
      start += inc;
      if (start >= num) {
        setDisplay(num);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start));
      }
    }, step);

    return () => clearInterval(timer);
  }, [visible, num]);

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

export default function LandingPage({ onLogin, onSignup }) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headerOpacity = Math.min(scrollY / 120, 1);

  return (
    <>
      <SeoHead
        title="トルソーAI | 1枚の商品写真からプロ撮影を超える"
        description="平置き画像からAIがモデル着用画像を自動生成。背景変更・動画生成・一括100枚処理対応のアパレルAI撮影OS。"
        ogTitle="TORSO.AI"
        ogDescription="平置き画像からAIがモデル着用画像を自動生成。背景変更・一括処理に対応したアパレルAI撮影OS。"
      />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400&family=Noto+Sans+JP:wght@300;400;500;600;700&family=Noto+Serif+JP:wght@400;700&display=swap');
        @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-33.333%)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes heroReveal { from{opacity:0;transform:translateY(60px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; }
        ::selection { background: ${P.goldLight}; color: ${P.text}; }
      `}</style>

      <div style={{ minHeight: "100vh", background: P.bg, color: P.text, fontFamily: BODY }}>
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 24px" }}>
          <div
            style={{
              maxWidth: 1200,
              margin: "12px auto 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 24px",
              borderRadius: 100,
              border: `1px solid ${headerOpacity > 0.3 ? P.border : P.borderLight}`,
              background: `rgba(255,255,253,${0.78 + headerOpacity * 0.2})`,
              backdropFilter: `blur(${8 + headerOpacity * 12}px)`,
              transition: "all 0.4s ease",
            }}
          >
            <Logo size="sm" />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Btn variant="ghost" onClick={onLogin}>ログイン</Btn>
              <Btn variant="primary" onClick={onSignup} style={{ padding: "10px 28px", fontSize: 13 }}>無料で始める</Btn>
            </div>
          </div>
        </header>

        <section style={{ ...sectionPad, paddingTop: 120, paddingBottom: 24 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: 900, margin: "0 auto", animation: "heroReveal 1.2s cubic-bezier(.16,1,.3,1) forwards" }}>
              <p
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: P.gold,
                  border: `1px solid ${P.borderLight}`,
                  borderRadius: 100,
                  padding: "6px 20px",
                  marginBottom: 28,
                  background: P.cream,
                }}
              >
                AI-Powered Apparel Operation OS
              </p>
              <h1
                style={{
                  fontFamily: DISPLAY,
                  fontSize: "clamp(40px, 7vw, 80px)",
                  lineHeight: 1.08,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  marginBottom: 24,
                  color: P.text,
                }}
              >
                アパレルECの常識を、
                <br />
                <span
                  style={{
                    background: `linear-gradient(90deg, ${P.gold}, ${P.text}, ${P.gold})`,
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    animation: "shimmer 4s ease-in-out infinite",
                  }}
                >
                  AIで再定義する。
                </span>
              </h1>
              <p
                style={{
                  fontSize: "clamp(15px, 1.8vw, 18px)",
                  color: P.textMid,
                  lineHeight: 1.85,
                  maxWidth: 640,
                  margin: "0 auto 36px",
                  fontWeight: 300,
                }}
              >
                新作ブランドから、古着・リユース事業者まで。
                <br />
                1枚の商品写真を、売れるビジュアルへ。
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Btn variant="primary" onClick={onSignup} style={{ padding: "15px 40px", fontSize: 15 }}>無料で試す</Btn>
                <Btn variant="secondary" onClick={onLogin}>サービスを詳しく見る</Btn>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                maxWidth: 760,
                margin: "56px auto 0",
                animation: "fadeInUp 1s cubic-bezier(.16,1,.3,1) 0.3s both",
              }}
            >
              {[
                { value: "90", suffix: "%", label: "制作時間を短縮" },
                { value: "85", suffix: "%", label: "撮影コスト削減" },
                { value: "∞", suffix: "", label: "バリエーション生成" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  style={{
                    textAlign: "center",
                    padding: "28px 16px",
                    borderRadius: 16,
                    border: `1px solid ${P.border}`,
                    background: P.cream,
                  }}
                >
                  <p
                    style={{
                      fontFamily: NUM,
                      fontSize: kpi.value === "∞" ? 52 : 48,
                      lineHeight: 1,
                      fontWeight: 800,
                      color: P.text,
                      marginBottom: 8,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {kpi.value === "∞" ? "∞" : <AnimatedNumber value={kpi.value} suffix={kpi.suffix} />}
                  </p>
                  <p style={{ fontSize: 12, color: P.textSub, letterSpacing: "0.04em" }}>{kpi.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div style={{ marginTop: 56 }}>
          <Marquee />
        </div>

        <section style={sectionPad}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 48, alignItems: "center", padding: "0 0 80px" }}>
                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: P.gold, marginBottom: 16 }}>About TORSO.AI</p>
                  <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(26px, 3.5vw, 38px)", fontWeight: 700, lineHeight: 1.35, marginBottom: 20, color: P.text }}>
                    アパレルECの非効率を
                    <br />AIで根本から変える。
                  </h2>
                  <p style={{ fontSize: 15, color: P.textMid, lineHeight: 1.9, fontWeight: 300 }}>
                    商品開発・EC運営・撮影 / 販促の知見を、制作現場で使えるオペレーションとして実装。
                    TORSO.AIは単発生成ではなく、運用を回すための基盤です。
                  </p>
                </div>
                <div
                  style={{
                    background: `linear-gradient(145deg, ${P.warm}, ${P.cream})`,
                    borderRadius: 24,
                    border: `1px solid ${P.border}`,
                    padding: 40,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${P.goldLight}22, transparent)` }} />
                  <p style={{ fontFamily: DISPLAY, fontSize: 64, fontWeight: 800, color: P.gold, opacity: 0.18, position: "absolute", top: 12, right: 24 }}>AI</p>
                  <div style={{ position: "relative" }}>
                    <p style={{ fontSize: 13, color: P.textSub, marginBottom: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>Our Mission</p>
                    <p style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: P.text, lineHeight: 1.5 }}>
                      ファッションの価値は、
                      <br />クリエイティブに宿る。
                      <br />オペレーションはAIに。
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section style={{ ...sectionPad, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: P.gold, marginBottom: 8 }}>Problems</p>
              <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700, marginBottom: 36, color: P.text }}>
                こんな課題、抱えていませんか？
              </h2>
            </Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {[
                { id: "01", title: "膨大な撮影コスト", body: "モデル・スタジオ・撮影人件費が積み重なり、1商品あたりの制作単価が上がる。", icon: "01" },
                { id: "02", title: "時間のかかる制作", body: "撮影調整から編集、公開まで数週間。販売スピードが落ちていく。", icon: "02" },
                { id: "03", title: "バリエーションの限界", body: "カラー・サイズ別で全パターン撮影するのは現実的に難しい。", icon: "03" },
                { id: "04", title: "人材不足・属人化", body: "制作業務が特定の担当者に依存し、運営のボトルネックに。", icon: "04" },
              ].map((item, i) => (
                <Reveal key={item.id} delay={i * 0.1}>
                  <div
                    style={{
                      border: `1px solid ${P.border}`,
                      borderRadius: 20,
                      padding: "28px 24px",
                      background: P.cream,
                      height: "100%",
                      transition: "transform 0.3s ease, box-shadow 0.3s ease",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 12px 40px rgba(26,24,20,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <span style={{ fontFamily: DISPLAY, fontSize: 22, display: "block", marginBottom: 12, color: P.gold }}>{item.icon}</span>
                    <p style={{ fontSize: 10, color: P.textSub, marginBottom: 8, letterSpacing: "0.1em" }}>PROBLEM {item.id}</p>
                    <p style={{ fontSize: 18, fontWeight: 700, color: P.text, marginBottom: 10, fontFamily: BODY }}>{item.title}</p>
                    <p style={{ fontSize: 14, color: P.textMid, lineHeight: 1.75, fontWeight: 300 }}>{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...sectionPad, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <div
                style={{
                  borderRadius: 28,
                  background: `linear-gradient(160deg, ${P.text} 0%, #2a261e 50%, #3a342a 100%)`,
                  padding: "clamp(32px, 5vw, 64px)",
                  color: P.cream,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", border: "1px solid rgba(184,155,106,0.15)" }} />
                <div style={{ position: "absolute", bottom: -60, left: -60, width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(184,155,106,0.1)" }} />

                <div style={{ position: "relative", zIndex: 1 }}>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: P.goldLight, marginBottom: 16 }}>Our Flagship Product</p>
                  <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 800, marginBottom: 20, letterSpacing: "-0.02em" }}>
                    TORSO Studio
                  </h2>
                  <p style={{ fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.85, color: "rgba(255,255,253,0.75)", maxWidth: 640, marginBottom: 40, fontWeight: 300 }}>
                    AIがあなたの服をモデルに着せる。1枚の服写真から、シルエットや素材感を反映した着用画像を生成。
                    撮影不要・モデル不要・スタジオ不要。
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
                    {[
                      { label: "ワンストップフロー", desc: "アップロード → 自動生成 → 失敗再試行 → 完了ZIP納品。手作業を最小化。" },
                      { label: "コスト比較例", desc: "年間300SKU × 5カット。従来: 1,500万〜3,000万円 → TORSO.AI: 約150万〜300万円" },
                      { label: "即時ダウンロード", desc: "生成結果はその場でダウンロード可能。撮影の待ち時間をゼロに。" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: 20,
                          borderRadius: 16,
                          border: "1px solid rgba(184,155,106,0.2)",
                          background: "rgba(255,255,253,0.04)",
                        }}
                      >
                        <p style={{ fontSize: 12, color: P.goldLight, marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em" }}>{item.label}</p>
                        <p style={{ fontSize: 13, color: "rgba(255,255,253,0.65)", lineHeight: 1.7, fontWeight: 300 }}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section style={{ ...sectionPad, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: P.gold, marginBottom: 8 }}>Why TORSO.AI</p>
              <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700, marginBottom: 40, color: P.text }}>
                選ばれる3つの理由
              </h2>
            </Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
              {[
                { num: "01", title: "時間効率", lead: "制作時間 90% 短縮", body: "従来2〜3週間かかる工程を、最短数秒で生成。市場投入までの速度を引き上げます。" },
                { num: "02", title: "コスト効率", lead: "撮影コスト 85% 削減", body: "モデル費・スタジオ費・撮影費を大幅に圧縮し、商品単価を最適化します。" },
                { num: "03", title: "柔軟性", lead: "無制限バリエーション", body: "背景・ポーズ・雰囲気を何度でも再生成。季節やキャンペーンに即応できます。" },
              ].map((item, i) => (
                <Reveal key={item.num} delay={i * 0.12}>
                  <div
                    style={{
                      border: `1px solid ${P.border}`,
                      borderRadius: 20,
                      padding: "32px 24px",
                      background: P.cream,
                      height: "100%",
                      position: "relative",
                      overflow: "hidden",
                      transition: "transform 0.3s ease, box-shadow 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 16px 48px rgba(26,24,20,0.07)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <p style={{ fontFamily: NUM, fontSize: 72, fontWeight: 800, color: P.gold, opacity: 0.08, position: "absolute", top: -8, right: 12, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {item.num}
                    </p>
                    <p style={{ fontSize: 11, color: P.textSub, marginBottom: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>{item.title}</p>
                    <p style={{ fontFamily: DISPLAY, fontSize: "clamp(20px, 2.2vw, 26px)", fontWeight: 800, color: P.text, marginBottom: 12, lineHeight: 1.3 }}>
                      {item.lead}
                    </p>
                    <p style={{ fontSize: 14, color: P.textMid, lineHeight: 1.8, fontWeight: 300 }}>{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...sectionPad, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <div style={{ textAlign: "center", marginBottom: 40 }}>
                <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: P.gold, marginBottom: 8 }}>How It Works</p>
                <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 700, color: P.text }}>
                  たった3ステップで完了
                </h2>
              </div>
            </Reveal>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, maxWidth: 900, margin: "0 auto" }}>
              {[
                { step: "01", label: "商品画像をアップロード", sub: "1枚の服写真でOK" },
                { step: "02", label: "モデルとシーンを選択", sub: "背景・ポーズをカスタマイズ" },
                { step: "03", label: "AI生成完了", sub: "即ダウンロード可能" },
              ].map((item, i) => (
                <Reveal key={item.step} delay={i * 0.15}>
                  <div style={{ textAlign: "center", padding: "0 16px" }}>
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: "50%",
                        background: P.cream,
                        border: `2px solid ${P.gold}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 20px",
                        boxShadow: `0 4px 20px ${P.gold}22`,
                      }}
                    >
                      <span style={{ fontFamily: NUM, fontSize: 28, fontWeight: 800, color: P.gold, fontVariantNumeric: "tabular-nums" }}>{item.step}</span>
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: P.text, marginBottom: 6, fontFamily: BODY }}>{item.label}</p>
                    <p style={{ fontSize: 13, color: P.textSub, fontWeight: 300 }}>{item.sub}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...sectionPad, paddingBottom: 80 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Reveal>
              <div
                style={{
                  borderRadius: 28,
                  border: `1px solid ${P.border}`,
                  background: `linear-gradient(160deg, ${P.cream}, ${P.warm})`,
                  padding: "clamp(40px, 6vw, 72px) clamp(24px, 4vw, 48px)",
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(600px circle at 50% 0%, ${P.goldLight}15, transparent)` }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: P.gold, marginBottom: 16 }}>Get Started</p>
                  <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 800, marginBottom: 16, color: P.text, lineHeight: 1.25 }}>
                    今すぐ、次世代の
                    <br />商品画像制作を体験しませんか？
                  </h2>
                  <p style={{ fontSize: 15, color: P.textMid, lineHeight: 1.8, maxWidth: 520, margin: "0 auto 32px", fontWeight: 300 }}>
                    無料プランからお試しいただけます。
                    クレジットカード不要、即日利用開始。
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <Btn variant="primary" onClick={onSignup} style={{ padding: "16px 48px", fontSize: 16 }}>無料で始める</Btn>
                    <Btn variant="secondary" onClick={onLogin}>ログイン</Btn>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <footer style={{ ...sectionPad, paddingBottom: 40 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", borderTop: `1px solid ${P.border}`, paddingTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <Logo size="sm" />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { href: "/company", label: "会社概要" },
                  { href: "/terms", label: "利用規約" },
                  { href: "/privacy", label: "プライバシーポリシー" },
                  { href: "/commerce", label: "特定商取引法に基づく表記" },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    style={{ fontSize: 12, color: P.textSub, textDecoration: "none" }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <p style={{ fontSize: 12, color: P.textSub }}>© {new Date().getFullYear()} TORSO.AI</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
