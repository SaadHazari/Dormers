"use client";

import { useEffect } from "react";

/* ─────────────────────────────────────────────────────────────────
 * All hero styles are scoped with the h- prefix to avoid collisions.
 * CSS-only animations — no Framer Motion in this component.
 * ───────────────────────────────────────────────────────────────── */
const CSS = `
  /* ── Keyframes ───────────────────────────────────────────────── */
  @keyframes h-fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes h-strikeReveal {
    from { clip-path: inset(0 100% 0 0); }
    to   { clip-path: inset(0 0%   0 0); }
  }
  @keyframes h-scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1);    }
  }

  /* ── Section ─────────────────────────────────────────────────── */
  .h-section {
    background: linear-gradient(180deg, #091825 0%, #1e3a4f 60%, #162f40 100%);
    min-height: 100vh;
    position: relative;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  /* ── SVG grain overlay ───────────────────────────────────────── */
  .h-grain {
    position: absolute;
    inset: 0;
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Content container ───────────────────────────────────────── */
  .h-content {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 0 80px;
  }

  /* ── 1. Headline ─────────────────────────────────────────────── */
  .h-headline {
    margin-bottom: 48px;
    opacity: 0;
    animation: h-fadeUp 500ms ease-out forwards;
    animation-delay: 0ms;
  }
  .h-hl-l1 {
    font-family: Montserrat, sans-serif;
    font-weight: 700;
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
  .h-hl-to {
    font-weight: 700;
    color: #ede8da;
    margin-right: 0.22em;
  }
  .h-hl-stress {
    font-weight: 800;
    color: #f57f20;
    font-style: italic;
  }
  .h-hl-l3 {
    margin: 0;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
  /* "dinner" wrapper — underline via ::after */
  .h-hl-dinner-wrap {
    position: relative;
    display: inline-block;
    padding-bottom: 8px;
  }
  .h-hl-dinner-wrap::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: -10px;
    right: -10px;
    height: 4px;
    background: #f57f20;
    border-radius: 2px;
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

  /* ── 2. Strikethrough checklist ──────────────────────────────── */
  .h-checklist {
    margin-bottom: 48px;
    display: flex;
    align-items: center;
    opacity: 0;
    animation: h-fadeUp 400ms ease-out forwards;
    animation-delay: 500ms;
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
  /* Strikethrough line — revealed by clip-path animation */
  .h-check-item::after {
    content: '';
    position: absolute;
    height: 3px;
    background: #f57f20;
    top: 50%;
    left: -4px;
    right: -4px;
    border-radius: 2px;
    clip-path: inset(0 100% 0 0);
    animation-name: h-strikeReveal;
    animation-duration: 350ms;
    animation-timing-function: ease-out;
    animation-fill-mode: forwards;
  }
  .h-check-1::after { animation-delay: 900ms;  transform: translateY(-50%) rotate(-1deg);  }
  .h-check-2::after { animation-delay: 1100ms; transform: translateY(-50%) rotate(0.5deg); }
  .h-check-3::after { animation-delay: 1300ms; transform: translateY(-50%) rotate(-0.8deg);}

  .h-dot-sep {
    color: rgba(237, 232, 218, 0.55);
    font-size: 18px;
    margin: 0 20px;
    user-select: none;
    line-height: 1;
  }

  /* ── 3. Anchor / payoff ──────────────────────────────────────── */
  .h-anchor {
    margin-bottom: 48px;
    opacity: 0;
    animation: h-fadeUp 500ms ease-out forwards;
    animation-delay: 1500ms;
  }
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
  .h-anchor-emph {
    font-weight: 800;
    color: #f57f20;
    text-transform: uppercase;
  }

  /* ── 4. CTA Buttons ──────────────────────────────────────────── */
  .h-ctas {
    margin-bottom: 64px;
    display: flex;
    align-items: center;
    gap: 16px;
    opacity: 0;
    animation: h-scaleIn 400ms ease-out forwards;
    animation-delay: 1900ms;
  }
  .h-btn {
    font-family: Montserrat, sans-serif;
    font-size: 18px;
    padding: 16px 40px;
    border-radius: 50px;
    cursor: pointer;
    line-height: 1;
    transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
    white-space: nowrap;
  }
  .h-btn-primary {
    background: #f57f20;
    color: #ede8da;
    font-weight: 700;
    border: none;
  }
  .h-btn-primary:hover {
    background: #e06d10;
    transform: scale(1.03);
  }
  .h-btn-secondary {
    background: transparent;
    color: #ede8da;
    font-weight: 600;
    border: 2px solid rgba(237, 232, 218, 0.4);
  }
  .h-btn-secondary:hover {
    border-color: #ede8da;
    background: rgba(237, 232, 218, 0.08);
    transform: scale(1.03);
  }

  /* ── 5. Proof bar ────────────────────────────────────────────── */
  .h-proof {
    border-top: 1px solid rgba(237, 232, 218, 0.15);
    padding: 32px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    opacity: 0;
    animation: h-fadeUp 400ms ease-out forwards;
    animation-delay: 2300ms;
  }
  .h-proof-col { text-align: left; }
  .h-proof-label {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 11px;
    color: rgba(237, 232, 218, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 4px;
    display: block;
  }
  .h-proof-val-row {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .h-proof-currency {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: #f57f20;
    line-height: 1;
  }
  .h-proof-num {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 48px;
    color: #f57f20;
    line-height: 1;
  }
  .h-proof-unit {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 14px;
    color: rgba(237, 232, 218, 0.55);
    line-height: 1;
  }

  /* ── Responsive: Tablet (641–1024px) ─────────────────────────── */
  @media (max-width: 1024px) {
    .h-content   { padding: 0 48px; }
    .h-hl-l1     { font-size: 52px; }
    .h-hl-l2     { font-size: 52px; }
    .h-hl-dinner { font-size: 64px; }
    .h-hl-period { font-size: 64px; }
  }

  /* ── Responsive: Mobile (≤640px) ─────────────────────────────── */
  @media (max-width: 640px) {
    .h-content   { padding: 0 24px; }
    .h-hl-l1     { font-size: 36px; }
    .h-hl-l2     { font-size: 36px; }
    .h-hl-dinner { font-size: 44px; }
    .h-hl-period { font-size: 44px; }
    .h-headline  { margin-bottom: 34px; }

    /* Stack checklist vertically, hide dots */
    .h-checklist {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 34px;
    }
    .h-dot-sep   { display: none; }

    .h-anchor        { margin-bottom: 34px; }
    .h-anchor-l1,
    .h-anchor-l2     { font-size: 20px; }

    /* Stack CTAs full-width */
    .h-ctas {
      flex-direction: column;
      gap: 12px;
      margin-bottom: 45px;
    }
    .h-btn {
      width: 100%;
      text-align: center;
      font-size: 16px;
      padding: 14px 32px;
    }

    .h-proof-num  { font-size: 36px; }
    .h-proof-label { font-size: 10px; }
  }
`;

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

        {/* ── Inline SVG grain texture (6% opacity) ───────────── */}
        <div aria-hidden className="h-grain">
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: "block" }}
          >
            <defs>
              <filter id="h-noise-filter" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.9"
                  numOctaves="4"
                  stitchTiles="stitch"
                />
              </filter>
            </defs>
            <rect
              width="100%"
              height="100%"
              filter="url(#h-noise-filter)"
              fill="white"
            />
          </svg>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        <div className="h-content">

          {/* 1 ── Headline */}
          <div className="h-headline">
            {/* Line 1 */}
            <div className="h-hl-l1">You didn&apos;t leave home</div>

            {/* Line 2 */}
            <div className="h-hl-l2">
              <span className="h-hl-to">to</span>
              {" "}
              <span className="h-hl-stress">stress about</span>
            </div>

            {/* Line 3 — "dinner." larger, underline on "dinner" only */}
            <div className="h-hl-l3">
              <span className="h-hl-dinner-wrap">
                <span className="h-hl-dinner">dinner</span>
              </span>
              <span className="h-hl-period">.</span>
            </div>
          </div>

          {/* 2 ── Strikethrough checklist */}
          <div className="h-checklist">
            <span className="h-check-item h-check-1">No apps to scroll</span>
            <span className="h-dot-sep" aria-hidden="true">·</span>
            <span className="h-check-item h-check-2">No groceries to buy</span>
            <span className="h-dot-sep" aria-hidden="true">·</span>
            <span className="h-check-item h-check-3">No recipes to follow</span>
          </div>

          {/* 3 ── Anchor / payoff */}
          <div className="h-anchor">
            <p className="h-anchor-l1">A new dish, every night.</p>
            <p className="h-anchor-l2">
              Delivered{" "}
              <span className="h-anchor-emph">WARM</span>
              {" "}to your{" "}
              <span className="h-anchor-emph">DORM</span>.
            </p>
          </div>

          {/* 4 ── CTA Buttons */}
          <div className="h-ctas">
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
          </div>

          {/* 5 ── Proof bar */}
          <div className="h-proof">

            {/* Col 1 — Price */}
            <div className="h-proof-col">
              <span className="h-proof-label">Starting from</span>
              <div className="h-proof-val-row">
                <span className="h-proof-currency">AED</span>
                <span className="h-proof-num">17</span>
                <span className="h-proof-unit">/meal</span>
              </div>
            </div>

            {/* Col 2 — Dishes */}
            <div className="h-proof-col">
              <span className="h-proof-num">48</span>
              <span className="h-proof-label" style={{ marginTop: "4px" }}>
                Dishes across menu
              </span>
            </div>

            {/* Col 3 — Dorms */}
            <div className="h-proof-col">
              <span className="h-proof-num">6</span>
              <span className="h-proof-label" style={{ marginTop: "4px" }}>
                Dorms served
              </span>
            </div>

          </div>

        </div>
      </section>
    </>
  );
}
