'use client'

// Pile-by-pile pickup, shown when the load is too big to photograph in one go.
//
// Every photo is taken first and submitted TOGETHER in one call. That was
// measured against a call per photo on identical images: same accuracy, 2.5x
// faster, and 2.4x fewer images over the wire, because a per-photo loop
// re-ships the whole box reference set every single time.
//
// The model is never asked for a total. It reports a count per photo and the
// arithmetic happens on the server, which is what stops the wide shot's boxes
// being added to the pile photos that contain those same boxes.
//
// Each card carries a drawing of the shot it wants and IS the button that
// opens the camera. The rules here are physical — no box behind another, real
// gaps between piles — and a picture of the arrangement lands before a
// sentence about it does.

import { useState, useRef } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'
import { PileGuide, WideShotGuide } from './PhotoGuides'

const BG_CARD = '#ffffff'
const NAVY    = '#091825'
const MUTED   = '#64748b'
const BORDER  = '#e5e2dc'
const ORANGE  = '#f57f20'
const EMERALD = '#10b981'
const FONT    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

interface Shot { blob: Blob; url: string }

interface Props {
  opsTokenId: string
  deliveryDateIso: string
  riderCount: number
  maxPerStack: number
  onAccepted: () => void
  onCancel: () => void
}

export function StackPickup({
  opsTokenId, deliveryDateIso, riderCount, maxPerStack, onAccepted, onCancel,
}: Props) {
  // One slot per pile. Starts at two because a load that reached this screen is
  // never one pile, and an empty slot is the thing he taps.
  const [piles, setPiles] = useState<(Shot | null)[]>([null, null])
  const [wide, setWide] = useState<Shot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ bad: boolean; title: string; body: string } | null>(null)
  const [badPiles, setBadPiles] = useState<number[]>([])

  // One input per slot so the camera returns to the card that opened it.
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  const filled = piles.filter(Boolean).length
  const ready = filled >= 1 && piles.every(p => p !== null) && wide !== null

  async function capture(key: string, file: File | undefined) {
    if (!file) return
    const blob = await resizeToJpeg(file)
    const shot = { blob, url: URL.createObjectURL(blob) }
    if (key === 'wide') {
      if (wide) URL.revokeObjectURL(wide.url)
      setWide(shot)
    } else {
      const i = Number(key)
      setPiles(prev => {
        const next = [...prev]
        if (next[i]) URL.revokeObjectURL(next[i]!.url)
        next[i] = shot
        return next
      })
      setBadPiles(prev => prev.filter(n => n !== i + 1))
    }
    setMessage(null)
  }

  function addPile() {
    setPiles(prev => [...prev, null])
  }

  function removePile(i: number) {
    setPiles(prev => {
      if (prev[i]) URL.revokeObjectURL(prev[i]!.url)
      return prev.filter((_, j) => j !== i)
    })
  }

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setMessage(null)
    setBadPiles([])
    try {
      const form = new FormData()
      form.append('phase', 'batch')
      form.append('opsToken', opsTokenId)
      form.append('dateIso', deliveryDateIso)
      form.append('riderCount', String(riderCount))
      piles.forEach((p, i) => form.append('piles', p!.blob, `pile-${i + 1}.jpg`))
      form.append('overview', wide!.blob, 'wide.jpg')

      const res = await fetch('/api/ops/pickup-stack', { method: 'POST', body: form })
      if (!res.ok) {
        setMessage({ bad: true, title: `Could not send that (${res.status})`, body: 'Your photos are still here. Tap Check again.' })
        return
      }
      const data = await res.json()
      if (data.accepted) { onAccepted(); return }

      setBadPiles(data.unreadableStacks ?? [])
      setMessage({ bad: true, ...explain(data, piles.length) })
    } catch {
      setMessage({ bad: true, title: 'No connection', body: 'Your photos are still here. Tap Check again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60, backgroundColor: '#00060cfa',
        display: 'flex', flexDirection: 'column', fontFamily: FONT, overflowY: 'auto',
      }}
    >
      <div style={{ padding: '20px 16px 8px', color: '#ffffff' }}>
        <div style={{ fontSize: '20px', fontWeight: 800 }}>
          {/* He can reach this screen two ways: pushed here by the load being
              over the limit, or by choosing to split a smaller one. Telling a
              man who just chose to split six boxes that six is "too many" reads
              as the app arguing with him. */}
          {riderCount > maxPerStack
            ? `${riderCount} boxes is too many for one photo`
            : `Splitting ${riderCount} ${riderCount === 1 ? 'box' : 'boxes'} into piles`}
        </div>
        <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
          {riderCount > maxPerStack
            ? `Split them into piles of about ${maxPerStack}. `
            : 'Make as many piles as you like. '}
          One photo per pile, then one wide shot of the lot. Tap a card to shoot it.
        </div>
      </div>

      <div style={{ padding: '8px 16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {piles.map((p, i) => (
          <GuideCard
            key={i}
            title={`Pile ${i + 1}`}
            hint={`Up to ${maxPerStack} boxes, stacked so every lid edge shows. Nothing behind anything.`}
            shot={p}
            flagged={badPiles.includes(i + 1)}
            guide={<PileGuide />}
            onTap={() => inputs.current[String(i)]?.click()}
            onRemove={piles.length > 1 ? () => removePile(i) : undefined}
            inputRef={el => { inputs.current[String(i)] = el }}
            onFile={f => capture(String(i), f)}
            disabled={busy}
          />
        ))}

        <button
          onClick={addPile}
          disabled={busy}
          style={{
            height: '46px', borderRadius: '12px', border: `1px dashed ${ORANGE}`,
            backgroundColor: 'transparent', color: ORANGE, fontSize: '15px',
            fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          + Add another pile
        </button>

        <GuideCard
          title="Wide shot of every pile"
          hint="Step back so all the piles are in one frame, with clear gaps between them. This one counts the piles, not the boxes."
          shot={wide}
          flagged={false}
          guide={<WideShotGuide />}
          onTap={() => inputs.current['wide']?.click()}
          inputRef={el => { inputs.current['wide'] = el }}
          onFile={f => capture('wide', f)}
          disabled={busy}
        />

        {message && (
          <div
            style={{
              backgroundColor: message.bad ? '#7f1d1d' : '#0f2f22',
              border: `1px solid ${message.bad ? '#ef4444' : EMERALD}`,
              borderRadius: '12px', padding: '12px 16px', color: '#ffffff',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700 }}>{message.title}</div>
            <div style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '2px' }}>{message.body}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={submit}
          disabled={!ready || busy}
          style={{
            width: '100%', height: '56px', borderRadius: '12px', border: 'none',
            backgroundColor: !ready || busy ? '#334155' : EMERALD, color: '#ffffff',
            fontSize: '17px', fontWeight: 700, fontFamily: FONT,
            cursor: !ready || busy ? 'default' : 'pointer',
          }}
        >
          {busy
            ? 'Counting…'
            : ready
              ? `Check all ${piles.length} piles`
              : wide
                ? 'Photograph every pile first'
                : 'Take the wide shot to finish'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            height: '44px', borderRadius: '12px', border: '1px solid #ffffff44',
            backgroundColor: 'transparent', color: '#ffffff', fontSize: '14px',
            fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  )
}

/** A card that shows the shot it wants, and is itself the shutter. */
function GuideCard({
  title, hint, shot, flagged, guide, onTap, onRemove, inputRef, onFile, disabled,
}: {
  title: string
  hint: string
  shot: Shot | null
  flagged: boolean
  guide: React.ReactNode
  onTap: () => void
  onRemove?: () => void
  inputRef: (el: HTMLInputElement | null) => void
  onFile: (f: File | undefined) => void
  disabled: boolean
}) {
  return (
    <div
      style={{
        backgroundColor: BG_CARD,
        border: flagged ? '2px solid #ef4444' : `1px solid ${BORDER}`,
        borderRadius: '14px', padding: '12px', display: 'flex', gap: '12px',
        alignItems: 'center',
      }}
    >
      <button
        onClick={() => !disabled && onTap()}
        disabled={disabled}
        aria-label={`Photograph ${title}`}
        style={{
          width: '104px', height: '78px', flexShrink: 0, padding: 0,
          border: 'none', borderRadius: '10px', overflow: 'hidden',
          backgroundColor: '#050d15', cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {shot
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={shot.url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : guide}
      </button>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: NAVY }}>{title}</div>
        <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px', lineHeight: 1.35 }}>
          {flagged ? 'Could not be counted. Lay it out flat and shoot it again.' : hint}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={() => !disabled && onTap()}
            disabled={disabled}
            style={{
              border: 'none', background: 'none', padding: 0, color: ORANGE,
              fontSize: '13px', fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
            }}
          >
            {shot ? 'Retake' : 'Take photo'}
          </button>
          {onRemove && (
            <button
              onClick={() => !disabled && onRemove()}
              disabled={disabled}
              style={{
                border: 'none', background: 'none', padding: 0, color: MUTED,
                fontSize: '13px', fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f) }}
        style={{ display: 'none' }}
      />
    </div>
  )
}

/** Turn a reconcile outcome into something a driver can act on. */
function explain(
  data: { outcome: string; total: number | null; overviewStackCount: number | null; target: number; unreadableStacks?: number[] },
  photographed: number,
) {
  switch (data.outcome) {
    case 'stack_unreadable': {
      const list = (data.unreadableStacks ?? []).join(' and ')
      return {
        title: `Could not count pile ${list}`,
        body: 'Lay that pile out so no box sits behind another, then shoot it again. Everything else is saved.',
      }
    }
    case 'stack_missing':
      return {
        title: `The wide shot shows ${data.overviewStackCount} piles, you photographed ${photographed}`,
        body: 'Add a card for the pile you missed and photograph it.',
      }
    case 'stack_extra':
      return {
        title: `You photographed ${photographed} piles but the wide shot shows ${data.overviewStackCount}`,
        body: 'Looks like one pile got shot twice. Remove the duplicate card.',
      }
    case 'overview_unreadable':
      return {
        title: 'Could not tell the piles apart',
        body: 'Move the piles further apart and retake the wide shot.',
      }
    case 'total_mismatch':
      return {
        title: `The piles add up to ${data.total}, not ${data.target}`,
        body: 'Either a pile was counted wrong or the van really is short. Recount and reshoot whichever pile looks off.',
      }
    default:
      return { title: 'Could not confirm the load', body: 'Try the check again.' }
  }
}
