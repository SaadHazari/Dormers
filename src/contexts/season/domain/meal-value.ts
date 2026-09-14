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
}

export type MealValue = { fils: number; exact: boolean } | null

export function mealValueOf(order: OrderMoney): MealValue {
  const meals = order.mealsCount ?? 0
  if (meals <= 0) return null
  if (order.amountPaidFils != null && order.creditAppliedFils != null) {
    return { fils: Math.floor((order.amountPaidFils + order.creditAppliedFils) / meals), exact: true }
  }
  if (order.pricePerMealAed != null && order.pricePerMealAed > 0) {
    return { fils: Math.round(order.pricePerMealAed * 100), exact: false }
  }
  return null
}

export function formatAed(fils: number): string {
  const whole = fils % 100 === 0
  return `AED ${whole ? String(fils / 100) : (fils / 100).toFixed(2)}`
}
