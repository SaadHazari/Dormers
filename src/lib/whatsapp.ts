// Compatibility shim — moved to @/infra/meta-whatsapp/client in Phase 5.
// The Meta WhatsApp Cloud API SDK call lives in the infra ring per
// L1-BOUNDARIES.md. New consumers should import from the new path.
// Shim removed in Phase 11 cleanup.
export * from '@/infra/meta-whatsapp/client'
