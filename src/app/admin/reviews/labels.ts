/**
 * Shared presentation maps for the admin Reviews surfaces.
 *
 * The data layer (`reviews-repo.ts`) returns raw enum ids; these maps turn them
 * into admin-facing labels + tones. Kept in one client-safe module so the
 * dashboard and the submissions feed don't drift apart on wording.
 */

import {
    SIGNUP_TRIGGER_OPTIONS, JOB_OPTIONS, ALTERNATIVE_OPTIONS, ALTERNATIVE_COST_OPTIONS,
} from '@/contexts/subscriptions/domain/monthly-review'

// Saturated fills read fine on both light + dark admin surfaces — mirror the
// token palette's light-mode hues so the bars feel native to the theme.
export const TONE = {
    good: '#1d8a30',
    ok: '#f57f20',
    warn: '#b8860b',
    bad: '#c0392b',
    neutral: '#8a8a8a',
} as const
export type ToneKey = keyof typeof TONE

interface EnumMeta { id: string; label: string; tone: ToneKey }

// Admin-facing labels (concise) for the two enums the domain doesn't export.
export const RENEWAL_ORDER: ReadonlyArray<EnumMeta> = [
    { id: 'definitely', label: 'Definitely renewing', tone: 'good' },
    { id: 'probably', label: 'Probably', tone: 'ok' },
    { id: 'probably_not', label: 'Probably not', tone: 'warn' },
    { id: 'no', label: 'Not renewing', tone: 'bad' },
]
export const RECOMMEND_ORDER: ReadonlyArray<EnumMeta> = [
    { id: 'yes_specific', label: 'Yes — to specific people', tone: 'good' },
    { id: 'yes_general', label: 'Yes — generally', tone: 'ok' },
    { id: 'maybe', label: 'Maybe', tone: 'warn' },
    { id: 'no', label: 'No', tone: 'bad' },
]

export const renewalMeta = new Map(RENEWAL_ORDER.map(o => [o.id, o]))
export const recommendMeta = new Map(RECOMMEND_ORDER.map(o => [o.id, o]))
export const triggerLabel = new Map(SIGNUP_TRIGGER_OPTIONS.map(o => [o.id, o.label]))
export const jobLabel = new Map(JOB_OPTIONS.map(o => [o.id, o.label]))
export const altLabel = new Map(ALTERNATIVE_OPTIONS.map(o => [o.id, o.label]))
export const costLabel = new Map<string, string>(ALTERNATIVE_COST_OPTIONS.map(o => [o.id, o.label]))

/** Short label for a renewal-intent id, falling back to the raw id. */
export function renewalLabel(id: string | null | undefined): string {
    return (id && renewalMeta.get(id)?.label) || id || '—'
}
/** Short label for a recommend id, falling back to the raw id. */
export function recommendLabel(id: string | null | undefined): string {
    return (id && recommendMeta.get(id)?.label) || id || '—'
}
