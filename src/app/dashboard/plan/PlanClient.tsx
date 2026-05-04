'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Utensils, Gem, Crown, Sparkles, Info,
  CalendarDays, Unlock, Heart,
} from 'lucide-react'
import { OG, OG3, NV, BODY, S, TIER1, TIER2, TIER3, cleanPlanName } from '../_shared/tokens'
import { PlanGlyph } from '../_shared/PlanGlyph'
import { Eyebrow } from '../_shared/Eyebrow'
import { FAQItem } from '../_shared/FAQItem'
import { fmt, fmtWithDay } from '../_shared/format'
import { SUBSCRIPTION_STATUS } from '@/lib/subscription-status'
import { CheckoutPanel } from './CheckoutPanel'
import { pricePerMeal, totalPrice, PLANS, type PlanId, type Pref, type PlanDef } from './pricing'

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
      <p style={{ marginTop: 4, fontFamily: BODY, fontSize: 11, color: S.fgFaint, lineHeight: 1.5 }}>
        Want all-veg or all-non-veg? Switch your preference on{' '}
        <Link href="/dashboard/profile" style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.20)', textUnderlineOffset: 2 }}>
          your profile
        </Link>
        .
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
  const [cancelBanner, setCancelBanner] = useState(false)

  // ?checkout_canceled=true → show inline banner, then scrub the param so a
  // refresh doesn't re-trigger the banner. (The bfcache reset for the inflight
  // checkout-loading state lives inside <CheckoutPanel>.)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout_canceled') === 'true') {
      setCancelBanner(true)
      params.delete('checkout_canceled')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  // Pricing grid: in 'explore' mode it's always visible; in 'plan' mode it's
  // gone entirely (users go to /dashboard/explore-plans for it).
  const showPricing = isExplore

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

              {/* Checkout panel — slides in once a plan is selected.
                  Owns its own date-picker, Stripe redirect, and the panel-
                  local state (startDate, loading, error). Sticks to the
                  bottom of the viewport on desktop. */}
              <AnimatePresence>
                {selected && (
                  <CheckoutPanel
                    selected={selected}
                    pref={pref}
                    vegDayCount={vegDayCount}
                    customer={customer}
                    userEmail={userEmail}
                    activeSubscription={activeSubscription}
                  />
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

      <style jsx>{`
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
      `}</style>
    </div>
  )
}
