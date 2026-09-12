import { Skel, SkeletonTrees, SkelMobileHeader } from '../_shared/Skeleton'

// Desktop: title → label / field rows.
// Phone: burger + title, the dark identity card, the security card and the
// what-we-cook card — the shape MobileProfile hydrates into.
export default function ProfileLoading() {
  return (
    <SkeletonTrees
      desktop={
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
      }
      mobile={
        <div>
          <SkelMobileHeader titleWidth={140} />
          <Skel tone="strong" radius={24} style={{ height: 200, marginBottom: 14, background: 'rgba(9,24,37,0.22)' }} />
          <Skel tone="subtle" radius={22} style={{ height: 300, marginBottom: 14 }} />
          <Skel tone="subtle" radius={22} style={{ height: 240, marginBottom: 14 }} />
          <Skel tone="subtle" radius={22} style={{ height: 180 }} />
        </div>
      }
    />
  )
}
