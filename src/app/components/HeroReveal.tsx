"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

/* Strikethrough line drawn left→right */
function Strikethrough({ delay, color }: { delay: number; color: string }) {
  return (
    <motion.span
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ delay, duration: 0.52, ease: [0.25, 0.46, 0.45, 0.94] }}
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
 *
 * Each major section breathes before the next begins.
 * The sequence is intentionally unhurried — each element
 * earns its place before the next arrives.
 *
 * L1 words → L2 line → subtitle → proof points
 * → strikethroughs → closer → CTAs → 48 dishes → AED 17
 *
 * ─────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

const W_GAP   = 0.15;   // gap between headline words
const L1_S    = 0.20;   // "You" appears at 0.20s
// Words land at: 0.20  0.35  0.50  0.65
// Last word fully settled (~0.65 + 0.42 dur) ≈ 1.07s

const L2_D    = 1.15;   // "to stress about dinner." — after headline settles
const SUB_D   = 1.90;   // subtitle — after L2 settles
const PP1_D   = 2.65;   // first proof point
const PP_GAP  = 0.24;   // pp2 = 2.89, pp3 = 3.13
const STR1_D  = 3.80;   // strikes — after all 3 proof points settle
const STR_GAP = 0.24;   // str2 = 4.04, str3 = 4.28
const CLOSE_D = 4.95;   // closer — after strikes finish
const CTA_D   = 5.55;   // CTAs — main action, after closer settles
const DISH_D  = 6.30;   // 48 dishes (below CTAs)
const PRICE_D = 6.85;   // AED 17/meal

export default function HeroReveal() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const bg           = isLight ? "#EEE9DA" : "#1E3A4F";
  const textColor    = isLight ? "#1E3A4F" : "#EEE9DA";
  const subtextColor = isLight
    ? "rgba(30,58,79,0.65)"
    : "rgba(238,233,218,0.6)";
  const dividerColor = isLight
    ? "rgba(30,58,79,0.12)"
    : "rgba(238,233,218,0.12)";

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    return () => {
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    };
  }, []);

  /*
   * Each word carries its own Montserrat weight + style.
   * Variation creates rhythm — soft open, strong negation,
   * neutral centre, grounding close.
   */
  const l1Words: {
    text: string;
    weight: number;
    italic?: boolean;
  }[] = [
    { text: "You",    weight: 400, italic: true  },
    { text: "didn't", weight: 800                },
    { text: "leave",  weight: 500                },
    { text: "home",   weight: 700                },
  ];

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
          maxWidth: "780px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "clamp(26px, 4.2vh, 44px)",
        }}
      >

        {/* ── Headline ─────────────────────────────────────── */}
        <h1
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "clamp(34px, 7.5vw, 72px)",
            lineHeight: 1.12,
            color: textColor,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {/* Line 1: word-by-word, each with distinct weight */}
          <span style={{ display: "block" }}>
            {l1Words.map((w, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.44,
                  delay: L1_S + i * W_GAP,
                  ease: E,
                }}
                style={{
                  display: "inline-block",
                  marginRight: "0.24em",
                  fontWeight: w.weight,
                  fontStyle: w.italic ? "italic" : "normal",
                }}
              >
                {w.text}
              </motion.span>
            ))}
          </span>

          {/* Line 2: whole line at once — mixed styling */}
          <motion.span
            initial={{ opacity: 0, y: 22, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.46, delay: L2_D, ease: E }}
            style={{ display: "block" }}
          >
            {/* "to" — quiet connector */}
            <span
              style={{
                fontWeight: 300,
                fontStyle: "italic",
                color: subtextColor,
                marginRight: "0.24em",
              }}
            >
              to
            </span>
            {/* "stress about" — the loaded phrase */}
            <span
              style={{
                fontWeight: 800,
                fontStyle: "italic",
                color: "#FF7F00",
                marginRight: "0.24em",
              }}
            >
              stress about
            </span>
            {/* "dinner" — the landing word, underlined */}
            <span
              style={{
                fontWeight: 900,
                color: "#FF7F00",
                textDecoration: "underline",
                textDecorationColor: "#FF7F00",
                textUnderlineOffset: "5px",
                textDecorationThickness: "2px",
              }}
            >
              dinner
            </span>
            {/* Montserrat period (same font — stays consistent) */}
            <span style={{ fontWeight: 900, color: "#FF7F00" }}>.</span>
          </motion.span>
        </h1>

        {/* ── Subtitle ─────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: SUB_D, ease: E }}
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
                  duration: 0.40,
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
          transition={{ duration: 0.48, delay: CLOSE_D, ease: E }}
          style={{
            fontFamily: "'Typo Round Bold Demo', 'Typo Round', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(20px, 4vw, 36px)",
            lineHeight: 1.25,
            color: textColor,
            margin: 0,
          }}
        >
          A warm meal<span style={{ fontFamily: "Montserrat, sans-serif" }}>.</span>{" "}
          <span style={{ color: "#FF7F00" }}>
            Waiting for you<span style={{ fontFamily: "Montserrat, sans-serif", color: "#FF7F00" }}>.</span>
          </span>
        </motion.p>

        {/* ── CTAs ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: CTA_D, ease: E }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(12px, 2vw, 20px)",
            flexWrap: "wrap",
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

        {/* ── Stats — below CTAs, spread on desktop ────────── */}
        <div
          className="w-full flex flex-col sm:flex-row sm:justify-between items-center"
          style={{
            gap: "clamp(20px, 3vh, 32px)",
            paddingTop: "clamp(4px, 1vh, 12px)",
            borderTop: `1px solid ${dividerColor}`,
          }}
        >
          {/* 48 dishes across menu */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: DISH_D, ease: E }}
            style={{ textAlign: "center" }}
          >
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px, 4.5vw, 48px)",
                color: "#FF7F00",
                lineHeight: 1,
                display: "block",
              }}
            >
              48
            </span>
            <span
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 400,
                fontSize: "clamp(10px, 1.2vw, 13px)",
                color: subtextColor,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
              }}
            >
              dishes across menu
            </span>
          </motion.div>

          {/* Vertical divider — desktop only */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: DISH_D }}
            className="hidden sm:block"
            style={{
              width: "1px",
              height: "clamp(32px, 4.5vh, 50px)",
              background: dividerColor,
              flexShrink: 0,
            }}
          />

          {/* AED 17/meal */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: PRICE_D, ease: E }}
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
                  fontSize: "clamp(28px, 4.5vw, 48px)",
                  color: "#FF7F00",
                  lineHeight: 1,
                }}
              >
                17
              </span>
              <span
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 400,
                  fontSize: "clamp(10px, 1.2vw, 13px)",
                  color: subtextColor,
                }}
              >
                /meal
              </span>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}