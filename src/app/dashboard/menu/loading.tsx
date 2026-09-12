import { Skel, SkeletonTrees, SkelMobileHeader } from '../_shared/Skeleton'

// Desktop: title → seven-day rail → two panels.
// Phone: burger + title, preference row, the tonight ticket (16:10 photo +
// text), then the two-up THIS WEEK cards — the shape MobileMenu hydrates into.
export default function MenuLoading() {
  return (
    <SkeletonTrees
      desktop={
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
      }
      mobile={
        <div>
          <SkelMobileHeader titleWidth={130} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <Skel style={{ width: 82, height: 14 }} />
            <Skel radius={999} style={{ width: 58, height: 22 }} />
            <Skel style={{ width: 120, height: 14 }} />
          </div>
          {/* Tonight ticket: photo + text block */}
          <Skel tone="strong" radius={24} style={{ height: 520, marginBottom: 22, background: 'rgba(9,24,37,0.22)' }} />
          <Skel style={{ width: 90, height: 12, marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skel key={i} tone="subtle" radius={18} style={{ height: 250 }} />
            ))}
          </div>
        </div>
      }
    />
  )
}
