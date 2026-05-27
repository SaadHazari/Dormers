// Compatibility shim — moved to @/shared/validation in Phase 9.
// Pure validators (name, password) are shared kernel — used by identity,
// profile updates, referral trial-claim. Shim removed in Phase 11.
export * from '@/shared/validation'
