'use client'

// Pile-by-pile pickup, shown when the load is too big to photograph in one go.
//
// He photographs each pile on its own, then one wide shot of the whole lot.
// The pile photos are what count the boxes; the wide shot only counts how many
// piles there are. That separation is the entire point — nothing is counted in
// two places, so nothing can be double counted. See
// contexts/ops/domain/stack-pickup.ts for why two angles of the same pile
// would have been worse than one photo.

import { useState, useRef } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'

const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const ORANGE  = '#f57f20'
const EMERALD = '#10b981'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

interface Pile { index: number; count: number }

interface Props {
  opsTokenId: string
  deliveryDateIso: string
  riderCount: number
  maxPerStack: number
  onAccepted: () => void
  onCancel: () => void
}

type Phase = 'piles' | 'overview'

export function StackPickup({
  opsTokenId, deliveryDateIso, riderCount, maxPerStack, onAccepted, onCancel,
}: Props) {
  const [piles, setPiles] = useState<Pile[]>([])
  const [phase, setPhase] = useState<Phase>('piles')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'bad'; title: string; body: string } | null>(null)
  const pileInputRef = useRef<HTMLInputElement>(null)
  const overviewInputRef = useRef<HTMLInputElement>(null)

  const runningTotal = piles.reduce((a, p) => a + p.count, 0)

  async function post(form: FormData) {
    form.append('opsToken', opsTokenId)
    form.append('dateIso', deliveryDateIso)
    form.append('riderCount', String(riderCount))
    const res = await fetch('/api/ops/pickup-stack', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`server ${res.status}`)
    return res.json()
  }

  async function handlePile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const form = new FormData()
      form.append('phase', 'stack')
      form.append('photo', await resizeToJpeg(file), 'pile.jpg')
      const data = await post(form)

      if (data.outcome === 'stack_unreadable') {
        setMessage({
          tone: 'bad',
          title: `Could not count pile ${data.stackIndex}`,
          body: `${data.reason} Lay that pile out so no box is behind another, then shoot it again.`,
        })
        return
      }
      setPiles(prev => [...prev, { index: data.stackIndex, count: data.count }])
      setMessage({
        tone: 'info',
        title: `Pile ${data.stackIndex}: ${data.count} ${data.count === 1 ? 'box' : 'boxes'}`,
        body: 'Next pile, or take the wide shot when every pile is done.',
      })
    } catch (err) {
      setMessage({ tone: 'bad', title: 'Could not save that pile', body: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleOverview(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const form = new FormData()
      form.append('phase', 'overview')
      form.append('photo', await resizeToJpeg(file), 'overview.jpg')
      const data = await post(form)

      if (data.accepted) {
        onAccepted()
        return
      }
      setMessage({ tone: 'bad', ...explain(data, piles.length) })
      setPhase('piles')
    } catch (err) {
      setMessage({ tone: 'bad', title: 'Could not save the wide shot', body: err instanceof Error ? err.message : 'Try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (busy) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('phase', 'reset')
      await post(form)
      setPiles([])
      setPhase('piles')
      setMessage({ tone: 'info', title: 'Started over', body: 'Photograph the first pile.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60, backgroundColor: '#000000ee',
        display: 'flex', flexDirection: 'column', padding: '20px 16px', gap: '14px',
        fontFamily: FONT, overflowY: 'auto',
      }}
    >
      <div style={{ color: '#ffffff' }}>
        <div style={{ fontSize: '20px', fontWeight: 800 }}>
          {riderCount} boxes is too many for one photo
        </div>
        <div style={{ fontSize: '14px', color: '#cbd5e1', marginTop: '4px' }}>
          Split them into piles of about {maxPerStack}. Photograph each pile on its
          own with no box hidden behind another, then one wide shot of all the piles
          together.
        </div>
      </div>

      {/* ── Piles counted so far ─────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: BG_CARD, borderRadius: '12px', padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}
      >
        {piles.length === 0 ? (
          <div style={{ fontSize: '14px', color: MUTED }}>No piles photographed yet.</div>
        ) : (
          <>
            {piles.map(p => (
              <div key={p.index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', color: NAVY }}>
                <span>Pile {p.index}</span>
                <strong>{p.count}</strong>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, color: NAVY }}>
              <span>So far</span>
              <span>{runningTotal}</span>
            </div>
          </>
        )}
      </div>

      {message && (
        <div
          style={{
            backgroundColor: message.tone === 'bad' ? '#7f1d1d' : '#0f2f22',
            border: `1px solid ${message.tone === 'bad' ? '#ef4444' : EMERALD}`,
            borderRadius: '12px', padding: '12px 16px', color: '#ffffff',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 700 }}>{message.title}</div>
          <div style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '2px' }}>{message.body}</div>
        </div>
      )}

      <input ref={pileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePile} style={{ display: 'none' }} />
      <input ref={overviewInputRef} type="file" accept="image/*" capture="environment" onChange={handleOverview} style={{ display: 'none' }} />

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={() => !busy && pileInputRef.current?.click()}
          disabled={busy}
          style={btn(busy ? BORDER : ORANGE)}
        >
          {busy && phase === 'piles' ? 'Counting…' : `Photograph pile ${piles.length + 1}`}
        </button>

        <button
          onClick={() => { setPhase('overview'); if (!busy) overviewInputRef.current?.click() }}
          disabled={busy || piles.length === 0}
          style={btn(busy || piles.length === 0 ? BORDER : EMERALD)}
        >
          {busy && phase === 'overview' ? 'Checking…' : `Wide shot of all ${piles.length || ''} piles`}
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleReset} disabled={busy} style={ghost()}>Start over</button>
          <button onClick={onCancel} disabled={busy} style={ghost()}>Back</button>
        </div>
      </div>
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    width: '100%', height: '56px', borderRadius: '12px', border: 'none',
    backgroundColor: bg, color: '#ffffff', fontSize: '17px', fontWeight: 700,
    fontFamily: FONT, cursor: bg === BORDER ? 'default' : 'pointer',
  }
}
function ghost(): React.CSSProperties {
  return {
    flex: 1, height: '46px', borderRadius: '12px', border: '1px solid #ffffff55',
    backgroundColor: 'transparent', color: '#ffffff', fontSize: '14px',
    fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
  }
}

/** Turn a reconcile outcome into something a rider can act on. */
function explain(data: { outcome: string; total: number | null; overviewStackCount: number | null; target: number }, photographed: number) {
  switch (data.outcome) {
    case 'stack_missing':
      return {
        title: `The wide shot shows ${data.overviewStackCount} piles, you photographed ${photographed}`,
        body: 'Photograph the pile you missed, then take the wide shot again.',
      }
    case 'stack_extra':
      return {
        title: `You photographed ${photographed} piles but the wide shot shows ${data.overviewStackCount}`,
        body: 'Looks like a pile got shot twice. Start over so the piles line up.',
      }
    case 'overview_unreadable':
      return {
        title: 'Could not tell the piles apart',
        body: 'Move the piles further apart and take the wide shot again.',
      }
    case 'total_mismatch':
      return {
        title: `The piles add up to ${data.total}, not ${data.target}`,
        body: 'Either a pile was counted wrong or the van really is short. Recount, or start over and reshoot.',
      }
    default:
      return { title: 'Could not confirm the load', body: 'Try the wide shot again.' }
  }
}
