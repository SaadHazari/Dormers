'use server';

/**
 * Subscriptions context — savings use-case.
 *
 * One server action that captures the customer's self-reported "what would
 * you typically pay for takeout?" benchmark. Powers the "Saved this cycle"
 * StatTile and the lifetime savings line in the greeting ribbon.
 *
 * The number is bounded (15..50 AED) and stored as a smallint per the
 * migration. Validation here mirrors the DB CHECK constraint so we fail
 * fast with a friendly error instead of bubbling a Postgres violation.
 */

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/contexts/identity/usecases/require-user';

export type SetTakeoutBenchmarkResult =
  | { ok: true }
  | { error: string };

export async function setTakeoutBenchmark(
  aed: number,
): Promise<SetTakeoutBenchmarkResult> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };

  if (!Number.isFinite(aed) || !Number.isInteger(aed)) {
    return { error: 'Pick a whole-dirham amount.' };
  }
  if (aed < 15 || aed > 50) {
    return { error: 'Benchmark must be between AED 15 and AED 50.' };
  }

  const { error } = await auth.supabase
    .from('customers')
    .update({ takeout_benchmark_aed: aed })
    .eq('id', auth.user.id);

  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
