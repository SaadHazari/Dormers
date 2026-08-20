'use client'

// Drawings of what each pickup photo should look like, shown on the card the
// driver taps to open the camera.
//
// They exist because the counting rules are physical, not verbal. "No box
// hidden behind another" and "leave gaps between the piles" are instructions a
// tired person skims past at 5pm; a picture of the arrangement is understood
// before it is read. Every refusal these prevent is a retake the driver does
// not have to make.
//
// The boxes are drawn side-on with the orange lid band showing, because that
// band is literally what the counter looks for — one visible edge per box.

// The box body has to sit clearly OFF the backdrop or the drawing reads as
// floating orange lines rather than stacked boxes. Body is the lighter navy
// from the brand family, backdrop is nearly black, and each box carries a thin
// outline so touching boxes still read as separate.
const BODY     = '#25455e'
const OUTLINE  = '#4d7a99'
const BACKDROP = '#050d15'
const GROUND   = '#1b3346'
const ORANGE   = '#f57f20'
const CREAM    = '#f5f0e8'

/** One box, side on: navy body under its orange lid edge. */
function Box({ x, y, w, h, className }: { x: number; y: number; w: number; h: number; className?: string }) {
  return (
    <g className={className}>
      <rect x={x} y={y + 3} width={w} height={h - 3} rx="1.5" fill={BODY} stroke={OUTLINE} strokeWidth="0.6" />
      <rect x={x} y={y} width={w} height="3.5" rx="1.5" fill={ORANGE} />
    </g>
  )
}

/**
 * A single pile: boxes stacked with every lid edge in view.
 * The boxes ease in one after another, which is the point being made — each
 * one is separately visible, so each one can be counted.
 */
export function PileGuide() {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 120 90" width="100%" height="100%" role="img" aria-label="One pile of boxes, every lid edge visible">
      <rect x="0" y="0" width="120" height="90" rx="8" fill={BACKDROP} />
      <rect x="18" y="78" width="84" height="3" rx="1.5" fill={GROUND} />
      {rows.map(i => (
        <Box key={i} className={`pg-box pg-b${i}`} x={30} y={62 - i * 15} w={60} h={13} />
      ))}
      <style jsx>{`
        .pg-box { animation: pgIn 3.2s ease-in-out infinite; opacity: 0; }
        .pg-b0 { animation-delay: 0s; }
        .pg-b1 { animation-delay: 0.22s; }
        .pg-b2 { animation-delay: 0.44s; }
        .pg-b3 { animation-delay: 0.66s; }
        @keyframes pgIn {
          0%        { opacity: 0; transform: translateY(-7px); }
          14%, 82%  { opacity: 1; transform: translateY(0); }
          100%      { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pg-box { animation: none; opacity: 1; }
        }
      `}</style>
    </svg>
  )
}

/**
 * The wide shot: several piles with real gaps between them.
 * The gaps are what the counter reads, so they are what the drawing
 * emphasises — they widen and settle rather than the boxes moving.
 */
export function WideShotGuide() {
  const piles = [
    { x: 12, boxes: 3 },
    { x: 48, boxes: 4 },
    { x: 84, boxes: 2 },
  ]
  return (
    <svg viewBox="0 0 120 90" width="100%" height="100%" role="img" aria-label="Several piles of boxes with gaps between them">
      <rect x="0" y="0" width="120" height="90" rx="8" fill={BACKDROP} />
      <rect x="6" y="78" width="108" height="3" rx="1.5" fill={GROUND} />
      {piles.map((p, pi) => (
        <g key={pi} className={`ws-pile ws-p${pi}`}>
          {Array.from({ length: p.boxes }, (_, i) => (
            <Box key={i} x={p.x} y={64 - i * 11} w={24} h={9} />
          ))}
        </g>
      ))}
      {/* The gaps, drawn as the thing that matters */}
      <line x1="40" y1="42" x2="46" y2="42" className="ws-gap ws-g0" stroke={CREAM} strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="76" y1="42" x2="82" y2="42" className="ws-gap ws-g1" stroke={CREAM} strokeWidth="1.5" strokeDasharray="2 2" />
      <style jsx>{`
        .ws-pile { animation: wsPop 3.4s ease-in-out infinite; }
        .ws-p0 { animation-delay: 0s; }
        .ws-p1 { animation-delay: 0.28s; }
        .ws-p2 { animation-delay: 0.56s; }
        .ws-gap { animation: wsGap 3.4s ease-in-out infinite; opacity: 0; }
        .ws-g0 { animation-delay: 0.9s; }
        .ws-g1 { animation-delay: 1.05s; }
        @keyframes wsPop {
          0%        { opacity: 0.25; }
          16%, 84%  { opacity: 1; }
          100%      { opacity: 1; }
        }
        @keyframes wsGap {
          0%, 24%   { opacity: 0; }
          40%, 84%  { opacity: 0.85; }
          100%      { opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-pile { animation: none; opacity: 1; }
          .ws-gap  { animation: none; opacity: 0.85; }
        }
      `}</style>
    </svg>
  )
}
