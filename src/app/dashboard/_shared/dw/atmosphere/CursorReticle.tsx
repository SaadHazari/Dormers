'use client'

/**
 * Mounts a global CSS rule that swaps the cursor on interactive surfaces to a small OG reticle.
 * Hotspot offset 10,10 (center of 20×20 SVG per RESEARCH Code Examples + Pitfall 5).
 * Reduced-motion: reverts to default `cursor: pointer`.
 *
 * Selector list comes from UI-SPEC Cursor Reticle: button, a, [role="button"], dorm-wars interactive cards.
 * Scoped by `.dw-reticle` opt-in class (mounted on the dorm-wars root) to avoid leaking into other dashboard pages.
 */
export function CursorReticle() {
  // SVG URI: 20×20 viewBox, OG (#f57f20 → URL-encoded %23f57f20) cross-hair + center dot, 1.5px stroke.
  const RETICLE_URI = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='9' fill='none' stroke='%23f57f20' stroke-width='1.5'/><line x1='10' y1='2' x2='10' y2='6' stroke='%23f57f20' stroke-width='1.5'/><line x1='10' y1='14' x2='10' y2='18' stroke='%23f57f20' stroke-width='1.5'/><line x1='2' y1='10' x2='6' y2='10' stroke='%23f57f20' stroke-width='1.5'/><line x1='14' y1='10' x2='18' y2='10' stroke='%23f57f20' stroke-width='1.5'/><circle cx='10' cy='10' r='1' fill='%23f57f20'/></svg>"
  return (
    <style>{`
      .dw-reticle button,
      .dw-reticle a,
      .dw-reticle [role="button"],
      .dw-reticle .dwm-drop-btn,
      .dw-reticle .dwm-ladder-card,
      .dw-reticle .dwm-trophy,
      .dw-reticle .dwm-action-card {
        cursor: url("${RETICLE_URI}") 10 10, pointer;
      }
      @media (prefers-reduced-motion: reduce) {
        .dw-reticle button,
        .dw-reticle a,
        .dw-reticle [role="button"],
        .dw-reticle .dwm-drop-btn,
        .dw-reticle .dwm-ladder-card,
        .dw-reticle .dwm-trophy,
        .dw-reticle .dwm-action-card {
          cursor: pointer;
        }
      }
    `}</style>
  )
}
