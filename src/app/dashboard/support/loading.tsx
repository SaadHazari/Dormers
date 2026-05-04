import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function SupportLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header — eyebrow, h1, supporting line */}
        <div style={{ marginBottom: 36 }}>
          <Skel style={{ width: 140, height: 12, marginBottom: 12 }} />
          <Skel tone="strong" style={{ width: 'min(100%, 420px)', height: 44, marginBottom: 14 }} />
          <Skel style={{ width: 'min(100%, 520px)', height: 14 }} />
        </div>

        {/* Section 1 — three equal cards */}
        <div style={{ marginBottom: 36 }}>
          <Skel style={{ width: 110, height: 12, marginBottom: 18 }} />
          <div className="support-grid-skel" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skel key={i} radius={16} style={{ height: 260 }} />
            ))}
          </div>
        </div>

        {/* Section 2 — FAQ */}
        <div>
          <Skel style={{ width: 160, height: 12, marginBottom: 18 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skel key={i} tone="subtle" radius={12} style={{ height: 56 }} />
            ))}
          </div>
        </div>
      </div>
      <SkeletonKeyframes />
      <style>{`
        @media (max-width: 1024px) {
          .support-grid-skel { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
