import { Skel, SkeletonTrees, SkelMobileHeader } from '../_shared/Skeleton'

// Desktop: header → three equal cards → FAQ list.
// Phone: burger + title, the dark Doro spotlight, the WhatsApp line, the
// details card, then FAQ rows — the shape MobileSupport hydrates into.
export default function SupportLoading() {
  return (
    <SkeletonTrees
      desktop={
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ marginBottom: 36 }}>
            <Skel style={{ width: 140, height: 12, marginBottom: 12 }} />
            <Skel tone="strong" style={{ width: 'min(100%, 420px)', height: 44, marginBottom: 14 }} />
            <Skel style={{ width: 'min(100%, 520px)', height: 14 }} />
          </div>
          <div style={{ marginBottom: 36 }}>
            <Skel style={{ width: 110, height: 12, marginBottom: 18 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skel key={i} radius={16} style={{ height: 260 }} />
              ))}
            </div>
          </div>
          <div>
            <Skel style={{ width: 160, height: 12, marginBottom: 18 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skel key={i} tone="subtle" radius={12} style={{ height: 56 }} />
              ))}
            </div>
          </div>
        </div>
      }
      mobile={
        <div>
          <SkelMobileHeader titleWidth={210} />
          <Skel style={{ width: '92%', height: 14, marginBottom: 6 }} />
          <Skel style={{ width: '60%', height: 14, marginBottom: 16 }} />
          <Skel tone="strong" radius={24} style={{ height: 250, marginBottom: 16, background: 'rgba(9,24,37,0.22)' }} />
          <Skel style={{ width: '80%', height: 14, marginBottom: 16, marginInline: 'auto' }} />
          <Skel tone="subtle" radius={22} style={{ height: 230, marginBottom: 24 }} />
          <Skel tone="strong" style={{ width: 190, height: 22, marginBottom: 14 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skel key={i} tone="subtle" radius={10} style={{ height: 50 }} />
            ))}
          </div>
        </div>
      }
    />
  )
}
