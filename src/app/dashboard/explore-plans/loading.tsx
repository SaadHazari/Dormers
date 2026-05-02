import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function ExplorePlansLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Skel style={{ width: 220, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 380, height: 32, marginBottom: 28 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} radius={18} style={{ height: 460 }} />
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
