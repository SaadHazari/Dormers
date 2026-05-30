'use client'

/**
 * DormWarsTour — first-visit guided walkthrough for the Dorm Wars hub.
 *
 * Four spotlight steps mapped to the hub's four reward surfaces, in the
 * order a new user should mentally absorb them: Cycle → Lifetime → Streak
 * chest → Side quests. Tour ends with a consent dialog where the user
 * picks "Don't show again" (writes the DB flag) or "Maybe later" (closes
 * the tour but leaves the flag NULL so it returns next session).
 *
 * Targets are looked up by `[data-tour="..."]` selectors so the hub markup
 * stays decoupled from tour internals — moving a column doesn't require
 * touching this file.
 *
 * Skip-tour (×, ESC, click outside) jumps straight to the consent step so
 * the opt-out is always one click away regardless of how the user exits.
 *
 * Mobile + desktop share the same spotlight logic; the tooltip auto-flips
 * above/below the target based on viewport space and caps its width with
 * side-margins so it never escapes the screen.
 */

import { forwardRef, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { BODY, OG } from '../../_shared/tokens'
import { markDormWarsTourCompleted } from './tour-actions'

interface TourStep {
  selector: string
  title:    string
  body:     string
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="cycle-rewards"]',
    title:    'Your current cycle',
    body:     'Every meal pushes you through milestones. Hit them and AED lands in your wallet for this cycle.',
  },
  {
    selector: '[data-tour="lifetime-rewards"]',
    title:    'Lifetime rewards',
    body:     'Your career stats across every cycle. Higher tiers unlock perks like early access and bigger rewards.',
  },
  {
    selector: '[data-tour="streak-chest"]',
    title:    'Weekly streak chest',
    body:     'Eat 8 days in a row to open a chest. Mystery cash or a week-long doubler — you never know what drops.',
  },
  {
    selector: '[data-tour="side-quests"]',
    title:    'Side quests',
    body:     'Bonus AED for things you’d do anyway: leave a review, wrap your cycle, refer a friend.',
  },
]

// 0..3 = spotlight steps, 4 = consent dialog
const CONSENT_STEP = STEPS.length

interface TooltipPlacement {
  top:       number
  left:      number
  arrow:     'top' | 'bottom'
  arrowLeft: number
}

interface SpotlightRect {
  top:    number
  left:   number
  width:  number
  height: number
}

const SPOTLIGHT_PAD     = 8
const TOOLTIP_WIDTH     = 320
const TOOLTIP_GAP       = 14
const VIEWPORT_MARGIN   = 16

export function DormWarsTour({ onComplete }: { onComplete: () => void }) {
  const [step,     setStep]     = useState(0)
  const [rect,     setRect]     = useState<SpotlightRect | null>(null)
  const [pending,  startMarking] = useTransition()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltip,  setTooltip]  = useState<TooltipPlacement | null>(null)

  const onConsent = step === CONSENT_STEP

  // Measure the target element for the current step. Scrolls the element
  // into view first so the cutout doesn't land off-screen.
  useLayoutEffect(() => {
    if (onConsent) { setRect(null); setTooltip(null); return }

    const target = document.querySelector<HTMLElement>(STEPS[step].selector)
    if (!target) {
      // Target missing (page changed, gated view) — bail to consent so the
      // user isn't trapped in a broken tour.
      setStep(CONSENT_STEP)
      return
    }

    // Wrappers use `display: contents` to stay invisible to layout so they
    // don't break the parent grid/flex sizing. That makes their own bounding
    // rect collapse to zero — fall back to the first element child, which is
    // the real visible box we want to spotlight.
    const measurable = (target.firstElementChild as HTMLElement | null) ?? target
    measurable.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Measure on next frame so post-scroll layout is stable.
    const measure = () => {
      const r = measurable.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const raf = requestAnimationFrame(measure)

    window.addEventListener('resize', measure)
    window.addEventListener('scroll',  measure, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll',  measure)
    }
  }, [step, onConsent])

  // Position the tooltip relative to the measured rect. Flips above/below
  // based on which side has more space; caps horizontal position so the
  // card never overflows the viewport on mobile.
  useLayoutEffect(() => {
    if (!rect || onConsent) { setTooltip(null); return }
    const vpW = window.innerWidth
    const vpH = window.innerHeight
    const cardH = tooltipRef.current?.getBoundingClientRect().height ?? 160

    const cutoutTop    = rect.top - SPOTLIGHT_PAD
    const cutoutBottom = rect.top + rect.height + SPOTLIGHT_PAD
    const spaceBelow   = vpH - cutoutBottom
    const spaceAbove   = cutoutTop
    const placeBelow   = spaceBelow >= cardH + TOOLTIP_GAP || spaceBelow >= spaceAbove

    const width = Math.min(TOOLTIP_WIDTH, vpW - VIEWPORT_MARGIN * 2)
    const idealLeft   = rect.left + rect.width / 2 - width / 2
    const maxLeft     = vpW - width - VIEWPORT_MARGIN
    const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(idealLeft, maxLeft))
    const top         = placeBelow ? cutoutBottom + TOOLTIP_GAP : cutoutTop - cardH - TOOLTIP_GAP

    // Arrow points back at the cutout's horizontal centre.
    const arrowLeft = Math.max(16, Math.min(width - 16, rect.left + rect.width / 2 - clampedLeft))

    setTooltip({ top, left: clampedLeft, arrow: placeBelow ? 'top' : 'bottom', arrowLeft })
  }, [rect, onConsent])

  // ESC anywhere in the tour → jump to consent so opting out is one key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onConsent) onComplete()
        else setStep(CONSENT_STEP)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConsent, onComplete])

  // Lock body scroll while the tour is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const next = () => setStep(s => (s + 1 < STEPS.length ? s + 1 : CONSENT_STEP))
  const skip = () => setStep(CONSENT_STEP)

  const persistAndClose = () => {
    startMarking(async () => {
      await markDormWarsTourCompleted()
      onComplete()
    })
  }

  // Backdrop with the spotlight cutout (an invisible div with a huge
  // box-shadow paints the dim everywhere except over the target).
  const cutout = !onConsent && rect ? {
    top:    rect.top    - SPOTLIGHT_PAD,
    left:   rect.left   - SPOTLIGHT_PAD,
    width:  rect.width  + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
  } : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dorm Wars walkthrough"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        pointerEvents: 'auto',
      }}
      onClick={(e) => {
        // Click on backdrop (not on cutout / not on tooltip) → skip to consent.
        if (e.target === e.currentTarget) skip()
      }}
    >
      {cutout ? (
        <div
          aria-hidden
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: cutout.top, left: cutout.left,
            width: cutout.width, height: cutout.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(9,24,37,0.72)',
            transition: 'top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease',
            pointerEvents: 'none',
          }}
        />
      ) : !onConsent ? (
        // Target measuring — show solid backdrop in the meantime so the
        // user doesn't see a flash of un-dimmed UI.
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,24,37,0.72)' }} />
      ) : null}

      {!onConsent && tooltip && (
        <TourTooltip
          ref={tooltipRef}
          step={step}
          totalSteps={STEPS.length}
          title={STEPS[step].title}
          body={STEPS[step].body}
          placement={tooltip}
          onNext={next}
          onSkip={skip}
        />
      )}

      {onConsent && (
        <ConsentDialog
          pending={pending}
          onDontShowAgain={persistAndClose}
          onMaybeLater={onComplete}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Tooltip card — anchored to a measured target with an arrow pointing back
// at it. Width adapts to viewport on mobile.

interface TourTooltipProps {
  step: number
  totalSteps: number
  title: string
  body: string
  placement: TooltipPlacement
  onNext: () => void
  onSkip: () => void
}

const TourTooltip = forwardRef<HTMLDivElement, TourTooltipProps>(function TourTooltip(
  { step, totalSteps, title, body, placement, onNext, onSkip },
  ref,
) {
  const isLast = step === totalSteps - 1
  const arrowSide = placement.arrow
  return (
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: placement.top, left: placement.left,
          width: Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
          padding: '16px 18px 14px',
          borderRadius: 'var(--radius-md)',
          background: '#ffffff',
          border: '1px solid var(--ds-border-soft)',
          boxShadow: '0 16px 40px rgba(9,24,37,0.28)',
          fontFamily: BODY,
          transition: 'top 220ms ease, left 220ms ease',
        }}
      >
        {/* Arrow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top:  arrowSide === 'top'    ? -7 : 'auto',
            bottom: arrowSide === 'bottom' ? -7 : 'auto',
            left: placement.arrowLeft - 7,
            width: 14, height: 14,
            background: '#ffffff',
            transform: 'rotate(45deg)',
            borderLeft:   arrowSide === 'top'    ? '1px solid var(--ds-border-soft)' : '0',
            borderTop:    arrowSide === 'top'    ? '1px solid var(--ds-border-soft)' : '0',
            borderRight:  arrowSide === 'bottom' ? '1px solid var(--ds-border-soft)' : '0',
            borderBottom: arrowSide === 'bottom' ? '1px solid var(--ds-border-soft)' : '0',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: OG,
          }}>
            Step {step + 1} of {totalSteps}
          </span>
          <button
            type="button"
            aria-label="Skip tour"
            onClick={onSkip}
            style={{
              background: 'none', border: 0, cursor: 'pointer',
              padding: 2, color: 'var(--ds-fg-tint)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div style={{
          fontSize: 15, fontWeight: 800, color: 'var(--ds-fg)',
          lineHeight: 1.25, marginBottom: 6,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 13, color: 'var(--ds-fg-muted)',
          lineHeight: 1.45, marginBottom: 14,
        }}>
          {body}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: 'none', border: 0, cursor: 'pointer',
              padding: '6px 4px',
              fontFamily: BODY, fontSize: 12, fontWeight: 600,
              color: 'var(--ds-fg-tint)',
              letterSpacing: '0.04em',
            }}
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onNext}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-pill)',
              background: OG, color: '#fff', border: 0,
              fontFamily: BODY, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(245,127,32,0.30)',
            }}
          >
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    )
  }
)

// ────────────────────────────────────────────────────────────────────────
// Consent dialog — final step. Two CTAs: persist the opt-out (writes DB)
// vs. close without persisting (tour returns next session).

function ConsentDialog({
  pending, onDontShowAgain, onMaybeLater,
}: {
  pending: boolean
  onDontShowAgain: () => void
  onMaybeLater: () => void
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(9,24,37,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: VIEWPORT_MARGIN,
      }}
    >
      <div
        style={{
          width: 'min(380px, 100%)',
          padding: '24px 22px 20px',
          borderRadius: 'var(--radius-md)',
          background: '#ffffff',
          border: '1px solid var(--ds-border-soft)',
          boxShadow: '0 20px 50px rgba(9,24,37,0.32)',
          fontFamily: BODY,
        }}
      >
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: OG, marginBottom: 8,
        }}>
          Tour complete
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: 'var(--ds-fg)',
          lineHeight: 1.25, marginBottom: 6,
        }}>
          That&rsquo;s the rundown.
        </div>
        <div style={{
          fontSize: 13, color: 'var(--ds-fg-muted)',
          lineHeight: 1.5, marginBottom: 20,
        }}>
          Want a refresher next time you visit, or are you all set?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onDontShowAgain}
            disabled={pending}
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-pill)',
              background: OG, color: '#fff', border: 0,
              fontFamily: BODY, fontSize: 14, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: pending ? 'wait' : 'pointer',
              opacity: pending ? 0.7 : 1,
              boxShadow: '0 6px 18px rgba(245,127,32,0.35)',
            }}
          >
            {pending ? 'Saving…' : 'Don’t show again'}
          </button>
          <button
            type="button"
            onClick={onMaybeLater}
            disabled={pending}
            style={{
              padding: '11px 18px',
              borderRadius: 'var(--radius-pill)',
              background: 'transparent', color: 'var(--ds-fg-muted)',
              border: '1px solid var(--ds-border-soft)',
              fontFamily: BODY, fontSize: 13, fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
