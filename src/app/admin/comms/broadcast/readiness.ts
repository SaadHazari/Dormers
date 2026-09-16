/**
 * Can this broadcast go, and if not, what exactly is in the way?
 *
 * The old composer answered only "can it go", by disabling the button. That
 * built a trap: nobody had opted into WhatsApp marketing, so the audience
 * counted 0, so Send was disabled — and the switch that includes those people
 * lived in the dialog behind Send. Saad could not send to anyone and nothing on
 * screen said why.
 *
 * So readiness is a sentence, not a boolean. Every block names itself, names
 * its fix, and names the step where the fix lives, and the page renders that
 * wherever the person is looking. Pure, so the trap cannot be rebuilt without a
 * test going red.
 */

export type Step = 'audience' | 'message' | 'send'

export interface ReadinessInput {
    channel: 'email' | 'whatsapp'
    mode: 'custom' | 'season_reopen'
    audienceCount: number
    countLoading: boolean
    /** WhatsApp only: include contacts who never opted in to marketing. */
    includeUnknown: boolean
    /** WhatsApp only: how many in this audience HAVE opted in. */
    optedInCount: number
    templateChosen: boolean
    missingVariables: string[]
    subject: string
    heading: string
    body: string
    /** WhatsApp only: unique recipients the number can still reach in 24h. */
    remainingToday: number
    quality: 'ok' | 'warn' | 'block'
}

export interface Readiness {
    ready: boolean
    /** Still counting — not a problem, just not an answer yet. */
    pending: boolean
    step: Step | null
    blocker: string | null
    fix: string | null
    /** Allowed through, but worth reading first. */
    warning: string | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

function block(step: Step, blocker: string, fix: string | null = null): Readiness {
    return { ready: false, pending: false, step, blocker, fix, warning: null }
}

export function assessReadiness(i: ReadinessInput): Readiness {
    if (i.countLoading) {
        return { ready: false, pending: true, step: null, blocker: null, fix: null, warning: null }
    }

    // ── Step 1: who ─────────────────────────────────────────────────────────
    if (i.audienceCount === 0) {
        if (i.channel === 'whatsapp' && !i.includeUnknown && i.optedInCount === 0) {
            return block(
                'audience',
                'Nobody in this audience has opted in to WhatsApp marketing yet.',
                'Switch on "Include people who never opted in" to reach them.',
            )
        }
        return block('audience', 'Nobody in this audience can be reached on this channel.', 'Pick a different audience.')
    }

    if (i.channel === 'whatsapp' && i.audienceCount > i.remainingToday) {
        return block(
            'audience',
            `This number can reach ${fmt(i.remainingToday)} more people today, and this audience is ${fmt(i.audienceCount)}.`,
            'Pick a smaller audience, or send the rest tomorrow.',
        )
    }

    // ── Step 2: what ────────────────────────────────────────────────────────
    if (i.channel === 'whatsapp') {
        if (!i.templateChosen) return block('message', 'Choose which approved template to send.')
        if (i.missingVariables.length > 0) {
            return block('message', `Fill in ${i.missingVariables.join(', ')}.`)
        }
    } else if (i.mode === 'custom') {
        if (!i.subject.trim()) return block('message', 'Write a subject line.')
        if (!i.heading.trim()) return block('message', 'Write a heading.')
        if (!i.body.trim()) return block('message', 'Write the message.')
    }

    // ── Step 3: send ────────────────────────────────────────────────────────
    if (i.channel === 'whatsapp' && i.quality === 'block') {
        return block(
            'send',
            'The WhatsApp number’s quality rating is red. Sending now risks the number your signup codes come from.',
            'Wait for the rating to recover before sending.',
        )
    }

    const warning = i.channel === 'whatsapp' && i.quality === 'warn'
        ? 'The number’s quality rating is not a clean green. Consider a smaller group first.'
        : null

    return { ready: true, pending: false, step: null, blocker: null, fix: null, warning }
}
