import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function HistoryLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Skel style={{ width: 180, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 260, height: 32, marginBottom: 28 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skel key={i} radius={14} style={{ height: 96 }} />
          ))}
        </div>
      </div>
      <SkeletonKeyframes />
    </div>
  )
}
