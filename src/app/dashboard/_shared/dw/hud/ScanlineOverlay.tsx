'use client'

/**
 * CRT scanline overlay — scoped to its parent container via absolute positioning + inset:0.
 * Drift animation: backgroundPositionY 0 → 2px over 8s linear infinite (UI-SPEC Atmosphere Stack CRT row).
 * D-15 reduced-motion: drift paused via @media (prefers-reduced-motion: reduce).
 *
 * Parent must have `position: relative` for inset:0 to work correctly.
 * NEVER mount at page root — that would overlay the full page, violating UI-SPEC "HUD only".
 */
export function ScanlineOverlay() {
  return (
    <>
      <div
        aria-hidden
        className="dw-scanline"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundColor: 'transparent',
          backgroundImage: 'repeating-linear-gradient(rgba(245,127,32,0.04) 0px, transparent 1px, transparent 2px)',
          mixBlendMode: 'normal',
          borderRadius: 'inherit', // respect rounded corners of parent
        }}
      />
      <style>{`
        .dw-scanline {
          animation: dw-scanline-drift 8s linear infinite;
        }
        @keyframes dw-scanline-drift {
          from { background-position-y: 0; }
          to   { background-position-y: 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dw-scanline { animation: none; }
        }
      `}</style>
    </>
  )
}
