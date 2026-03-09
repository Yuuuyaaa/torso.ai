import { C, SANS } from "../theme";

export function Tag({ children, color = C.textSub, bg = C.borderLight }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "2px 8px",
        background: bg,
        color,
        borderRadius: 1,
        fontFamily: SANS,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

export function Btn({ children, variant = "primary", onClick, disabled, full, size = "md" }) {
  const styles = {
    primary: {
      bg: "linear-gradient(135deg, #f3e1be 0%, #e4c488 56%, #cfa567 100%)",
      color: "#3b3328",
      border: "#d8b87a",
      shadow: "0 2px 10px rgba(191,165,122,0.28)",
    },
    secondary: { bg: "transparent", color: C.text, border: C.text },
    ghost: { bg: "transparent", color: C.textMid, border: C.border },
    gold: { bg: C.gold, color: "#fff", border: C.gold },
  };
  const s = styles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={variant === "primary" ? "btn-primary-glow" : undefined}
      style={{
        width: full ? "100%" : "auto",
        padding: size === "lg" ? "16px 32px" : size === "sm" ? "8px 16px" : "12px 24px",
        background: disabled ? C.border : s.bg,
        color: disabled ? C.textSub : s.color,
        border: `1px solid ${disabled ? C.border : s.border}`,
        borderRadius: 1,
        fontSize: size === "sm" ? 11 : 12,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: SANS,
        fontWeight: 500,
        transition: "all 0.15s",
        boxShadow: !disabled && variant === "primary" ? styles.primary.shadow : "none",
      }}
    >
      {children}
    </button>
  );
}

export function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {label && (
        <span style={{ fontSize: 11, color: C.textSub, letterSpacing: "0.08em" }}>{label}</span>
      )}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}
