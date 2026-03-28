"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

/* Renders a period in Montserrat while surrounding text stays in Typo Round */
function MP({ orange }: { orange?: boolean }) {
  return (
    <span
      style={{
        fontFamily: "Montserrat, sans-serif",
        ...(orange ? { color: "#FF7F00" } : {}),
      }}
    >
      .
    </span>
  );
}

/* Strikethrough line drawn left→right */
function Strikethrough({ delay, color }: { delay: number; color: string }) {
  return (
    <motion.span
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ delay, duration: 0.48, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "52%",
        height: "1.5px",
        background: color,
        transformOrigin: "left center",
        display: "block",
        borderRadius: "1px",
      }}
    />
  );
}

/* ── Animation timing ──────────────────────────────────────────
 * Sequence:
 *   L1 words → L2 line → subtitle → proof pts → strikethroughs
 *   → closer → 48 dishes → AED 17 → CTAs
 * ─────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

const W_GAP   = 0.09;   // gap between headline words
const L1_S    = 0.10;   // first word appears at 0.10s
// last l1 word at 0.10 + 3×0.09 = 0.37s
const L2_D    = 0.50;   // second headline line (all at once)
const SUB_D   = 0.90;   // subtitle
const PP1_D   = 1.32;   // proof point 1
const PP_GAP  = 0.15;   // gap between proof points (pp2=1.47, pp3=1.62)
const STR1_D  = 2.05;   // strikethrough 1 (after pp3 settles)
const STR_GAP = 0.15;   // gap between strikethroughs (str2=2.20, str3=2.35)
const CLOSE_D = 2.65;   // closer line
const DISH_D  = 2.82;   // 48 dishes stat
const PRICE_D = 3.18;   // AED 17 stat
const CTA_D   = 3.50;   // CTA buttons

export default function HeroReveal() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const bg          = isLight ? "#EEE9DA" : "#1E3A4F";
  const textColor   = isLight ? "#1E3A4F" : "#EEE9DA";
  const subtextColor = isLight
    ? "rgba(30,58,79,0.65)"
    : "rgba(238,233,218,0.6)";

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    return () => {
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    };
  }, []);

  const l1Words = ["You", "didn't", "leave", "home"];

  const proofPoints = [
    "No apps to scroll",
    "No groceries to buy",
    "No recipes to follow",
  ];

  return (
    <section
      id="hero"
      style={{
        background: bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "clamp(100px, 14vh, 160px) clamp(24px, 6vw, 80px) clamp(42px, 8vh, 110px)",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "clamp(26px, 4.2vh, 42px)",
        }}
      >
        {/* ── Headline ─────────────────────────────────────── */}
        <h1
          style={{
            fontFamily: "'Typo Round Bold Demo', 'Typo Round', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(34px, 7.5vw, 72px)",
            lineHeight: 1.12,
            color: textColor,
            margin: 0,
            letterSpacing: "-0.015em",
          }}
        >
          {/* Line 1: word-by-word */}
          <span style={{ display: "block" }}>
            {l1Words.map((w, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20, scale: 0.90 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.42,
                  delay: L1_S + i * W_GAP,
                  ease: E,
                }}
                style={{
                  display: "inline-block",
                  marginRight: "0.26em",
                }}
              >
                {w}
              </motion.span>
            ))}
          </span>

          {/* Line 2: whole line at once — orange */}
          <motion.span
            initial={{ opacity: 0, y: 20, scale: 0.90 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.44, delay: L2_D, ease: E }}
            style={{ display: "block", color: "#FF7F00" }}
          >
            to stress about dinner<MP orange />
          </motion.span>
        </h1>

        {/* ── Subtitle ─────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: SUB_D, ease: E }}
          style={{
            fontFamily: "Poppins, Montserrat, sans-serif",
            fontWeight: 300,
            fontSize: "clamp(14px, 2.2vw, 21px)",
            lineHeight: 1.55,
            color: subtextColor,
            margin: 0,
            maxWidth: "540px",
            letterSpacing: "0.2px",
          }}
        >
          Delivered warm to your dorm — a new dish, every night.
        </motion.p>

        {/* ── Proof Points with animated strikethrough ─────── */}
        <div
          className="flex flex-col md:flex-row"
          style={{
            alignItems: "center",
            gap: "clamp(8px, 1.2vh, 14px)",
          }}
        >
          {proofPoints.map((item, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.38,
                  delay: PP1_D + i * PP_GAP,
                  ease: E,
                }}
                style={{
                  position: "relative",
                  display: "inline-block",
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.6vw, 16px)",
                  color: subtextColor,
                }}
              >
                {item}
                <Strikethrough
                  delay={STR1_D + i * STR_GAP}
                  color={textColor}
                />
              </motion.span>

              {/* Desktop dot separator */}
              {i < proofPoints.length - 1 && (
                <span
                  className="hidden md:inline"
                  style={{
                    color: isLight
                      ? "rgba(30,58,79,0.18)"
                      : "rgba(238,233,218,0.18)",
                    margin: "0 6px",
                    fontSize: "18px",
                    lineHeight: 1,
                  }}
                >
                  ·
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Closer ───────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: CLOSE_D, ease: E }}
          style={{
            fontFamily: "'Typo Round Bold Demo', 'Typo Round', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(20px, 4vw, 36px)",
            lineHeight: 1.25,
            color: textColor,
            margin: 0,
          }}
        >
          A warm meal<MP />{" "}
          <span style={{ color: "#FF7F00" }}>
            Waiting for you<MP orange />
          </span>
        </motion.p>

        {/* ── Stats ────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(20px, 4vw, 42px)",
          }}
        >
          {/* 48 dishes across menu */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: DISH_D, ease: E }}
            style={{ textAlign: "center" }}
          >
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(30px, 5vw, 50px)",
                color: "#FF7F00",
                lineHeight: 1,
                display: "block",
              }}
            >
              48
            </span>
            <span
              style={{
                fontFamily: "Poppins, Montserrat, sans-serif",
                fontWeight: 400,
                fontSize: "clamp(10px, 1.2vw, 14px)",
                color: subtextColor,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              dishes across menu
            </span>
          </motion.div>

          {/* Divider */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: DISH_D }}
            style={{
              width: "1px",
              height: "clamp(32px, 4.5vh, 50px)",
              background: isLight
                ? "rgba(30,58,79,0.12)"
                : "rgba(238,233,218,0.12)",
            }}
          />

          {/* AED 17/meal */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: PRICE_D, ease: E }}
            style={{ textAlign: "center" }}
          >
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 600,
                fontSize: "clamp(9px, 1.1vw, 12px)",
                color: subtextColor,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                display: "block",
                marginBottom: "4px",
              }}
            >
              starting from
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(11px, 1.4vw, 15px)",
                  color: "#FF7F00",
                  lineHeight: 1,
                }}
              >
                AED
              </span>
              <span
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(30px, 5vw, 50px)",
                  color: "#FF7F00",
                  lineHeight: 1,
                }}
              >
                17
              </span>
              <span
                style={{
                  fontFamily: "Poppins, Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(10px, 1.2vw, 14px)",
                  color: subtextColor,
                }}
              >
                /meal
              </span>
            </div>
          </motion.div>
        </div>

        {/* ── CTAs ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: CTA_D, ease: E }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(12px, 2vw, 20px)",
            flexWrap: "wrap",
            marginTop: "clamp(6px, 1vh, 16px)",
          }}
        >
          <button
            onClick={() => window.open("https://vip.dormers.ae/", "_blank")}
            className="hero-cta-primary"
            style={{
              background: "#FF7F00",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              padding: "clamp(13px, 1.6vh, 18px) clamp(30px, 4vw, 50px)",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              fontSize: "clamp(13px, 1.5vw, 16px)",
              letterSpacing: "0.3px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 20px rgba(255,127,0,0.3)",
            }}
          >
            Subscribe
          </button>
          <button
            onClick={() => window.open("https://vip.dormers.ae/", "_blank")}
            className="hero-cta-secondary"
            style={{
              background: "transparent",
              color: textColor,
              border: `1.5px solid ${
                isLight ? "rgba(30,58,79,0.3)" : "rgba(238,233,218,0.3)"
              }`,
              borderRadius: "12px",
              padding: "clamp(13px, 1.6vh, 18px) clamp(30px, 4vw, 50px)",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              fontSize: "clamp(13px, 1.5vw, 16px)",
              letterSpacing: "0.3px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Try a meal
          </button>
        </motion.div>
      </div>
    </section>
  );
}