'use server';

/**
 * Identity context — profile actions.
 *
 * Server actions for the customer's name + dorm building. Carved out of the
 * dashboard's actions.ts god-file in Phase D of the layered refactor.
 *
 * Note: whatsapp_number is intentionally NOT updatable here — that goes
 * through the verified OTP path in profile/SecuritySection so an unverified
 * number can never be persisted by this action.
 */

import { revalidatePath } from 'next/cache';
import { requireUser } from './require-user';

/**
 * Saves account-detail fields that apply IMMEDIATELY (current cycle).
 * Whitelist: name, dorm_name. Allergens, spice level, meal preference,
 * delivery week, and religious veg days are NOT here — they ride the
 * pending-preferences flow in savePendingPreferences so a mid-cycle change
 * doesn't break the dashboard ↔ kitchen-ops contract.
 */
export async function updateProfile(data: {
  name: string;
  dorm_name: string;
}) {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  if (!data.name?.trim()) return { error: 'Full name is required.' };
  if (!data.dorm_name?.trim()) return { error: 'Dorm building is required.' };

  const { error } = await auth.supabase
    .from('customers')
    .update({ name: data.name.trim(), dorm_name: data.dorm_name.trim() })
    .eq('id', auth.user.id);

  if (error) return { error: 'Failed to update profile.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/plan');
  revalidatePath('/dashboard/profile');
  return { success: true };
}
