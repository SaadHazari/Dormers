"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

/* ─── Strikethrough — reduced opacity so text behind stays legible ─── */
function Strikethrough({ delay, isLight }: { delay: number; isLight: boolean }) {
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
        background: isLight
          ? "rgba(30, 58, 79, 0.38)"
          : "rgba(238, 233, 218, 0.45)",
        transformOrigin: "left center",
        display: "block",
        borderRadius: "1px",
      }}
    />
  );
}

/* ─── Typewriter text renderer ─────────────────────────────────────── */
function renderCloserText(text: string, textColor: string) {
  const PART1 = "A warm meal. "; // first 13 chars → textColor
  return text.split("").map((ch, i) => (
    <span
      key={i}
      style={{
        color: i >= PART1.length ? "#FF7F00" : textColor,
        fontFamily: ch === "." ? "Montserrat, sans-serif" : undefined,
      }}
    >
      {ch}
    </span>
  ));
}

/* ─── Animation timing ──────────────────────────────────────────────
 *
 * Sequence (all times in seconds):
 *   L1 word-by-word → L2 word-by-word → dinner underline
 *   → subtitle → proof points → strikethroughs
 *   → typewriter closer → CTAs → AED 17 → 48 dishes
 *
 * ─────────────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

const W_GAP    = 0.13;  // L1 word gap
const L1_S     = 0.20;  // "You" at 0.20, "didn't" 0.33, "leave" 0.46, "home" 0.59

const L2_D     = 1.15;  // "to" at 1.15
const L2_W_GAP = 0.20;  // "stress" 1.35, "about" 1.55, "dinner" 1.75
// "dinner" animation ends: 1.75 + 0.44 = 2.19
const UNDER_D  = 2.26;  // dinner underline draws in
// underline ends: 2.26 + 0.50 = 2.76

const SUB_D    = 3.15;  // subtitle

const PP1_D    = 3.95;  // proof point 1
const PP_GAP   = 0.24;  // pp2 = 4.19, pp3 = 4.43

const STR1_D   = 5.20;  // strikethrough 1 (after pp3 settles)
const STR_GAP  = 0.24;  // str2 = 5.44, str3 = 5.68

const CLOSE_D  = 6.55;  // typewriter starts here (cursor blinks 500ms then types)
// ~30 chars × 42ms = 1.26s  → typing done ≈ 8.31s

const CTA_D    = 8.60;  // CTAs
const PRICE_D  = 9.40;  // AED 17/meal (shown first)
const DISH_D   = 9.95;  // 48 dishes across menu

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

  /* ── Typewriter state ── */
  type CloserPhase = "idle" | "cursor" | "typing" | "done";
  const [closerPhase, setCloserPhase] = useState<CloserPhase>("idle");
  const [closerText, setCloserText] = useState("");
  const CLOSER_FULL = "A warm meal. Waiting for you.";

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    const t1 = setTimeout(() => {
      setCloserPhase("cursor");
      const t2 = setTimeout(() => {
        setCloserPhase("typing");
        let idx = 0;
        const iv = setInterval(() => {
          idx++;
          setCloserText(CLOSER_FULL.slice(0, idx));
          if (idx >= CLOSER_FULL.length) {
            clearInterval(iv);
            setCloserPhase("done");
          }
        }, 42);
        intervals.push(iv);
      }, 500);
      timers.push(t2);
    }, CLOSE_D * 1000);
    timers.push(t1);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      intervals.forEach((iv) => clearInterval(iv));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── L1 words — uniform Montserrat 700, except "home" → Typo Round ── */
  const l1Words = [
    { text: "You",    typoRound: false },
    { text: "didn't", typoRound: false },
    { text: "leave",  typoRound: false },
    { text: "home",   typoRound: true  },
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
        position: "relative",
        background: bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "clamp(100px, 14vh, 160px) clamp(24px, 6vw, 80px) clamp(42px, 8vh, 110px)",
        overflow: "hidden",
      }}
    >

      {/* ── Animated gradient background blobs ────────────────── */}
      <style>{`
        @keyframes blob1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(40px,-50px) scale(1.08); }
          66%      { transform: translate(-30px,25px) scale(0.93); }
        }
        @keyframes blob2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-30px,40px) scale(0.96); }
          66%      { transform: translate(50px,-25px) scale(1.06); }
        }
        @keyframes blob3 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(25px,30px) scale(1.10); }
          66%      { transform: translate(-40px,-35px) scale(0.90); }
        }
      `}</style>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {/* Orange blob — top-left */}
        <div
          style={{
            position: "absolute",
            top: "8%", left: "3%",
            width: 520, height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,127,0,0.11) 0%, transparent 68%)",
            filter: "blur(60px)",
            animation: "blob1 20s ease-in-out infinite",
          }}
        />
        {/* Accent blob — bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: "10%", right: "8%",
            width: 460, height: 460,
            borderRadius: "50%",
            background: isLight
              ? "radial-gradient(circle, rgba(30,58,79,0.09) 0%, transparent 68%)"
              : "radial-gradient(circle, rgba(255,127,0,0.07) 0%, transparent 68%)",
            filter: "blur(65px)",
            animation: "blob2 25s ease-in-out infinite",
          }}
        />
        {/* Small orange blob — mid-right */}
        <div
          style={{
            position: "absolute",
            top: "42%", right: "22%",
            width: 360, height: 360,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,127,0,0.07) 0%, transparent 68%)",
            filter: "blur(55px)",
            animation: "blob3 30s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          maxWidth: "780px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "clamp(26px, 4.2vh, 44px)",
        }}
      >

        {/* ── Headline ──────────────────────────────────────── */}
        <h1
          style={{
            fontSize: "clamp(34px, 7.5vw, 72px)",
            lineHeight: 1.12,
            color: textColor,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {/* Line 1: uniform weight, "home" in Typo Round */}
          <span style={{ display: "block" }}>
            {l1Words.map((w, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.44, delay: L1_S + i * W_GAP, ease: E }}
                style={{
                  display: "inline-block",
                  marginRight: "0.24em",
                  fontFamily: w.typoRound
                    ? "'Typo Round Bold Demo', 'Typo Round', sans-serif"
                    : "Montserrat, sans-serif",
                  fontWeight: 700,
                  fontStyle: "normal",
                }}
              >
                {w.text}
              </motion.span>
            ))}
          </span>

          {/* Line 2: word-by-word, each with distinct Montserrat styling */}
          <span style={{ display: "block" }}>
            {/* "to" — quiet connector */}
            <motion.span
              initial={{ opacity: 0, y: 22, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.44, delay: L2_D, ease: E }}
              style={{
                display: "inline-block",
                marginRight: "0.24em",
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 300,
                fontStyle: "italic",
                color: subtextColor,
              }}
            >
              to
            </motion.span>

            {/* "stress" */}
            <motion.span
              initial={{ opacity: 0, y: 22, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.44, delay: L2_D + L2_W_GAP, ease: E }}
              style={{
                display: "inline-block",
                marginRight: "0.24em",
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 800,
                fontStyle: "italic",
                color: "#FF7F00",
              }}
            >
              stress
            </motion.span>

            {/* "about" */}
            <motion.span
              initial={{ opacity: 0, y: 22, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.44, delay: L2_D + 2 * L2_W_GAP, ease: E }}
              style={{
                display: "inline-block",
                marginRight: "0.24em",
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 800,
                fontStyle: "italic",
                color: "#FF7F00",
              }}
            >
              about
            </motion.span>

            {/* "dinner" — underline draws in after word lands */}
            <motion.span
              initial={{ opacity: 0, y: 22, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.44, delay: L2_D + 3 * L2_W_GAP, ease: E }}
              style={{ display: "inline-block" }}
            >
              <span style={{ position: "relative", display: "inline-block" }}>
                <span
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 900,
                    fontStyle: "normal",
                    color: "#FF7F00",
                  }}
                >
                  dinner
                </span>
                {/* Animated underline */}
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: UNDER_D, duration: 0.50, ease: E }}
                  style={{
                    position: "absolute",
                    bottom: -3,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "#FF7F00",
                    transformOrigin: "left center",
                    display: "block",
                    borderRadius: "1px",
                  }}
                />
              </span>
              {/* Montserrat period */}
              <span
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 900,
                  color: "#FF7F00",
                }}
              >
                .
              </span>
            </motion.span>
          </span>
        </h1>

        {/* ── Subtitle ──────────────────────────────────────── */}
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

        {/* ── Proof Points — full textColor, reduced-opacity strike ── */}
        <div
          className="flex flex-col md:flex-row"
          style={{ alignItems: "center", gap: "clamp(8px, 1.2vh, 14px)" }}
        >
          {proofPoints.map((item, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.40, delay: PP1_D + i * PP_GAP, ease: E }}
                style={{
                  position: "relative",
                  display: "inline-block",
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 500,
                  fontSize: "clamp(13px, 1.6vw, 16px)",
                  color: textColor,
                }}
              >
                {item}
                <Strikethrough
                  delay={STR1_D + i * STR_GAP}
                  isLight={isLight}
                />
              </motion.span>

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

        {/* ── Typewriter closer ─────────────────────────────── */}
        <div
          style={{
            fontFamily: "'Typo Round Bold Demo', 'Typo Round', sans-serif",
            fontWeight: 700,
            fontSize: "clamp(20px, 4vw, 36px)",
            lineHeight: 1.25,
            color: textColor,
            minHeight: "1.25em", // reserve space so layout doesn't jump
          }}
        >
          {closerPhase !== "idle" && renderCloserText(closerText, textColor)}

          {/* Blinking cursor — shown during cursor + typing phases */}
          {(closerPhase === "cursor" || closerPhase === "typing") && (
            <motion.span
              animate={
                closerPhase === "cursor"
                  ? { opacity: [1, 0] }
                  : { opacity: 1 }
              }
              transition={{
                duration: 0.45,
                repeat: closerPhase === "cursor" ? Infinity : 0,
                repeatType: "reverse",
              }}
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 300,
                color: textColor,
              }}
            >
              |
            </motion.span>
          )}

          {/* Cursor fade-out after typing completes */}
          {closerPhase === "done" && (
            <motion.span
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 300,
                color: textColor,
              }}
            >
              |
            </motion.span>
          )}
        </div>

        {/* ── CTAs ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, ease: E, delay: CTA_D }}
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

        {/* ── Stats — AED 17 first, then 48 dishes ──────────── */}
        {/* Spread full-width on desktop, stacked on mobile     */}
        <div
          className="w-full flex flex-col sm:flex-row sm:justify-between items-center"
          style={{
            gap: "clamp(20px, 3vh, 32px)",
            paddingTop: "clamp(4px, 1vh, 12px)",
            borderTop: `1px solid ${dividerColor}`,
          }}
        >
          {/* AED 17/meal — shown first */}
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

          {/* Vertical divider — desktop only */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: PRICE_D }}
            className="hidden sm:block"
            style={{
              width: "1px",
              height: "clamp(32px, 4.5vh, 50px)",
              background: dividerColor,
              flexShrink: 0,
            }}
          />

          {/* 48 dishes across menu — shown second */}
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
        </div>

      </div>
    </section>
  );
}
