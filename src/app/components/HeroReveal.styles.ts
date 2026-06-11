/**
 * Scoped CSS for HeroReveal — extracted from the component file so the
 * 300-line stylesheet doesn't dominate the JSX/animation logic. Imported
 * back in via a single `<style>{HERO_REVEAL_CSS}</style>` tag.
 *
 * Class prefix `.h-*` is intentional — keeps overrides scoped via the
 * existing `html.light .h-*` rules in globals.css.
 */
export const HERO_REVEAL_CSS = `
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

  /* ── Typewriter cursor (HeroCloser) — light theme flips via globals.css ── */
  .h-type-cursor {
    color: rgba(237, 232, 218, 0.55);
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
