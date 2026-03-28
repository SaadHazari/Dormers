"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────────
 * Framer Motion ease curve used throughout
 * ───────────────────────────────────────────────────────────────── */
const E = [0.25, 0.46, 0.45, 0.94] as const;

/* ─────────────────────────────────────────────────────────────────
 * Scoped CSS — structural + typography only.
 * All enter animations are handled by Framer Motion below.
 * ───────────────────────────────────────────────────────────────── */
const CSS = `
  /* ── Section ── */
  .h-section {
    background: linear-gradient(180deg, #091825 0%, #1e3a4f 60%, #162f40 100%);
    min-height: 100vh;
    position: relative;
    display: flex;
    align-items: center;
    padding-top: 120px;
    padding-bottom: 40px;
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
  .h-hl-to    { font-weight: 500; color: #ede8da; margin-right: 0.22em; }
  .h-hl-stress { font-weight: 800; color: #f57f20; font-style: italic; }
  .h-hl-l3    { margin: 0; line-height: 1.05; letter-spacing: -0.02em; }

  /* dinner wrapper — space for the animated SVG underline */
  .h-hl-dinner-wrap {
    position: relative;
    display: inline-block;
    padding-bottom: 10px;
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
    .h-section   { padding-top: 88px; }
    .h-content   { padding: 0 16px; }
    .h-hl-l1, .h-hl-l2 { font-size: 36px; }
    .h-hl-dinner, .h-hl-period { font-size: 44px; }
    .h-headline  { margin-bottom: 34px; }
    .h-checklist { flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 34px; }
    .h-dot-sep   { display: none; }
    .h-anchor    { margin-bottom: 34px; }
    .h-anchor-l1, .h-anchor-l2 { font-size: 20px; }
    .h-ctas      { flex-direction: column; gap: 12px; margin-bottom: 45px; }
    .h-btn       { width: 100%; text-align: center; font-size: 16px; padding: 14px 32px; }
    .h-proof     { padding: 24px 0; }
    .h-proof-qualifier { font-size: 9px; letter-spacing: 0.06em; margin-bottom: 2px; }
    .h-proof-num    { font-size: 32px; line-height: 1; }
    .h-proof-prefix { font-size: 10px; }
    .h-proof-unit   { font-size: 10px; margin-top: 1px; }
    .h-proof-divider { height: 50px; background: rgba(237,232,218,0.10); }
  }
`;

/* ─── Strikethrough — Framer reveal, thinner + more transparent ── */
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
        transition={{ delay, duration: 0.42, ease: E }}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "rgba(245, 127, 32, 0.22)",
          transformOrigin: "left",
          borderRadius: "1px",
        }}
      />
    </span>
  );
}

export default function HeroReveal() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    return () => {
      window.dispatchEvent(new CustomEvent("hero-ui-hidden"));
    };
  }, []);

  return (
    <>
      <style>{CSS}</style>

      <section id="hero" className="h-section">

        {/* ── Inline SVG grain texture ─────────────────────── */}
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
          <motion.div
            className="h-headline"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0, duration: 0.5, ease: E }}
          >
            <div className="h-hl-l1">You didn&apos;t leave home</div>

            <div className="h-hl-l2">
              <span className="h-hl-to">to</span>{" "}
              <span className="h-hl-stress">stress about</span>
            </div>

            <div className="h-hl-l3">
              <span className="h-hl-dinner-wrap">
                <span className="h-hl-dinner">dinner</span>

                {/* Hand-drawn underline — pathLength draws left→right */}
                <svg
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: -10,
                    right: -10,
                    height: 11,
                    overflow: "visible",
                    display: "block",
                  }}
                >
                  <motion.path
                    d="M2,7 C30,4 65,10 100,6 C135,2 170,9 198,6"
                    stroke="#f57f20"
                    strokeWidth="2.8"
                    fill="none"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{
                      pathLength: { delay: 0.55, duration: 0.70, ease: E },
                      opacity:    { delay: 0.55, duration: 0.01 },
                    }}
                  />
                </svg>
              </span>
              <span className="h-hl-period">.</span>
            </div>
          </motion.div>

          {/* 2 ── Strikethrough checklist */}
          <motion.div
            className="h-checklist"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4, ease: E }}
          >
            <span className="h-check-item">
              No apps to scroll
              <Strike delay={0.9}  rotation={-1}   />
            </span>
            <span className="h-dot-sep" aria-hidden="true">·</span>
            <span className="h-check-item">
              No groceries to buy
              <Strike delay={1.1}  rotation={0.5}  />
            </span>
            <span className="h-dot-sep" aria-hidden="true">·</span>
            <span className="h-check-item">
              No recipes to follow
              <Strike delay={1.3}  rotation={-0.8} />
            </span>
          </motion.div>

          {/* 3 ── Anchor / payoff */}
          <motion.div
            className="h-anchor"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.5, ease: E }}
          >
            <p className="h-anchor-l1">A new dish, every night.</p>
            <p className="h-anchor-l2">
              Delivered{" "}
              <span className="h-anchor-emph">WARM</span>
              {" "}to your{" "}
              <span className="h-anchor-emph">DORM</span>.
            </p>
          </motion.div>

          {/* 4 ── CTA Buttons */}
          <motion.div
            className="h-ctas"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.9, duration: 0.4, ease: E }}
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

          {/* 5 ── Proof bar — 3 columns */}
          <motion.div
            className="h-proof"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.3, duration: 0.4, ease: E }}
          >
            <div className="h-proof-col">
              <span className="h-proof-qualifier">Starting from</span>
              <div className="h-proof-num-row">
                <span className="h-proof-prefix">AED</span>
                <span className="h-proof-num">17</span>
              </div>
              <span className="h-proof-unit">/meal</span>
            </div>

            <div className="h-proof-divider" />

            <div className="h-proof-col">
              <span className="h-proof-qualifier">More than</span>
              <div className="h-proof-num-row">
                <span className="h-proof-num">48</span>
              </div>
              <span className="h-proof-unit">dishes</span>
            </div>

            <div className="h-proof-divider" />

            <div className="h-proof-col">
              <span className="h-proof-qualifier">Delivering to</span>
              <div className="h-proof-num-row">
                <span className="h-proof-num">6</span>
              </div>
              <span className="h-proof-unit">dorms</span>
            </div>
          </motion.div>

        </div>
      </section>
    </>
  );
}
