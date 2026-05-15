'use client'

import { CR, BODY } from '../../tokens'

/**
 * HUD row 1: leading dot indicator + user first name.
 * First name parsed from `customerCid` by DormWarsClient (we receive the parsed name as prop).
 * UI-SPEC: 12px/600 cream-muted; 8x8 circle indicator; 8px horizontal gap.
 */
export function CallsignChip({ name }: { name: string }) {
  const display = (name || 'AGENT').toUpperCase().slice(0, 16) // truncate runaway long names
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: BODY,
      fontSize: 12,
      fontWeight: 600,
      color: 'rgba(237,232,218,0.65)',
      letterSpacing: '0.06em',
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: CR,
        flexShrink: 0,
      }} />
      <span>{display}</span>
    </div>
  )
}
