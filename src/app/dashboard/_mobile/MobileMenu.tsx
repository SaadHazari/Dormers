'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Moon, Truck, Lock, ChevronRight, Check, Sparkles, Clock, Utensils } from 'lucide-react'
import type { WeekMeal, WeekDayState, NoDeliveryReason } from '../menu/MenuClient'
import { SUBSCRIPTION_STATUS } from '@/contexts/subscriptions/domain/subscription-status'
import {
  MobileColumn, HeroTitle, SectionTitle, MealTag, HeatBar, MobileSheet, solidNavyBtn,
  CARD, OG, NV, S, BODY, eyebrow,
} from './kit'

/**
 * MobileMenu — ground-up mobile /menu (≤768). Desktop (MenuClient) untouched.
 * Built from .planning/mobile/MOBILE-REDESIGN-SPEC.md §7.4.
 *
 * Job: "What am I getting tonight, and when does it arrive?"
 * Scan order: title → preference line → Today spotlight (photo → name →
 *   countdown → macros → truncated description) → This week (2-across, today
 *   widened) → Next week peek → DishDetail bottom sheet on tap.
 *
 * All business logic (week build, no-delivery classification, plan-ends
 * routing) stays in MenuClient and arrives here as plain cell data + handlers.
 */

const SPICE_LABELS = ['', 'Mild', 'Medium', 'Hot']

// Countdown — copied verbatim from MenuClient.computeCountdown so the mobile
// hero shows the same status-gated, deliberately-imprecise ETA without a
// circular import. (Desktop keeps its own ticking copy.)
function computeCountdown(now: Date, subStatus: string | null): { label: string; urgent: boolean } {
  if (subStatus !== SUBSCRIPTION_STATUS.ACTIVE) {
    if (subStatus === SUBSCRIPTION_STATUS.PAUSED)    return { label: 'Plan paused — no delivery today', urgent: false }
    if (subStatus === SUBSCRIPTION_STATUS.SKIPPED)   return { label: 'Skipped today — back tomorrow', urgent: false }
    if (subStatus === SUBSCRIPTION_STATUS.SCHEDULED) return { label: 'Plan starts soon', urgent: false }
    return { label: 'No active plan', urgent: false }
  }
  // Asia/Dubai is UTC+4 year-round. Derive the AE wall day/hour/minute from
  // the epoch via getUTC* — never now.getHours()/getDay(), which read the
  // runtime's local zone. The local read both misreported the Dubai delivery
  // clock for customers in other timezones AND diverged between the server
  // (UTC) and the browser, breaking SSR hydration on this countdown text.
  const ae = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  const day = ae.getUTCDay(); const hour = ae.getUTCHours(); const minute = ae.getUTCMinutes()
  if (day === 0) return { label: 'No delivery today', urgent: false }
  if (hour === 19) return { label: 'Arriving now', urgent: true }
  if (hour < 19) {
    const minutesToTarget = (19 - hour) * 60 - minute
    if (minutesToTarget <= 30) return { label: 'Arriving soon', urgent: true }
    const hours = Math.max(1, Math.round(minutesToTarget / 60))
    return { label: `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`, urgent: false }
  }
  return { label: 'Delivered today', urgent: false }
}

export interface MobileMenuCell {
  meal: WeekMeal
  dayLabel: string
  state: WeekDayState
  reason: NoDeliveryReason | null
}

interface Props {
  prefTag: 'Veg' | 'Non Veg' | 'Mix'
  todayMeal: WeekMeal | null
  dorm: string | null
  subStatus: string | null
  resumedAfterCutoff: boolean
  nextDeliveryLabel: string
  thisWeekCells: MobileMenuCell[]
  nextWeekCells: MobileMenuCell[]
  /** Plan-ends cards route here (renew) instead of opening the dish sheet. */
  onRenew: () => void
}

// Cream-on-dark ramp (matches MobileHome / TIER_POP_TEXT — kept literal so the
// hero reads the same as the dashboard's dinner-ticket).
const CREAM = 'rgba(245,240,232,0.88)'
const CREAM_MUTED = 'rgba(245,240,232,0.72)'
const CREAM_FAINT = 'rgba(245,240,232,0.45)'

export function MobileMenu({ prefTag, todayMeal, dorm, subStatus, resumedAfterCutoff, nextDeliveryLabel, thisWeekCells, nextWeekCells, onRenew }: Props) {
  const [sheetMeal, setSheetMeal] = useState<WeekMeal | null>(null)

  return (
    <MobileColumn style={{ color: S.fg }}>

      {/* ── Title (sits beside the fixed hamburger) + preference line ──────── */}
      <div style={{ paddingLeft: 56, minHeight: 34, display: 'flex', alignItems: 'center' }}>
        <SectionTitle size={22}>My menu</SectionTitle>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12.5, color: S.fgMuted, marginTop: -6 }}>
        <span>Preference</span>
        <MealTag kind={prefTag} compact />
        <Link href="/dashboard/profile" style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 4px', margin: '-6px -4px', color: S.fgSub, fontSize: 12, fontWeight: 700, textDecoration: 'underline', textDecorationColor: 'var(--ds-fg-tint)', textUnderlineOffset: 3, touchAction: 'manipulation' }}>Change</Link>
        <span style={{ color: S.fgFaint }}>·</span>
        <span>7–8 PM · Sun off</span>
      </div>

      {/* ── Today spotlight ─────────────────────────────────────────────────── */}
      <TodaySpotlight
        meal={todayMeal}
        subStatus={subStatus}
        dorm={dorm}
        resumedAfterCutoff={resumedAfterCutoff}
        nextDeliveryLabel={nextDeliveryLabel}
        onOpen={() => todayMeal && setSheetMeal(todayMeal)}
      />

      {/* ── This week (2-across, today widened) ─────────────────────────────── */}
      <SectionHeader label="This week" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {thisWeekCells.map((c, i) => (
          <DayCard
            key={i}
            cell={c}
            wide={c.state === 'today' && c.reason === null && c.meal.tag !== 'Off'}
            onClick={c.reason === 'plan-ends' ? onRenew : () => setSheetMeal(c.meal)}
          />
        ))}
      </div>

      {/* ── Next week peek (horizontal scroller) ────────────────────────────── */}
      <SectionHeader label="Next week" />
      <div
        className="mobile-menu-peek"
        style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -14px', padding: '2px 14px 4px', WebkitOverflowScrolling: 'touch' }}
      >
        {nextWeekCells.map((c, i) => (
          <PeekCard
            key={i}
            cell={c}
            onClick={c.reason === 'plan-ends' ? onRenew : () => setSheetMeal(c.meal)}
          />
        ))}
      </div>

      {/* ── Dish detail — bottom sheet on mobile (never opens on desktop: the
          mobile tree is display:none ≥768, so there's no clickable trigger). ── */}
      <MobileSheet
        open={sheetMeal !== null}
        onClose={() => setSheetMeal(null)}
        ariaLabel="Dish details"
        footer={
          <button type="button" onClick={() => setSheetMeal(null)} style={solidNavyBtn}>Got it</button>
        }
      >
        {sheetMeal && <DishDetail meal={sheetMeal} />}
      </MobileSheet>
    </MobileColumn>
  )
}

// ── Today spotlight ──────────────────────────────────────────────────────────
function TodaySpotlight({ meal, subStatus, dorm, resumedAfterCutoff, nextDeliveryLabel, onOpen }: {
  meal: WeekMeal | null
  subStatus: string | null
  dorm: string | null
  resumedAfterCutoff: boolean
  nextDeliveryLabel: string
  onOpen: () => void
}) {
  const [ct, setCt] = useState(() => computeCountdown(new Date(), subStatus))
  useEffect(() => {
    setCt(computeCountdown(new Date(), subStatus))
    const t = setInterval(() => setCt(computeCountdown(new Date(), subStatus)), 30_000)
    return () => clearInterval(t)
  }, [subStatus])

  // Rest day (Sunday) — light card, nothing to anchor.
  if (!meal) {
    return (
      <div style={{ ...CARD, padding: '34px 22px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Moon size={26} strokeWidth={1.7} color={S.fgMuted} />
        <div style={{ fontSize: 18, fontWeight: 800, color: S.fg }}>Sunday — no delivery</div>
        <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>Rest up. Next delivery Monday at 7 PM.</div>
      </div>
    )
  }

  // Resumed after the 2 PM kitchen cutoff — nothing prepped tonight.
  if (resumedAfterCutoff) {
    return (
      <div style={{ ...CARD, background: 'linear-gradient(105deg, rgba(245,127,32,0.10) 0%, rgba(245,127,32,0.03) 55%, #fdfbf6 100%)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Moon size={26} strokeWidth={1.7} color="rgba(200,148,23,0.85)" />
        <SectionTitle size={21}>No delivery tonight</SectionTitle>
        <p style={{ margin: 0, fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55 }}>
          You resumed after the 2 PM kitchen cutoff — your first delivery is <strong style={{ color: S.fg, fontWeight: 700 }}>{nextDeliveryLabel}</strong>, 7–8 PM. Tonight&rsquo;s slot moves to the end of your plan — nothing is lost.
        </p>
      </div>
    )
  }

  // Active dish — dark photo-led ticket. Photo → name → countdown → macros →
  // truncated description (full description lives one tap down in the sheet).
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Tonight: ${meal.dish}. Tap for details.`}
      style={{
        position: 'relative', appearance: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, border: 'none',
        background: 'linear-gradient(150deg, #1f4456 0%, #0c1f2e 62%, #091825 100%)',
        borderRadius: 24, overflow: 'hidden', fontFamily: BODY,
        boxShadow: '0 10px 34px -12px rgba(9,24,37,0.55), 0 2px 6px rgba(9,24,37,0.18)',
      }}
    >
      {/* Photo */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', background: 'linear-gradient(135deg, #3a2418, #1e3a4f)' }}>
        {meal.image
          ? <Image src={meal.image} alt={meal.dish} fill sizes="(max-width: 768px) 100vw, 480px" style={{ objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}><Utensils size={28} color={CREAM_FAINT} /></div>}
        <span style={{ position: 'absolute', top: 14, left: 14, ...eyebrow, color: '#fff', letterSpacing: '0.18em', background: 'rgba(9,24,37,0.55)', padding: '5px 10px', borderRadius: 999, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
          Tonight
        </span>
      </div>

      <div style={{ padding: 20 }}>
        <HeroTitle>{meal.dish}</HeroTitle>

        {/* Countdown — above description, urgent keeps orange */}
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: ct.urgent ? 'rgba(245,127,32,0.14)' : 'rgba(245,240,232,0.07)', border: `1px solid ${ct.urgent ? 'rgba(245,127,32,0.35)' : 'rgba(245,240,232,0.14)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Truck size={14} strokeWidth={2} color={ct.urgent ? OG : CREAM_MUTED} />
            {/* Live countdown — intentionally time-dependent; suppress the
                hydration warning for the rare SSR↔hydration minute-boundary flip. */}
            <span suppressHydrationWarning style={{ fontSize: 12.5, fontWeight: 700, color: ct.urgent ? OG : CREAM_MUTED }}>{ct.label}</span>
          </span>
          {dorm && <span style={{ fontSize: 11, fontWeight: 600, color: CREAM_MUTED, background: 'rgba(245,240,232,0.10)', padding: '2px 8px', borderRadius: 999 }}>{dorm}</span>}
        </div>

        <MacroShelf meal={meal} />

        {meal.sub && (
          <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: CREAM_MUTED, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>
            {meal.sub}
          </p>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 10, fontSize: 11.5, fontWeight: 700, color: CREAM }}>
          View dish <ChevronRight size={14} strokeWidth={2.4} />
        </span>
      </div>
    </button>
  )
}

// Dark inset macro shelf — calories / protein / spice. Mirrors desktop TodaySpotlight.
function MacroShelf({ meal }: { meal: WeekMeal }) {
  const cell: CSSProperties = { flex: 1, padding: '9px 0', textAlign: 'center', background: 'rgba(245,240,232,0.06)' }
  const cap: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: CREAM_FAINT }
  const val: CSSProperties = { fontSize: 18, fontWeight: 800, color: CREAM, fontFeatureSettings: '"tnum"', lineHeight: 1.2, marginTop: 3 }
  const div = <div style={{ width: 1, background: 'rgba(245,240,232,0.12)' }} />
  return (
    <div style={{ display: 'flex', marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(245,240,232,0.14)', boxShadow: 'inset 0 1px 0 rgba(245,240,232,0.10), inset 0 -1px 0 rgba(9,24,37,0.12)' }}>
      <div style={cell}><div style={cap}>Calories</div><div style={val}>{meal.cal.toFixed(0)}<span style={{ fontSize: 10, fontWeight: 500, color: CREAM_MUTED }}> kcal</span></div></div>
      {div}
      <div style={cell}><div style={cap}>Protein</div><div style={val}>{meal.protein.toFixed(0)}<span style={{ fontSize: 10, fontWeight: 500, color: CREAM_MUTED }}> g</span></div></div>
      {meal.heat > 0 && (<>{div}<div style={{ ...cell, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><div style={cap}>Spice</div><HeatBar level={meal.heat} onDark /></div></>)}
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
      <span style={eyebrow}>{label}</span>
      <span style={{ flex: 1, height: 1, background: S.border }} />
    </div>
  )
}

// ── Reason chip config (mirrors desktop noDeliveryConfig) ────────────────────
const REASON: Record<NoDeliveryReason, { Icon: typeof Moon; label: string; color: string }> = {
  'today-skipped':  { Icon: Moon, label: 'Not tonight',     color: 'rgba(140,110,60,0.78)' },
  'past-skipped':   { Icon: Moon, label: 'Skipped',         color: 'rgba(140,110,60,0.78)' },
  'future-skipped': { Icon: Moon, label: 'Skipped',         color: 'rgba(140,110,60,0.78)' },
  'pause-start':    { Icon: Moon, label: 'Pause begins',    color: 'rgba(30,58,79,0.78)' },
  'in-pause':       { Icon: Moon, label: 'Paused',          color: 'rgba(30,58,79,0.72)' },
  'plan-ends':      { Icon: Lock, label: 'Renew to unlock', color: 'rgba(90,84,72,0.82)' },
}

function stateChip(cell: MobileMenuCell): { Icon: typeof Moon; label: string; color: string } {
  if (cell.reason) return REASON[cell.reason]
  if (cell.state === 'past') return { Icon: Check, label: 'Delivered', color: 'rgba(29,138,48,0.80)' }
  if (cell.state === 'today') return { Icon: Sparkles, label: 'Today', color: OG }
  return { Icon: Clock, label: 'Upcoming', color: 'rgba(29,95,163,0.70)' }
}

// ── Week day card (this-week grid) ───────────────────────────────────────────
function DayCard({ cell, wide, onClick }: { cell: MobileMenuCell; wide: boolean; onClick: () => void }) {
  const { meal, dayLabel, reason } = cell
  const isOff = meal.tag === 'Off'
  const isToday = cell.state === 'today' && reason === null && !isOff
  const isPlanEnds = reason === 'plan-ends'
  const chip = stateChip(cell)

  const card: CSSProperties = {
    ...CARD,
    gridColumn: wide ? '1 / -1' : undefined,
    padding: 0, overflow: 'hidden', textAlign: 'left', cursor: isOff ? 'default' : 'pointer',
    appearance: 'none', fontFamily: BODY, display: 'flex',
    flexDirection: wide ? 'row' : 'column',
    border: isToday ? `1.5px solid rgba(245,127,32,0.45)` : (CARD.border as string),
    boxShadow: isToday ? '0 4px 18px -8px rgba(245,127,32,0.4), 0 1px 2px rgba(9,24,37,0.05)' : CARD.boxShadow,
    opacity: isPlanEnds ? 0.82 : 1,
  }

  const photo = (
    <div style={{ position: 'relative', flexShrink: 0, width: wide ? 116 : '100%', aspectRatio: wide ? undefined : '16 / 10', alignSelf: 'stretch', background: 'linear-gradient(135deg, #3a2418, #1e3a4f)' }}>
      {meal.image && !isOff
        ? <Image src={meal.image} alt={meal.dish} fill sizes="(max-width: 768px) 50vw, 200px" style={{ objectFit: 'cover', filter: isPlanEnds ? 'grayscale(1) brightness(0.92)' : undefined }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{isOff ? <Moon size={20} color="#fff" /> : <Utensils size={20} color="#fff" />}</div>}
      {isPlanEnds && meal.image && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(9,24,37,0.30)' }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(245,240,232,0.92)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(9,24,37,0.3)' }}><Lock size={14} strokeWidth={2.2} color={NV} /></span>
        </div>
      )}
    </div>
  )

  const body = (
    <div style={{ flex: 1, minWidth: 0, padding: wide ? '12px 14px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: isToday ? OG : S.fgSub }}>{dayLabel}</span>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: S.fgFaint }}>{meal.date}</span>
      </div>
      <div style={{ fontSize: wide ? 14 : 13, fontWeight: 700, lineHeight: 1.25, color: S.fg, opacity: isOff ? 0.55 : 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>
        {meal.dish}{isToday && <span style={{ color: OG }}>.</span>}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {isOff
          ? <span style={{ fontSize: 11, color: S.fgFaint }}>Rest day</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: chip.color }}><chip.Icon size={11} strokeWidth={2.2} />{chip.label}</span>}
        {!isOff && !reason && <MealTag kind={meal.tag} compact />}
      </div>
    </div>
  )

  return (
    <button type="button" onClick={isOff ? undefined : onClick} disabled={isOff} style={card}>
      {photo}{body}
    </button>
  )
}

// ── Next-week peek card (narrow, horizontal scroll) ──────────────────────────
function PeekCard({ cell, onClick }: { cell: MobileMenuCell; onClick: () => void }) {
  const { meal, dayLabel, reason } = cell
  const isOff = meal.tag === 'Off'
  const isPlanEnds = reason === 'plan-ends'
  return (
    <button
      type="button"
      onClick={isOff ? undefined : onClick}
      disabled={isOff}
      style={{ ...CARD, flex: '0 0 auto', width: 132, scrollSnapAlign: 'start', padding: 0, overflow: 'hidden', textAlign: 'left', cursor: isOff ? 'default' : 'pointer', appearance: 'none', fontFamily: BODY, opacity: isPlanEnds ? 0.82 : 1 }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'linear-gradient(135deg, #3a2418, #1e3a4f)' }}>
        {meal.image && !isOff
          ? <Image src={meal.image} alt={meal.dish} fill sizes="132px" style={{ objectFit: 'cover', filter: isPlanEnds ? 'grayscale(1) brightness(0.92)' : undefined }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{isOff ? <Moon size={18} color="#fff" /> : <Utensils size={18} color="#fff" />}</div>}
      </div>
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.fgSub }}>{dayLabel} · {meal.date}</span>
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: S.fg, opacity: isOff ? 0.55 : 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>{meal.dish}</span>
      </div>
    </button>
  )
}

// ── Dish detail (sheet body) ─────────────────────────────────────────────────
function DishDetail({ meal }: { meal: WeekMeal }) {
  const macro: CSSProperties = { flex: 1, padding: '12px 14px', borderRadius: 12, background: 'var(--ds-surface2)', border: `1px solid ${S.border}` }
  const macroCap: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted }
  const macroVal: CSSProperties = { marginTop: 5, fontSize: 24, fontWeight: 800, color: S.fg, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }
  return (
    <div style={{ paddingTop: 4 }}>
      {meal.image && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--ds-skeleton-base)' }}>
          <Image src={meal.image} alt={meal.dish} fill sizes="(max-width: 768px) 100vw, 460px" style={{ objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ ...eyebrow, color: S.fgMuted }}>{meal.day} · {meal.date}</div>
      <div style={{ marginTop: 8 }}><SectionTitle size={22}>{meal.dish}</SectionTitle></div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <div style={macro}><div style={macroCap}>Calories</div><div style={macroVal}>{meal.cal.toFixed(0)}<span style={{ fontSize: 12, fontWeight: 500, color: S.fgMuted }}> kcal</span></div></div>
        <div style={macro}><div style={macroCap}>Protein</div><div style={macroVal}>{meal.protein.toFixed(0)}<span style={{ fontSize: 12, fontWeight: 500, color: S.fgMuted }}> g</span></div></div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <MealTag kind={meal.tag} />
        {meal.heat > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: S.fgMuted }}>{SPICE_LABELS[meal.heat]} <HeatBar level={meal.heat} /></span>}
      </div>
      {meal.sub && <p style={{ margin: '14px 0 0', fontSize: 13.5, color: S.fgMuted, lineHeight: 1.6 }}>{meal.sub}</p>}
    </div>
  )
}
