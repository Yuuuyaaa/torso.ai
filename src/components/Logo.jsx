import { C, SERIF } from "../theme";

export default function Logo({ size = "md" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <img
        src="/newicon.png?v=1"
        alt="TORSO.AI"
        style={{
          width: size === "lg" ? 38 : size === "sm" ? 20 : 28,
          height: size === "lg" ? 38 : size === "sm" ? 20 : 28,
          objectFit: "contain",
        }}
      />
      <span
        style={{
          fontFamily: SERIF,
          fontSize: size === "lg" ? 32 : size === "sm" ? 16 : 22,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: C.text,
        }}
      >
        TORSO.AI
      </span>
    </div>
  );
}
