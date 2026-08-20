'use client'

// The end of the rider's day. The old app had no ending at all — the last
// drop-off just returned him to the same grid, which is how "am I done?"
// became a WhatsApp to the owner. This screen is the answer: what happened,
// stop by stop, and permission to go home.

import type { DormMapping } from '@/shared/dorm-shapes'
import { dormShapeSvg } from '@/shared/dorm-shapes'
import { OPS, Banner, Tick, PillButton } from './ui'
import type { DormDropoffStatus } from './RiderClient'

export interface StopSummary {
  dormName: string
  dormInfo: DormMapping
  count: number
  status: DormDropoffStatus
  /** A flagged count the rider can still add one photo of evidence to. */
  canAddPhoto: boolean
}

const STATUS_TEXT: Record<Exclude<DormDropoffStatus, 'ready'>, string> = {
  verified: 'Delivered, counts agree',
  manual: 'Recorded by hand',
  mismatch: 'Delivered, count flagged',
  escalated: 'Delivered, photo unreadable',
}

export function RunComplete({
  stops,
  pickupFlagged,
  onAddPhoto,
}: {
  stops: StopSummary[]
  pickupFlagged: boolean
  onAddPhoto: (dormName: string) => void
}) {
  const flagged = stops.filter(s => s.status === 'mismatch' || s.status === 'escalated')
  const totalBoxes = stops.reduce((a, s) => a + s.count, 0)

  return (
    <div
      style={{
        minHeight: '100dvh', backgroundColor: OPS.bg, fontFamily: OPS.font,
        padding: '32px 16px 40px', display: 'flex', flexDirection: 'column', gap: '20px',
      }}
    >
      {/* ── The moment ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '12px 0 4px' }}>
        <div
          style={{
            width: '84px', height: '84px', borderRadius: '50%',
            backgroundColor: OPS.success, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(29,138,48,0.35)',
          }}
        >
          <Tick size={44} />
        </div>
        <div style={{ fontSize: '28px', fontWeight: 800, color: OPS.navy, textAlign: 'center', lineHeight: 1.15 }}>
          All deliveries done
        </div>
        <div style={{ fontSize: '14px', color: OPS.muted, textAlign: 'center' }}>
          {totalBoxes} {totalBoxes === 1 ? 'box' : 'boxes'} across {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
        </div>
      </div>

      {/* ── Stop-by-stop summary ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stops.map(s => {
          const statusColor =
            s.status === 'verified' ? OPS.success
            : s.status === 'manual' ? OPS.orange
            : OPS.danger
          const svg = dormShapeSvg(s.dormInfo.shape, s.dormInfo.number, 34, 'dark', { hideNumber: true })
          return (
            <div
              key={s.dormName}
              style={{
                backgroundColor: OPS.card,
                border: `1px solid ${OPS.border}`,
                borderRadius: '20px',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}
            >
              <div style={{ flexShrink: 0, display: 'flex' }} dangerouslySetInnerHTML={{ __html: svg }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: OPS.navy }}>{s.dormInfo.displayName}</div>
                <div style={{ fontSize: '12px', color: statusColor, fontWeight: 600, marginTop: '2px' }}>
                  {s.status === 'ready' ? '' : STATUS_TEXT[s.status]}
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: OPS.navy, flexShrink: 0 }}>
                {s.count}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Anything the owner now owns ────────────────────────────────── */}
      {flagged.length > 0 && (
        <Banner
          tone="warn"
          title={`${flagged.length} ${flagged.length === 1 ? 'stop is' : 'stops are'} flagged for the owner`}
          body="The food was delivered and the customers were told. The count question is the owner's now, nothing more is needed from you."
        >
          {flagged.filter(s => s.canAddPhoto).map(s => (
            <PillButton key={s.dormName} variant="ghost" small onClick={() => onAddPhoto(s.dormName)}>
              {`Add one more photo at ${s.dormInfo.displayName}`}
            </PillButton>
          ))}
        </Banner>
      )}

      {pickupFlagged && (
        <Banner
          tone="warn"
          title="The pickup opened on your word"
          body="The pickup photo never matched the count, so the owner was told this morning. Nothing more is needed from you."
        />
      )}

      <div style={{ marginTop: 'auto', fontSize: '14px', color: OPS.muted, textAlign: 'center', lineHeight: 1.6 }}>
        All done. You can close this page.
        <br />
        See you tomorrow.
      </div>
    </div>
  )
}
