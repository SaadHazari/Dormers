"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TextRotate } from "@/components/ui/text-rotate";
import TonightsMeal from "@/app/components/TonightsMeal";
import Preloader from "@/app/components/Preloader";

/* ─────────────────────────────────────────────────────────────────
 * Framer ease curve
 * ───────────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

/* ─────────────────────────────────────────────────────────────────
 * Animation timing — sequential checklist
 *
 * SPEED GUIDE — tweak these constants to accelerate the sequence:
 *   W_GAP   0.13  → inter-word gap on line 1 (try 0.09)
 *   L2_D    1.15  → line 2 start       (try 0.75)
 *   L2_W_GAP 0.20 → inter-word gap L2  (try 0.13)
 *   UNDER_D 2.26  → dinner underline   (try 1.55)
 *   PP1_D   3.95  → checklist item 1   (try 2.60) ← biggest saving
 *   STR1_D  4.40  → strike 1           (try 3.05)
 *   DOT1_D  4.88  → dot 1              (try 3.45)
 *   PP2_D   5.08  → item 2             (try 3.60)
 *   … and so on keeping the same ~0.45 s gaps between items
 *   CLOSE_D 7.30  → typewriter start   (try 5.50) ← biggest saving
 *   CTA_D  10.10  → CTA buttons        (try 8.00)
 * ───────────────────────────────────────────────────────────────── */
const W_GAP = 0.13;
const L1_S  = 0.20;
const L2_D  = 1.15;
const L2_W_GAP = 0.20;
const UNDER_D  = 2.26;

// PP1_D = 3.0 — all subsequent values keep the exact original inter-step gaps
const PP1_D  = 3.00;               // was 3.95  (-0.95)
const STR1_D = PP1_D  + 0.45;     // 3.45  (was 4.40)
const DOT1_D = STR1_D + 0.48;     // 3.93  (was 4.88)
const PP2_D  = DOT1_D + 0.20;     // 4.13  (was 5.08)
const STR2_D = PP2_D  + 0.44;     // 4.57  (was 5.52)
const DOT2_D = STR2_D + 0.48;     // 5.05  (was 6.00)
const PP3_D  = DOT2_D + 0.20;     // 5.25  (was 6.20)
const STR3_D = PP3_D  + 0.44;     // 5.69  (was 6.64)

const CLOSE_D  = STR3_D + 0.66;   // 6.35  (was 7.30)
const LINE2_D  = CLOSE_D + 1.65;  // 8.00  (was 8.95)
const LINE2B_D = LINE2_D + 0.50;  // 8.50  (was 9.45)
const CTA_D    = LINE2B_D + 0.65; // 9.15  (was 10.10)
const PRICE_D  = CTA_D  + 0.65;   // 9.80  (was 10.75)
const DISH_D   = PRICE_D + 0.55;  // 10.35 (was 11.30)
const DORM_D   = DISH_D  + 0.55;  // 10.90 (was 11.85)

/* ─────────────────────────────────────────────────────────────────
 * Scoped CSS
 * ───────────────────────────────────────────────────────────────── */
const CSS = `
  .h-section {
    background: linear-gradient(180deg, #091825 0%, #1e3a4f 60%, #162f40 100%);
    min-height: 100vh;
    position: relative;
    display: flex;
    flex-direction: column;
    padding-top: 136px;
    overflow: hidden;
  }
  .h-grain {
    position: absolute;
    inset: 0;
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
  }
  .h-content {
    position: relative;
    z-index: 1;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 0 70px;
    display: flex;
    align-items: flex-start;
    gap: 56px;
  }
  .h-left  { flex: 1 1 auto; min-width: 0; }
  .h-right {
    flex-shrink: 0;
    align-self: flex-start;
    margin-top: 19px;
    margin-left: 5px;
  }
  .h-headline { margin-bottom: 48px; }
  .h-hl-l1 {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 58px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: #ede8da;
    margin: 0;
  }
  .h-hl-l2 {
    font-family: Montserrat, sans-serif;
    font-size: 58px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .h-hl-to     { font-weight: 700; color: #ede8da; }
  .h-hl-stress { font-weight: 800; color: #f57f20; font-style: italic; }
  .h-hl-l3     { margin: 0; line-height: 1.05; letter-spacing: -0.02em; }
  .h-hl-dinner-wrap { position: relative; display: inline-block; }
  .h-hl-dinner {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 74px;
    color: #f57f20;
    font-style: italic;
  }
  .h-hl-period {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 74px;
    color: #f57f20;
    font-style: italic;
  }
  .h-checklist {
    margin-bottom: 48px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    row-gap: 12px;
  }
  .h-check-item {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 18px;
    color: #ede8da;
    letter-spacing: 0.01em;
    position: relative;
    display: inline-block;
    white-space: nowrap;
  }
  .h-dot-sep {
    color: rgba(237, 232, 218, 0.55);
    font-size: 18px;
    margin: 0 20px;
    user-select: none;
    line-height: 1;
  }
  .h-anchor { margin-bottom: 48px; }
  .h-anchor-l1 {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 24px;
    color: rgba(237, 232, 218, 0.55);
    margin: 0 0 8px;
    line-height: 1.4;
  }
  .h-anchor-l2 {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 24px;
    color: #ede8da;
    margin: 0;
    line-height: 1.4;
  }
  .h-anchor-emph { font-weight: 800; color: #f57f20; text-transform: uppercase; }
  .h-ctas {
    margin-bottom: 64px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .h-btn {
    font-family: Montserrat, sans-serif;
    font-size: 18px;
    padding: 16px 40px;
    border-radius: 12px;
    cursor: pointer;
    line-height: 1;
    transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
    white-space: nowrap;
  }
  .h-btn-primary  { background: #f57f20; color: #ede8da; font-weight: 700; border: none; }
  .h-btn-primary:hover  { background: #e06d10; transform: scale(1.03); }
  .h-btn-secondary { background: transparent; color: #ede8da; font-weight: 600; border: 2px solid rgba(237,232,218,0.4); }
  .h-btn-secondary:hover { border-color: #ede8da; background: rgba(237,232,218,0.08); transform: scale(1.03); }
  .h-proof-wrapper {
    width: 100%;
    max-width: 900px;
    margin: auto auto 40px auto;
    padding: 0 40px;
  }
  .h-proof {
    border-top: 1px solid rgba(237, 232, 218, 0.15);
    padding: 24px 0 0;
    display: flex;
    justify-content: space-around;
    align-items: flex-start;
  }
  .h-proof-col {
    flex: 1;
    min-width: 0;
    text-align: center;
    padding: 0 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .h-proof-divider {
    width: 1px;
    height: 70px;
    background: rgba(237, 232, 218, 0.12);
    flex-shrink: 0;
    align-self: center;
  }
  .h-proof-qualifier {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 11px;
    color: rgba(237, 232, 218, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    white-space: nowrap;
  }
  .h-proof-num-row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 2px;
  }
  .h-proof-prefix {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: #ede8da;
    line-height: 1.1;
  }
  .h-proof-num {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 48px;
    color: #f57f20;
    line-height: 1.1;
    margin: 0;
  }
  .h-proof-unit {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 12px;
    color: rgba(237, 232, 218, 0.5);
    letter-spacing: 0.02em;
    margin-top: 2px;
    white-space: nowrap;
  }

  /* ── Skip Intro button ── */
  .h-skip {
    position: absolute;
    top: 100px;
    right: 70px;
    z-index: 10;
    font-family: Montserrat, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ede8da;
    background: rgba(245, 127, 32, 0.18);
    border: 1px solid rgba(245, 127, 32, 0.45);
    padding: 8px 18px;
    border-radius: 20px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(245, 127, 32, 0.12);
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, color 150ms ease;
  }
  .h-skip:hover {
    background: rgba(245, 127, 32, 0.32);
    border-color: rgba(245, 127, 32, 0.70);
    box-shadow: 0 0 24px rgba(245, 127, 32, 0.28);
    color: #fff;
  }

  /* ── Mobile-inline skip (inside h-ctas, hidden on sm+) ── */
  .h-skip-mobile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: auto;
    align-self: center;
    margin-top: -20px;
    position: relative;
    z-index: 10;
    font-family: Montserrat, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ede8da;
    background: rgba(245, 127, 32, 0.18);
    border: 1px solid rgba(245, 127, 32, 0.45);
    padding: 10px 28px;
    border-radius: 20px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(245, 127, 32, 0.12);
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }
  .h-skip-mobile:hover {
    background: rgba(245, 127, 32, 0.32);
    border-color: rgba(245, 127, 32, 0.70);
    box-shadow: 0 0 24px rgba(245, 127, 32, 0.28);
  }
  @media (min-width: 641px) {
    .h-skip-mobile { display: none !important; }
  }

  /* ── Tablet (641–1024px) ── */
  @media (max-width: 1024px) {
    .h-section   { padding-top: 100px; min-height: auto; padding-bottom: 30px; }
    .h-content   { padding: 0 48px; flex-direction: column; gap: 32px; }
    .h-hl-l1, .h-hl-l2 { font-size: 52px; }
    .h-hl-dinner, .h-hl-period { font-size: 64px; }
    .h-proof-num    { font-size: 44px; }
    .h-proof-prefix { font-size: 13px; }
    .h-ctas         { margin-bottom: 24px; }
    .h-right        { align-self: center; margin-top: 0; margin-left: 0; transform: scale(0.95); margin-bottom: 30px; }
    .h-skip         { right: 48px; }
  }

  /* ── Mobile (≤640px) ── */
  @media (max-width: 640px) {
    .h-section   { padding-top: 96px; }
    .h-content   { padding: 0 24px; }
    .h-right     { display: none !important; }
    .h-hl-l1, .h-hl-l2 { font-size: 36px; }
    .h-hl-dinner, .h-hl-period { font-size: 44px; }
    .h-headline  { margin-bottom: 34px; }
    .h-checklist { flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 34px; }
    .h-dot-sep   { display: none; }
    .h-anchor    { margin-bottom: 34px; }
    .h-anchor-l1, .h-anchor-l2 { font-size: 20px; }
    .h-ctas      { gap: 12px; margin-bottom: 45px; align-items: stretch; }
    .h-btn       { font-size: 16px; padding: 12px 28px; }
    .h-proof     { padding: 24px 0; }
    .h-proof-qualifier { font-size: 9px; letter-spacing: 0.06em; margin-bottom: 2px; }
    .h-proof-num    { font-size: 32px; line-height: 1; }
    .h-proof-prefix { font-size: 10px; }
    .h-proof-unit   { font-size: 10px; margin-top: 1px; }
    .h-proof-divider { height: 50px; background: rgba(237,232,218,0.10); }
    .h-skip {
      display: none;
    }
  }
`;

/* ─── Strikethrough — Framer scaleX reveal ───────────────────── */
function Strike({ delay, rotation, skipped }: { delay: number; rotation: number; skipped: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        left: -4,
        right: -4,
        top: "50%",
        height: "1px",
        transform: `translateY(-50%) rotate(${rotation}deg)`,
        overflow: "hidden",
      }}
    >
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={skipped ? { duration: 0, delay: 0 } : { delay, duration: 0.45, ease: E }}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "#f57f20",
          transformOrigin: "left",
          borderRadius: "1px",
        }}
      />
    </span>
  );
}

export default function HeroReveal() {
  const router = useRouter();

  type CloserPhase = "idle" | "cursor" | "typing" | "done";
  const [closerPhase, setCloserPhase] = useState<CloserPhase>("idle");
  const [closerText, setCloserText] = useState("");
  const [isPreloading, setIsPreloading] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const CLOSER_FULL = "A new dish, every night.";
  const skippedRef = useRef(false);

  /* ── Snap-transition helper ──────────────────────────────────────
   * When skipped=true every entry animation collapses to 0 duration,
   * snapping all motion elements to their final visible state.      */
  const st = (base: object) => skipped ? { duration: 0, delay: 0 } : base;

  /* ── Skip intro handler ───────────────────────────────────────── */
  const skipIntro = () => {
    setSkipped(true);
    setAnimDone(true);
    setCloserPhase("done");
    setCloserText(CLOSER_FULL);
    window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    localStorage.setItem("hero_seen", "true");
  };

  /* ── Skip animation for returning visitors ───────────────────── *
   * Keep isPreloading=true so the quick splash screen still shows.  *
   * skippedRef escapes the stale-closure problem in onComplete.     */
  useLayoutEffect(() => {
    if (localStorage.getItem("hero_seen") === "true") {
      skippedRef.current = true;
      setSkipped(true);
      setAnimDone(true);
      setCloserPhase("done");
      setCloserText(CLOSER_FULL);
    }
  }, []);

  /* ── Navbar + chat bubble reveal ─────────────────────────────────
   * Fires right after the CTA buttons appear (CTA_D + 0.5 s),
   * not after the proof columns (old: DORM_D + 0.5 s).            */
  useEffect(() => {
    if (isPreloading || skipped) return;
    const t = setTimeout(() => {
      setAnimDone(true);
      window.dispatchEvent(new CustomEvent("hero-ui-visible"));
      localStorage.setItem("hero_seen", "true");
    }, (CTA_D + 0.5) * 1000);
    return () => {
      clearTimeout(t);
    };
  }, [isPreloading, skipped]);

  /* ── Typewriter ───────────────────────────────────────────────── */
  useEffect(() => {
    if (isPreloading || skipped) return;
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
  }, [isPreloading, skipped]);

  return (
    <>
      <style>{CSS}</style>

      {isPreloading && (
        <Preloader
          onComplete={() => {
            setIsPreloading(false);
            if (skippedRef.current) {
              window.dispatchEvent(new CustomEvent("hero-ui-visible"));
            }
          }}
        />
      )}

      <section id="hero" className="h-section">

        {/* ── Grain texture ────────────────────────────────── */}
        <div aria-hidden className="h-grain">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
            <defs>
              <filter id="h-noise-filter" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
              </filter>
            </defs>
            <rect width="100%" height="100%" filter="url(#h-noise-filter)" fill="white" />
          </svg>
        </div>

        {!isPreloading && (
          <>
            {/* ── Skip Intro button ──────────────────────────── */}
            <AnimatePresence>
              {!animDone && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.8, duration: 0.35 }}
                  onClick={skipIntro}
                  className="h-skip"
                >
                  Skip intro →
                </motion.button>
              )}
            </AnimatePresence>

            {/* key forces full remount on skip → all motion elements start fresh
                with st() → duration:0, snapping every element to final state   */}
            <div key={skipped ? 1 : 0} style={{ display: "contents" }}>
            <div className="h-content">
              <div className="h-left">

                {/* 1 ── Headline */}
                <div className="h-headline">

                  {/* Line 1 — word-by-word */}
                  <div className="h-hl-l1">
                    {["You", "didn't", "leave", "home"].map((word, i) => (
                      <motion.span
                        key={word}
                        initial={{ opacity: 0, y: 22, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={st({ duration: 0.44, delay: L1_S + i * W_GAP, ease: E })}
                        style={{
                          display: "inline-block",
                          marginRight: "0.24em",
                          fontFamily:
                            word === "home"
                              ? "'Lora', Georgia, serif"
                              : "Montserrat,sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        {word}
                      </motion.span>
                    ))}
                  </div>

                  {/* Line 2 — word-by-word */}
                  <div className="h-hl-l2">
                    <motion.span
                      className="h-hl-to"
                      initial={{ opacity: 0, y: 22, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={st({ duration: 0.44, delay: L2_D, ease: E })}
                      style={{ display: "inline-block", marginRight: "0.24em" }}
                    >
                      to
                    </motion.span>
                    <motion.span
                      className="h-hl-stress"
                      initial={{ opacity: 0, y: 22, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={st({ duration: 0.44, delay: L2_D + L2_W_GAP, ease: E })}
                      style={{ display: "inline-block", marginRight: "0.24em" }}
                    >
                      stress
                    </motion.span>
                    <motion.span
                      className="h-hl-stress"
                      initial={{ opacity: 0, y: 22, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={st({ duration: 0.44, delay: L2_D + 2 * L2_W_GAP, ease: E })}
                      style={{ display: "inline-block", marginRight: "0.24em" }}
                    >
                      about
                    </motion.span>
                  </div>

                  {/* Line 3 — "dinner." + underline */}
                  <div className="h-hl-l3">
                    <motion.span
                      initial={{ opacity: 0, y: 22, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={st({ duration: 0.44, delay: L2_D + 3 * L2_W_GAP, ease: E })}
                      style={{ display: "inline-block" }}
                    >
                      <span className="h-hl-dinner-wrap">
                        <span className="h-hl-dinner">dinner</span>
                        <motion.span
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={st({ delay: UNDER_D, duration: 0.50, ease: E })}
                          style={{
                            position: "absolute",
                            bottom: -3,
                            left: 0,
                            right: 0,
                            height: 2,
                            background: "#f57f20",
                            transformOrigin: "left center",
                            display: "block",
                            borderRadius: "1px",
                          }}
                        />
                      </span>
                      <span className="h-hl-period">.</span>
                    </motion.span>
                  </div>
                </div>

                {/* 2 ── Checklist */}
                <div className="h-checklist">

                  <motion.span
                    className="h-check-item"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ duration: 0.40, delay: PP1_D, ease: E })}
                  >
                    No apps to scroll
                    <Strike delay={STR1_D} rotation={-1} skipped={skipped} />
                  </motion.span>

                  <motion.span
                    className="h-dot-sep"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={st({ duration: 0.18, delay: DOT1_D, ease: E })}
                  >
                    ·
                  </motion.span>

                  <motion.span
                    className="h-check-item"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ duration: 0.40, delay: PP2_D, ease: E })}
                  >
                    No groceries to buy
                    <Strike delay={STR2_D} rotation={0.5} skipped={skipped} />
                  </motion.span>

                  <motion.span
                    className="h-dot-sep"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={st({ duration: 0.18, delay: DOT2_D, ease: E })}
                  >
                    ·
                  </motion.span>

                  <motion.span
                    className="h-check-item"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ duration: 0.40, delay: PP3_D, ease: E })}
                  >
                    No recipes to follow
                    <Strike delay={STR3_D} rotation={-0.8} skipped={skipped} />
                  </motion.span>

                </div>

                {/* 3 ── Anchor / payoff */}
                <div className="h-anchor">

                  <p className="h-anchor-l1" style={{ minHeight: "1.25em" }}>
                    {closerPhase !== "idle" && closerText}

                    {(closerPhase === "cursor" || closerPhase === "typing") && (
                      <motion.span
                        animate={
                          closerPhase === "cursor" ? { opacity: [1, 0] } : { opacity: 1 }
                        }
                        transition={{
                          duration: 0.45,
                          repeat: closerPhase === "cursor" ? Infinity : 0,
                          repeatType: "reverse",
                        }}
                        style={{
                          fontFamily: "Montserrat, sans-serif",
                          fontWeight: 300,
                          color: "rgba(237,232,218,0.55)",
                        }}
                      >
                        |
                      </motion.span>
                    )}

                    {closerPhase === "done" && (
                      <motion.span
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        style={{
                          fontFamily: "Montserrat, sans-serif",
                          fontWeight: 300,
                          color: "rgba(237,232,218,0.55)",
                        }}
                      >
                        |
                      </motion.span>
                    )}
                  </p>

                  <p className="h-anchor-l2">
                    <motion.span
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={st({ delay: LINE2_D, duration: 0.45, ease: E })}
                      style={{ display: "inline" }}
                    >
                      Delivered{" "}<span className="h-anchor-emph">WARM</span>
                    </motion.span>
                    {" "}
                    <motion.span
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={st({ delay: LINE2B_D, duration: 0.45, ease: E })}
                      style={{ display: "inline" }}
                    >
                      to your{" "}<span className="h-anchor-emph">DORM</span>.
                    </motion.span>
                  </p>

                </div>

                {/* 4 ── CTA Buttons */}
                <div className="h-ctas">
                  <motion.button
                    className="h-btn h-btn-primary hero-cta-primary flex items-center justify-center overflow-hidden min-w-[160px] md:min-w-[185px]"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: CTA_D, duration: 0.48, ease: E })}
                    onClick={() => router.push("/maintenance")}
                  >
                    <TextRotate
                      texts={["Get Started", "View Plans"]}
                      mainClassName="font-bold !whitespace-nowrap !flex-nowrap"
                      staggerDuration={0.03}
                      staggerFrom="last"
                      rotationInterval={3500}
                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    />
                  </motion.button>
                  <motion.button
                    className="h-btn h-btn-secondary"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: CTA_D, duration: 0.48, ease: E })}
                    onClick={() => router.push("/maintenance")}
                  >
                    Try a Meal
                  </motion.button>

                  {/* Mobile-only skip intro — centred in CTA row, appears with "You" */}
                  <AnimatePresence>
                    {!animDone && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        transition={st({ delay: L1_S, duration: 0.35 })}
                        onClick={(e) => { e.stopPropagation(); skipIntro(); }}
                        className="sm:hidden h-skip-mobile"
                      >
                        Skip intro →
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

              </div>{/* end h-left */}

              {/* Right column — Tonight's Meal card */}
              <motion.div
                className="h-right"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={st({ delay: DISH_D, duration: 0.55, ease: E })}
              >
                <TonightsMeal />
              </motion.div>

            </div>

            {/* 5 ── Proof bar */}
            <div className="h-proof-wrapper">
              <div className="h-proof">

                <motion.div
                  className="h-proof-col"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={st({ delay: PRICE_D, duration: 0.48, ease: E })}
                >
                  <span className="h-proof-qualifier">Starting from</span>
                  <div className="h-proof-num-row">
                    <span className="h-proof-prefix">AED</span>
                    <span className="h-proof-num">17</span>
                  </div>
                  <span className="h-proof-unit">/meal</span>
                </motion.div>

                <motion.div
                  className="h-proof-divider"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={st({ delay: PRICE_D, duration: 0.3 })}
                />

                <motion.div
                  className="h-proof-col"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={st({ delay: DISH_D, duration: 0.48, ease: E })}
                >
                  <span className="h-proof-qualifier">More than</span>
                  <div className="h-proof-num-row">
                    <span className="h-proof-num">48</span>
                  </div>
                  <span className="h-proof-unit">dishes</span>
                </motion.div>

                <motion.div
                  className="h-proof-divider"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={st({ delay: DISH_D, duration: 0.3 })}
                />

                <motion.div
                  className="h-proof-col"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={st({ delay: DORM_D, duration: 0.48, ease: E })}
                >
                  <span className="h-proof-qualifier">Delivering to</span>
                  <div className="h-proof-num-row">
                    <span className="h-proof-num">6</span>
                  </div>
                  <span className="h-proof-unit">dorms</span>
                </motion.div>

              </div>
            </div>
            </div>{/* end key wrapper */}
          </>
        )}
      </section>
    </>
  );
}
