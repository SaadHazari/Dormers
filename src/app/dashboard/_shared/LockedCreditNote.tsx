import { OG_DEEP, BODY, S } from './tokens'

/**
 * Explains an approved credit that is NOT coming off the price on screen,
 * e.g. the seasonal-pause waitlist credit (monthly-only) held by a customer
 * checking out weekly-flex or trial. The rule this exists to satisfy: if a
 * customer holds a credit and it isn't applied to the plan in front of them,
 * they must be told why, on that screen, before they pay, on every plan
 * where it doesn't apply, not just some of them.
 *
 * Renders immediately below the total on both checkout surfaces
 * (CheckoutPanel, MobileCheckout). Returns null at zero so it never renders
 * an empty card.
 *
 * This is an explanation, not an alarm: no icon larger than 16px, no
 * warning triangle, no red.
 */
export function LockedCreditNote(props: { lockedAed: number }) {
  const { lockedAed } = props
  if (lockedAed <= 0) return null
  // Whole-AED display, matching the applied-credit line's format elsewhere
  // in these same panels (e.g. "AED {appliedAed.toFixed(0)}").
  const amount = lockedAed.toFixed(0)

  return (
    <div
      role="note"
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: 'var(--ds-og-wash-strong)',
        border: '1px solid var(--ds-og-border-strong)',
      }}
    >
      <p style={{ margin: 0, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.45 }}>
        <span style={{ color: OG_DEEP, fontWeight: 800 }}>AED {amount} credit not applied.</span>
        {' '}Your credit unlocks on a monthly plan. It stays in your account until then.
      </p>
    </div>
  )
}
