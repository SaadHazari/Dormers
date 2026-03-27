"use client";

import { useRef, useEffect, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  MotionValue,
  AnimatePresence,
} from "framer-motion";
import { useTheme } from "next-themes";

// ─── Scroll phase breakpoints (0–1) ──────────────────────────────────────────
const L1_SHRINK_S   = 0.02;
const L1_SHRINK_E   = 0.18;
const L2_FADE_S     = 0.15;
const L2_REVEAL_S   = 0.18;
const L2_REVEAL_E   = 0.36;
const L2_SHRINK_E   = 0.46;
const L3_FADE_S     = 0.42;
const L3_REVEAL_S   = 0.46;
const L3_REVEAL_E   = 0.62;
const L3_SHRINK_E   = 0.72;
const L4_FADE_S     = 0.68;
const L4_START      = 0.72;
const L4_END        = 0.88;
const L4_SHRINK_E   = 0.94;
const XFADE_S       = 0.88;
const XFADE_E       = 0.96;
const UI_SHOW_AT    = 0.88;

// ─── Static content arrays ────────────────────────────────────────────────────
const L1_ROW1 = ["DORMERS'", "IS", "FOR"];
const L1_ROW2 = ["STUDENTS", "ONLY"];
const L2_CHARS = Array.from("NO OVERPRICED TAKEOUTS");
const L3_CHARS = Array.from("NO TIME WASTED COOKING");
const L4_WORDS = ["JUST", "GOOD,", "AFFORDABLE", "FOOD,", "DELIVERED", "TO", "YOUR", "DORM"];

// ─── RevealChar: scroll-linked per-letter opacity+blur ───────────────────────
function RevealChar({
  char,
  scrollY,
  threshold,
  dur,
}: {
  char: string;
  scrollY: MotionValue<number>;
  threshold: number;
  dur: number;
}) {
  const opacity = useTransform(scrollY, [threshold, threshold + dur], [0, 1]);
  const blur    = useTransform(scrollY, [threshold, threshold + dur * 1.5], ["blur(10px)", "blur(0px)"]);
  if (char === " ") return <span style={{ display: "inline-block", width: "0.26em" }} />;
  return (
    <motion.span style={{ opacity, filter: blur, display: "inline-block", willChange: "opacity,filter" }}>
      {char}
    </motion.span>
  );
}

// ─── RibbonWord: scroll-linked word slide-in from right ──────────────────────
function RibbonWord({
  word, scrollY, start, end, style,
}: {
  word: string; scrollY: MotionValue<number>; start: number; end: number; style?: React.CSSProperties;
}) {
  const opacity = useTransform(scrollY, [start, end], [0, 1]);
  const x       = useTransform(scrollY, [start, end], ["90px", "0px"]);
  return (
    <motion.span style={{ opacity, x, display: "inline-block", ...style }}>
      {word}
    </motion.span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HeroReveal() {
  const { theme } = useTheme();
  const isLight   = theme === "light";
  const bg        = isLight ? "#EEE9DA" : "#1E3A4F";
  const textColor = isLight ? "#1E3A4F" : "#EEE9DA";
  const outline   = `${textColor}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // ── L1 time-based word reveal ──────────────────────────────────────────────
  const [l1Shown, setL1Shown] = useState(0);
  useEffect(() => {
    [...L1_ROW1, ...L1_ROW2].forEach((_, i) => {
      setTimeout(() => setL1Shown(i + 1), 350 + i * 300);
    });
  }, []);

  // ── Line 1: scale down as user scrolls ────────────────────────────────────
  const l1Scale = useTransform(scrollYProgress, [L1_SHRINK_S, L1_SHRINK_E], [3.6, 1]);
  const l1Y     = useTransform(scrollYProgress, [L1_SHRINK_S, L1_SHRINK_E], [200, 0]);

  // ── Line 2 container ───────────────────────────────────────────────────────
  const l2Opacity = useTransform(scrollYProgress, [L2_FADE_S, L2_REVEAL_S], [0, 1]);
  const l2Scale   = useTransform(scrollYProgress, [L2_REVEAL_S, L2_SHRINK_E], [3.0, 1]);
  const l2Y       = useTransform(scrollYProgress, [L2_REVEAL_S, L2_SHRINK_E], [160, 0]);

  // ── Line 3 container ───────────────────────────────────────────────────────
  const l3Opacity = useTransform(scrollYProgress, [L3_FADE_S, L3_REVEAL_S], [0, 1]);
  const l3Scale   = useTransform(scrollYProgress, [L3_REVEAL_S, L3_SHRINK_E], [3.0, 1]);
  const l3Y       = useTransform(scrollYProgress, [L3_REVEAL_S, L3_SHRINK_E], [160, 0]);

  // ── Line 4 ribbon container ───────────────────────────────────────────────
  const l4Opacity = useTransform(scrollYProgress, [L4_FADE_S, L4_START], [0, 1]);
  const l4Scale   = useTransform(scrollYProgress, [L4_END, L4_SHRINK_E], [2.4, 1]);
  const l4Y       = useTransform(scrollYProgress, [L4_END, L4_SHRINK_E], [100, 0]);

  // ── Crossfade intro ↔ final ────────────────────────────────────────────────
  const introOpacity = useTransform(scrollYProgress, [XFADE_S, XFADE_E], [1, 0]);
  const finalOpacity = useTransform(scrollYProgress, [XFADE_S, XFADE_E], [0, 1]);

  // ── Dispatch hero-ui-visible/hidden ───────────────────────────────────────
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v >= UI_SHOW_AT) {
      window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    } else {
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    }
  });

  // ── Per-char thresholds ───────────────────────────────────────────────────
  const l2Range = L2_REVEAL_E - L2_REVEAL_S;
  const l2Dur   = (l2Range / L2_CHARS.length) * 0.75;
  const l3Range = L3_REVEAL_E - L3_REVEAL_S;
  const l3Dur   = (l3Range / L3_CHARS.length) * 0.75;

  // ── L4 per-word scroll range ──────────────────────────────────────────────
  const l4Step = (L4_END - L4_START) / L4_WORDS.length;

  // ── Shared text styles ────────────────────────────────────────────────────
  const typoRound: React.CSSProperties = {
    fontFamily: "'Typo Round Bold Demo', sans-serif",
    lineHeight: 1.1,
  };
  const montserratOutline: React.CSSProperties = {
    fontFamily: "Montserrat",
    fontWeight: 900,
    color: "#213c4c",
    textShadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}`,
    lineHeight: 1.1,
  };
  const INTRO_FONT = "clamp(28px, 7.2vw, 58px)";

  return (
    /* ── 480 vh outer: provides the scroll space ───────────────────────────── */
    <div ref={containerRef} style={{ height: "480vh", position: "relative" }}>

      {/* ── 100 vh sticky viewport ────────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: bg,
        }}
      >

        {/* ══════════════ INTRO LAYER ════════════════ */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: "clamp(60px, 10vh, 100px)",
            gap: "clamp(4px, 1vh, 10px)",
            opacity: introOpacity,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >

          {/* ── L1: DORMERS' IS FOR / STUDENTS ONLY ───────────────────────── */}
          <motion.div
            style={{
              scale: l1Scale,
              y: l1Y,
              transformOrigin: "top center",
              textAlign: "center",
              width: "100%",
            }}
          >
            {/* Row 1 */}
            <div style={{ display: "flex", justifyContent: "center", gap: "0.2em", flexWrap: "wrap" }}>
              {L1_ROW1.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
                  animate={
                    l1Shown > i
                      ? { opacity: 1, y: 0, filter: "blur(0px)" }
                      : { opacity: 0, y: 16, filter: "blur(10px)" }
                  }
                  transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{ ...typoRound, fontSize: INTRO_FONT, color: textColor, display: "inline-block" }}
                >
                  {word}
                </motion.span>
              ))}
            </div>
            {/* Row 2 */}
            <div style={{ display: "flex", justifyContent: "center", gap: "0.2em", flexWrap: "wrap", marginTop: "0.05em" }}>
              {L1_ROW2.map((word, i) => {
                const isStudents = word === "STUDENTS";
                return (
                  <motion.span
                    key={word}
                    initial={{ opacity: 0, y: 16, filter: "blur(10px)" }}
                    animate={
                      l1Shown > L1_ROW1.length + i
                        ? { opacity: 1, y: 0, filter: "blur(0px)" }
                        : { opacity: 0, y: 16, filter: "blur(10px)" }
                    }
                    transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
                    style={{
                      ...(isStudents ? montserratOutline : typoRound),
                      fontSize: INTRO_FONT,
                      color: isStudents ? "#213c4c" : textColor,
                      display: "inline-block",
                    }}
                  >
                    {word}
                  </motion.span>
                );
              })}
            </div>
          </motion.div>

          {/* ── L2: NO OVERPRICED TAKEOUTS ────────────────────────────────── */}
          <motion.div
            style={{
              opacity: l2Opacity,
              scale: l2Scale,
              y: l2Y,
              transformOrigin: "top center",
              textAlign: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                ...typoRound,
                fontSize: INTRO_FONT,
                color: textColor,
                display: "inline-flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 0,
              }}
            >
              {L2_CHARS.map((char, i) => (
                <RevealChar
                  key={i}
                  char={char}
                  scrollY={scrollYProgress}
                  threshold={L2_REVEAL_S + i * (l2Range / L2_CHARS.length)}
                  dur={l2Dur}
                />
              ))}
            </div>
          </motion.div>

          {/* ── L3: NO TIME WASTED COOKING ───────────────────────────────── */}
          <motion.div
            style={{
              opacity: l3Opacity,
              scale: l3Scale,
              y: l3Y,
              transformOrigin: "top center",
              textAlign: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                ...montserratOutline,
                fontSize: INTRO_FONT,
                display: "inline-flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 0,
              }}
            >
              {L3_CHARS.map((char, i) => (
                <RevealChar
                  key={i}
                  char={char}
                  scrollY={scrollYProgress}
                  threshold={L3_REVEAL_S + i * (l3Range / L3_CHARS.length)}
                  dur={l3Dur}
                />
              ))}
            </div>
          </motion.div>

          {/* ── L4: ribbon ────────────────────────────────────────────────── */}
          <motion.div
            style={{
              opacity: l4Opacity,
              scale: l4Scale,
              y: l4Y,
              transformOrigin: "top center",
              textAlign: "center",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: "0.28em",
              }}
            >
              {L4_WORDS.map((word, i) => (
                <RibbonWord
                  key={i}
                  word={word}
                  scrollY={scrollYProgress}
                  start={L4_START + i * l4Step}
                  end={L4_START + (i + 1) * l4Step}
                  style={{ ...typoRound, fontSize: "clamp(22px, 5.5vw, 46px)", color: textColor }}
                />
              ))}
            </div>
          </motion.div>

        </motion.div>

        {/* ══════════════ FINAL HERO LAYER (crossfades in at end) ════════════ */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            opacity: finalOpacity,
            zIndex: 3,
            background: bg,
          }}
        >
          <div className="container mx-auto px-2 sm:px-4 pt-[80px] pb-[24px] md:pt-[100px] md:pb-[40px]">
            <div className="max-w-4xl mx-auto">
              <div className="space-y-4">

                {/* Section 1: DORMERS' IS FOR + STUDENTS ONLY */}
                <div className="text-center mb-[4px]">
                  <h1
                    className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2"
                    style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", lineHeight: 1, color: textColor }}
                  >
                    DORMERS&apos; IS FOR
                  </h1>
                  <div className="relative inline-flex items-center gap-2 sm:gap-4">
                    <h2
                      className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mt-0"
                      style={{
                        fontFamily: "Montserrat", fontWeight: 900,
                        textTransform: "uppercase", color: "#213c4c",
                        textShadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}`,
                        lineHeight: 1, letterSpacing: 0,
                      }}
                    >
                      STUDENTS
                    </h2>
                    <span
                      className={`${isLight ? "bg-[#1E3A4F] text-white" : "bg-[#EEE9DA] text-[#1E3A4F]"} top-4 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-base animate-bounce rotate-[15.74deg] absolute -right-15 sm:-right-12 lg:right-[-117px]`}
                      style={{ width: "33%", fontFamily: "Typo Round Bold Demo" }}
                    >
                      ONLY
                    </span>
                  </div>
                </div>

                {/* Section 2: NO Overpriced Takeouts */}
                <div className="relative text-center mt-2 mb-[4px]">
                  <span className="bg-[#FF7F00] text-[#1E3A4F] flex items-center justify-center absolute transition-all duration-300 hover:scale-110 animate-bounce rotate-[-11.13deg] badge-label lg:!text-[14px]">
                    NO
                  </span>
                  <h1
                    className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2"
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      textTransform: "uppercase", lineHeight: 1, color: textColor,
                    }}
                  >
                    Overpriced Takeouts
                  </h1>
                </div>

                {/* Section 3: NO TIME WASTED + COOKING */}
                <div className="relative text-center mt-2 mb-[4px]">
                  <h2
                    className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl"
                    style={{
                      fontFamily: "Montserrat", fontWeight: 900,
                      textTransform: "uppercase", color: "#213c4c",
                      textShadow: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}`,
                      lineHeight: 1, letterSpacing: 0,
                    }}
                  >
                    NO TIME WASTED
                  </h2>
                  <span
                    className="bg-[#031624] text-[#FFFFFF] px-3 sm:px-2 py-1 rounded-full text-[10px] sm:text-base absolute right-4 sm:right-35 top-1 animate-bounce rotate-[11.13deg]"
                    style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700 }}
                  >
                    COOKING
                  </span>
                </div>

                {/* Section 4: Bottom line */}
                <p
                  className="text-[12px] sm:text-[24px] md:text-lg lg:text-xl text-center"
                  style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700, color: textColor }}
                >
                  Just good, affordable food, delivered to your dorm
                </p>

              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
