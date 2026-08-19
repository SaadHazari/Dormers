import { Skel, SkeletonKeyframes } from '../_shared/Skeleton'

export default function CreditLoading() {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: 'var(--font-montserrat), Arial, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Skel style={{ width: 180, height: 18, marginBottom: 8 }} />
        <Skel tone="strong" style={{ width: 220, height: 32, marginBottom: 28 }} />
        <Skel radius={20} style={{ height: 150, marginBottom: 28 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} radius={14} style={{ height: 64 }} />
          ))}
        </div>
      </div>
      <SkeletonKeyframes />
    </div>
  )
}
