'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Moon, Truck, Lock, ChevronRight, Check, Sparkles, Clock, Utensils } from 'lucide-react'
import type { WeekMeal, WeekDayState } from '../menu/MenuClient'
import type { NoDeliveryReason, RenewGate } from '../_shared/menu-day-status'
import type { Spotlight } from '../_shared/menu-spotlight'
import { reasonChip, lastDinnerChip, GREY_CARD_BG, GREY_PHOTO_FILTER, type ReasonChip } from '../_shared/menu-reason-chip'
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
 * All business logic (week build, day status, which top card, renew gates)
 * stays in MenuClient and the _shared/menu-* modules and arrives here as plain
 * props, so the two trees can't tell a customer different things.
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
  /** No plan, ever: no state chip and no "today" treatment (see desktop WeekDayCard.noPlan). */
  noPlan?: boolean
  /** Why this dinner won't come — the first line of the dish sheet. */
  note: string | null
  /** The plan's end date: the one card that says "Last dinner". */
  lastDinner?: boolean
}

interface Props {
  prefTag: 'Veg' | 'Non Veg' | 'Mix'
  /** "Mon, Wed" for a religious customer, else null. */
  vegDaysLabel: string | null
  todayMeal: WeekMeal | null
  todayNote: string | null
  dorm: string | null
  /** Which card tonight gets (_shared/menu-spotlight.ts). */
  spotlight: Spotlight
  /** Words for every card except the dinner ticket and the rest day. */
  notice: { headline: string; body: string } | null
  restCopy: { headline: string; body: string }
  planName: string | null
  /** A live pause — the paused card links to the Resume button on the dashboard. */
  canResume: boolean
  /** "tomorrow" / "Fri, 18 Sep" when the plan's last dinner is 1–7 days away. */
  endingLabel: string | null
  renew: RenewGate
  thisWeekCells: MobileMenuCell[]
  nextWeekCells: MobileMenuCell[]
  onNavigate: (href: string) => void
}

// Cream-on-dark ramp (matches MobileHome / TIER_POP_TEXT — kept literal so the
// hero reads the same as the dashboard's dinner-ticket).
const CREAM = 'rgba(245,240,232,0.88)'
const CREAM_MUTED = 'rgba(245,240,232,0.72)'
const CREAM_FAINT = 'rgba(245,240,232,0.45)'

const PILL: CSSProperties = { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2, padding: '10px 16px', borderRadius: 999, border: 0, background: OG, color: '#fff', cursor: 'pointer', fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', touchAction: 'manipulation' }

export function MobileMenu({ prefTag, vegDaysLabel, todayMeal, todayNote, dorm, spotlight, notice, restCopy, planName, canResume, endingLabel, renew, thisWeekCells, nextWeekCells, onNavigate }: Props) {
  const [sheet, setSheet] = useState<{ meal: WeekMeal; note: string | null } | null>(null)
  const renewHref = renew.kind === 'open' ? renew.href : null
  // Days after the plan, while renewing is open, go straight to renew; every
  // other card opens the dish sheet with its reason line.
  const openCell = (c: MobileMenuCell) => c.reason === 'plan-ends' && renewHref
    ? () => onNavigate(renewHref)
    : () => setSheet({ meal: c.meal, note: c.note })

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
      {/* A religious customer's veg days get their own line — squeezed into the
          row above they wrapped it and stranded the separator. */}
      {vegDaysLabel && (
        <div style={{ fontSize: 12.5, color: S.fgMuted, marginTop: -8 }}>
          Veg on <strong style={{ fontWeight: 700, color: S.fgSub }}>{vegDaysLabel}</strong>
        </div>
      )}

      {/* ── Today spotlight ─────────────────────────────────────────────────── */}
      <TodaySpotlight
        meal={todayMeal}
        dorm={dorm}
        spotlight={spotlight}
        notice={notice}
        restCopy={restCopy}
        canResume={canResume}
        renew={renew}
        onOpen={() => todayMeal && setSheet({ meal: todayMeal, note: todayNote })}
        onNavigate={onNavigate}
      />

      {/* ── End of the plan, nothing queued ─────────────────────────────────── */}
      {spotlight.kind === 'dinner' && spotlight.lastDinner && (
        <EndingStrip renew={renew} onNavigate={onNavigate}>
          Last dinner of your <strong style={{ color: OG, fontWeight: 700 }}>{planName ?? 'plan'}</strong> tonight.
        </EndingStrip>
      )}
      {endingLabel && (
        <EndingStrip renew={renew} onNavigate={onNavigate}>
          Your last dinner is <strong style={{ fontWeight: 700 }}>{endingLabel}</strong>.
        </EndingStrip>
      )}

      {/* ── This week (2-across, today widened) ─────────────────────────────── */}
      <SectionHeader label="This week" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {thisWeekCells.map((c, i) => (
          <DayCard
            key={i}
            cell={c}
            renewKind={renew.kind}
            wide={c.state === 'today' && c.reason === null && c.meal.tag !== 'Off' && !c.noPlan}
            onClick={openCell(c)}
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
          <PeekCard key={i} cell={c} renewKind={renew.kind} onClick={openCell(c)} />
        ))}
      </div>

      {/* ── Dish detail — bottom sheet on mobile (never opens on desktop: the
          mobile tree is display:none ≥768, so there's no clickable trigger). ── */}
      <MobileSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        ariaLabel="Dish details"
        footer={
          <button type="button" onClick={() => setSheet(null)} style={solidNavyBtn}>Got it</button>
        }
      >
        {sheet && <DishDetail meal={sheet.meal} note={sheet.note} />}
      </MobileSheet>
    </MobileColumn>
  )
}

// Renew, the way the dashboard's plan card does it: open → the same plan,
// preselected; blocked → a grey pill with the reason under it; season → a note.
function RenewAction({ renew, label = 'Renew →', onNavigate }: { renew: RenewGate; label?: string; onNavigate: (href: string) => void }) {
  if (renew.kind === 'season') {
    return <span style={{ fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>{renew.note}</span>
  }
  if (renew.kind === 'blocked') {
    return (
      <span style={{ alignSelf: 'flex-start', display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <span aria-disabled="true" style={{ ...PILL, marginTop: 0, background: 'var(--ds-fg-tint)', color: 'rgba(255,255,255,0.85)', cursor: 'not-allowed' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: S.fgMuted, lineHeight: 1.4 }}>{renew.reason}</span>
      </span>
    )
  }
  const href = renew.href
  return <button type="button" onClick={() => onNavigate(href)} style={{ ...PILL, marginTop: 0 }}>{label}</button>
}

// Thin warm strip for the end of a plan — same words as the desktop line.
function EndingStrip({ renew, onNavigate, children }: { renew: RenewGate; onNavigate: (href: string) => void; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 16, background: 'rgba(245,127,32,0.07)', border: '1px solid rgba(245,127,32,0.22)' }}>
      <span style={{ fontSize: 13, color: S.fg, lineHeight: 1.45 }}>{children}</span>
      <RenewAction renew={renew} onNavigate={onNavigate} />
    </div>
  )
}

// Shared shell for the "nothing arrives tonight" spotlight family — mirrors
// the desktop SpotlightNotice (orange edge-wash on the light card).
function SpotlightNotice({ headline, children }: { headline: string; children: ReactNode }) {
  return (
    <div style={{ ...CARD, background: 'linear-gradient(105deg, rgba(245,127,32,0.10) 0%, rgba(245,127,32,0.03) 55%, #fdfbf6 100%)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Moon size={26} strokeWidth={1.7} color="rgba(200,148,23,0.85)" />
      <SectionTitle size={21}>{headline}</SectionTitle>
      {children}
    </div>
  )
}

// ── Today spotlight ──────────────────────────────────────────────────────────
function TodaySpotlight({ meal, dorm, spotlight, notice, restCopy, canResume, renew, onOpen, onNavigate }: {
  meal: WeekMeal | null
  dorm: string | null
  spotlight: Spotlight
  notice: { headline: string; body: string } | null
  restCopy: { headline: string; body: string }
  canResume: boolean
  renew: RenewGate
  onOpen: () => void
  onNavigate: (href: string) => void
}) {
  // Only the dinner ticket counts down; every other card is static.
  const [ct, setCt] = useState(() => computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE))
  useEffect(() => {
    setCt(computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE))
    const t = setInterval(() => setCt(computeCountdown(new Date(), SUBSCRIPTION_STATUS.ACTIVE)), 30_000)
    return () => clearInterval(t)
  }, [])

  // Rest day (Sunday, or Saturday on a 5-day plan) — light card, nothing to anchor.
  if (spotlight.kind === 'rest' || !meal) {
    return (
      <div style={{ ...CARD, padding: '34px 22px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Moon size={26} strokeWidth={1.7} color={S.fgMuted} />
        <div style={{ fontSize: 18, fontWeight: 800, color: S.fg }}>{restCopy.headline}</div>
        <div style={{ fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>{restCopy.body}</div>
      </div>
    )
  }

  // Nothing arrives tonight — same family, same words as the desktop card.
  // The dark ticket (TONIGHT badge, macros, "View dish") used to render here
  // and contradict the grey card right below it.
  if (notice) {
    const showDish = spotlight.kind !== 'closure' && spotlight.kind !== 'resumed-late'
    return (
      <SpotlightNotice headline={notice.headline}>
        <p style={{ margin: 0, fontSize: 13.5, color: S.fgMuted, lineHeight: 1.55 }}>{notice.body}</p>
        {showDish && (
          <button type="button" onClick={onOpen} style={{ appearance: 'none', background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
            On the menu tonight: <strong style={{ color: S.fg, fontWeight: 700 }}>{meal.dish}</strong> <span style={{ color: OG, fontWeight: 700, whiteSpace: 'nowrap' }}>View dish →</span>
          </button>
        )}
        {spotlight.kind === 'none' && (
          <button type="button" onClick={() => onNavigate('/dashboard/explore-plans')} style={PILL}>Explore plans →</button>
        )}
        {spotlight.kind === 'ended' && <RenewAction renew={renew} label="Renew plan →" onNavigate={onNavigate} />}
        {spotlight.kind === 'paused' && canResume && (
          <button type="button" onClick={() => onNavigate('/dashboard')} style={PILL}>Resume plan →</button>
        )}
      </SpotlightNotice>
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
      {meal.heat > 0 && (<>{div}<div style={{ ...cell, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}><div style={cap}>Spice</div><div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><HeatBar level={meal.heat} onDark /><span style={{ fontSize: 10, fontWeight: 700, color: CREAM_MUTED, textTransform: 'uppercase', letterSpacing: '0.10em' }}>{SPICE_LABELS[meal.heat]}</span></div></div></>)}
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

function stateChip(cell: MobileMenuCell, renewKind: RenewGate['kind']): ReasonChip | null {
  if (cell.reason) return reasonChip(cell.reason, renewKind)
  if (cell.noPlan) return null
  if (cell.lastDinner) return lastDinnerChip(cell.state)
  if (cell.state === 'past') return { Icon: Check, label: 'Delivered', color: 'rgba(29,138,48,0.80)' }
  if (cell.state === 'today') return { Icon: Sparkles, label: 'Today', color: OG }
  return { Icon: Clock, label: 'Upcoming', color: 'rgba(29,95,163,0.70)' }
}

// Lock badge over a grey photo — only while renewing unlocks the day.
function LockBadge({ size }: { size: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(9,24,37,0.30)' }}>
      <span style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(245,240,232,0.92)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(9,24,37,0.3)' }}><Lock size={size * 0.44} strokeWidth={2.2} color={NV} /></span>
    </div>
  )
}

// ── Week day card (this-week grid) ───────────────────────────────────────────
function DayCard({ cell, wide, renewKind, onClick }: { cell: MobileMenuCell; wide: boolean; renewKind: RenewGate['kind']; onClick: () => void }) {
  const { meal, dayLabel, reason } = cell
  const isOff = meal.tag === 'Off'
  const isToday = cell.state === 'today' && reason === null && !isOff && !cell.noPlan
  // Grey = this dinner won't reach the customer (skipped, paused, closed, not
  // started, after the plan). The lock on days after the plan, except over the
  // semester break, when new plans are closed.
  const isGrey = reason !== null && !isOff
  const isLocked = reason === 'plan-ends' && renewKind !== 'season'
  const chip = stateChip(cell, renewKind)

  const card: CSSProperties = {
    ...CARD,
    background: isGrey ? GREY_CARD_BG : CARD.background,
    gridColumn: wide ? '1 / -1' : undefined,
    padding: 0, overflow: 'hidden', textAlign: 'left', cursor: isOff ? 'default' : 'pointer',
    appearance: 'none', fontFamily: BODY, display: 'flex',
    flexDirection: wide ? 'row' : 'column',
    border: isToday ? `1.5px solid rgba(245,127,32,0.45)` : isLocked ? '1px dashed rgba(9,24,37,0.18)' : (CARD.border as string),
    boxShadow: isToday ? '0 4px 18px -8px rgba(245,127,32,0.4), 0 1px 2px rgba(9,24,37,0.05)' : CARD.boxShadow,
    opacity: isLocked ? 0.82 : 1,
  }

  const photo = (
    <div style={{ position: 'relative', flexShrink: 0, width: wide ? 116 : '100%', aspectRatio: wide ? undefined : '16 / 10', alignSelf: 'stretch', background: 'linear-gradient(135deg, #3a2418, #1e3a4f)' }}>
      {meal.image && !isOff
        ? <Image src={meal.image} alt={meal.dish} fill sizes="(max-width: 768px) 50vw, 200px" style={{ objectFit: 'cover', filter: isGrey ? GREY_PHOTO_FILTER : undefined }} />
        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{isOff ? <Moon size={20} color="#fff" /> : <Utensils size={20} color="#fff" />}</div>}
      {isLocked && meal.image && <LockBadge size={32} />}
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
      {/* Diet tag on every dinner, labelled or not — desktop always showed it. */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, rowGap: 4, flexWrap: 'wrap' }}>
        {isOff
          ? <span style={{ fontSize: 11, color: S.fgFaint }}>Rest day</span>
          : chip
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: chip.color, whiteSpace: 'nowrap' }}><chip.Icon size={11} strokeWidth={2.2} />{chip.label}</span>
            : <span />}
        {!isOff && <MealTag kind={meal.tag} compact />}
      </div>
    </div>
  )

  return (
    <button type="button" onClick={isOff ? undefined : onClick} disabled={isOff} data-reason={reason ?? undefined} style={card}>
      {photo}{body}
    </button>
  )
}

// ── Next-week peek card (narrow, horizontal scroll) ──────────────────────────
function PeekCard({ cell, renewKind, onClick }: { cell: MobileMenuCell; renewKind: RenewGate['kind']; onClick: () => void }) {
  const { meal, dayLabel, reason } = cell
  const isOff = meal.tag === 'Off'
  const isGrey = reason !== null && !isOff
  const isLocked = reason === 'plan-ends' && renewKind !== 'season'
  return (
    <button
      type="button"
      onClick={isOff ? undefined : onClick}
      disabled={isOff}
      style={{ ...CARD, background: isGrey ? GREY_CARD_BG : CARD.background, flex: '0 0 auto', width: 132, scrollSnapAlign: 'start', padding: 0, overflow: 'hidden', textAlign: 'left', cursor: isOff ? 'default' : 'pointer', appearance: 'none', fontFamily: BODY, border: isLocked ? '1px dashed rgba(9,24,37,0.18)' : (CARD.border as string), opacity: isLocked ? 0.82 : 1 }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'linear-gradient(135deg, #3a2418, #1e3a4f)' }}>
        {meal.image && !isOff
          ? <Image src={meal.image} alt={meal.dish} fill sizes="132px" style={{ objectFit: 'cover', filter: isGrey ? GREY_PHOTO_FILTER : undefined }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{isOff ? <Moon size={18} color="#fff" /> : <Utensils size={18} color="#fff" />}</div>}
        {isLocked && meal.image && <LockBadge size={26} />}
      </div>
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.fgSub }}>{dayLabel} · {meal.date}</span>
        <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: S.fg, opacity: isOff ? 0.55 : 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as CSSProperties}>{meal.dish}</span>
        {/* Status chip only when there is a reason or it's the last dinner; a
            plain upcoming day keeps the rail quiet. */}
        {!isOff && (reason || cell.lastDinner) && (() => {
          const chip = reason ? reasonChip(reason, renewKind) : lastDinnerChip(cell.state)
          return (
            <span style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: chip.color }}>
              <chip.Icon size={10} strokeWidth={2.2} />{chip.label}
            </span>
          )
        })()}
      </div>
    </button>
  )
}

// ── Dish detail (sheet body) ─────────────────────────────────────────────────
function DishDetail({ meal, note }: { meal: WeekMeal; note: string | null }) {
  const macro: CSSProperties = { flex: 1, padding: '12px 14px', borderRadius: 12, background: 'var(--ds-surface2)', border: `1px solid ${S.border}` }
  const macroCap: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted }
  const macroVal: CSSProperties = { marginTop: 5, fontSize: 24, fontWeight: 800, color: S.fg, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }
  return (
    <div style={{ paddingTop: 4 }}>
      {/* Why this dinner won't come — read before the photo sells it. */}
      {note && (
        // marginRight clears the sheet's close button, which sits over this row.
        <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, marginRight: 40, padding: '10px 12px', borderRadius: 12, background: 'var(--ds-surface2)', border: `1px solid ${S.border}`, fontSize: 13, color: S.fgSub, lineHeight: 1.5 }}>
          <Moon size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 3 }} />
          <span>{note}</span>
        </div>
      )}
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
