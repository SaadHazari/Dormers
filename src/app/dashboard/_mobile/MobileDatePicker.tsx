'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { OG, S, BODY } from './kit'

/**
 * MobileDatePicker — the inline calendar for sheets (Phase-0 primitive, §3.2).
 *
 * The desktop DateField is an absolutely-positioned popover that clips inside a
 * MobileSheet's overflow:hidden surface. This renders the same calendar INLINE
 * (no popover) so it lives happily inside a sheet: ~44px cells, a pinned legend,
 * and — the key mobile rule — tapping a non-delivery day surfaces its reason
 * INLINE (never hover/title/hatch-alone).
 *
 * Date math is copied verbatim from DateField (single source of truth for the
 * gating rules; desktop DateField stays untouched).
 */

interface Props {
  value: string            // ISO YYYY-MM-DD or '' when nothing picked
  onChange: (iso: string) => void
  minDate: string
  maxDate: string
  weekType?: '5DAYS' | '6DAYS'
  cutoffActive?: boolean
}

function isoDow(d: Date): number {
  const js = d.getDay()
  return js === 0 ? 7 : js
}
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MobileDatePicker({ value, onChange, minDate, maxDate, weekType, cutoffActive }: Props) {
  const minD = new Date(minDate + 'T00:00:00')
  const maxD = new Date(maxDate + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const initialView = useMemo(() => {
    const ref = value || minDate
    const d = new Date(ref + 'T00:00:00')
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }, [value, minDate])
  const [viewMonth, setViewMonth] = useState(initialView)
  const [reason, setReason] = useState<string | null>(null)

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startDow = (monthStart.getDay() + 6) % 7
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

  const isNonDeliveryDay = (d: Date): boolean => {
    if (!weekType) return false
    const dow = isoDow(d)
    if (weekType === '5DAYS') return dow === 6 || dow === 7
    return dow === 7
  }
  const inRange = (d: Date) => d >= minD && d <= maxD
  const isSelectable = (d: Date) => inRange(d) && !isNonDeliveryDay(d)
  const isToday = (d: Date) => d.getTime() === today.getTime()
  const isSelected = (d: Date) => !!value && d.getTime() === new Date(value + 'T00:00:00').getTime()

  const cellTooltip = (d: Date, inMonth: boolean): string | undefined => {
    if (!inMonth) return undefined
    if (isSelected(d)) return undefined
    if (isNonDeliveryDay(d)) {
      const dow = isoDow(d)
      const label = dow === 7 ? 'Sundays' : 'Saturdays'
      const week = weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'
      return `${label} aren’t a delivery day on your ${week} plan — pick a working day instead.`
    }
    if (d < minD) {
      if (cutoffActive && d.getTime() === today.getTime()) {
        return 'The 2 PM kitchen cutoff has passed — tonight’s run is already prepping. Pick tomorrow or later.'
      }
      return 'Start dates can’t be in the past.'
    }
    if (d > maxD) return 'Outside your 30-day pick window.'
    return undefined
  }

  function onCell(d: Date, inMonth: boolean) {
    // Require inMonth — the grid styles out-of-month cells as non-selectable,
    // so without this an in-range adjacent-month cell would silently pick a
    // date from the wrong month.
    if (inMonth && isSelectable(d)) { setReason(null); onChange(isoOf(d)); return }
    // Inline reason instead of a dead tap (the no-hover substitute).
    const tip = cellTooltip(d, inMonth)
    if (tip) setReason(tip)
  }

  const canPrev = monthStart > new Date(minD.getFullYear(), minD.getMonth(), 1)
  const canNext = monthEnd < new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0)

  const navBtn: CSSProperties = { width: 36, height: 36, borderRadius: 8, border: 'none', background: 'transparent', color: S.fg, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <div style={{ fontFamily: BODY }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => canPrev && setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={{ ...navBtn, opacity: canPrev ? 1 : 0.3, cursor: canPrev ? 'pointer' : 'not-allowed' }}><ChevronLeft size={16} strokeWidth={2.4} /></button>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: S.fg }}>{viewMonth.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })}</span>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => canNext && setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ ...navBtn, opacity: canNext ? 1 : 0.3, cursor: canNext ? 'pointer' : 'not-allowed' }}><ChevronRight size={16} strokeWidth={2.4} /></button>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: S.fgFaint, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Grid — 44px tap targets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          const sel = isSelected(c.date)
          const tdy = isToday(c.date) && !sel
          const selectable = c.inMonth && isSelectable(c.date)
          const noDelivery = c.inMonth && isNonDeliveryDay(c.date) && inRange(c.date)
          const base: CSSProperties = {
            aspectRatio: '1 / 1', minHeight: 40, border: 'none', borderRadius: 8, padding: 0,
            fontSize: 13, fontWeight: sel ? 700 : 600, fontFeatureSettings: '"tnum"', fontFamily: BODY,
            cursor: selectable ? 'pointer' : 'default', appearance: 'none',
            color: sel ? '#fff' : !c.inMonth ? 'rgba(9,24,37,0.25)' : selectable ? S.fg : S.fgFaint,
            background: sel ? OG : 'transparent',
            boxShadow: sel ? '0 4px 12px rgba(245,127,32,0.30)' : tdy ? 'inset 0 0 0 1.5px rgba(245,127,32,0.5)' : 'none',
            ...(noDelivery && !sel ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(9,24,37,0.18) 0px, rgba(9,24,37,0.18) 3px, transparent 3px, transparent 6px)' } : {}),
          }
          if (tdy) base.color = OG
          return (
            <button key={i} type="button" onClick={() => onCell(c.date, c.inMonth)} aria-label={c.date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })} aria-current={sel ? 'date' : undefined} style={base}>
              {c.date.getDate()}
            </button>
          )
        })}
      </div>

      {/* Inline reason — fires when a blocked day is tapped (no hover on touch). */}
      {reason && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: OG }}>
          <Info size={13} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{reason}</span>
        </div>
      )}

      {/* Legend (pinned) */}
      {weekType && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${S.border}`, display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: S.fgSub, lineHeight: 1.5 }}>
          <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1px solid ${S.border}`, backgroundColor: 'var(--ds-skeleton-base)', backgroundImage: 'repeating-linear-gradient(135deg, rgba(9,24,37,0.30) 0px, rgba(9,24,37,0.30) 3px, transparent 3px, transparent 6px)' }} />
          {/* One <span> so the sentence FLOWS as text — not flex-distributed
              chunks that fling "plan." to the far right. */}
          <span>Hatched days aren&rsquo;t a delivery day on your <strong style={{ color: S.fg, fontWeight: 700 }}>{weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'}</strong> plan.</span>
        </div>
      )}
    </div>
  )
}
