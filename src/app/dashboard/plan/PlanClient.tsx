'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Utensils, Gem, Crown, Sparkles, Info, Lock, Loader2,
  ChevronDown, ChevronLeft, ChevronRight,
  ChefHat, Globe, ShieldCheck, CalendarDays, SkipForward, RefreshCw,
  Unlock, BadgePercent, Pause, Zap,
  Heart,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OG, OG3, NV, BODY, S, TIER1, TIER2, TIER3, cleanPlanName } from '../_shared/tokens'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { Eyebrow } from '../_shared/Eyebrow'
import { FAQItem } from '../_shared/FAQItem'
import { fmt, fmtWithDay } from '../_shared/format'
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status'

// DB stores the raw `meal_preference_type` value; this map yields the friendly
// label for read-only displays. (Kept here because the Plan page only renders
// the value; full editing happens at /dashboard/profile.)
const MEAL_PREFS = [
  { value: 'Carnivore',            label: 'Non-Vegetarian'      },
  { value: 'Plant-Based',          label: 'Veg'                 },
  { value: 'Religious Preference', label: 'Religious Preference' },
]

// ── Tokens ────────────────────────────────────────────────────────────────────
// OG / OG3 / NV / BODY / S / TIER1-3 are pulled from the shared dashboard token
// system so this page sits on the same surface tiers, palette, and typeface as
// Home and Menu. DISPLAY is intentionally an alias of BODY — single typeface
// across the dashboard; hierarchy comes from scale + weight + colour.
// BG is a soft cream gradient kept locally for this page only.
const BG = 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)'
const DISPLAY = BODY

// ── Pricing tables ────────────────────────────────────────────────────────────
// Religious mix: index = number of veg days (0–6)
const MIXED_MONTHLY_PER_MEAL = [22, 22, 21, 20, 19, 18, 17]
const MIXED_WEEKLY_PER_MEAL  = [23, 21.67, 21.67, 21, 21, 20, 19]

type Pref = 'NonVeg' | 'Veg' | 'Religious'

interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null
  whatsapp_number?: string | null; dorm_name?: string | null; meal_preference_type?: string | null
  allergens?: string | null; spice_level_preference?: string | null; created_at: string
}
interface Subscription {
  id: string; plan_name: string; status: string; start_date: string; end_date: string
  total_meals: number; delivered_meals: number; skipped_meals_count: number
  has_paused_before: boolean; pause_date?: string | null; last_skipped_date?: string | null
  paused_days?: number; created_at: string
}
interface Props {
  customer: Customer | null
  activeSubscription: Subscription | null
  allSubscriptions: Subscription[]
  userEmail: string
  // 'plan'    → /dashboard/plan: shows current plan, profile, past plans (no pricing grid).
  // 'explore' → /dashboard/explore-plans: shows ONLY pricing grid + checkout, no other sections.
  mode?: 'plan' | 'explore'
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// ── Plan definitions ─────────────────────────────────────────────────────────
type PlanId = 'Trial' | 'Weekly Flex' | 'Monthly Premium' | 'Monthly Max'

type Feature = { text: string; icon: LucideIcon }

interface PlanDef {
  id: PlanId
  badge?: string
  badgeTone?: 'orange' | 'gold'
  duration: string
  meals: number
  period: '/meal' | '/week' | '/month'
  features: Feature[]
  disclaimer?: string
}

const PLANS: PlanDef[] = [
  {
    id: 'Trial',
    badge: 'One-time trial',
    duration: 'Single delivery',
    meals: 1,
    period: '/meal',
    features: [
      { text: '1 freshly cooked meal',     icon: ChefHat },
      { text: 'Any cuisine preference',     icon: Globe },
      { text: 'No commitment whatsoever',   icon: ShieldCheck },
    ],
  },
  {
    id: 'Weekly Flex',
    badge: 'Low commitment',
    duration: '1 week · 6 days/week',
    meals: 6,
    period: '/week',
    features: [
      { text: '6 meals per week',           icon: CalendarDays },
      { text: '1 meal skip included',       icon: SkipForward },
      { text: 'Renew or cancel weekly',     icon: RefreshCw },
      { text: 'No long-term lock-in',       icon: Unlock },
    ],
  },
  {
    id: 'Monthly Premium',
    badge: 'Best value',
    badgeTone: 'orange',
    duration: '4 weeks · 6 days/week',
    meals: 24,
    period: '/month',
    features: [
      { text: '24 meals per month',         icon: CalendarDays },
      { text: 'Lowest price per meal',      icon: BadgePercent },
      { text: '1 free pause (indefinite)',  icon: Pause },
      { text: '3 meal skips included',      icon: SkipForward },
      { text: 'Priority delivery slot',     icon: Zap },
    ],
  },
  {
    id: 'Monthly Max',
    badge: 'For the hungry',
    badgeTone: 'gold',
    duration: '4 weeks · 6 days/week · 2 meals/day',
    meals: 48,
    period: '/month',
    features: [
      { text: '48 meals per month (24 days × 2)', icon: CalendarDays },
      { text: '0.50 AED less per meal vs. Premium', icon: BadgePercent },
      { text: '1 free pause (indefinite)',  icon: Pause },
      { text: '3 meal skips included',      icon: SkipForward },
      { text: 'Priority delivery slot',     icon: Zap },
    ],
    disclaimer:
      'Both meals delivered together at 7:00–8:00 PM. Both meals are the same dish — not two different meals.',
  },
]

// Per-meal price for a plan given current preference
function pricePerMeal(plan: PlanId, pref: Pref, vegDayCount: number): number {
  if (pref === 'Religious') {
    if (plan === 'Monthly Premium') return MIXED_MONTHLY_PER_MEAL[vegDayCount] ?? 22
    if (plan === 'Weekly Flex')     return MIXED_WEEKLY_PER_MEAL[vegDayCount]  ?? 23
    if (plan === 'Trial')            return 25
    if (plan === 'Monthly Max')      return Math.max(0, (MIXED_MONTHLY_PER_MEAL[vegDayCount] ?? 22) - 0.5)
  }
  if (pref === 'Veg') {
    if (plan === 'Monthly Premium') return 18
    if (plan === 'Weekly Flex')     return 19
    if (plan === 'Trial')            return 20
    if (plan === 'Monthly Max')      return 17.5
  }
  if (plan === 'Monthly Premium') return 22
  if (plan === 'Weekly Flex')     return 23
  if (plan === 'Trial')            return 25
  if (plan === 'Monthly Max')      return 21.5
  return 0
}

function totalPrice(plan: PlanId, pref: Pref, vegDayCount: number): number {
  const p = pricePerMeal(plan, pref, vegDayCount)
  const def = PLANS.find(x => x.id === plan)!
  return Math.round(p * def.meals * 100) / 100
}

// ── Reusable bits ─────────────────────────────────────────────────────────────
// Eyebrow moved to _shared/Eyebrow.tsx — imported above.

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; dot: string }> = {
    Active:    { bg: 'rgba(9,145,14,0.14)',  fg: '#1d8a30', dot: '#1d8a30' },
    Paused:    { bg: 'rgba(255,170,0,0.16)', fg: '#a36900', dot: OG3 },
    Scheduled: { bg: 'rgba(0,136,204,0.14)', fg: '#0079b6', dot: '#0088cc' },
    Ended:     { bg: 'rgba(9,24,37,0.08)',   fg: 'rgba(9,24,37,0.55)', dot: 'rgba(9,24,37,0.45)' },
  }
  const c = map[status] || map.Active
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontFamily: BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
      {status}
    </span>
  )
}

// ── Active plan callout ───────────────────────────────────────────────────────
function ActivePlanCallout({ sub, onRenewClick }: { sub: Subscription | null; onRenewClick: () => void }) {
  if (!sub) {
    return (
      <div style={{ ...TIER1, padding: 22, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>No active plan</Eyebrow>
          <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: NV }}>Pick a plan to get started.</div>
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 13, color: S.fgMuted }}>Cancel or change any time.</div>
        </div>
      </div>
    )
  }
  const daysLeft = Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000))
  const startsInFuture = new Date(sub.start_date).getTime() > Date.now()
  const renewEligible = !startsInFuture && daysLeft <= 7
  const status = startsInFuture ? SUBSCRIPTION_STATUS.SCHEDULED : sub.status

  // Behavioural numbers — the answer to "how is my plan going?". Pulled from
  // the existing subscription record; no new data fetched.
  // NOTE: legacy `plan_name` rows include decoration (emojis, etc.), which is
  // why ClientDashboard uses `.includes()` and a cleanPlanName helper. We
  // match the same convention here so monthly subs read correctly even when
  // the stored string isn't a clean exact match.
  const isMax       = sub.plan_name.includes('Monthly Max')
  const isPremium   = sub.plan_name.includes('Monthly Premium')
  const isWeekly    = sub.plan_name.includes('Weekly Flex')
  const supportsPause = isMax || isPremium
  const skipAllowance = isMax || isPremium ? 3 : isWeekly ? 1 : 0
  const skipsLeft = Math.max(0, skipAllowance - sub.skipped_meals_count)
  const pauseStatus = !supportsPause
    ? '—'
    : sub.status === SUBSCRIPTION_STATUS.PAUSED
      ? 'Active'
      : sub.has_paused_before
        ? 'Used'
        : 'Available'

  return (
    <div style={{
      ...TIER1,
      // Hierarchy via a single orange border accent + TIER1 surface — the
      // brand colour calls the eye without flooding the card. Shadow comes
      // from TIER1 itself, keeping the page on one shadow scale.
      padding: 28, borderRadius: 20,
      border: '1.5px solid rgba(245,127,32,0.32)',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow color="#a35100">Your current plan</Eyebrow>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: NV, letterSpacing: '-0.01em' }}>
            <PlanGlyph planName={sub.plan_name} size={22} color={NV} />
            {cleanPlanName(sub.plan_name)}
          </div>
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted }}>
            {startsInFuture
              ? <>Starts <strong style={{ color: NV }}>{fmtWithDay(sub.start_date)}</strong> · ends {fmtWithDay(sub.end_date)}</>
              : <>Started {fmtWithDay(sub.start_date)} · ends <strong style={{ color: NV }}>{fmtWithDay(sub.end_date)}</strong></>}
          </div>
        </div>
        <StatusDot status={status} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', color: OG, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{daysLeft}</span>
          <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: NV }}>day{daysLeft === 1 ? '' : 's'} {startsInFuture ? 'until you start' : 'left in your plan'}</span>
        </div>

        {/* Renew control: only render the orange CTA when actionable. While
            mid-cycle, show a calm informational line instead of a permanently
            disabled button — no daily reminder of an inability to act. */}
        {renewEligible ? (
          <button
            type="button"
            onClick={onRenewClick}
            title="Choose a plan + start date below."
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 18px', borderRadius: 999,
              fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              border: 0, cursor: 'pointer',
              background: OG, color: '#fff',
              transition: 'opacity 150ms',
            }}
          >
            Renew now →
          </button>
        ) : !startsInFuture ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: NV }}>
              Plan in progress
            </div>
            <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, marginTop: 2 }}>
              Renew opens {Math.max(0, daysLeft - 7)} day{Math.max(0, daysLeft - 7) === 1 ? '' : 's'} before {fmtWithDay(sub.end_date)}.
            </div>
          </div>
        ) : null}
      </div>

      {/* Behavioural stats — the "how is it going?" row. Label-value pattern:
          small uppercase eyebrow over emphasised value. Hidden for scheduled
          plans (no activity yet). */}
      {!startsInFuture && (
        <>
          <div style={{ height: 1, background: 'rgba(9,24,37,0.08)', margin: '4px 0' }} />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 18,
          }}>
            <Stat label="Meals delivered" value={`${sub.delivered_meals}/${sub.total_meals}`} />
            <Stat
              label="Skips left"
              value={skipAllowance > 0 ? `${skipsLeft} of ${skipAllowance}` : '—'}
            />
            <Stat label="Pause" value={pauseStatus} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Mini stat tile — uppercase label over emphasised numeric value. Used
// inside the active-plan callout so the behavioural data sits as supporting
// info under the days-left hero number.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 18, fontWeight: 800, color: NV, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  )
}

// ── Veg-day slider for Religious ──────────────────────────────────────────────
function VegDayPicker({ count, setCount }: { count: number; setCount: (n: number) => void }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Eyebrow>Veg Days per Week</Eyebrow>
        <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: OG, fontFeatureSettings: '"tnum"' }}>{count} of 6</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            style={{
              padding: '10px 0', borderRadius: 8, border: `1px solid ${count === n ? OG : S.border}`,
              background: count === n ? 'rgba(245,127,32,0.12)' : 'rgba(255,255,255,0.5)',
              color: count === n ? OG : NV, fontFamily: BODY, fontSize: 13, fontWeight: 700, fontFeatureSettings: '"tnum"', cursor: 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <p style={{ marginTop: 10, fontFamily: BODY, fontSize: 11.5, color: S.fgMuted }}>
        {`${count} veg day${count === 1 ? '' : 's'} · ${6 - count} non-veg day${6 - count === 1 ? '' : 's'}.`}
      </p>
    </div>
  )
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({
  plan, pref, vegDayCount, selected, onSelect,
}: {
  plan: PlanDef
  pref: Pref
  vegDayCount: number
  selected: boolean
  onSelect: (id: PlanId) => void
}) {
  const price = pricePerMeal(plan.id, pref, vegDayCount)
  const total = totalPrice(plan.id, pref, vegDayCount)
  const featured = plan.id === 'Monthly Premium'

  // Anchor each upgrade against the next-tier-down at *equal meal count* so
  // the saving reflects the real monthly delta the user pays, not a per-meal
  // figure that hides commitment scale.
  //   • Premium (24 meals)   vs  Weekly Flex × 4 weeks  (also 24 meals)
  //   • Max     (48 meals)   vs  Premium × 2            (also 48 meals)
  let saveAmount: number | null = null
  let saveAgainst: string | null = null
  if (plan.id === 'Monthly Premium') {
    const flexFourWeeks = totalPrice('Weekly Flex', pref, vegDayCount) * 4
    const diff = flexFourWeeks - total
    if (diff > 0) { saveAmount = diff; saveAgainst = 'Weekly Flex' }
  } else if (plan.id === 'Monthly Max') {
    const twoPremium = totalPrice('Monthly Premium', pref, vegDayCount) * 2
    const diff = twoPremium - total
    if (diff > 0) { saveAmount = diff; saveAgainst = 'Monthly Premium' }
  }
  const showSave = saveAmount !== null
  const saveLabel = saveAmount !== null
    ? (saveAmount % 1 === 0 ? `${saveAmount}` : saveAmount.toFixed(2))
    : ''

  const badgeStyle = ((): { bg: string; fg: string; border: string } => {
    if (plan.badgeTone === 'gold')   return { bg: 'rgba(212,160,23,0.12)', fg: '#a37800', border: 'rgba(212,160,23,0.30)' }
    if (plan.badgeTone === 'orange') return { bg: 'rgba(245,127,32,0.10)', fg: '#a35100', border: 'rgba(245,127,32,0.30)' }
    return { bg: 'rgba(9,24,37,0.05)', fg: S.fgMuted, border: S.border }
  })()

  const planIcon = plan.id === 'Monthly Premium' ? <Gem size={16}/> :
                   plan.id === 'Monthly Max' ? <Crown size={16}/> :
                   plan.id === 'Weekly Flex' ? <Sparkles size={16}/> :
                   <Utensils size={16}/>

  // Recommended plan sits on TIER1 (lifted, focal); the rest sit on TIER2
  // (supporting). Selected adds an orange border ring + small lift but
  // keeps the underlying surface on the same tier scale as the rest of
  // the dashboard — no white floating cards, no orange-glow shadows.
  const baseTier = featured ? TIER1 : TIER2

  return (
    <button
      type="button"
      onClick={() => onSelect(plan.id)}
      style={{
        ...baseTier,
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 18,
        textAlign: 'left',
        // Recommended card gets +8px top padding so its content starts a bit
        // lower than peers — combined with the floating ribbon above, the
        // card visually weighs more without breaking grid alignment.
        padding: featured ? '32px 24px 28px' : 24,
        borderRadius: 24,
        border: `1.5px solid ${selected ? OG : (featured ? 'rgba(245,127,32,0.32)' : 'rgba(9,24,37,0.07)')}`,
        transition: 'transform 150ms, border-color 200ms',
        cursor: 'pointer',
        transform: selected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Floating "Most Popular" ribbon — only on the recommended card. The
          ribbon carries the social-proof hook ("many people pick this") and
          the inline "Best value" caption below carries the value-claim hook.
          Two distinct messages reinforcing the recommendation, not the same
          phrase repeated. */}
      {featured && (
        <span style={{
          position: 'absolute',
          top: -13,
          left: '50%',
          transform: 'translateX(-50%)',
          background: OG,
          color: '#fff',
          fontFamily: BODY,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          padding: '6px 14px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          Most Popular
        </span>
      )}

      {/* Header */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: NV, fontFamily: BODY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(9,24,37,0.06)' }}>
            {planIcon}
          </span>
          {plan.id}
        </div>
        {plan.badge && (
          <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 11, fontWeight: 600, color: badgeStyle.fg, letterSpacing: '0.04em' }}>
            {plan.badge}
          </div>
        )}
      </div>

      {/* Price */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 800, color: NV, letterSpacing: '-0.03em', lineHeight: 1 }}>{price}</span>
          <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: S.fgMuted }}>AED / meal</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 12, fontWeight: 700, color: (selected || featured) ? OG : S.fgMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {total} AED{plan.period}
        </div>
        <div style={{ marginTop: 4, fontFamily: BODY, fontSize: 11.5, color: S.fgFaint }}>{plan.duration}</div>
        {showSave && (
          <div style={{
            marginTop: 10,
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(245,127,32,0.10)',
            color: '#a35100',
            fontFamily: BODY, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em',
          }}>
            Save {saveLabel} AED/month vs {saveAgainst}
          </div>
        )}
      </div>

      {/* Features — each with its own descriptive icon */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plan.features.map(f => {
          const FeatureIcon = f.icon
          return (
            <li key={f.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: BODY, fontSize: 13, color: NV, lineHeight: 1.45 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 7,
                background: 'rgba(245,127,32,0.10)',
                flexShrink: 0, marginTop: 1,
              }}>
                <FeatureIcon size={12} strokeWidth={2.2} color={OG} />
              </span>
              <span>{f.text}</span>
            </li>
          )
        })}
      </ul>

      {/* Disclaimer (Monthly Max) */}
      {plan.disclaimer && (
        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.22)' }}>
          <Info size={14} style={{ color: '#a37800', flexShrink: 0, marginTop: 2 }} strokeWidth={2.4} />
          <p style={{ fontFamily: BODY, fontSize: 11.5, color: '#7a5a00', lineHeight: 1.45, margin: 0 }}>{plan.disclaimer}</p>
        </div>
      )}

      {/* CTA — three-state hierarchy so nothing competes:
          • selected (any card)        → solid orange, white text. The "I'm picked" state.
          • featured (recommended) only → subtle orange tint + orange border + orange text.
                                          Reads as "I'm the recommended one" without
                                          shouting over a different selected card.
          • everything else            → quiet neutral.
          One brand colour, three weights — selection always wins visually. */}
      <span style={{
        marginTop: 'auto',
        display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6,
        padding: '12px 16px', borderRadius: 12,
        background:
          selected ? OG :
          featured ? 'rgba(245,127,32,0.12)' :
          'rgba(9,24,37,0.06)',
        color:
          selected ? '#fff' :
          featured ? '#a35100' :
          NV,
        fontFamily: BODY, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        border:
          selected ? 0 :
          featured ? '1px solid rgba(245,127,32,0.40)' :
          `1px solid ${S.border2}`,
      }}>
        {selected ? <><Check size={13} strokeWidth={3}/> Selected</> : 'Choose plan'}
      </span>
    </button>
  )
}

// ── DateField — custom date trigger + popover calendar ───────────────────────
// Replaces native <input type="date"> so the calendar popup matches the
// dashboard's design system. Trigger button sits on the same height/radius
// as the Checkout CTA so the action strip reads as a unified bar.
function DateField({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: string  // ISO YYYY-MM-DD or '' when nothing picked yet
  onChange: (v: string) => void
  minDate: string
  maxDate: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Calendar view month — defaults to the picked date (or the min bound when
  // nothing is picked yet). Keeps the popup landing on a relevant month.
  const initialView = useMemo(() => {
    const ref = value || minDate
    const d = new Date(ref + 'T00:00:00')
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [value, minDate])
  const [viewMonth, setViewMonth] = useState(initialView)

  // Reset the view when the popup re-opens so it always lands on the right
  // month even after the user navigates away and closes without selecting.
  useEffect(() => {
    if (open) setViewMonth(initialView)
  }, [open, initialView])

  // Outside click + Esc to close.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const minD = new Date(minDate + 'T00:00:00')
  const maxD = new Date(maxDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build a 6-week (42-cell) grid for the visible month — Monday-start.
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const monthEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startDow   = (monthStart.getDay() + 6) % 7  // Mon=0 … Sun=6
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(monthStart); d.setDate(d.getDate() - (i + 1))
    cells.push({ date: d, inMonth: false })
  }
  for (let i = 1; i <= monthEnd.getDate(); i++) {
    cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i), inMonth: true })
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date
    const d = new Date(last); d.setDate(d.getDate() + 1)
    cells.push({ date: d, inMonth: false })
  }

  const inRange    = (d: Date) => d >= minD && d <= maxD
  const isToday    = (d: Date) => d.getTime() === today.getTime()
  const isSelected = (d: Date) =>
    !!value && d.getTime() === new Date(value + 'T00:00:00').getTime()

  function pick(d: Date) {
    if (!inRange(d)) return
    // ISO date in local time (avoids UTC-day-shift on negative tz offsets).
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onChange(iso)
    setOpen(false)
  }

  const canPrev = monthStart > new Date(minD.getFullYear(), minD.getMonth(), 1)
  const canNext = monthEnd   < new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0)

  const labelText = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Pick your start date'

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="checkout-date-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? `Start date: ${labelText}. Click to change.` : 'Pick your start date'}
      >
        <CalendarDays size={16} strokeWidth={2.2} aria-hidden />
        <span className={`checkout-date-label${value ? '' : ' is-empty'}`}>{labelText}</span>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden style={{
          color: 'rgba(9,24,37,0.5)',
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose a start date"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="checkout-date-popover"
          >
            <div className="checkout-date-popover-head">
              <button
                type="button"
                onClick={() => canPrev && setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                disabled={!canPrev}
                className="checkout-date-nav"
                aria-label="Previous month"
              >
                <ChevronLeft size={14} strokeWidth={2.4} />
              </button>
              <div className="checkout-date-monthlabel">
                {viewMonth.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })}
              </div>
              <button
                type="button"
                onClick={() => canNext && setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                disabled={!canNext}
                className="checkout-date-nav"
                aria-label="Next month"
              >
                <ChevronRight size={14} strokeWidth={2.4} />
              </button>
            </div>

            <div className="checkout-date-dow" aria-hidden>
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d}>{d}</div>)}
            </div>

            <div className="checkout-date-grid" role="grid">
              {cells.map((cell, i) => {
                const inR = cell.inMonth && inRange(cell.date)
                const tdy = isToday(cell.date)
                const sel = isSelected(cell.date)
                const cls = [
                  'checkout-date-cell',
                  sel ? 'is-selected' : '',
                  tdy && !sel ? 'is-today' : '',
                  !cell.inMonth ? 'is-outmonth' : '',
                ].filter(Boolean).join(' ')
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(cell.date)}
                    disabled={!inR}
                    className={cls}
                    aria-label={cell.date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    aria-current={sel ? 'date' : undefined}
                  >
                    {cell.date.getDate()}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Delivery preferences summary ──────────────────────────────────────────────
// Read-only snapshot of what we cook for the user. The Plan page is about
// plan state; editing lives on /dashboard/profile (single source of truth).
// The footer link routes there for any change.
function ProfileSummary({ customer }: { customer: Customer | null }) {
  const allergens = (customer?.allergens ?? '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean)
  const mealPrefLabel =
    MEAL_PREFS.find(m => m.value === customer?.meal_preference_type)?.label ??
    customer?.meal_preference_type ??
    ''

  const Field = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{
        marginTop: 6,
        fontFamily: BODY, fontSize: 14, fontWeight: 700,
        color: value ? NV : S.fgFaint,
        lineHeight: 1.35,
      }}>
        {value || '—'}
      </div>
    </div>
  )

  return (
    <div style={{ ...TIER2, padding: '20px 22px', borderRadius: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <Eyebrow>Delivery preferences</Eyebrow>
          <div style={{ marginTop: 6, fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: NV }}>
            How we cook for you
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999,
            fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            border: `1px solid ${S.border2}`, background: '#fff', color: NV,
            textDecoration: 'none',
          }}
        >
          Edit profile →
        </Link>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 18,
      }}>
        <Field label="Dorm" value={customer?.dorm_name} />
        <Field label="Diet" value={mealPrefLabel} />
        <Field label="Spice" value={customer?.spice_level_preference} />
        <Field
          label="Allergens"
          value={allergens.length > 0 ? allergens.join(', ') : 'None'}
        />
      </div>
    </div>
  )
}


// ── FAQ accordion ─────────────────────────────────────────────────────────────
const PLAN_FAQS = [
  { q: 'How does pausing work?',
    a: 'Monthly Premium and Monthly Max include 1 free pause (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals.' },
  { q: 'Can I switch plans mid-cycle?',
    a: 'Plan changes apply from your next renewal. You can renew early once you\'re within 7 days of your end date.' },
  { q: 'Why is Monthly Max only 0.50 AED less per meal?',
    a: 'Both daily meals are delivered together (7–8 PM) and are the same dish — so you\'re effectively buying a second portion of the same prep. The discount reflects that prep efficiency.' },
  { q: 'Can I skip a meal?',
    a: 'Yes — Weekly Flex includes 1 skip, Monthly Premium and Monthly Max include 3 skips per cycle. Use the Skip button on your dashboard before midnight the day prior.' },
]

// FAQItem moved to _shared/FAQItem.tsx — imported above.

// ── Main component ────────────────────────────────────────────────────────────
export default function PlanClient({ customer, activeSubscription, allSubscriptions, userEmail, mode = 'plan' }: Props) {
  const isExplore = mode === 'explore'
  // Pricing follows the user's saved preference — there is no toggle on the
  // page anymore. Preference lives on /dashboard/profile (single source of
  // truth) and propagates here via server-rendered customer state.
  const pref: Pref = customer?.meal_preference_type?.toLowerCase().includes('plant')
    ? 'Veg'
    : customer?.meal_preference_type?.toLowerCase().includes('religious')
      ? 'Religious'
      : 'NonVeg'
  const prefLabel = pref === 'NonVeg' ? 'Non-Veg' : pref === 'Veg' ? 'Vegetarian' : 'Religious Mix'
  const [vegDayCount, setVegDayCount] = useState<number>(3) // always in 1–5 range
  const [selected, setSelected] = useState<PlanId | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelBanner, setCancelBanner] = useState(false)

  // Stripe-cancel return-trip handling.
  // 1. ?checkout_canceled=true → show inline banner, scrub the param so refresh
  //    doesn't re-trigger the banner.
  // 2. Browser-BACK from Stripe restores this page from bfcache with
  //    `checkoutLoading: true` still set (the `finally` never ran before
  //    `window.location.href = …` unloaded the page). Reset on pageshow.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout_canceled') === 'true') {
      setCancelBanner(true)
      params.delete('checkout_canceled')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setCheckoutLoading(false) }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  // When a plan gets selected, scroll the checkout panel into clear view so
  // the user sees the date picker + checkout button without hunting for them.
  // Small delay lets the panel finish its slide-in animation before we move
  // the page; `block: 'center'` keeps the selected card and the panel both
  // visible (panel centred, card just above) instead of jumping past one or
  // the other. Honours `prefers-reduced-motion`.
  const checkoutRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selected) return
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(() => {
      checkoutRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      })
    }, 180)
    return () => window.clearTimeout(t)
  }, [selected])

  // Pricing grid: in 'explore' mode it's always visible; in 'plan' mode it's
  // gone entirely (users go to /dashboard/explore-plans for it).
  const showPricing = isExplore

  // Date picker bounds — both bounds anchored to a single starting point so
  // the user always gets a 30-day window to pick from:
  //   • Active sub      → window = [end_date + 1, end_date + 31]
  //   • No active sub   → window = [today,        today      + 30]
  // The calendar's initial month follows `min`, so the popover lands on a
  // relevant month even when `startDate` is still empty.
  const dateBounds = useMemo(() => {
    let minD: Date
    if (activeSubscription) {
      minD = new Date(activeSubscription.end_date)
      minD.setHours(0, 0, 0, 0)
      minD.setDate(minD.getDate() + 1)
    } else {
      minD = new Date()
      minD.setHours(0, 0, 0, 0)
    }
    const maxD = new Date(minD)
    maxD.setDate(maxD.getDate() + 30)
    return { min: isoDate(minD), max: isoDate(maxD) }
  }, [activeSubscription])

  // Start empty so the user makes a deliberate date choice — the Checkout CTA
  // is gated on this; no default-then-skip path.
  const [startDate, setStartDate] = useState<string>('')

  const endedPlans = allSubscriptions.filter(s => s.status === SUBSCRIPTION_STATUS.ENDED)

  // In 'plan' mode, "Renew" routes the user to /dashboard/explore-plans.
  // In 'explore' mode, the pricing grid is already visible — just scroll to it.
  const openPricing = () => {
    if (!isExplore) { window.location.href = '/dashboard/explore-plans'; return }
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById('plans-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    })
  }

  const handleCheckout = async () => {
    if (!selected || !startDate) return
    setError(null)
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(totalPrice(selected, pref, vegDayCount) * 100),
          name: customer?.name ?? '',
          email: customer?.email ?? userEmail,
          phone: customer?.whatsapp_number ?? '',
          location: customer?.dorm_name ?? '',
          preference: pref === 'Religious' ? 'Religious Preference' : pref === 'Veg' ? 'Plant-Based' : 'Carnivore',
          plan: selected === 'Monthly Premium' ? 'Monthly Premium' :
                selected === 'Monthly Max'     ? 'Monthly Max' :
                selected === 'Weekly Flex'     ? 'Weekly Flex' :
                'One-Time Trial',
          vegDays: pref === 'Religious'
            ? ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].slice(0, vegDayCount)
            : [],
          start_date: startDate,
          cancel_path: window.location.pathname,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setError(data.error ?? 'Checkout failed. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '28px 28px 48px', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {cancelBanner && (
          <div
            role="status"
            style={{
              marginBottom: 22, padding: '12px 18px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(9,24,37,0.04)', border: `1px solid ${S.border}`,
              color: S.fgMuted, fontSize: 13, fontFamily: BODY, lineHeight: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}
          >
            <span>Checkout was cancelled — no charge was made. Pick a plan when you&rsquo;re ready.</span>
            <button
              type="button"
              onClick={() => setCancelBanner(false)}
              aria-label="Dismiss"
              style={{ background: 'transparent', border: 'none', color: S.fgMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Header — clean hierarchy: H1 anchored, supporting paragraph in muted weight */}
        <header style={{ marginBottom: 48 }}>
          <h1 style={{
            fontFamily: DISPLAY,
            fontSize: 'clamp(34px, 5vw, 48px)',
            fontWeight: 700, letterSpacing: '-0.025em',
            marginTop: 0,
            lineHeight: 1.05, color: NV,
          }}>
            {isExplore
              ? <>Explore plans<span style={{ color: OG }}>.</span></>
              : <>My plan<span style={{ color: OG }}>.</span></>}
          </h1>
          <p style={{
            fontFamily: BODY, fontSize: 15, fontWeight: 400,
            color: S.fgMuted, marginTop: 10,
            maxWidth: 640, lineHeight: 1.6,
          }}>
            {isExplore
              ? (activeSubscription
                  ? 'Browse alternatives to your current plan — changes apply at your next renewal cycle.'
                  : 'Choose a plan that fits your week.')
              : 'Your current subscription, account details, and past plans — all in one place.'}
          </p>
        </header>

        {/* Active plan callout — only on /plan, not /explore-plans */}
        {!isExplore && (
          <div style={{ marginBottom: 16 }}>
            <ActivePlanCallout sub={activeSubscription} onRenewClick={openPricing} />
          </div>
        )}

        {/* Change-plan CTA — only on /plan */}
        {!isExplore && activeSubscription && (
          <div style={{ ...TIER2, marginBottom: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', borderRadius: 14 }}>
            <div>
              <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: NV }}>Want to switch plans or upgrade?</div>
              <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, marginTop: 2 }}>Browse all plans and pricing — changes apply at your next renewal.</div>
            </div>
            <Link
              href="/dashboard/explore-plans"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 999,
                fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                border: `1px solid ${S.border2}`, background: '#fff', color: NV, cursor: 'pointer', textDecoration: 'none',
                transition: 'background 150ms, border-color 150ms',
              }}
              className="change-plan-btn"
            >
              Explore plans →
            </Link>
          </div>
        )}

        {/* Pricing section. `showPricing` is bound to `isExplore` (a route-
            level prop), so it never toggles after mount — the animation is
            opacity-only and overflow is left clear so a `position: sticky`
            descendant (the checkout panel) actually sticks. */}
        <AnimatePresence initial={false}>
          {showPricing && (
            <motion.section
              key="pricing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {/* Value strip — anchors the universal promise of any plan
                  before the user reads prices. Frames the offer as outcome
                  + low effort + low risk, instead of a feature list. Only
                  shown in explore mode (this whole block is gated by
                  `showPricing`). */}
              <div className="explore-trust-strip" style={{
                ...TIER2,
                marginBottom: 24,
                padding: 'clamp(18px, 2vw, 22px)',
                borderRadius: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 18,
              }}>
                {[
                  { icon: Utensils,     title: 'Dinner sorted, every evening', sub: 'Chef-cooked, hot at your door. No planning, no cooking.' },
                  { icon: CalendarDays, title: 'Delivered 7–8 PM, your dorm',  sub: 'Same time, every day. Sunday off.' },
                  { icon: Unlock,       title: 'Skip, pause, cancel anytime',  sub: 'Life happens — flex without losing the meal.' },
                ].map(({ icon: Icon, title, sub }) => (
                  <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: 'rgba(245,127,32,0.10)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: OG,
                    }}>
                      <Icon size={16} strokeWidth={2.2} />
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: NV, lineHeight: 1.3 }}>
                      {title}
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 400, color: S.fgMuted, lineHeight: 1.5 }}>
                      {sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Static preference display — pricing is scoped to the user's
                  saved preference (one source of truth: profile). The toggle
                  that used to live here invited a false choice. The veg-day
                  picker stays for Religious users — that's a real choice
                  inside their preference, not a switch between preferences. */}
              <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  fontFamily: BODY, fontSize: 13, color: S.fgMuted,
                }}>
                  <span>Showing prices for</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 999,
                    background: 'rgba(245,127,32,0.10)',
                    color: NV, fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  }}>
                    {prefLabel}
                  </span>
                  <Link href="/dashboard/profile" style={{ color: S.fgSub, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.20)', textUnderlineOffset: 3 }}>
                    Change
                  </Link>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Info size={13} /> Prices in AED.
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {pref === 'Religious' && (
                    <motion.div
                      key="veg-picker"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <VegDayPicker count={vegDayCount} setCount={setVegDayCount} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Plan grid */}
              {/* Explicit 1 / 2 / 4 column breakpoints — skips the awkward
                  3-column zone that orphans the 4th plan. The recommended
                  card sits in row position 3 of 4 at desktop and bottom-left
                  of a 2x2 grid at tablet, both deliberate. */}
              <div id="plans-grid" className="plans-grid" style={{ marginBottom: 24 }}>
                {PLANS.map(p => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    pref={pref}
                    vegDayCount={vegDayCount}
                    selected={selected === p.id}
                    onSelect={(id) => setSelected(prev => prev === id ? null : id)}
                  />
                ))}
              </div>

              {/* Checkout panel — slides in once a plan is selected. Animation
                  is opacity + y only (no height) so the inner `position: sticky`
                  rule isn't trapped by `overflow: hidden`. The panel sticks to
                  the bottom of the viewport on desktop while the user scrolls
                  through the grid. */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/*
                      Receipt-header + action-strip composition.

                      Top section is a full-width plan summary — what you're
                      buying gets the panel's prime real estate, with the
                      total as the headline number (bold, tight tracking,
                      tabular numerals). A gradient hairline fades into the
                      panel rather than slicing across it. The bottom strip
                      is a 2-col 1fr/1fr action row, bottom-aligned so the
                      input baseline and the CTA baseline meet at the same
                      line. Mobile collapses to a single top-down flow.
                    */}
                    <div ref={checkoutRef} className="checkout-panel" style={{
                      ...TIER1,
                      padding: 'clamp(24px, 3vw, 36px)',
                      borderRadius: 24,
                      // Match the orange-accent intensity used on the active-
                      // plan callout and the recommended PlanCard — atmospheric,
                      // not shouty. The CTA inside is the assertive moment.
                      border: '1.5px solid rgba(245,127,32,0.32)',
                      marginBottom: 48,
                      scrollMarginBlock: 24,
                    }}>

                      {/* ── RECEIPT HEADER — what you're buying, anchored ── */}
                      <div className="checkout-summary-row">
                        <div className="checkout-identity">
                          <Eyebrow>Selected plan</Eyebrow>
                          {/* Glyph sits *inline* with the plan-name text on
                              the same baseline — Crown next to "Monthly Max",
                              Gem next to "Monthly Premium", etc. */}
                          <div className="checkout-plan-name">
                            <PlanGlyph planName={selected} size={24} color={NV} />
                            <span>{selected}</span>
                          </div>
                          <div className="checkout-plan-meta">
                            {pricePerMeal(selected, pref, vegDayCount)} AED/meal &middot; {PLANS.find(p => p.id === selected)?.meals} meals
                          </div>
                        </div>

                        {/* Headline number — single dominant moment of the
                            panel. Clamped scale, tabular numerals, tight
                            tracking. The "AED" lockup is a small footer
                            beneath, not a same-line equal partner. */}
                        <div className="checkout-total-block">
                          <div className="checkout-total-line">
                            <span className="checkout-total-num">
                              {totalPrice(selected, pref, vegDayCount)}
                            </span>
                            <span className="checkout-total-cur">AED</span>
                          </div>
                          <span className="checkout-total-period">
                            per {(PLANS.find(p => p.id === selected)?.period ?? '').replace('/', '')}
                          </span>
                        </div>
                      </div>

                      {/* Gradient hairline — fades into the panel edges so it
                          reads as a soft transition, not a hard slice. */}
                      <div className="checkout-divider" aria-hidden />

                      {/* ── ACTION STRIP ──
                          Two stacked grids so the trigger button and the CTA
                          button share a baseline regardless of how tall the
                          helper text below them runs. The controls grid is
                          bottom-aligned (date col taller because of its label;
                          the CTA col centres its single button to that bottom),
                          and the helpers grid sits underneath top-aligned. */}
                      <div className="checkout-action">
                        <div className="checkout-action-controls">
                          <div className="checkout-date">
                            <div className="checkout-label">Start date</div>
                            <DateField
                              value={startDate}
                              onChange={setStartDate}
                              minDate={dateBounds.min}
                              maxDate={dateBounds.max}
                            />
                          </div>

                          {/* Three-state CTA:
                              • !startDate → "Pick a date to continue" (faded, awaiting input)
                              • ready      → "Checkout securely →"     (orange, lift on hover)
                              • loading    → spinner + "Redirecting…"  (press-scaled momentarily) */}
                          <button
                            type="button"
                            disabled={checkoutLoading || !startDate}
                            onClick={handleCheckout}
                            className={`checkout-cta${!startDate && !checkoutLoading ? ' is-awaiting' : ''}${checkoutLoading ? ' is-loading' : ''}`}
                          >
                            {checkoutLoading ? (
                              <>
                                <Loader2 size={14} strokeWidth={2.6} className="checkout-cta-spinner" aria-hidden />
                                <span>Redirecting&hellip;</span>
                              </>
                            ) : !startDate ? (
                              <span>Pick a date to continue</span>
                            ) : (
                              <span>Checkout securely →</span>
                            )}
                          </button>
                        </div>

                        <div className="checkout-action-helpers">
                          <p className="checkout-helper">
                            Your meals begin on this date — you won&apos;t be charged for days before.
                          </p>
                          <div>
                            <p className="checkout-trust">
                              <Lock size={11} strokeWidth={2.4} color="#1d8a30" aria-hidden />
                              Powered by Stripe &middot; Card details never touch our servers.
                            </p>
                            {error && <p className="checkout-error">{error}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
            </motion.div>
          )}
        </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Delivery preferences summary — read-only on /plan; editing lives
            on /dashboard/profile (single source of truth). */}
        {!isExplore && (
          <div style={{ marginBottom: 24 }}>
            <ProfileSummary customer={customer} />
          </div>
        )}

        {/* Past plans — only on /plan */}
        {!isExplore && endedPlans.length > 0 && (
          <div style={{ marginBottom: 24, maxWidth: 720 }}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Eyebrow>Past plans</Eyebrow>
              <div style={{ flex: 1, height: 1, background: S.border }} />
            </div>
            {/* Compact grid — past plans are reference data, not action items.
                Each tile holds the same info as before but stacked, so a row
                of tiles fits where one full-width row used to live. */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}>
              {endedPlans.map(s => (
                <div key={s.id} style={{ ...TIER3, padding: '12px 14px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 13, fontWeight: 700, color: NV }}>
                      <PlanGlyph planName={s.plan_name} size={13} color={NV} />
                      {cleanPlanName(s.plan_name)}
                    </div>
                    <StatusDot status="Ended" />
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                    {fmt(s.start_date)} → {fmt(s.end_date)}
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 11.5, fontWeight: 600, color: S.fgMuted, fontFeatureSettings: '"tnum"' }}>
                    {s.delivered_meals}/{s.total_meals} meals
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ — only on /plan (manage mode). Explore Plans intentionally
            keeps the page focused on the offer; the same FAQ is one click
            away on /plan, so duplicating it here added clutter without
            answering anything new. Constrained to ~720px so prose lines
            stay in the comfortable 45-75 character reading range. */}
        {!isExplore && (
          <div style={{ ...TIER3, padding: 28, borderRadius: 20, marginBottom: 24, maxWidth: 720 }}>
            <Eyebrow>Pricing FAQ</Eyebrow>
            <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: NV }}>Common questions</div>
            <div style={{ marginTop: 14 }}>
              {PLAN_FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', padding: '12px 0', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgFaint, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6, width: '100%' }}>
          Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
        </div>
      </div>

      {/* `global` so the rules reach into <DateField/>'s JSX too — styled-jsx
          otherwise scopes by component, which is why the date trigger and
          popover were rendering unstyled. All class names are `checkout-*` /
          `plans-grid` and only used in this file, so there's no leakage. */}
      <style jsx global>{`
        .plans-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 560px) {
          .plans-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 920px) {
          .plans-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        /* Trust strip — collapses to a single column below 720px so the
           three promises stack instead of getting cramped at narrow widths. */
        @media (max-width: 720px) {
          .explore-trust-strip { grid-template-columns: 1fr !important; gap: 14px !important; }
        }

        /* ── Checkout panel ──────────────────────────────────────────────
           Receipt-header (full-width plan summary) over a 1fr/1fr action
           strip. Single typeface; hierarchy via scale, weight, tracking.
           Custom expo-out cubic-bezier on every transition so motion feels
           weighted, not mechanical.
        */

        /* Receipt header — plan identity left, headline price right. Wraps
           on narrow screens so the price drops below the identity block
           rather than crushing into it. */
        .checkout-summary-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .checkout-identity { min-width: 0; flex: 1 1 240px; }

        /* Plan name with the glyph sitting *inline* on the same baseline
           as the text — Crown ↔ "Monthly Max", Gem ↔ "Monthly Premium"… */
        .checkout-plan-name {
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 700;
          color: #091825;
          letter-spacing: -0.02em;
          line-height: 1.05;
        }
        .checkout-plan-meta {
          margin-top: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: rgba(9, 24, 37, 0.65);
          font-feature-settings: 'tnum';
        }

        /* Headline number — single hero moment of the panel. Dramatic scale,
           tight tracking, OG accent, tabular numerals so digits don't
           shift width as the user toggles preferences. */
        .checkout-total-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .checkout-total-line {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
        }
        .checkout-total-num {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: clamp(36px, 4.6vw, 48px);
          font-weight: 800;
          color: #f57f20;
          letter-spacing: -0.03em;
          line-height: 0.95;
          font-feature-settings: 'tnum';
        }
        .checkout-total-cur {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #f57f20;
          letter-spacing: -0.01em;
        }
        .checkout-total-period {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: rgba(9, 24, 37, 0.65);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        /* Gradient hairline — fades into the panel edges so the divider
           reads as a transition rather than a hard slice. */
        .checkout-divider {
          height: 1px;
          margin: 28px 0;
          background: linear-gradient(
            to right,
            rgba(9, 24, 37, 0) 0%,
            rgba(9, 24, 37, 0.10) 18%,
            rgba(9, 24, 37, 0.10) 82%,
            rgba(9, 24, 37, 0) 100%
          );
        }

        /* Action strip — split into TWO grids so the trigger button and the
           CTA button share a baseline (controls grid, bottom-aligned), with
           the helper texts laid out top-aligned underneath in a separate grid.
           Bottom-aligning the controls means: the date column (label + trigger)
           is taller than the CTA column (button only); the CTA gets pushed
           down so its bottom edge meets the trigger's bottom edge. */
        .checkout-action-controls,
        .checkout-action-helpers {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        .checkout-action-helpers {
          gap: 12px;
          margin-top: 12px;
        }
        @media (min-width: 560px) {
          .checkout-action-controls {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            align-items: end;
          }
          .checkout-action-helpers {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
          }
        }

        /* Eyebrow label above the date trigger. */
        .checkout-label {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(9, 24, 37, 0.65);
          line-height: 1;
          margin-bottom: 12px;
        }

        /* ── Date trigger — sits on the same height/radius as the CTA so
              the action strip reads as a single bar. Branded focus ring. */
        .checkout-date-trigger {
          width: 100%;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 18px 16px;
          border-radius: 14px;
          border: 1px solid rgba(9, 24, 37, 0.15);
          background: #fff;
          color: rgba(9, 24, 37, 0.55);
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          outline: none;
          transition:
            border-color 220ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow  220ms cubic-bezier(0.16, 1, 0.3, 1),
            background  220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .checkout-date-trigger:hover {
          border-color: rgba(9, 24, 37, 0.30);
        }
        .checkout-date-trigger[aria-expanded="true"],
        .checkout-date-trigger:focus-visible {
          border-color: rgba(245, 127, 32, 0.55);
          box-shadow: 0 0 0 3px rgba(245, 127, 32, 0.14);
        }
        .checkout-date-label {
          flex: 1;
          text-align: left;
          color: #091825;
          font-feature-settings: 'tnum';
        }
        .checkout-date-label.is-empty {
          color: rgba(9, 24, 37, 0.50);
          font-weight: 600;
        }

        /* ── Popover calendar — TIER1 surface, gradient-style elevation,
              spring-out entry, branded selection. Fully replaces the native
              browser date picker so the popup matches the dashboard. */
        .checkout-date-popover {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 20;
          background: #fcf8ee;
          border: 1px solid rgba(9, 24, 37, 0.10);
          border-radius: 16px;
          padding: 16px;
          min-width: 296px;
          transform-origin: top left;
          box-shadow:
            0 14px 40px rgba(9, 24, 37, 0.16),
            0 4px 12px  rgba(9, 24, 37, 0.06);
        }
        .checkout-date-popover-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 12px;
        }
        .checkout-date-monthlabel {
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          font-weight: 700;
          color: #091825;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }
        .checkout-date-nav {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 0;
          background: transparent;
          color: #091825;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .checkout-date-nav:hover:not(:disabled) {
          background: rgba(9, 24, 37, 0.06);
        }
        .checkout-date-nav:disabled {
          opacity: 0.30;
          cursor: not-allowed;
        }
        .checkout-date-dow {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
          margin-bottom: 4px;
        }
        .checkout-date-dow > div {
          text-align: center;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.10em;
          color: rgba(9, 24, 37, 0.45);
          text-transform: uppercase;
          padding: 6px 0;
        }
        .checkout-date-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }
        .checkout-date-cell {
          aspect-ratio: 1;
          border: 0;
          background: transparent;
          border-radius: 8px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: #091825;
          cursor: pointer;
          font-feature-settings: 'tnum';
          transition:
            background 150ms cubic-bezier(0.16, 1, 0.3, 1),
            color      150ms cubic-bezier(0.16, 1, 0.3, 1),
            transform  150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .checkout-date-cell:hover:not(:disabled):not(.is-selected) {
          background: rgba(245, 127, 32, 0.10);
          color: #a35100;
        }
        .checkout-date-cell:active:not(:disabled):not(.is-selected) {
          transform: scale(0.92);
        }
        .checkout-date-cell.is-today {
          color: #f57f20;
          box-shadow: inset 0 0 0 1.5px rgba(245, 127, 32, 0.50);
        }
        .checkout-date-cell.is-selected {
          background: #f57f20;
          color: #fff;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(245, 127, 32, 0.30);
        }
        .checkout-date-cell.is-outmonth {
          color: rgba(9, 24, 37, 0.20);
        }
        .checkout-date-cell:disabled {
          color: rgba(9, 24, 37, 0.20);
          cursor: not-allowed;
        }
        .checkout-date-cell:disabled:hover {
          background: transparent;
        }

        .checkout-helper {
          margin: 0;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11.5px;
          color: rgba(9, 24, 37, 0.45);
          line-height: 1.55;
        }

        /* Primary CTA — orange-glow only on hover (at-rest sits on the
           consolidated neutral shadow scale). Lift + intensified glow on
           hover, snap-back on press. Visible focus ring inside the button
           for keyboard nav without breaking the visual edge. */
        .checkout-cta {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 18px 22px;
          border-radius: 14px;
          background: #f57f20;
          color: #fff;
          border: 0;
          cursor: pointer;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          box-shadow: 0 4px 12px rgba(9, 24, 37, 0.10);
          transition:
            transform   220ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow  220ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity     150ms;
          will-change: transform;
        }
        .checkout-cta:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow:
            0 14px 32px rgba(245, 127, 32, 0.30),
            0 2px 8px   rgba(245, 127, 32, 0.16);
        }
        .checkout-cta:active:not(:disabled):not(.is-loading) {
          transform: scale(0.97);
          transition-duration: 80ms;
        }
        .checkout-cta:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.85);
          outline-offset: -4px;
        }
        .checkout-cta:disabled {
          cursor: not-allowed;
        }

        /* "Awaiting" — the user hasn't picked a date yet. Visually obvious
           it's not actionable (faded fill, dimmed text, no shadow) so the
           eye is pulled to the date trigger as the unmet step. */
        .checkout-cta.is-awaiting {
          background: rgba(245, 127, 32, 0.36);
          color: rgba(255, 255, 255, 0.92);
          box-shadow: none;
        }
        .checkout-cta.is-awaiting:hover {
          transform: none;
          box-shadow: none;
        }

        /* "Loading" — Stripe redirect in flight. Spinner replaces the arrow,
           button briefly compresses to confirm the press registered, then
           sits in a slightly weighted state until the redirect lands. */
        .checkout-cta.is-loading {
          transform: scale(0.98);
          box-shadow: 0 2px 8px rgba(245, 127, 32, 0.22);
        }
        .checkout-cta-spinner {
          animation: checkout-spin 700ms linear infinite;
          transform-origin: center;
        }
        @keyframes checkout-spin {
          to { transform: rotate(360deg); }
        }

        /* Trust line — pairs visually with the CTA above it. Lock icon
           reinforces the safety message at the moment of commitment. */
        .checkout-trust {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: rgba(9, 24, 37, 0.45);
          line-height: 1.5;
        }

        .checkout-error {
          margin-top: 8px;
          text-align: center;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: #b91c1c;
        }

        /* Sticky checkout panel — desktop only. On mobile a sticky panel
           would cover too much of the viewport, so it stays in flow there.
           Sticks until its natural position scrolls past, then un-sticks. */
        @media (min-width: 920px) {
          .checkout-panel {
            position: sticky;
            bottom: 16px;
            z-index: 5;
          }
        }

        /* Honour reduced-motion preferences — strip the lift/transitions
           but keep the hover signal via box-shadow only. */
        @media (prefers-reduced-motion: reduce) {
          .checkout-cta {
            transition: none;
          }
          .checkout-cta:hover:not(:disabled),
          .checkout-cta:active:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}
