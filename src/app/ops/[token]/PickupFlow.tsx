'use client'

// The pickup, as two steps in the order the server already checks them:
//
//   1. COUNT — the rider counts the van with his own eyes and commits a
//      number, blind. This is the strongest signal in the whole chain of
//      custody and it is checked FIRST (a precheck round-trip), because a
//      short van has a different remedy than a bad photo and it should not
//      cost him a wasted picture to find out.
//   2. PHOTO — one guided shot for a load that fits in a frame, or the
//      pile-by-pile flow for one that does not. The AI count gates the day.
//
// The old UI ran these in the opposite order (photo first, count typed into
// the review overlay), which is why every rejection arrived after the work
// instead of before it.

import { useState } from 'react'
import { resizeToJpeg } from '@/shared/image-resize'
import { STACK_MODE_THRESHOLD } from '@/contexts/ops/domain/stack-pickup'
import { StackPickup } from './StackPickup'
import { PileGuide } from './PhotoGuides'
import { OPS, PillButton, CountStepper, Banner, ScreenTitle, ShotCard, TickSplash } from './ui'

interface PickupResponse {
  ok: boolean
  accepted?: boolean
  alreadyOpen?: boolean
  outcome?: 'accepted' | 'rider_disagrees' | 'needs_stacks' | 'retake' | 'needs_assertion' | 'uncountable'
  allowAssert?: boolean
  riderCount?: number
  attempt?: number
  attemptsLeft?: number
  maxAttempts?: number
  maxPerStack?: number
  expectedTotal?: number
  kitchenTotal?: number | null
  target?: number
  geminiCount?: number | null
  flagged?: boolean
}

interface PrecheckResponse {
  ok: boolean
  alreadyOpen?: boolean
  match?: boolean
  target?: number
  kitchenTotal?: number | null
  needsStacks?: boolean
  maxPerStack?: number
}

type Step = 'count' | 'photo' | 'piles'

export function PickupFlow({
  opsTokenId,
  deliveryDateIso,
  onAccepted,
}: {
  opsTokenId: string
  deliveryDateIso: string
  /** The day is open. flagged = it opened on the rider's word, not the camera's. */
  onAccepted: (flagged: boolean) => void
}) {
  const [step, setStep] = useState<Step>('count')
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the rider's count disagrees with the kitchen. Cleared on recount.
  const [mismatch, setMismatch] = useState<{ target: number; kitchenSaid: boolean } | null>(null)
  // The rider chose to stand by a disagreeing count. Carried into the submit.
  const [asserted, setAsserted] = useState(false)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [result, setResult] = useState<PickupResponse | null>(null)
  const [maxPerStack, setMaxPerStack] = useState(STACK_MODE_THRESHOLD)
  const [splash, setSplash] = useState<{ flagged: boolean } | null>(null)

  const n = parseInt(count, 10)
  const countValid = !isNaN(n) && n > 0

  function finish(flagged: boolean) {
    setSplash({ flagged })
    setTimeout(() => onAccepted(flagged), 1600)
  }

  // ── Step 1 submit: check the count before any photo work ─────────────────
  async function commitCount() {
    if (!countValid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ops/pickup-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opsToken: opsTokenId, dateIso: deliveryDateIso, riderCount: n }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data: PrecheckResponse = await res.json()
      if (data.alreadyOpen) { onAccepted(false); return }
      if (data.maxPerStack) setMaxPerStack(data.maxPerStack)
      if (data.match === false && data.target !== undefined) {
        setMismatch({ target: data.target, kitchenSaid: data.kitchenTotal != null })
        return
      }
      setStep(data.needsStacks ? 'piles' : 'photo')
    } catch {
      // The precheck is a courtesy, not a gate — the server re-runs the same
      // comparison at submit. Offline or erroring, the flow just moves on.
      setStep(n > STACK_MODE_THRESHOLD ? 'piles' : 'photo')
    } finally {
      setBusy(false)
    }
  }

  function standByCount() {
    setAsserted(true)
    setMismatch(null)
    setStep('photo')
  }

  function recount() {
    setMismatch(null)
    setAsserted(false)
    setCount('')
  }

  // ── Step 2 submit ────────────────────────────────────────────────────────
  async function submitPhoto(withAssert = false) {
    if (!shot || busy) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('photo', shot.blob, 'pickup.jpg')
      form.append('opsToken', opsTokenId)
      form.append('dateIso', deliveryDateIso)
      form.append('riderCount', String(n))
      if (asserted || withAssert) form.append('riderAsserted', 'true')

      const res = await fetch('/api/ops/confirm-pickup', { method: 'POST', body: form })
      if (!res.ok) {
        setError(`Could not check the photo (${res.status}). Tap the button to try again.`)
        return
      }
      const data: PickupResponse = await res.json()
      if (!data.ok) {
        setError('Could not check the photo. Tap the button to try again.')
        return
      }

      if (data.accepted) { finish(data.flagged === true); return }

      setResult(data)
      if (data.outcome === 'needs_stacks') {
        if (data.maxPerStack) setMaxPerStack(data.maxPerStack)
        setStep('piles')
        return
      }
      if (data.outcome === 'rider_disagrees') {
        // The target moved between precheck and submit (kitchen count landed).
        setMismatch({ target: data.target ?? 0, kitchenSaid: data.kitchenTotal != null })
        setStep('count')
        return
      }
      if (data.outcome === 'retake') {
        setShot(null)
      }
    } catch {
      setError('No connection. Your photo is still here, tap the button to try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    const blob = await resizeToJpeg(f)
    if (shot) URL.revokeObjectURL(shot.url)
    setShot({ blob, url: URL.createObjectURL(blob) })
    setError(null)
    // A fresh photo reopens the normal submit: a new shot that finally agrees
    // is always allowed to open the day, even after the assert offer.
    setResult(null)
  }

  const page: React.CSSProperties = {
    minHeight: '100dvh',
    backgroundColor: OPS.bg,
    fontFamily: OPS.font,
    padding: '24px 16px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  }

  if (splash) {
    return (
      <TickSplash
        title="Pickup confirmed"
        sub={splash.flagged
          ? 'The day is open on your word. The owner has been told.'
          : 'Counts agree. Off you go.'}
      />
    )
  }

  // ── Pile-by-pile flow ────────────────────────────────────────────────────
  if (step === 'piles') {
    return (
      <StackPickup
        opsTokenId={opsTokenId}
        deliveryDateIso={deliveryDateIso}
        riderCount={n}
        maxPerStack={maxPerStack}
        onAccepted={() => finish(false)}
        onBack={() => { setStep('count'); setAsserted(false) }}
      />
    )
  }

  // ── Step 1: count ────────────────────────────────────────────────────────
  if (step === 'count') {
    return (
      <div style={page}>
        <ScreenTitle
          eyebrow="Pickup, step 1 of 2"
          title="Count the boxes"
          sub="Count every box the kitchen hands you, then put the number here. Count them yourself, do not ask the kitchen."
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
          <CountStepper value={count} onChange={v => { setCount(v); setMismatch(null) }} disabled={busy} />
        </div>

        {mismatch && (
          <Banner
            tone="danger"
            title={`${mismatch.kitchenSaid ? 'The kitchen packed' : 'The list says'} ${mismatch.target}. You counted ${n}.`}
            body={`Recount the van slowly. If you really only have ${n}, say so and the owner will be told straight away.`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              <PillButton variant="navy" small onClick={recount}>Count again</PillButton>
              <PillButton variant="ghost" small onClick={standByCount}>{`I really have ${n}`}</PillButton>
            </div>
          </Banner>
        )}

        {error && (
          <div style={{ fontSize: '13px', color: OPS.danger, textAlign: 'center' }}>{error}</div>
        )}

        {!mismatch && (
          <PillButton onClick={commitCount} disabled={!countValid || busy}>
            {busy ? 'Checking your count' : 'That is my count'}
          </PillButton>
        )}
      </div>
    )
  }

  // ── Step 2: single photo ─────────────────────────────────────────────────
  const attemptsLeft = result?.attemptsLeft
  const assertOffered = result?.allowAssert === true && (result.outcome === 'needs_assertion' || result.outcome === 'uncountable')

  return (
    <div style={page}>
      <ScreenTitle
        eyebrow="Pickup, step 2 of 2"
        title="Photograph the load"
        sub={`One photo of all ${n} boxes. Lay them so every lid edge shows, nothing hidden behind anything.`}
      />

      {result?.outcome === 'retake' && !shot && (
        <Banner
          tone="danger"
          title={result.geminiCount == null
            ? 'The boxes could not be counted in that photo'
            : `That photo shows ${result.geminiCount}, not ${result.target ?? n}`}
          body={`Lay the boxes out so every one is visible, then shoot again. ${attemptsLeft ?? 0} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`}
        />
      )}

      <ShotCard
        hero
        label={shot ? 'Your pickup photo' : 'All the boxes, one photo'}
        hint={shot ? 'Happy with it? Send it for the count below.' : 'Stack them like the drawing, every lid edge visible.'}
        guide={<PileGuide />}
        shot={shot}
        disabled={busy}
        onFile={onFile}
      />

      {assertOffered && (
        <Banner
          tone="warn"
          title={result?.outcome === 'uncountable'
            ? 'The photo could not be read'
            : 'The photo keeps seeing a different number'}
          body={`No more retakes. If you are sure all ${n} boxes are in the van, confirm below. The owner will be told either way.`}
        >
          <PillButton variant="navy" small disabled={busy} onClick={() => submitPhoto(true)} style={{ marginTop: '6px' }}>
            {busy ? 'Confirming' : `All ${n} are in the van`}
          </PillButton>
        </Banner>
      )}

      {asserted && !assertOffered && (
        <Banner
          tone="warn"
          title={`Starting with ${n}, on your word`}
          body="Your count does not match the list, so the owner will be told when the day opens. The photo is kept as evidence."
        />
      )}

      {error && (
        <div style={{ fontSize: '13px', color: OPS.danger, textAlign: 'center' }}>{error}</div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!assertOffered && (
          <PillButton onClick={() => submitPhoto()} disabled={!shot || busy}>
            {busy ? 'Counting the boxes' : 'Check my photo and start'}
          </PillButton>
        )}
        {!asserted && !assertOffered && (
          <PillButton variant="ghost" small disabled={busy} onClick={() => setStep('piles')}>
            Will not fit in one photo? Split into piles
          </PillButton>
        )}
        <PillButton variant="quiet" small disabled={busy} onClick={() => { setStep('count'); setResult(null); setError(null) }}>
          Back to the count
        </PillButton>
      </div>
    </div>
  )
}
