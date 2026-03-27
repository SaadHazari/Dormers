"use client";

import { useRef, useEffect, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  MotionValue,
} from "framer-motion";
import { useTheme } from "next-themes";

// ─── Scroll breakpoints (0–1) ─────────────────────────────────────────────────
const L2_REVEAL_S = 0.18;
const L2_REVEAL_E = 0.38;
const L2_SHRINK_E = 0.48;
const L3_REVEAL_S = 0.48;
const L3_REVEAL_E = 0.66;
const L3_SHRINK_E = 0.76;
const L4_REVEAL_S = 0.76;
const L4_REVEAL_E = 0.90;
const XFADE_S     = 0.90;
const XFADE_E     = 0.97;
const UI_SHOW_AT  = 0.90;
const WORD_DUR    = 0.044; // scroll-progress units each word takes to reveal

const L1_WORDS = ["DORMERS'", "IS", "FOR", "STUDENTS", "ONLY"];
const L2_WORDS = ["NO", "OVERPRICED", "TAKEOUTS"];
const L3_WORDS = ["NO", "TIME", "WASTED", "COOKING"];
const L4_WORDS = ["JUST", "GOOD,", "AFFORDABLE", "FOOD,", "DELIVERED", "TO", "YOUR", "DORM"];

// ─── Per-word scroll-linked reveal ───────────────────────────────────────────
function RevealWord({
  word,
  scrollY,
  start,
}: {
  word: string;
  scrollY: MotionValue<number>;
  start: number;
}) {
  const opacity = useTransform(scrollY, [start, start + WORD_DUR], [0, 1]);
  const y = useTransform(scrollY, [start, start + WORD_DUR * 1.4], ["22px", "0px"]);
  return (
    <motion.span style={{ opacity, y, display: "inline-block" }}>
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

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // L1 — time-based word reveal (auto-plays on arrival)
  const [l1Shown, setL1Shown] = useState(0);
  useEffect(() => {
    L1_WORDS.forEach((_, i) => {
      setTimeout(() => setL1Shown(i + 1), 280 + i * 250);
    });
  }, []);

  // ── Scale + Y settle for each line ──────────────────────────────────────────
  const l1Scale = useTransform(scrollYProgress, [0.00, 0.20], [2.6, 1]);
  const l1Y     = useTransform(scrollYProgress, [0.00, 0.20], ["70px", "0px"]);

  const l2Fade  = useTransform(scrollYProgress, [L2_REVEAL_S - 0.04, L2_REVEAL_S], [0, 1]);
  const l2Scale = useTransform(scrollYProgress, [L2_REVEAL_S, L2_SHRINK_E], [2.6, 1]);
  const l2Y     = useTransform(scrollYProgress, [L2_REVEAL_S, L2_SHRINK_E], ["70px", "0px"]);

  const l3Fade  = useTransform(scrollYProgress, [L3_REVEAL_S - 0.04, L3_REVEAL_S], [0, 1]);
  const l3Scale = useTransform(scrollYProgress, [L3_REVEAL_S, L3_SHRINK_E], [2.6, 1]);
  const l3Y     = useTransform(scrollYProgress, [L3_REVEAL_S, L3_SHRINK_E], ["70px", "0px"]);

  const l4Fade  = useTransform(scrollYProgress, [L4_REVEAL_S - 0.04, L4_REVEAL_S], [0, 1]);
  const l4Scale = useTransform(scrollYProgress, [L4_REVEAL_S, XFADE_S], [2.2, 1]);
  const l4Y     = useTransform(scrollYProgress, [L4_REVEAL_S, XFADE_S], ["55px", "0px"]);

  // ── Crossfade intro → final hero ────────────────────────────────────────────
  const introOpacity = useTransform(scrollYProgress, [XFADE_S, XFADE_E], [1, 0]);
  const finalOpacity = useTransform(scrollYProgress, [XFADE_S, XFADE_E], [0, 1]);

  // ── Dispatch hero-ui-visible / hidden ───────────────────────────────────────
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v >= UI_SHOW_AT) {
      window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    } else {
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    }
  });

  // ── Word start positions ────────────────────────────────────────────────────
  const l2Step = (L2_REVEAL_E - L2_REVEAL_S) / L2_WORDS.length;
  const l3Step = (L3_REVEAL_E - L3_REVEAL_S) / L3_WORDS.length;
  const l4Step = (L4_REVEAL_E - L4_REVEAL_S) / L4_WORDS.length;

  // ── Shared styles ───────────────────────────────────────────────────────────
  const INTRO_FONT = "clamp(34px, 7.5vw, 70px)";
  const L4_FONT    = "clamp(26px, 5.5vw, 52px)";

  const lineBase: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "baseline",
    gap: "0 0.24em",
    lineHeight: 1.05,
  };

  const typoRound: React.CSSProperties = {
    fontFamily: "'Typo Round Bold Demo', sans-serif",
    color: textColor,
    fontSize: INTRO_FONT,
  };

  const outline   = textColor;

  return (
    /* 400 vh outer — provides scroll space */
    <div ref={containerRef} style={{ height: "400vh", position: "relative" }}>

      {/* 100 vh sticky viewport */}
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
            paddingTop: "clamp(55px, 9vh, 95px)",
            gap: "clamp(3px, 0.6vh, 8px)",
            opacity: introOpacity,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >

          {/* ── L1: DORMERS' IS FOR STUDENTS ONLY ── */}
          <motion.div
            style={{
              scale: l1Scale,
              y: l1Y,
              transformOrigin: "top center",
              width: "100%",
            }}
          >
            <div style={{ ...lineBase, ...typoRound }}>
              {L1_WORDS.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                  animate={
                    l1Shown > i
                      ? { opacity: 1, y: 0, filter: "blur(0px)" }
                      : { opacity: 0, y: 18, filter: "blur(8px)" }
                  }
                  transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{ display: "inline-block" }}
                >
                  {word}
                </motion.span>
              ))}
            </div>
          </motion.div>

          {/* ── L2: NO OVERPRICED TAKEOUTS ── */}
          <motion.div
            style={{
              opacity: l2Fade,
              scale: l2Scale,
              y: l2Y,
              transformOrigin: "top center",
              width: "100%",
            }}
          >
            <div style={{ ...lineBase, ...typoRound }}>
              {L2_WORDS.map((word, i) => (
                <RevealWord
                  key={i}
                  word={word}
                  scrollY={scrollYProgress}
                  start={L2_REVEAL_S + i * l2Step}
                />
              ))}
            </div>
          </motion.div>

          {/* ── L3: NO TIME WASTED COOKING (outline style) ── */}
          <motion.div
            style={{
              opacity: l3Fade,
              scale: l3Scale,
              y: l3Y,
              transformOrigin: "top center",
              width: "100%",
            }}
          >
            <div
              style={{
                ...lineBase,
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: INTRO_FONT,
                WebkitTextFillColor: "transparent",
                WebkitTextStroke: `2px ${outline}`,
              }}
            >
              {L3_WORDS.map((word, i) => (
                <RevealWord
                  key={i}
                  word={word}
                  scrollY={scrollYProgress}
                  start={L3_REVEAL_S + i * l3Step}
                />
              ))}
            </div>
          </motion.div>

          {/* ── L4: JUST GOOD, AFFORDABLE FOOD, DELIVERED TO YOUR DORM ── */}
          <motion.div
            style={{
              opacity: l4Fade,
              scale: l4Scale,
              y: l4Y,
              transformOrigin: "top center",
              width: "100%",
            }}
          >
            <div
              style={{
                ...lineBase,
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                color: textColor,
                fontSize: L4_FONT,
              }}
            >
              {L4_WORDS.map((word, i) => (
                <RevealWord
                  key={i}
                  word={word}
                  scrollY={scrollYProgress}
                  start={L4_REVEAL_S + i * l4Step}
                />
              ))}
            </div>
          </motion.div>

        </motion.div>

        {/* ══════════════ FINAL HERO LAYER ════════════════ */}
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
                        fontFamily: "Montserrat",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        color: "transparent",
                        WebkitTextStroke: `2px ${outline}`,
                        lineHeight: 1,
                        letterSpacing: 0,
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
                      textTransform: "uppercase",
                      lineHeight: 1,
                      color: textColor,
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
                      fontFamily: "Montserrat",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      color: "transparent",
                      WebkitTextStroke: `2px ${outline}`,
                      lineHeight: 1,
                      letterSpacing: 0,
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
