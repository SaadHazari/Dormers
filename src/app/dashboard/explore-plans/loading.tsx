import { Skel, SkeletonTrees, SkelMobileHeader } from '../_shared/Skeleton'

// Desktop: title → three plan columns.
// Phone: burger + title, the trust row, the prices row, then plan cards
// stacked full width — the shape MobileExplore hydrates into.
export default function ExplorePlansLoading() {
  return (
    <SkeletonTrees
      desktop={
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Skel style={{ width: 220, height: 18, marginBottom: 8 }} />
          <Skel tone="strong" style={{ width: 'min(100%, 380px)', height: 32, marginBottom: 28 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skel key={i} radius={18} style={{ height: 460 }} />
            ))}
          </div>
        </div>
      }
      mobile={
        <div>
          <SkelMobileHeader titleWidth={160} />
          <Skel style={{ width: '90%', height: 14, marginBottom: 16 }} />
          <Skel tone="subtle" radius={18} style={{ height: 92, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <Skel style={{ width: 64, height: 14 }} />
            <Skel radius={999} style={{ width: 70, height: 24 }} />
            <Skel radius={999} style={{ width: 70, height: 24 }} />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} tone="subtle" radius={24} style={{ height: 340, marginBottom: 12 }} />
          ))}
        </div>
      }
    />
  )
}
