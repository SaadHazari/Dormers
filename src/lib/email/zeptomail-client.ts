// Compatibility shim — moved to @/infra/zeptomail/client in Phase 5.
// The ZeptoMail SDK call lives in the infra ring per L1-BOUNDARIES.md.
// New consumers should import from the new path.
// Shim removed in Phase 11 cleanup.
export * from '@/infra/zeptomail/client'
