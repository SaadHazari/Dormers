import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function SupportLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Skel style={{ width: 180, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 280, height: 32, marginBottom: 24 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} radius={14} style={{ height: 120 }} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skel key={i} tone="subtle" radius={12} style={{ height: 56 }} />
          ))}
        </div>
      </div>
      <SkeletonKeyframes />
      <style>{`
        @media (max-width: 1024px) {
          [style*="grid-template-columns: repeat(3, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
