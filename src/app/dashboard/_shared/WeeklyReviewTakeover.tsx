'use client'

import { useEffect, useState, useTransition } from 'react'
import Image, { type StaticImageData } from 'next/image'
import {
    X, Star, Clock, Check, ThumbsUp, ThumbsDown, ChevronLeft, Sparkles, Link2,
} from 'lucide-react'
import { BODY, OG, TIER_POP_TEXT } from './tokens'
import { Eyebrow } from './Eyebrow'

// ── Constants ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5
const DRAFT_KEY_PREFIX = 'dormers:weekly-review:draft:v1:'
const MISS_REASONS = ['Too spicy', 'Too mild', 'Cold', 'Portion size', 'Texture', 'Flavor', 'Other']
const DELIVERY_REASONS = ['Late', 'Wrong time slot', 'Missed entirely', 'Driver issue']
const PACKAGING_REASONS = ['Spilled', 'Wet / soggy', 'Damaged', 'Wrong meal']

// ── Public types ────────────────────────────────────────────────────────────

export interface WeeklyReviewMeal {
    id: string
    name: string
    /** Short day label rendered as a pill on the meal card, e.g. "Mon · Day 15". */
    day: string
    /** Real meal photo — Next.js StaticImageData (from local import) or a URL string. */
    image?: string | StaticImageData
    /** Fallback gradient used as the card background when no image is set. */
    gradient?: string
    /** When true, the meal wasn't delivered (customer skipped) — show greyed,
     *  non-selectable, with a "Skipped" caption. */
    skipped?: boolean
    /** When true, the meal wasn't delivered (subscription was paused that day)
     *  — show greyed, non-selectable, with a "Paused" caption. */
    paused?: boolean
}

export interface WeeklyReviewPayload {
    rating: number
    favorites: string[]
    misses: string[]
    missReasons: Record<string, string[]>
    delivery: 'up' | 'down'
    deliveryReasons: string[]
    packaging: 'up' | 'down'
    packagingReasons: string[]
    kitchenNote: string
}

export type WeeklyReviewSubmitResult =
    | {
          ok: true
          rewardPct: 50 | 100
          // Phase 8K Model C — when this submission was the LAST one for
          // the cycle (threshold reached), this carries the lump-sum AED
          // that just flipped from pending → approved. The takeover uses
          // it to fire the all-cycle celebration. Null when more reviews
          // are still needed; the wallet shows pending instead.
          lumpSumApprovedAed: number | null
          // Next still-pending week (within the late-submit window) on the
          // user's active subscription, after this submission. Drives the
          // post-submit chain — the thank-you screen offers an explicit
          // "Continue to Week N · +AED N" CTA when this is set, so the
          // user picks whether to keep going instead of being teleported.
          nextPendingWeek: number | null
          // AED the next pending week would pay today (5 if still in the
          // 7-day full-reward window, 2 if late). Powers the chain CTA's
          // copy so it states a real number rather than a guess.
          nextPendingWeekAed: number | null
      }
    | { ok: false; error: string }

export interface WeeklyReviewTakeoverProps {
    /** First name used in the opening "How was this week, {name}?" headline. */
    userName: string
    /** Week number being reviewed. */
    week: number
    /** Human date range, e.g. "Dec 9 — Dec 15". */
    weekRange: string
    /** Six (or however many) meals delivered that week. */
    meals: WeeklyReviewMeal[]
    /** Days remaining in the 7-day full-reward window. ≤0 → "Late · 50% reward". */
    daysLeftForFullReward: number
    /** Async submit handler — usually a server action that persists the review. */
    onSubmit: (payload: WeeklyReviewPayload) => Promise<WeeklyReviewSubmitResult>
    /** Called when the user dismisses the takeover (X button or post-thank-you "save for later" CTA). */
    onClose: () => void
    /**
     * Called when the user picks the chain CTA on the thank-you screen
     * ("Continue to Week N · +AED N"). Receives the target week number so
     * the host can route into that week's review takeover. Optional —
     * when absent, the chain CTA isn't rendered even if the action returns
     * a nextPendingWeek.
     */
    onContinueChain?: (nextWeek: number) => void
    /**
     * Phase 8K — how many reviews this user has ALREADY submitted on this
     * sub. Drives the first-submit acknowledgement modal: if 0, intercept
     * with the all-or-nothing rule explainer; if >0, skip straight to the
     * rating screen. Default 0 (safer default — show the modal).
     */
    priorSubmissions?: number
    /**
     * Phase 8K — total weekly reviews expected for this sub's cycle. Used
     * by the acknowledgement modal copy ("submit all 4..."). When 1
     * (Weekly Flex), the all-or-nothing rule is trivial and we skip the
     * modal entirely. Default 4.
     */
    weeksExpected?: number
    /** Label for the close/back CTA. Defaults to "Back to dashboard". */
    closeLabel?: string
}

// ── Component ───────────────────────────────────────────────────────────────

const ACK_STORAGE_KEY = 'dormers:weekly-review-rule-ack-v1'

export function WeeklyReviewTakeover({
    userName,
    week,
    weekRange,
    meals,
    daysLeftForFullReward,
    onSubmit,
    onClose,
    onContinueChain,
    priorSubmissions = 0,
    weeksExpected = 4,
    closeLabel = 'Back to dashboard',
}: WeeklyReviewTakeoverProps) {
    // Phase 8K — first-submit ack modal. Show ONLY when ALL of:
    //   • the sub has the all-or-nothing rule (weeksExpected > 1)
    //   • the user has never submitted on this sub (server-side count)
    //   • the user hasn't dismissed the modal previously (localStorage)
    // Initialised pessimistically (don't show until we've checked
    // localStorage) so SSR/hydration doesn't flash the modal incorrectly.
    const allOrNothingApplies = weeksExpected > 1
    const [ackResolved, setAckResolved] = useState(false)
    const [showAck, setShowAck] = useState(false)
    useEffect(() => {
        if (!allOrNothingApplies || priorSubmissions > 0) {
            setShowAck(false)
            setAckResolved(true)
            return
        }
        try {
            const seen = window.localStorage.getItem(ACK_STORAGE_KEY)
            setShowAck(!seen)
        } catch {
            setShowAck(true) // Storage disabled — show, no way to remember
        }
        setAckResolved(true)
    }, [allOrNothingApplies, priorSubmissions])

    const dismissAck = () => {
        try { window.localStorage.setItem(ACK_STORAGE_KEY, '1') } catch { /* ignore */ }
        setShowAck(false)
    }

    const [step, setStep] = useState(1)
    const [rating, setRating] = useState<number | null>(null)
    const [hoverStar, setHoverStar] = useState<number | null>(null)
    const [favorites, setFavorites] = useState<string[]>([])
    const [misses, setMisses] = useState<string[]>([])
    const [missReasons, setMissReasons] = useState<Record<string, string[]>>({})
    const [delivery, setDelivery] = useState<'up' | 'down' | null>(null)
    const [deliveryReasons, setDeliveryReasons] = useState<string[]>([])
    const [packaging, setPackaging] = useState<'up' | 'down' | null>(null)
    const [packagingReasons, setPackagingReasons] = useState<string[]>([])
    const [kitchenNote, setKitchenNote] = useState('')

    const [isSubmitting, startSubmitting] = useTransition()
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [earnedPct, setEarnedPct] = useState<50 | 100 | null>(null)
    // Phase 8K Model C — when this submission was the LAST one for the
    // cycle, the action's threshold-flip moves all pending credits to
    // approved. The total AED locked in lands here and drives the
    // thank-you screen's "cycle complete" celebration variant.
    const [lumpSumApproved, setLumpSumApproved] = useState<number | null>(null)
    // Post-submit chain — when set, the thank-you screen shows a primary
    // "Continue to Week N · +AED N" CTA alongside the secondary save-for-
    // later. Cleared when the user picks save-for-later or when cycle-
    // complete (lump sum landed → nothing to chain into).
    const [nextChain, setNextChain] = useState<{ week: number; aed: number } | null>(null)

    const activeStar = hoverStar ?? rating ?? 0
    const isLate = daysLeftForFullReward <= 0
    const isThankYou = earnedPct !== null
    const barPct = isThankYou ? 100 : (step / TOTAL_STEPS) * 100
    const draftKey = `${DRAFT_KEY_PREFIX}${week}`

    // ── Draft persistence ───────────────────────────────────────────────────
    // Keyed by week so a new week gets a fresh slate. Closing the takeover
    // (deliberately via "Save & continue later", or refresh/back) keeps the
    // answers in localStorage so the user can resume where they left off.

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const raw = window.localStorage.getItem(draftKey)
            if (!raw) return
            const d = JSON.parse(raw) as Record<string, unknown>
            if (typeof d.step === 'number') setStep(Math.max(1, Math.min(TOTAL_STEPS, d.step)))
            if (typeof d.rating === 'number') setRating(d.rating)
            if (Array.isArray(d.favorites)) setFavorites(d.favorites as string[])
            if (Array.isArray(d.misses)) setMisses(d.misses as string[])
            if (d.missReasons && typeof d.missReasons === 'object') setMissReasons(d.missReasons as Record<string, string[]>)
            if (d.delivery === 'up' || d.delivery === 'down') setDelivery(d.delivery)
            if (Array.isArray(d.deliveryReasons)) setDeliveryReasons(d.deliveryReasons as string[])
            if (d.packaging === 'up' || d.packaging === 'down') setPackaging(d.packaging)
            if (Array.isArray(d.packagingReasons)) setPackagingReasons(d.packagingReasons as string[])
            if (typeof d.kitchenNote === 'string') setKitchenNote(d.kitchenNote)
        } catch {
            // Corrupt draft — ignore.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (isThankYou) return
        const t = setTimeout(() => {
            try {
                window.localStorage.setItem(draftKey, JSON.stringify({
                    step, rating,
                    favorites, misses, missReasons,
                    delivery, deliveryReasons,
                    packaging, packagingReasons,
                    kitchenNote,
                }))
            } catch {
                // Quota or storage disabled — silently skip.
            }
        }, 250)
        return () => clearTimeout(t)
    }, [
        draftKey,
        step, rating,
        favorites, misses, missReasons,
        delivery, deliveryReasons,
        packaging, packagingReasons,
        kitchenNote,
        isThankYou,
    ])

    const next = () => setStep((s) => s + 1)
    const back = () => setStep((s) => Math.max(1, s - 1))

    const toggleFavorite = (id: string) =>
        setFavorites((arr) =>
            arr.includes(id) ? arr.filter((x) => x !== id) : arr.length >= 3 ? arr : [...arr, id],
        )

    const toggleMiss = (id: string) =>
        setMisses((arr) => {
            const nextArr = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
            if (!nextArr.includes(id)) {
                setMissReasons((r) => {
                    const rest = { ...r }
                    delete rest[id]
                    return rest
                })
            }
            return nextArr
        })

    const toggleMissReason = (id: string, reason: string) =>
        setMissReasons((r) => {
            const current = r[id] ?? []
            return {
                ...r,
                [id]: current.includes(reason) ? current.filter((x) => x !== reason) : [...current, reason],
            }
        })

    const setDeliveryThumbs = (v: 'up' | 'down') => {
        setDelivery(v)
        if (v === 'up') setDeliveryReasons([])
    }
    const setPackagingThumbs = (v: 'up' | 'down') => {
        setPackaging(v)
        if (v === 'up') setPackagingReasons([])
    }
    const toggleDeliveryReason = (reason: string) =>
        setDeliveryReasons((arr) => (arr.includes(reason) ? arr.filter((x) => x !== reason) : [...arr, reason]))
    const togglePackagingReason = (reason: string) =>
        setPackagingReasons((arr) => (arr.includes(reason) ? arr.filter((x) => x !== reason) : [...arr, reason]))

    const handleSubmit = () => {
        if (!rating || !delivery || !packaging) return
        setSubmitError(null)
        // Phase 8K — set ?just_submitted=1 in the URL BEFORE the action
        // fires. Server actions trigger a route refresh on completion
        // (via revalidatePath); without this marker, the re-rendered
        // page.tsx sees the just-inserted row and redirects to /menu
        // before the thank-you screen renders. The marker tells the
        // server "you're mid-thank-you, skip the bounce." Cleared
        // naturally when the user clicks "Back to dashboard."
        try {
            const url = new URL(window.location.href)
            url.searchParams.set('just_submitted', '1')
            window.history.replaceState({}, '', url.toString())
        } catch { /* ignore — server still has the existing-row redirect as fallback */ }
        startSubmitting(async () => {
            const result = await onSubmit({
                rating,
                favorites,
                misses,
                missReasons,
                delivery,
                deliveryReasons,
                packaging,
                packagingReasons,
                kitchenNote,
            })
            if (result.ok) {
                try { window.localStorage.removeItem(draftKey) } catch { /* ignore */ }
                setEarnedPct(result.rewardPct)
                setLumpSumApproved(result.lumpSumApprovedAed ?? null)
                if (
                    result.nextPendingWeek != null
                    && result.nextPendingWeekAed != null
                    && result.lumpSumApprovedAed == null
                ) {
                    setNextChain({ week: result.nextPendingWeek, aed: result.nextPendingWeekAed })
                }
            } else {
                setSubmitError(result.error)
            }
        })
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100,
                // Layered atmospheric backdrop — warm glow top-right, secondary
                // hint bottom-left, navy gradient base. Same lighting model
                // as the monthly wrap so the two reviews feel like one family.
                background: `
                    radial-gradient(ellipse 90% 60% at 92% -8%, rgba(245,127,32,0.11) 0%, transparent 55%),
                    radial-gradient(ellipse 70% 50% at 8% 108%, rgba(255,170,0,0.07) 0%, transparent 55%),
                    linear-gradient(135deg, #1c4255 0%, #0a1c2a 55%, #061421 100%)
                `,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: BODY,
                color: TIER_POP_TEXT.primary,
                overflow: 'auto',
            }}
        >
            {/* Progress bar */}
            <div style={{ height: 3, background: 'rgba(245,240,232,0.10)', position: 'relative', overflow: 'hidden' }}>
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${barPct}%`,
                        background: `linear-gradient(90deg, ${OG} 0%, #ffaa00 100%)`,
                        transition: 'width 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 0 16px rgba(245,127,32,0.7)',
                    }}
                />
            </div>

            {/* Header */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px clamp(20px, 4vw, 48px)',
                gap: 12,
            }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {step > 1 && !isThankYou && (
                        <button
                            aria-label="Back"
                            onClick={back}
                            disabled={isSubmitting}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 32, height: 32,
                                borderRadius: 'var(--radius-pill)',
                                border: '1px solid rgba(245,240,232,0.14)',
                                background: 'rgba(245,240,232,0.04)',
                                color: TIER_POP_TEXT.muted,
                                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                transition: 'background 150ms, color 150ms',
                            }}
                        >
                            <ChevronLeft size={16} strokeWidth={2.2} />
                        </button>
                    )}

                    {!isThankYou && (
                        <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: TIER_POP_TEXT.muted,
                            fontFeatureSettings: '"tnum"',
                        }}>
                            {step} / {TOTAL_STEPS}
                        </span>
                    )}

                    {!isThankYou && (
                        <div
                            title={isLate
                                ? 'Submitted after the 7-day window. 50% Dorm Wars reward instead of 100%.'
                                : 'Submit within 7 days of week end for 100% Dorm Wars reward. After that, 50%.'}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 'var(--radius-pill)',
                                background: isLate
                                    ? 'rgba(245,240,232,0.08)'
                                    : 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                                border: `1px solid ${isLate ? 'rgba(245,240,232,0.18)' : 'rgba(245,127,32,0.45)'}`,
                                color: isLate ? TIER_POP_TEXT.muted : '#ffc66b',
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                cursor: 'help',
                            }}
                        >
                            <Clock size={12} strokeWidth={2.4} />
                            {isLate
                                ? <>Late · 50% reward</>
                                : daysLeftForFullReward === 0
                                    ? <>Last day for full reward</>
                                    : <>{daysLeftForFullReward}d left for full reward</>}
                        </div>
                    )}
                </div>

                <button
                    aria-label="Close review"
                    onClick={onClose}
                    disabled={isSubmitting}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36, height: 36,
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid rgba(245,240,232,0.14)',
                        background: 'rgba(245,240,232,0.06)',
                        backdropFilter: 'blur(8px)',
                        color: TIER_POP_TEXT.muted,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        transition: 'background 150ms, color 150ms, border-color 150ms',
                    }}
                >
                    <X size={16} strokeWidth={2.2} />
                </button>
            </header>

            {/* Main */}
            <main style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px clamp(20px, 4vw, 48px) 16px',
                textAlign: 'center',
            }}>
                {/* Phase 8K — All-or-nothing acknowledgement intercept.
                    Renders BEFORE step 1 the very first time the user
                    opens the takeover on a given subscription. Requires
                    explicit "Got it — start review" click to advance,
                    leveraging commitment bias (Cialdini): the user owns
                    the rule by acknowledging it. */}
                {ackResolved && showAck && !isThankYou && (
                    <AcknowledgementScreen
                        weeksExpected={weeksExpected}
                        onContinue={dismissAck}
                    />
                )}

                {/* Screen 1 */}
                {!showAck && step === 1 && !isThankYou && (
                    <div style={{ maxWidth: 640, width: '100%' }}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Week {week} Review · {weekRange}</Eyebrow>
                        <H1>How was this week, {userName}?</H1>
                        <Sub>{meals.length} dinners delivered. A quick pulse before we dig in — this takes 60 seconds.</Sub>

                        <div
                            role="radiogroup"
                            aria-label="Overall rating for this week"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 'clamp(8px, 1.5vw, 16px)',
                                padding: '20px clamp(16px, 3vw, 28px)',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(245,240,232,0.04)',
                                border: '1px solid rgba(245,240,232,0.10)',
                                boxShadow: 'inset 0 1px 0 rgba(245,240,232,0.06)',
                            }}
                            onMouseLeave={() => setHoverStar(null)}
                        >
                            {[1, 2, 3, 4, 5].map((n) => {
                                const isLit = n <= activeStar
                                return (
                                    <button
                                        key={n}
                                        role="radio"
                                        aria-checked={rating === n}
                                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                                        onMouseEnter={() => setHoverStar(n)}
                                        onFocus={() => setHoverStar(n)}
                                        onBlur={() => setHoverStar(null)}
                                        onClick={() => setRating(n)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 'clamp(44px, 6vw, 64px)',
                                            height: 'clamp(44px, 6vw, 64px)',
                                            border: 0,
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            padding: 0,
                                            transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                                            transform: hoverStar === n ? 'translateY(-2px)' : 'translateY(0)',
                                        }}
                                    >
                                        <Star
                                            size={44}
                                            strokeWidth={1.5}
                                            fill={isLit ? OG : 'rgba(245,240,232,0.06)'}
                                            color={isLit ? OG : 'rgba(245,240,232,0.30)'}
                                            style={{
                                                transition: 'fill 200ms, color 200ms',
                                                filter: isLit ? 'drop-shadow(0 6px 18px rgba(245,127,32,0.55))' : 'none',
                                            }}
                                        />
                                    </button>
                                )
                            })}
                        </div>

                        <Caption>
                            {activeStar === 0 && 'Tap a star to continue'}
                            {activeStar === 1 && 'Rough week — we want to hear about it'}
                            {activeStar === 2 && 'Below the bar — what went wrong?'}
                            {activeStar === 3 && 'Decent — room to improve'}
                            {activeStar === 4 && 'Solid week'}
                            {activeStar === 5 && 'Loved it — tell us why'}
                        </Caption>

                        <ContinueButton enabled={!!rating} onClick={next} />
                    </div>
                )}

                {/* Screen 2 — Favorites */}
                {step === 2 && !isThankYou && (
                    <div style={{ maxWidth: 820, width: '100%' }}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Picks of the week</Eyebrow>
                        <H1>Which dinners <Accent>stood out</Accent>?</H1>
                        <Sub>Tap up to 3 favorites. We use these to plan more of what you love.</Sub>

                        <MealGrid
                            meals={meals}
                            selected={favorites}
                            onToggle={toggleFavorite}
                            tone="favorite"
                            disabled={(id) => favorites.length >= 3 && !favorites.includes(id)}
                        />

                        <div style={{ marginTop: 20, fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.muted, letterSpacing: '0.02em' }}>
                            {favorites.length === 0 && 'Nothing yet — tap up to 3'}
                            {favorites.length > 0 && (
                                <>
                                    <span style={{ color: OG }}>{favorites.length}</span> / 3 picked
                                </>
                            )}
                        </div>

                        <ContinueButton enabled onClick={next} label={favorites.length === 0 ? 'Skip — nothing stood out' : 'Continue'} muted={favorites.length === 0} />
                    </div>
                )}

                {/* Screen 3 — Misses */}
                {step === 3 && !isThankYou && (
                    <div style={{ maxWidth: 820, width: '100%' }}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Anything fall flat?</Eyebrow>
                        <H1>Any that <Accent>missed the mark</Accent>?</H1>
                        <Sub>Tap any dinners that didn&rsquo;t land. The kitchen reviews every flag.</Sub>

                        <MealGrid meals={meals} selected={misses} onToggle={toggleMiss} tone="miss" />

                        <div style={{ marginTop: 20, fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.muted, letterSpacing: '0.02em' }}>
                            {misses.length === 0 ? 'Nothing flagged' : <><span style={{ color: '#f87171' }}>{misses.length}</span> flagged · tag what went wrong below</>}
                        </div>

                        {misses.length > 0 && (
                            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
                                {misses.map((id) => {
                                    const meal = meals.find((m) => m.id === id)
                                    if (!meal) return null
                                    return (
                                        <div
                                            key={id}
                                            style={{
                                                padding: '14px 18px',
                                                borderRadius: 'var(--radius-md)',
                                                background: 'rgba(239,68,68,0.06)',
                                                border: '1px solid rgba(239,68,68,0.25)',
                                            }}
                                        >
                                            <div style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: TIER_POP_TEXT.primary,
                                                marginBottom: 10,
                                                letterSpacing: '-0.005em',
                                            }}>
                                                What didn&rsquo;t land about <span style={{ color: '#fca5a5' }}>{meal.name}</span>?
                                            </div>
                                            <ChipRow
                                                options={MISS_REASONS}
                                                selected={missReasons[id] ?? []}
                                                onToggle={(reason) => toggleMissReason(id, reason)}
                                                tone="miss"
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <ContinueButton
                            enabled
                            onClick={next}
                            label={misses.length === 0 ? 'All six landed →' : 'Continue'}
                            muted={misses.length === 0}
                        />
                    </div>
                )}

                {/* Screen 4 — Operational */}
                {step === 4 && !isThankYou && (
                    <div style={{ maxWidth: 640, width: '100%' }}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>Operations</Eyebrow>
                        <H1>Delivery & packaging</H1>
                        <Sub>Two quick checks on the logistics side. Tap up or down.</Sub>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520, margin: '0 auto' }}>
                            <OpRow
                                label="Delivery timing"
                                sub="Did dinners arrive when expected?"
                                value={delivery}
                                onSet={setDeliveryThumbs}
                                reasonOptions={DELIVERY_REASONS}
                                reasonSelected={deliveryReasons}
                                onToggleReason={toggleDeliveryReason}
                            />
                            <OpRow
                                label="Packaging quality"
                                sub="Clean, intact, easy to handle?"
                                value={packaging}
                                onSet={setPackagingThumbs}
                                reasonOptions={PACKAGING_REASONS}
                                reasonSelected={packagingReasons}
                                onToggleReason={togglePackagingReason}
                            />
                        </div>

                        <ContinueButton enabled={delivery !== null && packaging !== null} onClick={next} />
                    </div>
                )}

                {/* Screen 5 — Open prompt + submit */}
                {step === 5 && !isThankYou && (
                    <div style={{ maxWidth: 640, width: '100%' }}>
                        <Eyebrow color={TIER_POP_TEXT.muted}>One more thing</Eyebrow>
                        <H1>Anything for the kitchen?</H1>
                        <Sub>Loved, hated, want more of — whatever&rsquo;s on your mind. Optional.</Sub>

                        <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'left' }}>
                            <textarea
                                value={kitchenNote}
                                onChange={(e) => setKitchenNote(e.target.value)}
                                placeholder="The biryani was unreal. Can the Wednesday curry be a touch less spicy next time?"
                                rows={5}
                                disabled={isSubmitting}
                                style={{
                                    width: '100%',
                                    padding: '16px 18px',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundImage: 'linear-gradient(180deg, rgba(255,250,240,0.06) 0%, rgba(255,250,240,0.02) 100%)',
                                    backgroundColor: 'transparent',
                                    border: '1px solid rgba(245,240,232,0.14)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,250,240,0.06)',
                                    color: 'rgba(245,238,222,0.95)',
                                    fontFamily: BODY,
                                    fontSize: 15,
                                    lineHeight: 1.55,
                                    resize: 'vertical',
                                    outline: 'none',
                                    transition: 'border-color 150ms, box-shadow 150ms',
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(245,127,32,0.55)'
                                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,200,107,0.18), 0 0 0 3px rgba(245,127,32,0.10)'
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(245,240,232,0.14)'
                                    e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,250,240,0.06)'
                                }}
                            />
                            <div style={{ marginTop: 8, fontSize: 11, color: TIER_POP_TEXT.faint, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                                {kitchenNote.length > 0 ? `${kitchenNote.length} characters` : 'Optional · skip if nothing comes to mind'}
                            </div>
                        </div>

                        {submitError && (
                            <div style={{
                                marginTop: 20,
                                padding: '10px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(239,68,68,0.10)',
                                border: '1px solid rgba(239,68,68,0.35)',
                                color: '#fca5a5',
                                fontSize: 12,
                                fontWeight: 600,
                                maxWidth: 540,
                                marginLeft: 'auto',
                                marginRight: 'auto',
                            }}>
                                {submitError}
                            </div>
                        )}

                        <ContinueButton
                            enabled={!isSubmitting}
                            onClick={handleSubmit}
                            label={isSubmitting ? 'Submitting…' : 'Submit review'}
                        />
                    </div>
                )}

                {/* Thank-you — only after successful submission */}
                {isThankYou && (
                    <div style={{ maxWidth: 560, width: '100%' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 72, height: 72,
                            borderRadius: '50%',
                            background: lumpSumApproved !== null
                                ? `linear-gradient(135deg, #22c55e 0%, #16a34a 100%)`
                                : `linear-gradient(135deg, ${OG} 0%, #ffaa00 100%)`,
                            boxShadow: lumpSumApproved !== null
                                ? '0 12px 40px rgba(34,197,94,0.55)'
                                : '0 12px 40px rgba(245,127,32,0.55)',
                            marginBottom: 28,
                        }}>
                            {lumpSumApproved !== null
                                ? <Check size={36} strokeWidth={3} color="#fff" />
                                : <Sparkles size={32} strokeWidth={2} color="#fff" />}
                        </div>

                        {lumpSumApproved !== null ? (
                            <>
                                <H1>
                                    Cycle <Accent>locked in</Accent>.
                                </H1>
                                <Sub>
                                    All weekly reviews are in — your kitchen credit just hit your wallet. Thanks, {userName}.
                                </Sub>
                            </>
                        ) : (
                            <>
                                <H1>Logged. <Accent>Thank you</Accent>, {userName}.</H1>
                                <Sub>
                                    Every weekly review goes to the kitchen team Monday morning. Your picks shape next month&rsquo;s menu.
                                </Sub>
                            </>
                        )}

                        {/* Reward chip — adapts to lump-sum approval vs in-progress */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '12px 18px',
                            borderRadius: 'var(--radius-pill)',
                            background: lumpSumApproved !== null
                                ? 'linear-gradient(135deg, rgba(34,197,94,0.20) 0%, rgba(22,163,74,0.16) 100%)'
                                : 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(255,170,0,0.14) 100%)',
                            border: lumpSumApproved !== null
                                ? '1px solid rgba(34,197,94,0.45)'
                                : '1px solid rgba(245,127,32,0.45)',
                            color: lumpSumApproved !== null ? '#86efac' : '#ffc66b',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            marginBottom: 18,
                        }}>
                            <Sparkles size={14} strokeWidth={2.4} />
                            {lumpSumApproved !== null
                                ? <>+ AED {lumpSumApproved} landed in your wallet</>
                                : <>This review locked · AED {earnedPct === 100 ? 5 : 2} on the line</>}
                        </div>

                        {/* In-progress: pending-pool reminder + at-risk framing */}
                        {lumpSumApproved === null && (
                            <p style={{
                                margin: '0 auto 28px',
                                maxWidth: 460,
                                fontFamily: BODY,
                                fontSize: 13,
                                lineHeight: 1.6,
                                color: 'rgba(245,240,232,0.65)',
                            }}>
                                Pending until you finish the rest of this cycle&rsquo;s
                                weekly reviews. Miss one and the cycle&rsquo;s credit is
                                forfeit — keep going.
                            </p>
                        )}

                        {/* CTA cluster — chain-aware. When the action returns
                            another pending week (and the cycle isn't already
                            cycle-complete), surface BOTH options stacked:
                              primary  → continue into the next week's review
                              secondary → save for later, back to dashboard
                            Stacked over side-by-side so the primary clearly
                            reads as the recommended path; both remain full-
                            width clickable buttons so the opt-out is honest,
                            not buried as a tiny gray link. */}
                        {nextChain && onContinueChain ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                width: '100%',
                                maxWidth: 460,
                                margin: '0 auto',
                            }}>
                                <ContinueButton
                                    enabled
                                    onClick={() => onContinueChain(nextChain.week)}
                                    label={`Continue to Week ${nextChain.week} · +AED ${nextChain.aed}`}
                                />
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'transparent',
                                        border: 0,
                                        cursor: 'pointer',
                                        fontFamily: BODY,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        letterSpacing: '0.04em',
                                        color: 'rgba(245,240,232,0.65)',
                                    }}
                                >
                                    Save for later
                                </button>
                            </div>
                        ) : (
                            <div>
                                <ContinueButton enabled onClick={onClose} label={closeLabel} />
                            </div>
                        )}
                    </div>
                )}
            </main>

            {!isThankYou && (
                <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: 16 }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            fontFamily: BODY,
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: TIER_POP_TEXT.faint,
                            padding: '8px 12px',
                            transition: 'color 150ms',
                        }}
                    >
                        Save & continue later
                    </button>
                </footer>
            )}
        </div>
    )
}

// ── Internal sub-components ─────────────────────────────────────────────────

// ── Acknowledgement screen (first-submit only) ──────────────────────────────
//
// Phase 8K Layer 2 — explicit acknowledgement of the all-or-nothing rule.
// Required "Got it — start review" button is the action that confirms
// reading. localStorage flag ensures it fires exactly once per browser
// (server-side priorSubmissions also skips it for users who've already
// reviewed at least once).
function AcknowledgementScreen({
    weeksExpected,
    onContinue,
}: {
    weeksExpected: number
    onContinue: () => void
}) {
    const fullReward = weeksExpected * 5  // BASE_REWARD_AED — kept inline to avoid import churn
    return (
        <div style={{ maxWidth: 540, width: '100%' }}>
            {/* Chain icon — same visual language as the Now tray's
                AllOrNothingLine so the rule reads consistently across surfaces. */}
            <div
                aria-hidden="true"
                style={{
                    margin: '0 auto 18px',
                    width: 56, height: 56,
                    borderRadius: 14,
                    background: 'rgba(245,127,32,0.14)',
                    border: '1.5px solid rgba(245,127,32,0.45)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f57f20',
                }}
            >
                <Link2 size={26} strokeWidth={2.2} />
            </div>

            <Eyebrow color={TIER_POP_TEXT.muted}>Heads up · weekly reviews</Eyebrow>
            <H1>
                It&rsquo;s <Accent>all 4 or nothing</Accent>.
            </H1>

            <div style={{
                margin: '0 auto 28px',
                maxWidth: 480,
                fontFamily: BODY,
                fontSize: 'clamp(14px, 1.6vw, 16px)',
                lineHeight: 1.65,
                color: 'rgba(245,240,232,0.82)',
                fontWeight: 500,
            }}>
                <p style={{ margin: '0 0 10px' }}>
                    You earn <strong style={{ color: '#fff', fontWeight: 700 }}>AED 5 per weekly review</strong> —
                    but only if you finish <strong style={{ color: '#fff', fontWeight: 700 }}>all {weeksExpected} this cycle</strong>.
                    Miss even one and the whole cycle&rsquo;s credit is forfeit.
                </p>
                <p style={{ margin: 0 }}>
                    The full payout (<strong style={{ color: '#ffc66b', fontWeight: 700 }}>AED {fullReward}</strong>) lands
                    in your wallet when the {weeksExpected}th review is in. Late submissions
                    still count toward the {weeksExpected} but earn AED 2 each instead of 5.
                </p>
            </div>

            <button
                type="button"
                onClick={onContinue}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '14px 32px',
                    borderRadius: 999,
                    border: 0,
                    background: '#f57f20',
                    color: '#091825',
                    fontFamily: BODY,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '0 12px 30px rgba(245,127,32,0.50)',
                    transition: 'transform 150ms cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
                Got it — start review
            </button>
        </div>
    )
}

function H1({ children }: { children: React.ReactNode }) {
    // Top-lit gradient cream — matches MonthlyReviewTakeover's H1 treatment.
    // background-clip: text gives subtle dimension instead of flat cream.
    return (
        <h1 style={{
            margin: '20px 0 14px',
            fontFamily: BODY,
            fontSize: 'clamp(28px, 4.2vw, 48px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            backgroundImage: 'linear-gradient(180deg, #fdf8ef 0%, #f0e6cf 55%, #d6c8a8 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.25))',
        }}>
            {children}
        </h1>
    )
}

function Accent({ children }: { children: React.ReactNode }) {
    // Brighter cream + brand-orange underline — opts out of the H1's
    // background-clip: text so the accent word reads as solid, punchy colour.
    return (
        <span style={{
            color: '#fbe5b5',
            WebkitTextFillColor: '#fbe5b5',
            backgroundImage: 'none',
            textDecorationLine: 'underline',
            textDecorationColor: OG,
            textDecorationThickness: '0.08em',
            textUnderlineOffset: '0.18em',
            textDecorationSkipInk: 'none',
        }}>
            {children}
        </span>
    )
}

function Sub({ children }: { children: React.ReactNode }) {
    return (
        <p style={{
            margin: '0 auto 40px',
            fontFamily: BODY,
            fontSize: 'clamp(14px, 1.5vw, 17px)',
            fontWeight: 400,
            lineHeight: 1.55,
            color: 'rgba(245,238,222,0.72)',
            maxWidth: 540,
        }}>
            {children}
        </p>
    )
}

function Caption({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            marginTop: 24,
            minHeight: 24,
            fontFamily: BODY,
            fontSize: 14,
            fontWeight: 600,
            color: TIER_POP_TEXT.primary,
            letterSpacing: '0.02em',
            transition: 'opacity 200ms',
        }}>
            {children}
        </div>
    )
}

function ContinueButton({
    enabled,
    onClick,
    label = 'Continue',
    muted = false,
}: {
    enabled: boolean
    onClick: () => void
    label?: string
    muted?: boolean
}) {
    const isPrimary = enabled && !muted
    return (
        <button
            disabled={!enabled}
            onClick={onClick}
            style={{
                marginTop: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '14px 28px',
                borderRadius: 'var(--radius-pill)',
                border: isPrimary ? 0 : '1px solid rgba(245,240,232,0.18)',
                background: isPrimary ? OG : muted ? 'rgba(245,240,232,0.06)' : 'rgba(245,240,232,0.08)',
                color: isPrimary ? '#fff' : muted ? TIER_POP_TEXT.muted : TIER_POP_TEXT.faint,
                fontFamily: BODY,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: enabled ? 'pointer' : 'not-allowed',
                boxShadow: isPrimary ? '0 8px 28px rgba(245,127,32,0.50)' : 'none',
                transition: 'background 200ms, color 200ms, box-shadow 200ms, transform 150ms',
            }}
        >
            {label}
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>→</span>
        </button>
    )
}

function MealGrid({
    meals,
    selected,
    onToggle,
    tone,
    disabled,
}: {
    meals: WeeklyReviewMeal[]
    selected: string[]
    onToggle: (id: string) => void
    tone: 'favorite' | 'miss'
    disabled?: (id: string) => boolean
}) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 4,
        }}>
            {meals.map((m) => {
                const isNotDelivered = m.skipped || m.paused
                const notDeliveredLabel = m.skipped ? 'Skipped' : m.paused ? 'Paused' : null
                const isSelected = selected.includes(m.id) && !isNotDelivered
                const isDisabled = isNotDelivered || (!isSelected && disabled?.(m.id))
                const accent = tone === 'favorite' ? OG : '#ef4444'
                const accentGlow = tone === 'favorite' ? 'rgba(245,127,32,0.40)' : 'rgba(239,68,68,0.35)'

                return (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => !isDisabled && onToggle(m.id)}
                        disabled={isDisabled}
                        aria-label={isNotDelivered ? `${m.name} — ${notDeliveredLabel}, not reviewable` : m.name}
                        style={{
                            position: 'relative',
                            aspectRatio: '1 / 1',
                            borderRadius: 'var(--radius-md)',
                            background: m.gradient ?? '#1a1a1a',
                            border: `2px solid ${isSelected ? accent : 'rgba(245,240,232,0.14)'}`,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            overflow: 'hidden',
                            padding: 0,
                            // Skipped/paused get a stronger desaturation to read
                            // clearly as "not part of the review" — distinct from
                            // the lighter dim used for "you've already picked 3
                            // favorites, can't pick another".
                            opacity: isNotDelivered ? 0.55 : isDisabled ? 0.4 : 1,
                            filter: isNotDelivered ? 'grayscale(0.7)' : 'none',
                            transition: 'transform 180ms cubic-bezier(0.4, 0, 0.2, 1), border-color 180ms, box-shadow 180ms, opacity 180ms',
                            transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
                            boxShadow: isSelected
                                ? `0 12px 32px ${accentGlow}, 0 0 0 4px rgba(245,127,32,0.0)`
                                : '0 4px 12px rgba(0,0,0,0.20)',
                            textAlign: 'left',
                            fontFamily: BODY,
                        }}
                    >
                        {/* Real meal photo when available — fills the card and
                            sits behind the legibility scrim + overlays. */}
                        {m.image && (
                            <Image
                                src={m.image}
                                alt={m.name}
                                fill
                                sizes="(max-width: 768px) 50vw, 200px"
                                style={{ objectFit: 'cover' }}
                            />
                        )}

                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.65) 100%)',
                        }} />

                        {isSelected && (
                            <div style={{
                                position: 'absolute',
                                top: 10, right: 10,
                                width: 28, height: 28,
                                borderRadius: '50%',
                                background: accent,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: `0 4px 12px ${accentGlow}`,
                            }}>
                                {tone === 'favorite'
                                    ? <Check size={16} strokeWidth={3} color="#fff" />
                                    : <X size={16} strokeWidth={3} color="#fff" />}
                            </div>
                        )}

                        <div style={{
                            position: 'absolute',
                            top: 10, left: 10,
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'rgba(0,0,0,0.45)',
                            backdropFilter: 'blur(8px)',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'rgba(245,240,232,0.92)',
                        }}>
                            {m.day}
                        </div>

                        <div style={{
                            position: 'absolute',
                            bottom: 14, left: 14, right: 14,
                            fontSize: 15,
                            fontWeight: 700,
                            lineHeight: 1.2,
                            letterSpacing: '-0.01em',
                            color: '#fff',
                        }}>
                            {m.name}
                        </div>

                        {/* "Skipped" / "Paused" caption — centered band over
                            the meal card, clearly signaling "this isn't part
                            of the review" while keeping the meal visible so
                            the user has full context of the week. */}
                        {isNotDelivered && notDeliveredLabel && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                            }}>
                                <div style={{
                                    padding: '6px 14px',
                                    borderRadius: 'var(--radius-pill)',
                                    background: 'rgba(0,0,0,0.72)',
                                    backdropFilter: 'blur(6px)',
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    border: '1px solid rgba(255,255,255,0.20)',
                                }}>
                                    {notDeliveredLabel} meal
                                </div>
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

function OpRow({
    label,
    sub,
    value,
    onSet,
    reasonOptions,
    reasonSelected,
    onToggleReason,
}: {
    label: string
    sub: string
    value: 'up' | 'down' | null
    onSet: (v: 'up' | 'down') => void
    reasonOptions: string[]
    reasonSelected: string[]
    onToggleReason: (reason: string) => void
}) {
    const isDown = value === 'down'
    return (
        <div style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            background: isDown ? 'rgba(239,68,68,0.06)' : 'rgba(245,240,232,0.04)',
            border: `1px solid ${isDown ? 'rgba(239,68,68,0.25)' : 'rgba(245,240,232,0.10)'}`,
            transition: 'background 200ms, border-color 200ms',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TIER_POP_TEXT.primary, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: TIER_POP_TEXT.muted, lineHeight: 1.4 }}>{sub}</div>
                </div>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                    <ThumbBtn dir="up"   active={value === 'up'}   onClick={() => onSet('up')} />
                    <ThumbBtn dir="down" active={value === 'down'} onClick={() => onSet('down')} />
                </div>
            </div>
            {isDown && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(239,68,68,0.18)' }}>
                    <div style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#fca5a5',
                        marginBottom: 10,
                    }}>
                        What happened?
                    </div>
                    <ChipRow options={reasonOptions} selected={reasonSelected} onToggle={onToggleReason} tone="miss" />
                </div>
            )}
        </div>
    )
}

function ChipRow({
    options,
    selected,
    onToggle,
    tone,
}: {
    options: string[]
    selected: string[]
    onToggle: (v: string) => void
    tone: 'favorite' | 'miss'
}) {
    const accent = tone === 'favorite' ? OG : '#ef4444'
    const activeText = tone === 'favorite' ? '#ffc66b' : '#fca5a5'
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {options.map((opt) => {
                const active = selected.includes(opt)
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onToggle(opt)}
                        aria-pressed={active}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-pill)',
                            border: `1px solid ${active ? `${accent}99` : 'rgba(245,240,232,0.18)'}`,
                            // Lit-pill gradient — vertical fade simulates top
                            // lighting so chips read as raised, not painted on.
                            background: active
                                ? `linear-gradient(180deg, ${accent}3d 0%, ${accent}14 100%)`
                                : 'linear-gradient(180deg, rgba(255,250,240,0.08) 0%, rgba(255,250,240,0.025) 100%)',
                            boxShadow: active
                                ? `inset 0 1px 0 ${accent}44, 0 4px 12px ${accent}22`
                                : 'inset 0 1px 0 rgba(255,250,240,0.08)',
                            color: active ? activeText : 'rgba(245,238,222,0.82)',
                            fontFamily: BODY,
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: '0.01em',
                            cursor: 'pointer',
                            transition: 'background 150ms, color 150ms, border-color 150ms, box-shadow 150ms, transform 120ms',
                            transform: active ? 'translateY(-1px)' : 'translateY(0)',
                        }}
                    >
                        {opt}
                    </button>
                )
            })}
        </div>
    )
}

function ThumbBtn({ dir, active, onClick }: { dir: 'up' | 'down'; active: boolean; onClick: () => void }) {
    const accent = dir === 'up' ? '#22c55e' : '#ef4444'
    const accentGlow = dir === 'up' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'
    const Icon = dir === 'up' ? ThumbsUp : ThumbsDown
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={dir === 'up' ? 'Thumbs up' : 'Thumbs down'}
            aria-pressed={active}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44, height: 44,
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${active ? accent : 'rgba(245,240,232,0.18)'}`,
                background: active ? `${accent}22` : 'rgba(245,240,232,0.04)',
                color: active ? accent : TIER_POP_TEXT.muted,
                cursor: 'pointer',
                transition: 'background 180ms, color 180ms, border-color 180ms, box-shadow 180ms, transform 150ms',
                boxShadow: active ? `0 6px 18px ${accentGlow}` : 'none',
                transform: active ? 'translateY(-1px)' : 'translateY(0)',
            }}
        >
            <Icon size={18} strokeWidth={2.2} />
        </button>
    )
}
