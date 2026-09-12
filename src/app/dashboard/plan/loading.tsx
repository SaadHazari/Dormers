import { Skel, SkeletonTrees, SkelMobileHeader } from '../_shared/Skeleton'

// Desktop: title → current-plan panel + side card → strip → two halves.
// Phone: burger + title, the dark current-plan card, the three-stat row,
// the setup card — the shape MobilePlan hydrates into.
export default function PlanLoading() {
  return (
    <SkeletonTrees
      desktop={
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Skel style={{ width: 200, height: 18, marginBottom: 8 }} />
          <Skel tone="strong" style={{ width: 'min(100%, 360px)', height: 32, marginBottom: 24 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
            <Skel radius={16} style={{ gridColumn: 'span 8', height: 320 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 4', height: 320 }} />
            <Skel tone="subtle" radius={14} style={{ gridColumn: 'span 12', height: 80 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 6', height: 220 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 6', height: 220 }} />
          </div>
        </div>
      }
      mobile={
        <div>
          <SkelMobileHeader titleWidth={120} />
          <Skel tone="strong" radius={24} style={{ height: 280, marginBottom: 12, background: 'rgba(9,24,37,0.22)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skel key={i} tone="subtle" radius={16} style={{ height: 72 }} />
            ))}
          </div>
          <Skel tone="subtle" radius={22} style={{ height: 190, marginBottom: 12 }} />
          <Skel tone="subtle" radius={22} style={{ height: 300 }} />
        </div>
      }
    />
  )
}
