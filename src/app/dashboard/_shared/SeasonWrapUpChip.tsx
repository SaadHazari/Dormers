'use client'

import { CalendarClock } from 'lucide-react'
import { BODY, S } from './tokens'
import { seasonChipLabel } from './season-notice-copy'

/** "Semester wraps up Sat 3 Oct": home, desktop and mobile (spec N1). */
export function SeasonWrapUpChip({ wrapUpDay }: { wrapUpDay: string }) {
  return (
    <div
      // Desktop and mobile trees mount together, so an id would appear twice.
      data-testid="season-wrap-up-chip"
      role="note"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
        padding: '8px 14px', borderRadius: 999,
        background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)',
        fontFamily: BODY, fontSize: 12.5, fontWeight: 700, color: S.fg,
        fontFeatureSettings: '"tnum"', marginBottom: 16,
      }}
    >
      <CalendarClock size={14} strokeWidth={2.2} aria-hidden />
      {seasonChipLabel(wrapUpDay)}
    </div>
  )
}
