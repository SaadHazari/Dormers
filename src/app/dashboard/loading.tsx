import { Skel, SkeletonTrees } from './_shared/Skeleton'

// Shared loading skeleton for every dashboard sub-route.
// Desktop: greeting → hero (full width) → plan + week rail → refer card.
// Phone: the greeting beside the burger, the dinner ticket, the plan progress
// card and the two action pills — the shape MobileHome hydrates into.
export default function DashboardLoading() {
  return (
    <SkeletonTrees
      desktop={
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ marginBottom: 20 }}>
            <Skel style={{ width: 220, height: 18 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
            <Skel tone="strong" radius={16} style={{ gridColumn: 'span 12', height: 460 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 4', height: 360 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 8', height: 360 }} />
            <Skel tone="subtle" radius={16} style={{ gridColumn: 'span 12', height: 120 }} />
          </div>
        </div>
      }
      mobile={
        <div>
          {/* Greeting beside the shell's floating burger */}
          <div style={{ minHeight: 'var(--burger-size, 44px)', paddingLeft: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: 16 }}>
            <Skel tone="strong" radius={6} style={{ width: 170, height: 16, marginBottom: 6 }} />
            <Skel radius={6} style={{ width: 220, height: 12 }} />
          </div>
          <div>
            {/* Dinner ticket */}
            <Skel tone="strong" radius={24} style={{ height: 380, marginBottom: 14, background: 'rgba(9,24,37,0.22)' }} />
            {/* Plan progress card */}
            <Skel tone="subtle" radius={22} style={{ height: 330, marginBottom: 14 }} />
            {/* Plan a skip · Pause */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Skel radius={999} style={{ height: 60 }} />
              <Skel radius={999} style={{ height: 60 }} />
            </div>
          </div>
        </div>
      }
    />
  )
}
