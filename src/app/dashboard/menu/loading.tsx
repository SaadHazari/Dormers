import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function MenuLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Skel style={{ width: 240, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 320, height: 28, marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <Skel key={i} radius={14} style={{ height: 140 }} />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <Skel tone="subtle" radius={16} style={{ height: 280 }} />
          <Skel tone="subtle" radius={16} style={{ height: 280 }} />
        </div>
      </div>
      <SkeletonKeyframes />
      <style>{`
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(7, 1fr)"] > *,
          [style*="grid-template-columns: repeat(2, 1fr)"] > * {
            grid-column: span 1 !important;
          }
          [style*="grid-template-columns: repeat(7, 1fr)"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="grid-template-columns: repeat(2, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
