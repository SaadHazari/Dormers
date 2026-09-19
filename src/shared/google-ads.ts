/**
 * Google Ads conversions. The account tag (AW-17901506705) loads on every
 * page from src/app/layout.tsx; each label below tells Google which goal an
 * event counts toward. Labels come from Google Ads → Goals → Conversions.
 */
export const GOOGLE_ADS_PURCHASE = 'AW-17901506705/fBL8CL2gh_0cEJGhjdhC'
export const GOOGLE_ADS_SIGNUP_IN_AREA = 'AW-17901506705/mTTrCKG2jP0cEJGhjdhC'
export const GOOGLE_ADS_WAITLIST_IN_AREA = 'AW-17901506705/ozQ9CJvikv0cEJGhjdhC'

const LIVE_HOST = 'dormers.ae'

/**
 * Queue a gtag call. Pushing onto dataLayer (rather than calling window.gtag)
 * works even when the tag script has not finished loading yet — gtag.js
 * drains the queue when it arrives. It must push the `arguments` object, not
 * an array: gtag.js ignores arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]): void {
  const w = window as unknown as { dataLayer?: unknown[] }
  w.dataLayer = w.dataLayer || []
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments)
}

/**
 * Only the live site reports. Local dev, Netlify previews and the atlas
 * harness load the same tag and would otherwise count fake sales.
 */
function isLiveSite(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === LIVE_HOST
}

/**
 * Report one paid order. `orderId` doubles as Google's transaction_id, so a
 * refresh of the success screen never counts the same order twice.
 */
export function reportPurchase(orderId: string, amountAed: number): void {
  if (!isLiveSite()) return
  gtag('event', 'conversion', {
    send_to: GOOGLE_ADS_PURCHASE,
    value: amountAed,
    currency: 'AED',
    transaction_id: orderId,
  })
}

/**
 * Report a finished sign-up. Callers pass only customers whose dorm we
 * deliver to — a sign-up from outside the area tells Ads nothing useful.
 */
export function reportSignupInArea(): void {
  if (!isLiveSite()) return
  gtag('event', 'conversion', { send_to: GOOGLE_ADS_SIGNUP_IN_AREA })
}

/** Report a first-time waitlist join from a customer in the delivery area. */
export function reportWaitlistJoinInArea(): void {
  if (!isLiveSite()) return
  gtag('event', 'conversion', { send_to: GOOGLE_ADS_WAITLIST_IN_AREA })
}
