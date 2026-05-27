// Compatibility shim — moved to @/shared/cid in Phase 6.
// CID generator is shared kernel (used by identity onboarding + referral trial-claim).
// New consumers should import from the new path. Shim removed in Phase 11.
export * from '@/shared/cid'
