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
 * Not every value is a number, though — the Pause cell answers with a word
 * ("Available", "Not included"). Those wear the prose size and wrap at a
 * space; see valueIsProse below. Nothing here may be cut off. The band clips
 * (`overflow: hidden`) to keep its rounded corners, so a value that outgrows
 * its cell is sliced mid-glyph instead of spilling — invisible in the source,
 * plain on the phone. `npm run check:metric-strip-fit` is the guard.
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

/**
 * A value that is words rather than a measurement — "Available", "In use",
 * "Not included". It carries no digit, so the big tnum display size buys it
 * nothing and costs it the room it needs.
 *
 * Deliberately NOT a length test: the Pause cell shows all four of its states
 * in the same slot over one customer's cycle, and they must render alike, so
 * short "Used" reads at the same size as long "Not included". A placeholder
 * dash has no letters and stays a display glyph — it stands in for the number
 * it replaces.
 */
export function valueIsProse(value: ReactNode): boolean {
  return typeof value === 'string' && /[a-z]/i.test(value) && !/\d/.test(value)
}

/** Shared cell content (glyph+label, value, optional sub) for both the button
 *  and div cell variants. */
function cellInner(m: CompactMetric, valueColor: string): ReactNode {
  const prose = valueIsProse(m.value)
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
          fontFamily: BODY,
          // Prose reads a step down (--text-md) at the scale's normal leading,
          // which lands a ~21px first line — the same line box the 18px number
          // occupies, so a word cell still sits level with the numbers beside
          // it. At 18px "Not included" is 121px of ink in a 95px phone cell.
          ...(prose
            ? { fontSize: 14, fontWeight: 800, lineHeight: 1.5 }
            : { fontSize: 18, fontWeight: 900, lineHeight: 1.15 }),
          letterSpacing: '-0.02em',
          color: valueColor, fontFeatureSettings: '"tnum"',
          // Wrap at spaces only (never mid-word), like the label above. A
          // value too wide for its cell takes a second line; it never runs
          // under the divider and off the edge of the band.
          minWidth: 0, overflowWrap: 'normal', wordBreak: 'keep-all',
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
