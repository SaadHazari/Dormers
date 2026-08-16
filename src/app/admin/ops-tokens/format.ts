import type { OpsRole } from '@/contexts/ops/domain/ops-token'

/**
 * Shorten a link for the row it sits in, keeping the FRONT of the token.
 *
 * The old page masked as `****d2c1` — the tail is the half worth stealing and
 * it identifies nothing to the person reading it. Two links that both end in
 * different noise look identical at a glance; the leading characters are what
 * you actually recognise a link by.
 */
export function shortLink(url: string): string {
    const bare = url.replace(/^https?:\/\//, '')
    const cut = bare.lastIndexOf('/')
    if (cut === -1) return bare
    const prefix = bare.slice(0, cut + 1)
    const token = bare.slice(cut + 1)
    if (token.length <= 12) return bare
    return `${prefix}${token.slice(0, 6)}…${token.slice(-2)}`
}

/** "2h ago" / "3d ago" — coarse on purpose, this is a liveness hint. */
export function timeAgo(iso: string | null): string {
    if (!iso) return 'Never opened'
    const then = Date.parse(iso)
    if (!Number.isFinite(then)) return 'Never opened'

    const mins = Math.floor((Date.now() - then) / 60_000)
    if (mins < 2) return 'Opened just now'
    if (mins < 60) return `Opened ${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `Opened ${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `Opened ${days}d ago`
    return `Opened ${Math.floor(days / 30)}mo ago`
}

/** 2026-08-16 → "16 Aug 2026" */
export function shortDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 971504619384 → "+971 50 461 9384" */
export function prettyPhone(digits: string): string {
    if (digits.length === 12 && digits.startsWith('971')) {
        return `+971 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
    }
    return `+${digits}`
}

export const TEAM_LABEL: Record<OpsRole, string> = {
    kitchen: 'Kitchen',
    rider: 'Rider',
}

/** What the link actually opens — stated so nobody has to guess from a path. */
export const TEAM_DESCRIPTION: Record<OpsRole, string> = {
    kitchen: 'Opens the kitchen display: today\'s counts, recipes and packing check.',
    rider: 'Opens the rider run: pickup photo, dorm drop-offs and delivery confirmation.',
}
