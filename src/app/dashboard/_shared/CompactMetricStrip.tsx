'use client'

import type { CSSProperties, ReactNode } from 'react'
import { BODY, OG, S } from './tokens'

/**
 * CompactMetricStrip — Phase-0 mobile primitive.
 *
 * The dense counterpart to StatRow's big stacked StatTile cards. Renders N
 * metrics as a single bordered band with hairline dividers — a small caps
 * label over a compact tnum value — so three KPIs sit across the top of a
 * phone instead of three cards each eating ~1/3 of the viewport.
 *
 * Deliberately does NOT collapse to one column on narrow screens: KPI rows
 * stay N-across (values are short numbers). A surface that genuinely needs
 * fewer columns passes `columns={2}`. Pass `accent`/`danger` on at most one
 * metric — one orange (or one red) value max, per the hierarchy rules.
 *
 * See .interface-design/mobile-redesign-spec.md (shared pattern: CompactMetricStrip).
 */

export interface CompactMetric {
  label: string
  value: ReactNode
  /** Optional tiny secondary line under the value. */
  sub?: ReactNode
  /** Optional small leading glyph (≤16px icon). */
  glyph?: ReactNode
  /** Orange value — use on at most one metric per strip. */
  accent?: boolean
  /** Red value — e.g. low days-left. Mutually exclusive with accent. */
  danger?: boolean
  /** When set, the whole cell becomes a button (≥44px tap target). */
  onClick?: () => void
  /** Accessible label for the button cell (defaults to label). */
  ariaLabel?: string
}

interface Props {
  metrics: CompactMetric[]
  /** Columns across. Default 3. */
  columns?: 2 | 3
  /** Extra style on the band wrapper (e.g. marginBottom). */
  style?: CSSProperties
  /** Class on the band wrapper (e.g. for a CSS show/hide toggle). */
  className?: string
  /** Accessible label for the group. */
  ariaLabel?: string
}

export function CompactMetricStrip({ metrics, columns = 3, style, className, ariaLabel }: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        background: 'var(--ds-surface-tier2)',
        border: '1px solid var(--ds-border-tier2)',
        boxShadow: 'var(--ds-shadow-tier2)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {metrics.map((m, i) => {
        const valueColor = m.danger ? 'var(--ds-danger-fg)' : m.accent ? OG : S.fg
        const cellStyle: CSSProperties = {
          minWidth: 0,
          padding: '11px 12px',
          // Hairline divider between cells — left border on all but the
          // first cell of each row. With equal columns this reads as a
          // clean segmented band without per-cell card chrome.
          borderLeft: i % columns === 0 ? 'none' : '1px solid var(--ds-border-tier2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }
        const inner = (<>{cellInner(m, valueColor)}</>)
        // Tappable cell → button (full-cell ≥44px target); otherwise a div.
        return m.onClick ? (
          <button
            key={m.label}
            type="button"
            onClick={m.onClick}
            aria-label={m.ariaLabel ?? m.label}
            style={{
              ...cellStyle,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              borderLeft: cellStyle.borderLeft,
              appearance: 'none',
              cursor: 'pointer',
              font: 'inherit',
              width: '100%',
            }}
          >
            {inner}
          </button>
        ) : (
          <div key={m.label} style={cellStyle}>{inner}</div>
        )
      })}
    </div>
  )
}

/** Shared cell content (glyph+label, value, optional sub) for both the button
 *  and div cell variants. */
function cellInner(m: CompactMetric, valueColor: string): ReactNode {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
        {m.glyph && <span style={{ flexShrink: 0, color: m.accent ? OG : S.fgFaint, display: 'inline-flex' }}>{m.glyph}</span>}
        <span
          style={{
            fontFamily: BODY, fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: S.fgFaint, lineHeight: 1.3,
            // Wrap at spaces only (never mid-word) so a two-word label breaks
            // cleanly to two lines instead of "DELIVERI / ES".
            minWidth: 0, overflowWrap: 'normal', wordBreak: 'keep-all',
          }}
        >
          {m.label}
        </span>
      </div>
      <div
        style={{
          fontFamily: BODY, fontSize: 18, fontWeight: 900,
          lineHeight: 1.15, letterSpacing: '-0.02em',
          color: valueColor, fontFeatureSettings: '"tnum"',
          // Number stays on one line; labels/subs wrap around it.
          whiteSpace: 'nowrap',
        }}
      >
        {m.value}
      </div>
      {m.sub != null && (
        <div style={{ fontFamily: BODY, fontSize: 11, color: S.fgMuted, lineHeight: 1.4, minWidth: 0 }}>
          {m.sub}
        </div>
      )}
    </>
  )
}
