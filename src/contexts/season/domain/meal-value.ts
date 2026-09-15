/**
 * Meal value: what one meal of an order was actually worth to the customer.
 *
 * Spec §10.1. (cash charged + wallet credit used) ÷ meals in the order, rounded
 * down to the fils. orders.price_per_meal is the PRE-discount rate, so it only
 * ever serves as a labelled estimate until plan D backfills the real amounts.
 */

export interface OrderMoney {
  amountPaidFils: number | null
  creditAppliedFils: number | null
  mealsCount: number | null
  pricePerMealAed: number | null
  /** Owner decision D7: test-mode payments are not money, so a `cs_test_` session is never trusted for the exact path. */
  stripeSessionId: string | null
  /** The PaymentIntent a refund would go against (spec §10.3); absent for credit-only and older orders. */
  stripePaymentId?: string | null
}

export type MealValue = { fils: number; exact: boolean } | null

/**
 * AED to fils the way SQL's `round(price_per_meal::numeric * 100)` does.
 * price_per_meal is a Postgres `numeric` (exact decimal), so its round can
 * land on the far side of a half-fils boundary from a naive `Math.round` on a
 * JS double (20.115 * 100 is 2011.4999999999998 as a double, but numeric
 * 2011.5, which numeric round takes up to 2012). Round on the decimal digits
 * the number prints as, like Postgres round(numeric): half away from zero on
 * the third decimal digit, not on the binary double.
 */
export function aedToFils(aed: number): number {
  if (!Number.isFinite(aed)) return NaN
  const sign = aed < 0 ? -1 : 1
  const abs = Math.abs(aed)
  // Round on the decimal digits the number prints as, like Postgres round(numeric):
  // half away from zero on the third decimal digit. toFixed would first round the
  // binary double and can turn 0.024999999999999998 into 0.025.
  let text = abs.toString()
  if (text.includes('e')) text = abs.toFixed(20)
  const [whole, fraction = ''] = text.split('.')
  const digits = (fraction + '000').slice(0, 3)
  const fils = Number(whole) * 100 + Number(digits.slice(0, 2))
  return sign * (fils + (Number(digits[2]) >= 5 ? 1 : 0))
}

export function mealValueOf(order: OrderMoney): MealValue {
  const meals = order.mealsCount ?? 0
  if (meals <= 0) return null
  const isTestMode = (order.stripeSessionId ?? '').startsWith('cs_test_')
  if (order.amountPaidFils != null && order.creditAppliedFils != null && !isTestMode) {
    return { fils: Math.floor((order.amountPaidFils + order.creditAppliedFils) / meals), exact: true }
  }
  if (order.pricePerMealAed != null && order.pricePerMealAed > 0) {
    return { fils: aedToFils(order.pricePerMealAed), exact: false }
  }
  return null
}

/** Groups the integer part with commas (1234 -> 1,234); leaves any decimal part alone. */
function withThousands(numStr: string): string {
  const [whole, fraction] = numStr.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

export function formatAed(fils: number): string {
  const whole = fils % 100 === 0
  const amount = whole ? String(fils / 100) : (fils / 100).toFixed(2)
  return `AED ${withThousands(amount)}`
}
