// Compatibility shim — moved during the layered refactor.
//
//   queueCustomerNotification + CustomerNotificationKind moved in Phase 5
//   ↳ @/contexts/notifications/usecases/queue
//
//   ae9amUtcOnDate + nextEligibleDeliveryDay moved in Phase 2
//   ↳ @/shared/time/dubai-day
//
// New consumers should import directly from the new paths.
// Shim removed in Phase 11 cleanup.
export {
  queueCustomerNotification,
  type CustomerNotificationKind,
} from '@/contexts/notifications/usecases/queue'
export { ae9amUtcOnDate, nextEligibleDeliveryDay } from '@/shared/time/dubai-day'
