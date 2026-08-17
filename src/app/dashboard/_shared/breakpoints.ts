// PURE CONSTANTS ONLY — no React import, no 'use client'.
//
// The server-rendered dashboard layout imports COMPACT for its raw <style>
// block, and that pins this file between two failure modes. With 'use client',
// every export becomes a client *reference* when a server component imports it
// and the string does not survive. Without it, importing React hooks here makes
// the server component fail to compile outright ("you're importing a component
// that needs useState"). Both were observed.
//
// So the hook lives in ./use-is-compact.ts behind its own boundary, and this
// file stays importable from anywhere.

/**
 * The dashboard's ONE layout switch.
 *
 * Before this file the shell disagreed with itself: the mobile tree switched on
 * at 768 while the sidebar collapsed to a drawer at 1024, so everything from
 * 769 to 1024 got mobile navigation wrapped around desktop content. Nobody
 * designed that state — it fell out of two rules that disagreed — and it is
 * almost exactly the iPad. See
 * docs/superpowers/specs/2026-08-17-tablet-layout-contract-design.md.
 *
 * WHY ORIENTATION AND NOT A WIDTH. iPad Pro 12.9 in portrait and iPad mini in
 * landscape are BOTH exactly 1024px wide, and they need opposite layouts. No
 * width breakpoint can separate them; measured, both rendered the same page at
 * the same 1399px content height. Orientation is the only signal that tells
 * those two devices apart, which is why it is load-bearing here rather than
 * decorative.
 *
 * WHY THIS IS SAFE. Every viewport that renders correctly today keeps its
 * current layout: phones stay compact (a landscape phone is still under 1024),
 * laptops and desktops stay expanded. The only band that moves is 769-1024,
 * which had no design to protect. That property falls out of the rule itself
 * rather than needing discipline to maintain.
 *
 * ACCEPTED TRADE-OFF. A portrait external monitor 1024-1279 wide gets the
 * compact layout. Rare for this audience, and it still reads as intentional.
 * Deliberately NOT solved with a `pointer: fine` clause — iPadOS reports
 * pointer capabilities inconsistently once a Magic Keyboard is attached, and a
 * misfire there would put a real iPad back in the broken band.
 */

/** Sidebar rail + multi-column content. Laptops, desktops, landscape tablets. */
export const EXPANDED = '(min-width: 1024px) and (orientation: landscape)'

/**
 * The `_mobile` tree + drawer navigation. Phones and every portrait tablet.
 *
 * Exact logical complement of EXPANDED (De Morgan: NOT(A AND B) is
 * NOT-A OR NOT-B), so no viewport can match both or neither. The fractional
 * 1023.98 avoids the dead gap that `max-width: 1023px` would leave on
 * fractional-DPI viewports reporting e.g. 1023.5px.
 */
export const COMPACT = '(max-width: 1023.98px), (orientation: portrait)'

// The matching hook is ./use-is-compact.ts — kept out of this file so a server
// component can import the constants above.
