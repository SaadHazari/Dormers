'use client'

// Pile-by-pile pickup, for a load too big to photograph in one frame.
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

import { useState } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'
import { PileGuide, WideShotGuide } from './PhotoGuides'
import { OPS, PillButton, Banner, ScreenTitle, ShotCard } from './ui'

interface Shot { blob: Blob; url: string }

interface Props {
  opsTokenId: string
  deliveryDateIso: string
  riderCount: number
  maxPerStack: number
  onAccepted: () => void
  onBack: () => void
}

/** How many pile slots to start with: enough for the load, never fewer than 2
 *  (a load on this screen is never one pile), and the rider can add more. */
function startingPiles(riderCount: number, maxPerStack: number): number {
  return Math.max(2, Math.ceil(riderCount / Math.max(1, maxPerStack)))
}

export function StackPickup({
  opsTokenId, deliveryDateIso, riderCount, maxPerStack, onAccepted, onBack,
}: Props) {
  const [piles, setPiles] = useState<(Shot | null)[]>(
    () => Array.from({ length: startingPiles(riderCount, maxPerStack) }, () => null),
  )
  const [wide, setWide] = useState<Shot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null)
  const [badPiles, setBadPiles] = useState<number[]>([])

  const filled = piles.filter(Boolean).length
  const ready = filled >= 1 && piles.every(p => p !== null) && wide !== null

  async function capture(key: 'wide' | number, file: File | undefined) {
    if (!file) return
    const blob = await resizeToJpeg(file)
    const shot = { blob, url: URL.createObjectURL(blob) }
    if (key === 'wide') {
      if (wide) URL.revokeObjectURL(wide.url)
      setWide(shot)
    } else {
      setPiles(prev => {
        const next = [...prev]
        if (next[key]) URL.revokeObjectURL(next[key]!.url)
        next[key] = shot
        return next
      })
      setBadPiles(prev => prev.filter(n => n !== key + 1))
    }
    setMessage(null)
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
        setMessage({ title: `Could not send that (${res.status})`, body: 'Your photos are still here. Tap Check again.' })
        return
      }
      const data = await res.json()
      if (data.accepted) { onAccepted(); return }

      setBadPiles(data.unreadableStacks ?? [])
      setMessage(explain(data, piles.length))
    } catch {
      setMessage({ title: 'No connection', body: 'Your photos are still here. Tap Check again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh', backgroundColor: OPS.bg, fontFamily: OPS.font,
        padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: '16px',
      }}
    >
      <ScreenTitle
        eyebrow="Pickup, step 2 of 2"
        // He can reach this screen two ways: pushed here by the load being
        // over the limit, or by choosing to split a smaller one. Telling a
        // man who just chose to split six boxes that six is "too many" reads
        // as the app arguing with him.
        title={riderCount > maxPerStack
          ? `${riderCount} boxes, in piles`
          : `Splitting ${riderCount} ${riderCount === 1 ? 'box' : 'boxes'} into piles`}
        sub={`${riderCount > maxPerStack ? `Split the load into piles of about ${maxPerStack}. ` : 'Make as many piles as you like. '}One photo per pile, then one wide shot of the lot. Tap a card to shoot it.`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {piles.map((p, i) => (
          <ShotCard
            key={i}
            label={`Pile ${i + 1}`}
            hint={`Up to ${maxPerStack} boxes, stacked so every lid edge shows. Nothing behind anything.`}
            shot={p}
            flagged={badPiles.includes(i + 1)}
            guide={<PileGuide />}
            onRemove={piles.length > 1 ? () => removePile(i) : undefined}
            onFile={f => capture(i, f)}
            disabled={busy}
          />
        ))}

        <button
          onClick={() => !busy && setPiles(prev => [...prev, null])}
          disabled={busy}
          style={{
            height: '48px', borderRadius: '999px', border: `1.5px dashed ${OPS.orangeLine}`,
            backgroundColor: 'transparent', color: OPS.orange, fontSize: '13px',
            fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            fontFamily: OPS.font, cursor: busy ? 'default' : 'pointer',
          }}
        >
          Add another pile
        </button>

        <ShotCard
          label="Wide shot of every pile"
          hint="Step back so all the piles are in one frame, with clear gaps between them. This one counts the piles, not the boxes."
          shot={wide}
          guide={<WideShotGuide />}
          onFile={f => capture('wide', f)}
          disabled={busy}
        />

        {message && <Banner tone="danger" title={message.title} body={message.body} />}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <PillButton onClick={submit} disabled={!ready || busy}>
          {busy
            ? 'Counting the piles'
            : ready
              ? `Check all ${piles.length} piles and start`
              : wide
                ? 'Photograph every pile first'
                : 'Take the wide shot to finish'}
        </PillButton>
        <PillButton variant="quiet" small disabled={busy} onClick={onBack}>
          Back to the count
        </PillButton>
      </div>
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
        body: `Either a pile was counted wrong or the van really is short. Recount and reshoot whichever pile looks off. If the van really has ${data.total}, go back and fix your count.`,
      }
    case 'rider_disagrees':
      return {
        title: `The list now says ${data.target}, not your count`,
        body: 'Go back to the count and check it again.',
      }
    default:
      return { title: 'Could not confirm the load', body: 'Try the check again.' }
  }
}
