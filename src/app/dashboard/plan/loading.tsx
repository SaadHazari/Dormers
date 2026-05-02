import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function PlanLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Skel style={{ width: 200, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 360, height: 32, marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
          <Skel radius={16} style={{ gridColumn: 'span 8', height: 320 }} />
          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 4', height: 320 }} />

          <Skel tone="subtle" radius={14} style={{ gridColumn: 'span 12', height: 80 }} />

          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 6', height: 220 }} />
          <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 6', height: 220 }} />
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
