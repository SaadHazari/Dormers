'use client'

import { useEffect, useState } from 'react'
import Image, { StaticImageData } from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Moon, Utensils, Check, Sparkles, Clock } from 'lucide-react'
import { MENU_DATA, getMenuWeek } from '@/app/components/Menu'

import { OG, NV, CR, BG, BODY, S, TIER1, TIER2, TIER3 } from '../_shared/tokens'

// DISPLAY alias kept for readability — same font as BODY (single typeface).
const DISPLAY = BODY

// ── Data types ────────────────────────────────────────────────────────────────
interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null
  meal_preference_type?: string | null; dorm_name?: string | null; created_at: string
}

type WeekMeal = {
  day: string        // 'Monday' … 'Sunday'
  date: string       // 'Apr 28'
  dish: string
  sub: string
  tag: 'Veg' | 'Non Veg' | 'Off'
  heat: number
  cal: number
  protein: number
  image: string | StaticImageData | null
}

// ── Small shared components ───────────────────────────────────────────────────
function Eyebrow({ children, color = S.fgMuted }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color, lineHeight: 1 }}>
      {children}
    </div>
  )
}

// compact=true → 'N.V' for tight spaces (e.g. 7-col next-week grid)
function MealTag({ kind, compact }: { kind: string; compact?: boolean }) {
  const map: Record<string, { bg: string; fg: string; mark: string }> = {
    'Non Veg': { bg: 'rgba(245,127,32,0.14)', fg: '#a35100', mark: OG },
    'Veg':     { bg: 'rgba(9,145,14,0.12)',   fg: '#1d8a30', mark: '#1d8a30' },
    'Off':     { bg: 'rgba(9,24,37,0.06)',    fg: 'rgba(9,24,37,0.55)', mark: 'rgba(9,24,37,0.40)' },
  }
  const c = map[kind] || map.Veg
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: c.bg, color: c.fg, fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: kind === 'Veg' ? 'transparent' : c.mark, boxShadow: kind === 'Veg' ? `inset 0 0 0 1.5px ${c.mark}` : 'none' }} />
      {kind === 'Non Veg' ? (compact ? 'N.V' : 'Non-Veg') : kind}
    </span>
  )
}

function HeatBar({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 5, height: 9, borderRadius: 1.5, background: i < level ? OG : 'rgba(9,24,37,0.12)' }} />
      ))}
    </div>
  )
}

// ── Menu data helpers ─────────────────────────────────────────────────────────
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function buildFullMenu(prefIsVeg: boolean): { week: string; meals: WeekMeal[] }[] {
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
  const todayDay = todayMidnight.getDay()

  const mondayOffset = todayDay === 0 ? 1 : 1 - todayDay
  const thisMonday = new Date(todayMidnight)
  thisMonday.setDate(todayMidnight.getDate() + mondayOffset)

  const nextMonday = new Date(thisMonday)
  nextMonday.setDate(thisMonday.getDate() + 7)

  const blocks = [
    { week: 'This Week', start: thisMonday },
    { week: 'Next Week', start: nextMonday },
  ]

  return blocks.map(block => {
    const weekKey = getMenuWeek(block.start)
    const dishes = MENU_DATA.filter(d => d.week === weekKey && d.isVeg === prefIsVeg)
    const dishByDay = new Map(dishes.map(d => [d.dayOfWeek, d]))

    const meals: WeekMeal[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(block.start); day.setDate(block.start.getDate() + i)
      const isOff = i === 6
      const dish = isOff ? null : dishByDay.get(i)
      const cal     = dish ? parseFloat(String(dish.nutrients.calories).replace(/[^\d.]/g, '')) || 0 : 0
      const protein = dish ? parseFloat(String(dish.nutrients.protein).replace(/[^\d.]/g, '')) || 0 : 0

      meals.push({
        day:   FULL_DAYS[i],
        date:  day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dish:  isOff ? 'Sunday OFF' : dish?.name ?? 'Menu coming soon',
        sub:   isOff ? 'No delivery — rest day' : dish?.description ?? '',
        tag:   isOff ? 'Off' : (prefIsVeg ? 'Veg' : 'Non Veg'),
        heat:  isOff ? 0 : dish?.spiceLevel ?? 1,
        cal, protein,
        image: isOff ? null : dish?.image ?? null,
      })
    }
    return { week: block.week, meals }
  })
}

// Monday-first index for today: 0=Mon … 5=Sat … 6=Sun
function todayMonIdx(): number {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
}

// ── Today's delivery countdown ────────────────────────────────────────────────
// Deliberately imprecise — see ClientDashboard.computeCountdown for rationale.
// Rounded to the nearest hour with a "~" prefix; under 30 minutes we swap to
// "Arriving soon" so the user doesn't latch onto a minute-accurate ETA.
function computeCountdown(now: Date): { label: string; urgent: boolean } {
  const day = now.getDay(); const hour = now.getHours()
  if (day === 0) return { label: 'No delivery today', urgent: false }
  if (hour === 19) return { label: 'Arriving now', urgent: true }
  if (hour < 19) {
    const target = new Date(now); target.setHours(19, 0, 0, 0)
    const diff = target.getTime() - now.getTime()
    const totalMinutes = Math.floor(diff / 60_000)
    if (totalMinutes <= 30) return { label: 'Arriving soon', urgent: true }
    const hours = Math.max(1, Math.round(diff / 3_600_000))
    return { label: `Arriving in ~${hours} ${hours === 1 ? 'hour' : 'hours'}`, urgent: false }
  }
  return { label: 'Delivered today', urgent: false }
}

// ── Today's spotlight — full-width horizontal hero section ───────────────────
// Two-column split: photo left, dish details right. Photo is the "menu item"
// surface (not a portrait sticky), so the page reads as a catalog with today
// promoted to the top spot. Dish-name typography + edge accent borrow from
// the dashboard's HeroToday for cross-page cohesion.
const SPICE_LABELS = ['', 'Mild', 'Medium', 'Hot']

function TodaySpotlight({ meal, dorm }: { meal: WeekMeal | null; dorm: string | null }) {
  const [ct, setCt] = useState(() => computeCountdown(new Date()))

  useEffect(() => {
    const t = setInterval(() => setCt(computeCountdown(new Date())), 30_000)
    return () => clearInterval(t)
  }, [])

  // Sunday or out-of-range — graceful empty state, full-width
  if (!meal) {
    return (
      <div style={{
        ...TIER1,
        background: '#faf2dd',
        borderRadius: 'var(--radius-md)', padding: '56px 24px',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <Moon size={28} strokeWidth={1.6} color={S.fgMuted} />
        <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, lineHeight: 1.2 }}>Sunday — no delivery</div>
        <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.65 }}>
          Rest up. Next delivery Monday at 7 PM.
        </div>
      </div>
    )
  }

  return (
    <div className="today-spotlight" style={{
      ...TIER1,
      // Warm cream body — matches the this-week cards. Softer on the eye
      // than pure white against the page's cream background.
      background: '#faf2dd',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
      border: `1.5px solid rgba(245,127,32,0.30)`,
      display: 'grid',
      // Text leads (L→R reading flow), photo on the right as the visual reveal.
      // Slightly wider text column gives the dish name + description room to
      // breathe; image column is just-large-enough to read as a portrait.
      gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
      minHeight: 320,
    }}>
      {/* ── Left: dish name + description + macros + countdown ── */}
      <div style={{
        padding: 'clamp(24px, 2.6vw, 32px)',
        display: 'flex', flexDirection: 'column', gap: 16,
        justifyContent: 'center',
      }}>
        {/* Dish name — borrows the dashboard hero's display scale + period accent */}
        <div>
          <Eyebrow color={OG}>Tonight&rsquo;s dish</Eyebrow>
          <h2 style={{
            margin: '8px 0 0 0',
            fontFamily: DISPLAY,
            fontSize: 'clamp(24px, 2.4vw, 36px)',
            fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em',
            color: NV,
          }}>
            {meal.dish}<span style={{ color: OG }}>.</span>
          </h2>
        </div>

        {meal.sub && (
          <p style={{
            margin: 0,
            fontFamily: BODY, fontSize: 13, fontWeight: 400,
            color: S.fgMuted, lineHeight: 1.65, maxWidth: '54ch',
          }}>
            {meal.sub}
          </p>
        )}

        {/* Macro strip — warm ivory shelf inside the cream card body. Warm
            hairline (desaturated brand-orange) keeps the strip in the cream/
            orange family instead of jolting cool-navy. Inset highlight (top
            light + bottom shadow) gives a "pressed shelf" depth without a
            gradient — see refactoring-ui critique. */}
        <div style={{
          display: 'flex',
          borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          border: '1px solid rgba(165,100,30,0.14)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(9,24,37,0.04)',
        }}>
          <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: '#fff8e7' }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>Calories</div>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, fontFeatureSettings: '"tnum"', lineHeight: 1.2, marginTop: 4 }}>
              {meal.cal.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 500, color: S.fgMuted }}> kcal</span>
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(165,100,30,0.12)' }} />
          <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: '#fff8e7' }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>Protein</div>
            <div style={{ fontFamily: BODY, fontSize: 20, fontWeight: 700, color: NV, fontFeatureSettings: '"tnum"', lineHeight: 1.2, marginTop: 4 }}>
              {meal.protein.toFixed(0)}<span style={{ fontSize: 11, fontWeight: 500, color: S.fgMuted }}> g</span>
            </div>
          </div>
          {meal.heat > 0 && (
            <>
              <div style={{ width: 1, background: 'rgba(165,100,30,0.12)' }} />
              <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', background: '#fff8e7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>Spice</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <HeatBar level={meal.heat} />
                  <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: S.fgMuted, textTransform: 'uppercase', letterSpacing: '0.10em' }}>{SPICE_LABELS[meal.heat]}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live delivery countdown */}
        <div style={{
          padding: '11px 14px', borderRadius: 'var(--radius-sm)',
          background: ct.urgent ? 'rgba(245,127,32,0.09)' : 'rgba(9,24,37,0.04)',
          border: `1px solid ${ct.urgent ? 'rgba(245,127,32,0.28)' : S.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          transition: 'background 400ms, border-color 400ms',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={14} strokeWidth={1.9} color={ct.urgent ? OG : S.fgMuted} />
            <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: ct.urgent ? OG : S.fgMuted }}>
              {ct.label}
            </span>
          </div>
          {dorm && (
            <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: S.fgSub, background: 'rgba(9,24,37,0.06)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>
              {dorm}
            </span>
          )}
        </div>
      </div>

      {/* ── Right: framed dish photo (padded inside the card, no edge bleed) ── */}
      <div style={{
        padding: 'clamp(16px, 1.6vw, 20px)',
        paddingLeft: 0,
        display: 'flex', alignItems: 'stretch',
      }}>
        <div style={{
          position: 'relative',
          flex: 1,
          minHeight: 240,
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #3a2418, #1e3a4f)',
        }}>
          {meal.image && (
            <Image
              src={meal.image}
              alt={meal.dish}
              fill
              sizes="(max-width: 900px) 100vw, 480px"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── WeekDayCard — single calendar cell, used for both this-week and next-week ─
// One component, three visual states (past / today / future) and two variants
// (full / preview). Variant: 'full' = TIER2 surface, full body (this-week).
// Variant: 'preview' = TIER3 surface, compact body (next-week) — physically
// half the visual weight so the eye reads "preview, not primary."
type WeekDayState = 'past' | 'today' | 'future'
type WeekDayVariant = 'full' | 'preview'
function WeekDayCard({ meal, dayLabel, state, variant = 'full', onClick }: {
  meal: WeekMeal
  dayLabel: string
  state: WeekDayState
  variant?: WeekDayVariant
  onClick: () => void
}) {
  const isOff     = meal.tag === 'Off'
  const isToday   = state === 'today'
  const isPast    = state === 'past'
  const isPreview = variant === 'preview'

  // Surface tier — preview cards sit on TIER3 (flat, near-flush with the
  // page) so they recede behind the TIER2 this-week cards. Today gets bumped
  // to TIER1 (matches HeroToday + TodaySpotlight) so it visibly lifts off the
  // grid and reads as the focal moment of the row.
  const baseTier = isToday ? TIER1 : isPreview ? TIER3 : TIER2

  // Per-variant spacing + type. Preview keeps tighter spacing than full but
  // brings the footer chips back so the card has enough body content to
  // reach a proportional height (~1:1.4 aspect, near golden ratio).
  const padImage       = isPreview ? '8px 8px 0'       : '10px 14px 0'
  const padHeader      = isPreview ? '10px 10px 0'     : '12px 14px 0'
  const padBody        = isPreview ? '8px 10px 10px'   : '10px 14px 14px'
  const dishFontSize   = isPreview ? 12 : 13
  // Both variants allow dish names to wrap to a second line. Preview cards
  // gain a touch more height for long names like "Moroccan Chicken Tagine
  // w/ Couscous", which keeps the card proportional rather than truncating.
  const dishClampLines = 2
  const dayFontSize    = isPreview ? 10 : 11
  const dateFontSize   = isPreview ? 10 : 11
  // Image aspect — full = 16:10 (consistent with TodaySpotlight + modal).
  // Preview = 4:3, taller image, food-forward, helps the card reach a
  // natural portrait-leaning proportion at narrow widths.
  const imageAspect    = isPreview ? '4 / 3' : '16 / 10'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isOff}
      data-state={state}
      data-variant={variant}
      className="week-day-card"
      style={{
        ...baseTier,
        // Body color: warm cream (#faf2dd) for all this-week (full) cards —
        // pure white was harsh against the cream page background, the warm
        // tone reads more pleasant. Off-day cards stay muted gray.
        //
        // Preview (next-week) cards get a top-down orange "spotlight" wash
        // overlaid on white. The wash is concentrated at the top edge (where
        // the day label + image header sit) and fades to clean by mid-card.
        // Reads as anticipatory light from above — same brand vocabulary as
        // the hero's edge wash, anchored top-down so it doesn't copy the
        // hero verbatim. Energy without competing for the focal slot.
        background: isOff
          ? 'rgba(9,24,37,0.04)'
          : isPreview
            ? `
                linear-gradient(180deg, rgba(245,127,32,0.13) 0%, rgba(245,127,32,0.055) 28%, rgba(245,127,32,0.018) 60%, rgba(245,127,32,0) 100%),
                #ffffff
              `
            : '#faf2dd',
        border: isToday
          ? `2px solid rgba(245,127,32,0.32)`
          : isOff
            ? `1px solid ${S.border}`
            : (baseTier.border as string),
        // Today shadow stack (4 layers, painted top-to-bottom):
        //   • orange glow halo (animated by .today-pulse below — opacity
        //     breathes 0.14 ↔ 0.22 over 4s; this inline value is the resting
        //     mid-point used when prefers-reduced-motion disables animation)
        //   • static orange ring (4px ambient focus ring)
        //   • TIER1 neutral lift
        boxShadow: isOff
          ? 'none'
          : isToday
            ? `0 8px 28px rgba(245,127,32,0.18), 0 0 0 4px rgba(245,127,32,0.10), ${TIER1.boxShadow}`
            : baseTier.boxShadow,
        borderRadius: 'var(--radius-md)',
        padding: 0,
        textAlign: 'left',
        cursor: isOff ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit', color: 'inherit',
        overflow: 'hidden', position: 'relative', width: '100%',
        transition: 'transform 220ms cubic-bezier(.22,1,.36,1), box-shadow 220ms, border-color 220ms',
      }}
    >
      {/* ── Cell header — three slots: day (left) · state cue (center) · date (right).
            State is icon + label, colored by semantic family:
              past   → green Check        "Delivered"
              today  → orange Sparkles    "Today"
              future → blue Clock         "Upcoming"
            All low-saturation (0.65–0.75 opacity) so the cue reads as data,
            not decoration. Off-day cells skip the state cue entirely. */}
      <div style={{
        padding: padHeader,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: dayFontSize, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: isToday ? OG : isPast ? S.fgFaint : S.fgMuted,
          flexShrink: 0,
        }}>
          {dayLabel}
        </div>

        {!isOff && (() => {
          const stateConfig = isPast
            ? { Icon: Check,    label: 'Delivered', color: 'rgba(29,138,48,0.75)' }
            : isToday
              ? { Icon: Sparkles, label: 'Today',   color: OG }
              : { Icon: Clock,    label: 'Upcoming',color: 'rgba(29,95,163,0.65)' }
          const { Icon, label, color } = stateConfig
          const chipFont = isPreview ? 10 : 11
          const chipIcon = isPreview ? 10 : 11
          return (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color, fontFamily: BODY,
              fontSize: chipFont, fontWeight: 600,
              minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
              <Icon size={chipIcon} strokeWidth={2.2} />
              {label}
            </div>
          )
        })()}

        <div style={{
          fontFamily: BODY, fontSize: dateFontSize, fontWeight: 500,
          color: S.fgFaint,
          flexShrink: 0,
        }}>
          {meal.date}
        </div>
      </div>

      {/* ── Image — full = 16:10, preview = 4:3 (taller, food-forward). The
            variant-specific aspect lets preview cards reach a proportional
            ~1:1.4 outer aspect without forcing min-heights. ── */}
      <div style={{ padding: padImage }}>
        <div
          className="week-day-thumb"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: imageAspect,
            background: 'linear-gradient(135deg, #3a2418, #1e3a4f)',
            overflow: 'hidden',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {meal.image && !isOff ? (
            <Image
              src={meal.image}
              alt={meal.dish}
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw"
              style={{ objectFit: 'cover', transition: 'transform 320ms cubic-bezier(.22,1,.36,1)' }}
            />
          ) : (
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.55,
            }}>
              {isOff
                ? <Moon size={isPreview ? 18 : 22} strokeWidth={1.6} color={CR} />
                : <Utensils size={isPreview ? 18 : 22} strokeWidth={1.6} color={CR} />}
            </div>
          )}

          {/* No image overlays — state lives in the cell header above as
              colored text. Photo stays clean and food-forward. */}
        </div>
      </div>

      {/* ── Body — dish name + meal-tag + spice. Both variants show the
            footer chips; preview just uses tighter spacing around them. ── */}
      <div style={{ padding: padBody, display: 'flex', flexDirection: 'column', gap: isPreview ? 6 : 8, flex: 1 }}>
        <div style={{
          fontFamily: BODY, fontSize: dishFontSize, fontWeight: 700,
          lineHeight: 1.2, color: NV, opacity: isOff ? 0.55 : 1,
          display: '-webkit-box', WebkitLineClamp: dishClampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {/* Period accent only on today — same brand signature used by
              HeroToday and the page header (`My menu.`). */}
          {meal.dish}{isToday && <span style={{ color: OG }}>.</span>}
        </div>

        {!isOff && (
          <div style={{
            marginTop: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            fontFamily: BODY,
          }}>
            <MealTag kind={meal.tag} compact />
            {meal.heat > 0 && (
              <HeatBar level={meal.heat} />
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Dish detail modal ─────────────────────────────────────────────────────────
function DishDetailModal({ meal, onClose }: { meal: WeekMeal; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(9,24,37,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        style={{ background: BG, borderRadius: 'var(--radius-md)', padding: 32, maxWidth: 560, width: '100%', border: '1px solid rgba(245,127,32,0.20)', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflow: 'auto' }}
      >
        {meal.image && (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 18, background: 'rgba(9,24,37,0.04)' }}>
            <Image src={meal.image} alt={meal.dish} fill sizes="540px" style={{ objectFit: 'cover' }} />
          </div>
        )}
        <Eyebrow>{meal.day} · {meal.date}</Eyebrow>
        <div style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, color: NV, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{meal.dish}</div>
        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 14, color: S.fgMuted, lineHeight: 1.65 }}>{meal.sub}</div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: '#ffffff', border: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>Calories</div>
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 28, fontWeight: 700, color: NV, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }}>{meal.cal.toFixed(0)}<span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}> kcal</span></div>
          </div>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)', background: '#ffffff', border: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>Protein</div>
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 28, fontWeight: 700, color: NV, fontFeatureSettings: '"tnum"', lineHeight: 1, letterSpacing: '-0.02em' }}>{meal.protein.toFixed(0)}<span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 500, color: S.fgMuted, letterSpacing: 0 }}> g</span></div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MealTag kind={meal.tag} />
          {meal.heat > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY, fontSize: 11, color: S.fgMuted }}>
              Spice level <HeatBar level={meal.heat} />
            </span>
          )}
        </div>
        <button
          type="button" onClick={onClose}
          style={{ marginTop: 22, width: '100%', padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(9,24,37,0.15)', background: '#ffffff', color: NV, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MenuClient({ customer }: { customer: Customer | null; userEmail?: string }) {
  const isVeg = !!customer?.meal_preference_type?.toLowerCase().includes('plant')
  const prefTag = isVeg ? 'Veg' : 'Non Veg'
  const FULL_MENU = buildFullMenu(isVeg)
  const thisWeek  = FULL_MENU[0]
  const nextWeek  = FULL_MENU[1]

  // todayMonIdx() returns 6 on Sunday — no card in the 0-5 range gets highlighted,
  // and todayMeal is null so TodaySpotlight shows the rest-day state.
  const thisTodayIdx = todayMonIdx()
  const todayMeal    = thisTodayIdx < 6 ? thisWeek.meals[thisTodayIdx] : null

  const [openMeal, setOpenMeal] = useState<WeekMeal | null>(null)

  const DAY_ABBREVS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <Eyebrow>{new Date().toLocaleDateString('en-AE', { weekday: 'long', month: 'long', day: 'numeric' })}</Eyebrow>
          <div style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1, color: NV }}>
            My menu<span style={{ color: OG }}>.</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 14, color: S.fgMuted, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Your preference:</span>
            <MealTag kind={prefTag} />
            <a href="/dashboard/profile" style={{ color: S.fgSub, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(9,24,37,0.20)', textUnderlineOffset: 3 }}>
              Change
            </a>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Delivered 7–8 PM · Sunday off</span>
          </div>
        </div>

        {/* ── Section 1: Today (full-width hero) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Today&apos;s delivery</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <TodaySpotlight meal={todayMeal} dorm={customer?.dorm_name ?? null} />
        </section>

        {/* ── Section 2: This week (6-cell grid) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>This week</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <div className="this-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {thisWeek.meals.slice(0, 6).map((meal, i) => {
              const state: WeekDayState =
                i < thisTodayIdx  ? 'past'
                : i === thisTodayIdx ? 'today'
                : 'future'
              return (
                <WeekDayCard
                  key={i}
                  meal={meal}
                  dayLabel={DAY_ABBREVS[i]}
                  state={state}
                  onClick={() => setOpenMeal(meal)}
                />
              )
            })}
          </div>
        </section>

        {/* ── Section 3: Next week (open by default — no accordion) ── */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Next week</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          {/* 6-cell preview strip — same component as this-week, but variant
              "preview" → TIER3 surface, compact body, no footer chips. The
              6-column density (vs this-week's 3-col) does most of the
              hierarchy work; the surface + size changes finish it. */}
          <div className="menu-week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {nextWeek.meals.slice(0, 6).map((meal, i) => (
              <WeekDayCard
                key={i}
                meal={meal}
                dayLabel={DAY_ABBREVS[i]}
                state="future"
                variant="preview"
                onClick={() => setOpenMeal(meal)}
              />
            ))}
          </div>
        </section>

        {/* ── Dish detail modal ── */}
        <AnimatePresence>
          {openMeal && <DishDetailModal meal={openMeal} onClose={() => setOpenMeal(null)} />}
        </AnimatePresence>

      </div>

      <style>{`
        /* Today spotlight stacks vertical on narrow viewports.
           Image (now :last-child) goes BELOW the text and gains side padding so
           it sits framed inside the card — same treatment as desktop. */
        @media (max-width: 900px) {
          .today-spotlight { grid-template-columns: 1fr !important; }
          .today-spotlight > div:last-child {
            padding-left: clamp(16px, 1.6vw, 20px) !important;
            padding-top: 0 !important;
          }
          .today-spotlight > div:last-child > div { aspect-ratio: 16 / 10; min-height: 0 !important; }
        }
        /* This-week (full cards) — 3-col → 2-col → 1-col */
        @media (max-width: 640px) {
          .this-week-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 420px) {
          .this-week-grid { grid-template-columns: 1fr !important; }
        }
        /* Next-week (preview strip) — 6-col → 4-col → 3-col → 2-col.
           Stays denser than this-week at every breakpoint to preserve the
           visual hierarchy the variant is supposed to communicate. */
        @media (max-width: 1024px) {
          .menu-week-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .menu-week-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 420px) {
          .menu-week-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* Card hover lift — same vocabulary across all WeekDayCards.
           Past cards still lift on hover (positive past, fully interactive). */
        .week-day-card:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 26px rgba(9,24,37,0.10) !important;
          border-color: rgba(245,127,32,0.28) !important;
        }
        .week-day-card[data-state="today"]:not(:disabled):hover {
          box-shadow: 0 10px 26px rgba(245,127,32,0.20), 0 0 0 4px rgba(245,127,32,0.12) !important;
          animation-play-state: paused;
        }
        .week-day-card:not(:disabled):hover .week-day-thumb img { transform: scale(1.04); }

        /* Today's "alive" state — orange glow halo gently breathes (4s cycle,
           ease-in-out) layered with the static ambient ring + TIER1 lift.
           Subtle enough to register as warmth, not movement, in peripheral
           vision. Disabled for users who prefer reduced motion. */
        @keyframes today-pulse {
          0%, 100% {
            box-shadow:
              0 8px 28px rgba(245,127,32,0.14),
              0 0 0 4px rgba(245,127,32,0.10),
              0 6px 18px rgba(9,24,37,0.07),
              0 1px 3px rgba(9,24,37,0.04);
          }
          50% {
            box-shadow:
              0 10px 32px rgba(245,127,32,0.24),
              0 0 0 4px rgba(245,127,32,0.10),
              0 6px 18px rgba(9,24,37,0.07),
              0 1px 3px rgba(9,24,37,0.04);
          }
        }
        .week-day-card[data-state="today"]:not(:disabled) {
          animation: today-pulse 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .week-day-card[data-state="today"]:not(:disabled) {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
