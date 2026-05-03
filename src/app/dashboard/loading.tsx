import { Skel, SkeletonKeyframes } from './_shared/Skeleton'

// Shared loading skeleton for every dashboard sub-route. Matches the new
// 4-section layout: hero (full-width) → plan + week rail → refer card.
export default function DashboardLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Greeting line */}
        <div style={{ marginBottom: 20 }}>
          <Skel style={{ width: 220, height: 18 }} />
        </div>

        {/* 4-section grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
          {/* Hero — full width */}
          <Skel tone="strong" radius={16} style={{ gridColumn: 'span 12', height: 460 }} />
          {/* Plan + Week rail */}
          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 4', height: 360 }} />
          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 8', height: 360 }} />
          {/* Refer card */}
          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 12', height: 120 }} />
        </div>
      </div>
      <SkeletonKeyframes />
      <style>{`
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(12, 1fr)"] > * {
            grid-column: span 12 !important;
          }
        }
      `}</style>
    </div>
  )
}
