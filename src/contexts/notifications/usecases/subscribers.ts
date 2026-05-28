/**
 * Notifications context — event subscribers.
 *
 * Wires the notifications use-case into the in-process event bus. Importing
 * this module has a side effect: handler registration. wireEvents() in
 * src/shared/events/wire-events.ts imports this once per process.
 *
 * Per L1: notifications doesn't get directly called by other contexts; they
 * publish events, this module consumes them. Subscriptions/payments no
 * longer need to know `queueCustomerNotification` exists.
 */

import { eventBus } from '@/shared/events/event-bus'
import { queueCustomerNotification, type CustomerNotificationKind } from './queue'

const VALID_KINDS = new Set<CustomerNotificationKind>([
  'meal_skipped_confirm',
  'meal_resumed_confirm',
  'plan_paused_confirm',
  'plan_pause_scheduled_confirm',
  'plan_resumed_confirm',
  'payment_order_confirmed',
])

eventBus.on('subscription.notification-due', async (payload) => {
  // Narrow the bus's string-typed kind to our typed union at the boundary.
  // Unknown kinds are dropped with a loud log so a typo'd emit doesn't write
  // a row the dispatcher cron can't route.
  if (!VALID_KINDS.has(payload.kind as CustomerNotificationKind)) {
    console.error(
      `notifications subscriber: unknown kind="${payload.kind}" — dropped`,
    )
    return
  }
  await queueCustomerNotification(
    payload.customerId,
    payload.kind as CustomerNotificationKind,
    payload.scheduledFor,
    payload.payload ?? {},
  )
})
