/**
 * Profile-completion gate — single source of truth for which customer
 * fields must be filled before plan purchase is unlocked.
 *
 * Used by:
 *   - dashboard ClientDashboard.tsx — render the persistent banner +
 *     disable purchase CTAs
 *   - api/checkout/route.ts — server-side reject with PROFILE_INCOMPLETE
 *     (UI gate alone is bypassable)
 */

export type ProfileField = {
  key: 'name' | 'dorm_name' | 'meal_preference_type' | 'whatsapp_verified'
  label: string
}

export const REQUIRED_PROFILE_FIELDS: ProfileField[] = [
  { key: 'name',                 label: 'Your name' },
  { key: 'dorm_name',            label: 'Dorm name' },
  { key: 'meal_preference_type', label: 'Meal preference' },
  { key: 'whatsapp_verified',    label: 'WhatsApp verification' },
]

export interface ProfileLike {
  name?: string | null
  dorm_name?: string | null
  meal_preference_type?: string | null
  whatsapp_number?: string | null
  whatsapp_verified?: boolean | null
}

/**
 * Returns the labels of any required fields that are missing/unset.
 * Empty array = profile complete. Used to drive both the banner copy and
 * the API rejection payload.
 */
export function missingProfileFields(c: ProfileLike | null | undefined): string[] {
  if (!c) return REQUIRED_PROFILE_FIELDS.map(f => f.label)
  const missing: string[] = []
  for (const f of REQUIRED_PROFILE_FIELDS) {
    if (f.key === 'whatsapp_verified') {
      if (!c.whatsapp_number || !c.whatsapp_verified) missing.push(f.label)
    } else {
      const v = c[f.key]
      if (typeof v !== 'string' || v.trim() === '') missing.push(f.label)
    }
  }
  return missing
}

export function isProfileComplete(c: ProfileLike | null | undefined): boolean {
  return missingProfileFields(c).length === 0
}
