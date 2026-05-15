'use client'

/**
 * Fixed full-viewport vignette. Corners 12-15% darker than NV center.
 * Inner 60% of viewport stays unaffected per UI-SPEC Atmosphere Stack.
 * No animation — reduced-motion gate not needed.
 *
 * Uses backgroundColor + backgroundImage longhand pair (auto-memory rule:
 * never mix `background` shorthand with `backgroundImage` in inline styles).
 */
export function Vignette() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 8000,
        backgroundColor: 'transparent',
        backgroundImage: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.13) 100%)',
      }}
    />
  )
}
