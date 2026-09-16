/**
 * The rules a WhatsApp marketing send has to obey, as pure functions.
 *
 * Marketing leaves from the same Meta number that carries OTP. Blocks and
 * reports drop that number's quality rating, and a rating drop throttles the
 * number new signups depend on — so every judgement here is deliberately
 * biased towards sending less: an unknown tier is the smallest tier, an
 * unreadable quality rating asks for a second confirmation, and a missing
 * template variable becomes an empty slot rather than a silent shift.
 */

// ---------------------------------------------------------------------------
// Opt-out
// ---------------------------------------------------------------------------

/**
 * Only a message that IS the opt-out counts, not one that mentions it. A rider
 * replying "stopped at the gate", or a customer asking us to "stop my delivery
 * tomorrow", must not be unsubscribed — both are real messages this number
 * receives today.
 */
const OPT_OUT_RE = /^\s*(stop|unsubscribe|remove)\b[\s.!,]*(me|please|all)?[\s.!,]*$/i

export function isOptOutMessage(text: string | null | undefined): boolean {
    return typeof text === 'string' && OPT_OUT_RE.test(text)
}

// ---------------------------------------------------------------------------
// The number's daily allowance
// ---------------------------------------------------------------------------

const TIERS: Record<string, number> = {
    TIER_50: 50,
    TIER_250: 250,
    TIER_1K: 1_000,
    TIER_10K: 10_000,
    TIER_100K: 100_000,
    TIER_UNLIMITED: Infinity,
}

/** Meta's messaging tier as a number of unique recipients per rolling 24h.
 *  An unrecognised tier is treated as the smallest: guessing high is the
 *  expensive mistake, and Meta adds tiers without asking us. */
export function tierLimit(tier: string | null | undefined): number {
    if (!tier) return 1_000
    return TIERS[tier] ?? 1_000
}

export function remainingAllowance(tier: string | null | undefined, sentLast24h: number): number {
    return Math.max(0, tierLimit(tier) - sentLast24h)
}

// ---------------------------------------------------------------------------
// Number health
// ---------------------------------------------------------------------------

export type QualityVerdict = 'ok' | 'warn' | 'block'

/**
 * GREEN sends. RED refuses — sending into a red rating is how a number gets
 * restricted. YELLOW and UNKNOWN warn: UNKNOWN is what a number with little
 * recent history reports, and blocking that would make the feature unusable
 * on the day it ships.
 */
export function qualityVerdict(rating: string | null | undefined): QualityVerdict {
    if (rating === 'GREEN') return 'ok'
    if (rating === 'RED') return 'block'
    return 'warn'
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface MetaComponent {
    type?: string
    text?: string
    example?: { body_text_named_params?: Array<{ param_name?: string }> }
}

export interface MetaTemplate {
    name: string
    language: string
    status: string
    category: string
    components?: MetaComponent[]
}

export interface ReadTemplate {
    name: string
    language: string
    status: string
    category: string
    approved: boolean
    variables: string[]
    namedParams: boolean
    bodyPreview: string
}

/**
 * What a Meta template row means for us: its body text, its placeholders in
 * order, and whether those placeholders are named or positional. Meta rejects
 * positional parameters on a named template and vice versa, so that shape has
 * to be recorded, not guessed at send time.
 */
export function readTemplate(tpl: MetaTemplate): ReadTemplate {
    const body = (tpl.components ?? []).find(c => c.type?.toUpperCase() === 'BODY')
    const bodyPreview = body?.text ?? ''

    const named = body?.example?.body_text_named_params
    let variables: string[]
    let namedParams: boolean

    if (named && named.length > 0) {
        namedParams = true
        variables = named.map(p => p.param_name ?? '').filter(Boolean)
    } else {
        namedParams = false
        // Placeholders in first-appearance order, each counted once: a body
        // that repeats {{1}} still takes one parameter, and sending two would
        // shift everything after it.
        const seen = new Set<string>()
        variables = []
        for (const m of bodyPreview.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
            const key = m[1]
            if (!seen.has(key)) { seen.add(key); variables.push(key) }
        }
        // A body written with named placeholders but no example block is still
        // a named template — digits mean positional, anything else does not.
        if (variables.length > 0 && variables.some(v => !/^\d+$/.test(v))) namedParams = true
    }

    return {
        name: tpl.name,
        language: tpl.language,
        status: tpl.status,
        category: tpl.category,
        approved: tpl.status?.toUpperCase() === 'APPROVED',
        variables,
        namedParams,
        bodyPreview,
    }
}

export interface BodyParameter {
    type: 'text'
    text: string
    parameter_name?: string
}

/**
 * The parameters array for one send, in the template's own order.
 *
 * A value the admin left blank becomes an empty string rather than a dropped
 * slot: dropping one shifts every later parameter up by one and sends a real
 * person text meant for a different placeholder.
 */
export function buildBodyParameters(
    variables: string[],
    namedParams: boolean,
    values: Record<string, string>,
): BodyParameter[] {
    return variables.map(name => namedParams
        ? { type: 'text' as const, parameter_name: name, text: values[name] ?? '' }
        : { type: 'text' as const, text: values[name] ?? '' })
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * What this send costs, to the fils. A WhatsApp broadcast is the first thing
 * in this codebase where pressing a button spends money per recipient, so the
 * composer says so before the confirm.
 */
export function estimateCostAed(recipients: number, ratePerMessageAed: number): number {
    return Math.round(recipients * ratePerMessageAed * 100) / 100
}
