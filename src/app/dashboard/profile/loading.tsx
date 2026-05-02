import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function ProfileLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Skel style={{ width: 160, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 240, height: 32, marginBottom: 28 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'center' }}>
              <Skel radius={4} style={{ height: 14 }} />
              <Skel tone="subtle" radius={10} style={{ height: 44 }} />
            </div>
          ))}
        </div>
      </div>
      <SkeletonKeyframes />
      <style>{`
        @media (max-width: 1024px) {
          [style*="grid-template-columns: 160px 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
