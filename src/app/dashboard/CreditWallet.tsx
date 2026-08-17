'use client'

import { Wallet } from 'lucide-react'
import { walletSummary, type WalletRow } from './_shared/credit-wallet'
import { TIER_POP_TEXT } from './_shared/tokens'

const BODY = "'Montserrat', system-ui, sans-serif"
const OG3 = '#f57f20'

/**
 * Persistent credit balance in the sidebar.
 *
 * This used to be a Now-tray row. The tray is for time-bound items, and a
 * credit balance has no deadline and deliberately outlives the pause that
 * granted it, so it belongs on a rail that is always on screen rather than
 * behind a toggle. That also satisfies the spec's own rule better: if the
 * balance is not visible it is not doing its job.
 *
 * Renders nothing on a zero balance. An empty wallet is noise.
 */
export function CreditWallet({ rows, expanded }: { rows: WalletRow[]; expanded: boolean }) {
  const summary = walletSummary(rows)
  if (!summary.hasCredit) return null

  return (
    <div
      style={{
        marginBottom: 12,
        padding: 6,
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(245,127,32,0.10)',
        border: '1px solid rgba(245,127,32,0.22)',
      }}
    >
      <div
        data-tooltip={summary.note ? `AED ${summary.totalAed} in credit. ${summary.note}` : `AED ${summary.totalAed} in credit`}
        data-tooltip-placement="right"
        style={{
          display: 'flex', alignItems: 'center',
          gap: expanded ? 10 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          padding: '9px 10px', borderRadius: 'var(--radius-sm)',
          fontFamily: BODY, color: OG3, whiteSpace: 'nowrap',
          transition: 'gap 220ms',
        }}
      >
        <Wallet size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        {expanded && (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, lineHeight: 1.2, fontFeatureSettings: '"tnum"' }}>
              AED {summary.totalAed}
            </span>
            {summary.note && (
              // The sidebar is a fixed navy surface (never light-themed), so this
              // reads cream-on-navy via TIER_POP_TEXT rather than the dashboard's
              // ds-fg-muted token, which is dark text tuned for light surfaces and
              // would go near-invisible here. A held credit's explanation has to
              // stay legible wherever the balance appears, not just present in markup.
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: TIER_POP_TEXT.muted, marginTop: 2, lineHeight: 1.3, whiteSpace: 'normal' }}>
                {summary.note}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
