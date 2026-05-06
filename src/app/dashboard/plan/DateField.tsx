'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  value: string  // ISO YYYY-MM-DD or '' when nothing picked yet
  onChange: (v: string) => void
  minDate: string
  maxDate: string
  /** Customer's delivery cadence — when set, Sundays (and Saturdays for
   *  5DAYS) are non-selectable so they can't be picked as a start date.
   *  Each blocked cell still renders with a tooltip explaining why. */
  weekType?: '5DAYS' | '6DAYS'
}

// ISO dow for a JS Date — 1=Mon..7=Sun. AE day-of-week math elsewhere uses
// the same convention; keeping it consistent here so the kitchen-side
// non-delivery check matches.
function isoDow(d: Date): number {
  const js = d.getDay()
  return js === 0 ? 7 : js
}

export function DateField({ value, onChange, minDate, maxDate, weekType }: Props) {
  const [open, setOpen] = useState(false)
  // 'down' = popover sits below the trigger (default); 'up' = flips above when
  // there isn't enough viewport space below. Sticky checkout panels at the bottom
  // of the viewport on desktop tend to clip the calendar otherwise.
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Flip direction on open based on available space below the trigger.
  // Approximate popover height = 360px (header + 6 weeks + dow row).
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const POPOVER_H = 360
    const spaceBelow = window.innerHeight - rect.bottom
    setOpenDirection(spaceBelow < POPOVER_H ? 'up' : 'down')
  }, [open])

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

  // Non-delivery weekday (Sun for 6DAYS; Sat+Sun for 5DAYS). Returns false
  // when no weekType is supplied — the date picker pre-dates the gating, so
  // existing callers that haven't passed `weekType` still allow every day.
  const isNonDeliveryDay = (d: Date): boolean => {
    if (!weekType) return false
    const dow = isoDow(d)  // 1=Mon..7=Sun
    if (weekType === '5DAYS') return dow === 6 || dow === 7
    return dow === 7
  }

  const inRange    = (d: Date) => d >= minD && d <= maxD
  const isSelectable = (d: Date) => inRange(d) && !isNonDeliveryDay(d)
  const isToday    = (d: Date) => d.getTime() === today.getTime()
  const isSelected = (d: Date) =>
    !!value && d.getTime() === new Date(value + 'T00:00:00').getTime()

  // Per-cell tooltip text — explains *why* a particular date can't be picked.
  // Mirrors the server-side reject message in changeStartDate() so the user
  // sees the same reason whether the gate fires client-side or server-side.
  const cellTooltip = (d: Date, inMonth: boolean): string | undefined => {
    if (!inMonth) return undefined
    if (isSelected(d)) return undefined
    if (isNonDeliveryDay(d)) {
      const dow = isoDow(d)
      const label = dow === 7 ? 'Sundays' : 'Saturdays'
      const week = weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'
      return `${label} aren’t a delivery day on your ${week} plan — pick a working day instead.`
    }
    if (d < minD) return 'Start dates can’t be in the past.'
    if (d > maxD) return 'Outside your 30-day pick window.'
    return undefined
  }

  function pick(d: Date) {
    if (!isSelectable(d)) return
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
            initial={{ opacity: 0, y: openDirection === 'up' ? 8 : -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openDirection === 'up' ? 8 : -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="checkout-date-popover"
            style={openDirection === 'up'
              ? { top: 'auto', bottom: 'calc(100% + 8px)', transformOrigin: 'bottom left' }
              : undefined}
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
                const sel = isSelected(cell.date)
                const tdy = isToday(cell.date)
                const selectable = cell.inMonth && isSelectable(cell.date)
                const isNoDelivery = cell.inMonth && isNonDeliveryDay(cell.date) && inRange(cell.date)
                const tip = cellTooltip(cell.date, cell.inMonth)
                const cls = [
                  'checkout-date-cell',
                  sel ? 'is-selected' : '',
                  tdy && !sel ? 'is-today' : '',
                  !cell.inMonth ? 'is-outmonth' : '',
                  isNoDelivery && !sel ? 'is-no-delivery' : '',
                ].filter(Boolean).join(' ')
                const aria = `${cell.date.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}${tip ? ` — ${tip}` : ''}`
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(cell.date)}
                    disabled={!selectable}
                    className={cls}
                    title={tip}
                    aria-label={aria}
                    aria-current={sel ? 'date' : undefined}
                    aria-disabled={!selectable}
                  >
                    {cell.date.getDate()}
                  </button>
                )
              })}
            </div>

            {weekType && (
              <p className="checkout-date-legend">
                <span className="checkout-date-legend-dot" aria-hidden /> Greyed-out days aren&rsquo;t a delivery day on your <strong>{weekType === '5DAYS' ? 'Mon–Fri' : 'Mon–Sat'}</strong> plan.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
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
          /* Title attr on a disabled <button> still surfaces the tooltip in
             every major browser via the parent listener; pointer-events stays
             auto so the native tooltip + aria-label both fire on hover. */
          pointer-events: auto;
        }
        .checkout-date-cell:disabled:hover {
          background: transparent;
        }

        /* Non-delivery day — Sun for 6DAYS, Sat+Sun for 5DAYS. Visually
           distinguished from out-of-month / out-of-window cells with a
           diagonal hatch so the user reads it as "structurally unavailable"
           rather than "outside the month". */
        .checkout-date-cell.is-no-delivery {
          color: rgba(9, 24, 37, 0.30);
          background-image: repeating-linear-gradient(
            135deg,
            rgba(9, 24, 37, 0.045) 0px,
            rgba(9, 24, 37, 0.045) 3px,
            transparent 3px,
            transparent 6px
          );
        }
        .checkout-date-cell.is-no-delivery:hover {
          background-image: repeating-linear-gradient(
            135deg,
            rgba(239, 68, 68, 0.08) 0px,
            rgba(239, 68, 68, 0.08) 3px,
            transparent 3px,
            transparent 6px
          );
          color: rgba(154, 40, 40, 0.65);
        }

        /* Legend below the calendar grid — explains what the hatched cells
           mean. Only renders when a weekType is supplied. */
        .checkout-date-legend {
          margin: 12px 0 0;
          padding-top: 10px;
          border-top: 1px solid rgba(9, 24, 37, 0.06);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-montserrat), Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: rgba(9, 24, 37, 0.55);
          line-height: 1.5;
        }
        .checkout-date-legend strong {
          color: #091825;
          font-weight: 700;
        }
        .checkout-date-legend-dot {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          flex-shrink: 0;
          background-image: repeating-linear-gradient(
            135deg,
            rgba(9, 24, 37, 0.18) 0px,
            rgba(9, 24, 37, 0.18) 3px,
            transparent 3px,
            transparent 6px
          );
          background-color: rgba(9, 24, 37, 0.04);
          border: 1px solid rgba(9, 24, 37, 0.10);
        }
      `}</style>
    </div>
  )
}
