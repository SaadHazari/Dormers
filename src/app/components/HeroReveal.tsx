"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────────
 * Framer ease curve
 * ───────────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

/* ─────────────────────────────────────────────────────────────────
 * Animation timing — sequential checklist
 *
 * L1 words   → L2 words → dinner underline
 * → item 1 → strike 1 → dot 1 → item 2 → strike 2 → dot 2
 * → item 3 → strike 3
 * → typewriter → "Delivered WARM" → "to your DORM."
 * → CTAs → proof columns
 * ───────────────────────────────────────────────────────────────── */
const W_GAP    = 0.13;   // L1 inter-word gap
const L1_S     = 0.20;   // "You" starts at 0.20 s
const L2_D     = 1.15;   // "to" starts at 1.15 s
const L2_W_GAP = 0.20;   // L2 inter-word gap
const UNDER_D  = 2.26;   // dinner underline

// Sequential checklist
const PP1_D   = 3.95;    // Item 1
const STR1_D  = 4.40;    // Strike 1  (item 1 settles ~0.05 s before)
const DOT1_D  = 4.88;    // Dot 1     (strike 1 ends + tiny buffer)
const PP2_D   = 5.08;    // Item 2
const STR2_D  = 5.52;    // Strike 2
const DOT2_D  = 6.00;    // Dot 2
const PP3_D   = 6.20;    // Item 3
const STR3_D  = 6.64;    // Strike 3

// Anchor + rest
const CLOSE_D  = 7.30;             // typewriter starts
const LINE2_D  = CLOSE_D + 1.65;   // = 8.95 — "Delivered WARM"
const LINE2B_D = LINE2_D  + 0.50;  // = 9.45 — "to your DORM."
const CTA_D    = 10.10;
const PRICE_D  = 10.75;
const DISH_D   = 11.30;
const DORM_D   = 11.85;

/* ─────────────────────────────────────────────────────────────────
 * Scoped CSS — structural + typography only.
 * All enter animations are Framer Motion below.
 * ───────────────────────────────────────────────────────────────── */
const CSS = `
  /* ── Section ── */
  .h-section {
    background: linear-gradient(180deg, #091825 0%, #1e3a4f 60%, #162f40 100%);
    min-height: 100vh;
    position: relative;
    display: flex;
    align-items: flex-start;
    /* Balanced with left-margin (80px): top gap ~72px gives near-1:1 ratio */
    padding-top: 136px;
    overflow: hidden;
  }

  /* ── Grain overlay ── */
  .h-grain {
    position: absolute;
    inset: 0;
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Content container ── */
  .h-content {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 0 80px;
  }

  /* ── Headline ── */
  .h-headline { margin-bottom: 48px; }
  .h-hl-l1 {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 72px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: #ede8da;
    margin: 0;
  }
  .h-hl-l2 {
    font-family: Montserrat, sans-serif;
    font-size: 72px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .h-hl-to     { font-weight: 700; color: #ede8da; }
  .h-hl-stress { font-weight: 800; color: #f57f20; font-style: italic; }
  .h-hl-l3     { margin: 0; line-height: 1.05; letter-spacing: -0.02em; }

  .h-hl-dinner-wrap {
    position: relative;
    display: inline-block;
  }
  .h-hl-dinner {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 88px;
    color: #f57f20;
    font-style: italic;
  }
  .h-hl-period {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 88px;
    color: #f57f20;
    font-style: italic;
  }

  /* ── Checklist ── */
  .h-checklist {
    margin-bottom: 48px;
    display: flex;
    align-items: center;
  }
  .h-check-item {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 18px;
    color: #ede8da;
    letter-spacing: 0.01em;
    position: relative;
    display: inline-block;
  }
  .h-dot-sep {
    color: rgba(237, 232, 218, 0.55);
    font-size: 18px;
    margin: 0 20px;
    user-select: none;
    line-height: 1;
  }

  /* ── Anchor / payoff ── */
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

  /* ── CTAs ── */
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

  /* ── Proof bar ── */
  .h-proof {
    border-top: 1px solid rgba(237, 232, 218, 0.15);
    padding: 32px 0;
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
    color: #f57f20;
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

  /* ── Tablet (641–1024px) ── */
  @media (max-width: 1024px) {
    .h-section   { padding-top: 100px; }
    .h-content   { padding: 0 48px; }
    .h-hl-l1, .h-hl-l2 { font-size: 52px; }
    .h-hl-dinner, .h-hl-period { font-size: 64px; }
    .h-proof-num    { font-size: 44px; }
    .h-proof-prefix { font-size: 13px; }
  }

  /* ── Mobile (≤640px) ── */
  @media (max-width: 640px) {
    .h-section   { padding-top: 96px; }
    .h-content   { padding: 0 24px; }
    .h-hl-l1, .h-hl-l2 { font-size: 36px; }
    .h-hl-dinner, .h-hl-period { font-size: 44px; }
    .h-headline  { margin-bottom: 34px; }
    .h-checklist { flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 34px; }
    .h-dot-sep   { display: none; }
    .h-anchor    { margin-bottom: 34px; }
    .h-anchor-l1, .h-anchor-l2 { font-size: 20px; }
    .h-ctas      { gap: 12px; margin-bottom: 45px; }
    .h-btn       { font-size: 16px; padding: 12px 28px; }
    .h-proof     { padding: 24px 0; }
    .h-proof-qualifier { font-size: 9px; letter-spacing: 0.06em; margin-bottom: 2px; }
    .h-proof-num    { font-size: 32px; line-height: 1; }
    .h-proof-prefix { font-size: 10px; }
    .h-proof-unit   { font-size: 10px; margin-top: 1px; }
    .h-proof-divider { height: 50px; background: rgba(237,232,218,0.10); }
  }
`;

/* ─── Strikethrough — Framer scaleX reveal ───────────────────── */
function Strike({ delay, rotation }: { delay: number; rotation: number }) {
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
        transition={{ delay, duration: 0.45, ease: E }}
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
  /* ── Typewriter state ── */
  type CloserPhase = "idle" | "cursor" | "typing" | "done";
  const [closerPhase, setCloserPhase] = useState<CloserPhase>("idle");
  const [closerText, setCloserText]   = useState("");
  const CLOSER_FULL = "A new dish, every night.";

  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    }, (DORM_D + 0.5) * 1000);
    return () => {
      clearTimeout(t);
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    };
  }, []);

  useEffect(() => {
    const timers:    ReturnType<typeof setTimeout>[]   = [];
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

  return (
    <>
      <style>{CSS}</style>

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

        <div className="h-content">

          {/* 1 ── Headline */}
          <div className="h-headline">

            {/* Line 1 — word-by-word */}
            <div className="h-hl-l1">
              {["You", "didn't", "leave", "home"].map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 22, scale: 0.88 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.44, delay: L1_S + i * W_GAP, ease: E }}
                  style={{
                    display: "inline-block",
                    marginRight: "0.24em",
                    fontFamily:
                      word === "home"
                        ? "'Typo Round Bold Demo','Typo Round',sans-serif"
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
                transition={{ duration: 0.44, delay: L2_D, ease: E }}
                style={{ display: "inline-block", marginRight: "0.24em" }}
              >
                to
              </motion.span>
              <motion.span
                className="h-hl-stress"
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.44, delay: L2_D + L2_W_GAP, ease: E }}
                style={{ display: "inline-block", marginRight: "0.24em" }}
              >
                stress
              </motion.span>
              <motion.span
                className="h-hl-stress"
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.44, delay: L2_D + 2 * L2_W_GAP, ease: E }}
                style={{ display: "inline-block", marginRight: "0.24em" }}
              >
                about
              </motion.span>
            </div>

            {/* Line 3 — "dinner." + straight underline */}
            <div className="h-hl-l3">
              <motion.span
                initial={{ opacity: 0, y: 22, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.44, delay: L2_D + 3 * L2_W_GAP, ease: E }}
                style={{ display: "inline-block" }}
              >
                <span className="h-hl-dinner-wrap">
                  <span className="h-hl-dinner">dinner</span>
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

          {/* 2 ── Checklist — sequential: item → strike → dot → next item */}
          <div className="h-checklist">

            {/* Item 1 */}
            <motion.span
              className="h-check-item"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.40, delay: PP1_D, ease: E }}
            >
              No apps to scroll
              <Strike delay={STR1_D} rotation={-1} />
            </motion.span>

            {/* Dot 1 — appears after strike 1 */}
            <motion.span
              className="h-dot-sep"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: DOT1_D, ease: E }}
            >
              ·
            </motion.span>

            {/* Item 2 */}
            <motion.span
              className="h-check-item"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.40, delay: PP2_D, ease: E }}
            >
              No groceries to buy
              <Strike delay={STR2_D} rotation={0.5} />
            </motion.span>

            {/* Dot 2 — appears after strike 2 */}
            <motion.span
              className="h-dot-sep"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: DOT2_D, ease: E }}
            >
              ·
            </motion.span>

            {/* Item 3 */}
            <motion.span
              className="h-check-item"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.40, delay: PP3_D, ease: E }}
            >
              No recipes to follow
              <Strike delay={STR3_D} rotation={-0.8} />
            </motion.span>

          </div>

          {/* 3 ── Anchor / payoff */}
          <div className="h-anchor">

            {/* Line 1 — typewriter */}
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

            {/* Line 2 — "Delivered WARM" first, then "to your DORM." */}
            <p className="h-anchor-l2">
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: LINE2_D, duration: 0.45, ease: E }}
                style={{ display: "inline" }}
              >
                Delivered{" "}<span className="h-anchor-emph">WARM</span>
              </motion.span>
              {" "}
              <motion.span
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: LINE2B_D, duration: 0.45, ease: E }}
                style={{ display: "inline" }}
              >
                to your{" "}<span className="h-anchor-emph">DORM</span>.
              </motion.span>
            </p>

          </div>

          {/* 4 ── CTA Buttons */}
          <motion.div
            className="h-ctas"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: CTA_D, duration: 0.48, ease: E }}
          >
            <button
              className="h-btn h-btn-primary"
              onClick={() => window.open("https://vip.dormers.ae/", "_blank")}
            >
              Subscribe
            </button>
            <button
              className="h-btn h-btn-secondary"
              onClick={() => window.open("https://vip.dormers.ae/", "_blank")}
            >
              Try a Meal
            </button>
          </motion.div>

          {/* 5 ── Proof bar — individually staggered */}
          <div className="h-proof">

            <motion.div
              className="h-proof-col"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: PRICE_D, duration: 0.48, ease: E }}
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
              transition={{ delay: PRICE_D, duration: 0.3 }}
            />

            <motion.div
              className="h-proof-col"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: DISH_D, duration: 0.48, ease: E }}
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
              transition={{ delay: DISH_D, duration: 0.3 }}
            />

            <motion.div
              className="h-proof-col"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: DORM_D, duration: 0.48, ease: E }}
            >
              <span className="h-proof-qualifier">Delivering to</span>
              <div className="h-proof-num-row">
                <span className="h-proof-num">6</span>
              </div>
              <span className="h-proof-unit">dorms</span>
            </motion.div>

          </div>

        </div>
      </section>
    </>
  );
}
