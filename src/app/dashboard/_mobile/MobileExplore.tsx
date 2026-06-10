'use client'

import { type CSSProperties } from 'react'
import Link from 'next/link'
import { Check, Info, Utensils, CalendarDays, Unlock } from 'lucide-react'
import type { Customer, Subscription } from '../_shared/types'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import { OutOfZoneBanner } from '../_shared/OutOfZoneBanner'
import { pricePerMeal, totalPrice, mealsForPlan, PLANS, type PlanId, type Pref, type PlanDef, type WeekType, type PriceOverride } from '@/contexts/subscriptions/domain/pricing'
import { MobileCheckout } from './MobileCheckout'
import { MobileColumn, CARD, PlanGlyph, SectionTitle, eyebrow, OG, S, BODY, useIsCompact } from './kit'

/**
 * MobileExplore — ground-up mobile /dashboard/explore-plans (buy-first, ≤768).
 * Desktop (PlanClient, mode='explore') untouched. Built from MOBILE-REDESIGN
 * §7.3 and the dashboard bones: cards float on the page (no content frame),
 * recommended-first single column, and selecting a plan raises the checkout as
 * a bottom sheet (MobileCheckout) — never an inline-extending card.
 */

interface Props {
  customer: Customer | null
  userEmail: string
  activeSubscription: Subscription | null
  pref: Pref
  prefLabel: string
  weekType: WeekType
  vegDayCount: number | null
  setVegDayCount: (n: number) => void
  selected: PlanId | null
  setSelected: (fn: (prev: PlanId | null) => PlanId | null) => void
  outOfZone: boolean
  creditBalanceAed: number
  /** Active admin price overrides (plan_pricing rows) — threaded into the
   *  cards + checkout sheet so mobile shows the DB-backed price. */
  priceOverrides?: PriceOverride[]
}

export function MobileExplore({ customer, userEmail, activeSubscription, pref, prefLabel, weekType, vegDayCount, setVegDayCount, selected, setSelected, outOfZone, creditBalanceAed, priceOverrides = [] }: Props) {
  const paused = activeSubscription?.status === SUBSCRIPTION_STATUS.PAUSED
  // The checkout sheet shares `selected` with the desktop plan cards. Gate it to
  // compact so picking a plan on DESKTOP never opens this hidden sheet (which
  // would lock body scroll + trap focus behind the desktop CheckoutPanel).
  const compact = useIsCompact()
  // Recommended (Monthly Premium) leads; the rest keep their natural order.
  const ordered = [...PLANS].sort((a, b) => Number(b.id === 'Monthly Premium') - Number(a.id === 'Monthly Premium'))

  return (
    <MobileColumn style={{ color: S.fg }}>
      <div style={{ paddingLeft: 56, minHeight: 34, display: 'flex', alignItems: 'center' }}>
        <SectionTitle size={24}>Explore plans</SectionTitle>
      </div>
      <p style={{ margin: '-6px 0 0', fontSize: 13, color: S.fgMuted, lineHeight: 1.45 }}>
        {activeSubscription ? 'Browse alternatives — changes apply at your next renewal.' : 'Pick a plan that fits your week.'}
      </p>

      {/* Compact trust band — one row, replaces the three stacked promise cards. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 8px', borderRadius: 14, background: '#f7f4ec', border: '1px solid rgba(9,24,37,0.06)' }}>
        {[
          { Icon: Utensils, label: 'Chef-cooked' },
          { Icon: CalendarDays, label: '7–8 PM daily' },
          { Icon: Unlock, label: 'Skip anytime' },
        ].map(({ Icon, label }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--ds-og-wash-strong)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={14} strokeWidth={2.2} /></span>
            <span style={{ fontSize: 11, fontWeight: 600, color: S.fgMuted, lineHeight: 1.2 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Context — what these prices are scoped to (one wrapping line). */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12, color: S.fgMuted }}>
        <span>Prices for</span>
        <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(245,127,32,0.10)', color: S.fg, fontSize: 11.5, fontWeight: 700 }}>{prefLabel}</span>
        <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(58,111,140,0.10)', color: '#3a6f8c', fontSize: 11.5, fontWeight: 700 }}>{weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'}</span>
        <Link href="/dashboard/profile" style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 4px', margin: '-6px -4px', color: S.fgSub, fontSize: 12, fontWeight: 700, textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3 }}>Change</Link>
      </div>

      {/* Paused notice — browse ok, buy locked */}
      {paused && (
        <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(245,127,32,0.07)', border: '1px solid rgba(245,127,32,0.22)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: S.fg }}>Your current plan is paused</div>
          <div style={{ fontSize: 11.5, color: S.fgMuted, marginTop: 2, lineHeight: 1.5 }}>You can browse now, but checkout unlocks once you resume — the next start date depends on your current end date.</div>
        </div>
      )}

      {/* Religious-mix veg-day count picker */}
      {pref === 'Religious' && (
        <VegCountPicker count={vegDayCount} setCount={setVegDayCount} weekType={weekType} />
      )}

      <OutOfZoneBanner show={outOfZone} />

      {/* Plan cards — recommended first, single column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ordered.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            pref={pref}
            vegDayCount={vegDayCount}
            weekType={weekType}
            selected={selected === plan.id}
            onSelect={() => setSelected(prev => prev === plan.id ? null : plan.id)}
            priceOverrides={priceOverrides}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgFaint }}>
        Made with ♥ in Dubai
      </div>

      <MobileCheckout
        selected={compact ? selected : null}
        onClose={() => setSelected(() => null)}
        pref={pref}
        vegDayCount={vegDayCount ?? 3}
        customer={customer}
        userEmail={userEmail}
        activeSubscription={activeSubscription}
        weekType={weekType}
        outOfZone={outOfZone}
        creditBalanceAed={creditBalanceAed}
        priceOverrides={priceOverrides}
      />
    </MobileColumn>
  )
}

// ── Veg-day COUNT picker (religious only) ────────────────────────────────────
function VegCountPicker({ count, setCount, weekType }: { count: number | null; setCount: (n: number) => void; weekType: WeekType }) {
  const W = weekType === '5DAYS' ? 5 : 6
  const maxVeg = W - 1
  const options = Array.from({ length: maxVeg }, (_, i) => i + 1)
  const safeCount = count == null ? null : Math.min(count, maxVeg)
  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--ds-skeleton-base)', border: `1px solid ${S.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={eyebrow}>Veg days per week</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: safeCount == null ? S.fgFaint : OG, fontFeatureSettings: '"tnum"' }}>{safeCount == null ? `— of ${W}` : `${safeCount} of ${W}`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
        {options.map(n => {
          const active = safeCount === n
          return (
            <button key={n} type="button" onClick={() => setCount(n)} style={{ padding: '11px 0', borderRadius: 8, border: `1px solid ${active ? OG : S.border}`, background: active ? 'rgba(245,127,32,0.12)' : 'rgba(255,255,255,0.5)', color: active ? OG : S.fg, fontFamily: BODY, fontSize: 13, fontWeight: 700, fontFeatureSettings: '"tnum"', cursor: 'pointer' }}>{n}</button>
          )
        })}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: S.fgMuted, lineHeight: 1.45 }}>
        {safeCount == null ? `Choose your weekly veg-day count (1–${maxVeg}).` : `${safeCount} veg · ${W - safeCount} non-veg. Pick the exact days at checkout.`}
      </p>
    </div>
  )
}

// ── Plan card (compact, mobile-native) ───────────────────────────────────────
function PlanCard({ plan, pref, vegDayCount, weekType, selected, onSelect, priceOverrides }: {
  plan: PlanDef; pref: Pref; vegDayCount: number | null; weekType: WeekType; selected: boolean; onSelect: () => void; priceOverrides?: PriceOverride[]
}) {
  const priceUnknown = pref === 'Religious' && vegDayCount == null
  const safeCount = vegDayCount ?? 3
  const price = pricePerMeal(plan.id, pref, safeCount, weekType, priceOverrides)
  const total = totalPrice(plan.id, pref, safeCount, weekType, priceOverrides)
  const meals = mealsForPlan(plan.id, weekType)
  const featured = plan.id === 'Monthly Premium'
  const W = weekType === '5DAYS' ? 5 : 6
  const dynamicDuration =
    plan.id === 'Trial' ? plan.duration
    : plan.id === 'Weekly Flex' ? `1 week · ${W} days`
    : plan.id === 'Monthly Premium' ? `4 weeks · ${W} days/week`
    : `4 weeks · ${W} days/week · 2 meals/day`
  const dynamicMealsLine =
    plan.id === 'Weekly Flex' ? `${meals} meals / week`
    : plan.id === 'Monthly Premium' ? `${meals} meals / month`
    : plan.id === 'Monthly Max' ? `${meals} meals / month` : null
  const baseFeatures = dynamicMealsLine ? [{ ...plan.features[0], text: dynamicMealsLine }, ...plan.features.slice(1)] : plan.features
  const features = baseFeatures.slice(0, 3)

  let saveAmount: number | null = null
  if (plan.id === 'Monthly Premium') { const d = totalPrice('Weekly Flex', pref, safeCount, weekType, priceOverrides) * 4 - total; if (d > 0) saveAmount = d }
  else if (plan.id === 'Monthly Max') { const d = totalPrice('Weekly Flex', pref, safeCount, weekType, priceOverrides) * 8 - total; if (d > 0) saveAmount = d }
  const showSave = saveAmount !== null && !priceUnknown
  const saveLabel = saveAmount !== null ? (saveAmount % 1 === 0 ? `${saveAmount}` : saveAmount.toFixed(2)) : ''

  const cta: CSSProperties = {
    marginTop: 2, width: '100%', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 6,
    padding: '13px', borderRadius: 12, fontFamily: BODY, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    background: selected ? OG : featured ? 'var(--ds-og-wash-strong)' : 'var(--ds-skeleton-base)',
    color: selected ? '#fff' : featured ? OG : S.fg,
    border: selected ? '1px solid transparent' : featured ? '1px solid rgba(245,127,32,0.40)' : `1px solid ${S.border2}`,
  }

  return (
    <button
      type="button"
      onClick={() => { if (!priceUnknown) onSelect() }}
      disabled={priceUnknown}
      style={{
        ...CARD, position: 'relative', textAlign: 'left', cursor: priceUnknown ? 'not-allowed' : 'pointer',
        appearance: 'none', fontFamily: BODY, padding: featured ? '20px 18px 18px' : 18,
        display: 'flex', flexDirection: 'column', gap: 14,
        border: selected ? `1.5px solid ${OG}` : featured ? '1.5px solid var(--ds-og-border-strong)' : '1.5px solid rgba(9,24,37,0.08)',
        opacity: priceUnknown ? 0.7 : 1,
      }}
    >
      {featured && (
        <span style={{ position: 'absolute', top: -11, left: 18, background: OG, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, boxShadow: '0 4px 12px -4px rgba(245,127,32,0.7)' }}>Most Popular</span>
      )}

      {/* Header: icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--ds-skeleton-base)', color: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PlanGlyph planName={plan.id} size={17} color={OG} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: S.fg, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.id}</div>
          {plan.badge && <div style={{ fontSize: 11, fontWeight: 600, color: S.fgMuted, marginTop: 1 }}>{plan.badge}</div>}
        </div>
      </div>

      {/* Price */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: priceUnknown ? S.fgFaint : S.fg, letterSpacing: '-0.03em', lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{priceUnknown ? '—' : price}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: S.fgMuted }}>AED / meal</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: priceUnknown ? OG : (selected || featured ? OG : S.fgMuted), letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {priceUnknown ? 'Set veg days first' : `${total} AED${plan.period}`}
        </div>
        <div style={{ marginTop: 3, fontSize: 11, color: S.fgFaint }}>{dynamicDuration}</div>
        {showSave && (
          <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: 9, padding: '4px 10px', borderRadius: 999, background: 'rgba(245,127,32,0.10)', color: OG, fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}>Save {saveLabel} AED/mo vs Weekly Flex</span>
        )}
      </div>

      {/* Features (top 3) */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {features.map(f => (
          <li key={f.text} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: S.fg, lineHeight: 1.4 }}>
            <Check size={14} strokeWidth={2.6} color={OG} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>

      {plan.disclaimer && (
        <div style={{ display: 'flex', gap: 8, padding: 10, borderRadius: 10, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.22)' }}>
          <Info size={13} color="#a37800" strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 11, color: '#7a5a00', lineHeight: 1.4 }}>{plan.disclaimer}</p>
        </div>
      )}

      <span style={cta}>{selected ? <><Check size={13} strokeWidth={3} /> Selected</> : priceUnknown ? 'Pick veg days' : 'Choose plan'}</span>
    </button>
  )
}
