import { describe, it, expect } from 'vitest'
import {
    isOptOutMessage, tierLimit, remainingAllowance, qualityVerdict,
    readTemplate, buildBodyParameters, estimateCostAed,
} from './whatsapp-marketing'

describe('isOptOutMessage', () => {
    it('honours the words people actually send', () => {
        for (const text of ['STOP', 'stop', ' Stop ', 'unsubscribe', 'UNSUBSCRIBE please', 'remove me', 'Stop.']) {
            expect(isOptOutMessage(text)).toBe(true)
        }
    })

    it('does not opt someone out for mentioning the word in passing', () => {
        // A rider saying "stopped at the gate" must not be unsubscribed, and
        // neither must a customer asking us to stop a delivery.
        for (const text of ['stopped at the gate', 'can you stop my delivery tomorrow?', 'nonstop', 'I will not stop ordering']) {
            expect(isOptOutMessage(text)).toBe(false)
        }
    })

    it('ignores empty and non-text input', () => {
        expect(isOptOutMessage('')).toBe(false)
        expect(isOptOutMessage('   ')).toBe(false)
        expect(isOptOutMessage(undefined)).toBe(false)
    })
})

describe('tierLimit and remainingAllowance', () => {
    it('reads Meta tier strings', () => {
        expect(tierLimit('TIER_1K')).toBe(1_000)
        expect(tierLimit('TIER_10K')).toBe(10_000)
        expect(tierLimit('TIER_100K')).toBe(100_000)
        expect(tierLimit('TIER_UNLIMITED')).toBe(Infinity)
    })

    it('falls back to the lowest tier when Meta says something we do not know', () => {
        // Guessing high here would be the expensive mistake, so an unknown
        // tier is treated as the smallest one.
        expect(tierLimit('TIER_SOMETHING_NEW')).toBe(1_000)
        expect(tierLimit(undefined)).toBe(1_000)
    })

    it('subtracts what the number has already sent today', () => {
        expect(remainingAllowance('TIER_1K', 0)).toBe(1_000)
        expect(remainingAllowance('TIER_1K', 400)).toBe(600)
        expect(remainingAllowance('TIER_1K', 1_000)).toBe(0)
    })

    it('never reports a negative allowance', () => {
        expect(remainingAllowance('TIER_1K', 1_500)).toBe(0)
    })
})

describe('qualityVerdict', () => {
    it('lets a green number send', () => {
        expect(qualityVerdict('GREEN')).toBe('ok')
    })

    it('makes a yellow number ask twice', () => {
        expect(qualityVerdict('YELLOW')).toBe('warn')
    })

    it('refuses on red', () => {
        expect(qualityVerdict('RED')).toBe('block')
    })

    it('warns rather than blocks when Meta will not say', () => {
        // UNKNOWN is what a new number reports. Blocking it would make the
        // feature unusable on day one; sending blind would be worse.
        expect(qualityVerdict('UNKNOWN')).toBe('warn')
        expect(qualityVerdict(undefined)).toBe('warn')
    })
})

describe('readTemplate', () => {
    const positional = {
        name: 'season_reopen_news', language: 'en', status: 'APPROVED', category: 'MARKETING',
        components: [
            { type: 'HEADER', format: 'TEXT', text: 'We are back' },
            { type: 'BODY', text: 'Hi {{1}}, the kitchen reopens on {{2}}.' },
            { type: 'FOOTER', text: 'Dormers' },
        ],
    }
    const named = {
        name: 'menu_drop', language: 'en', status: 'APPROVED', category: 'MARKETING',
        components: [{
            type: 'BODY',
            text: 'Hi {{first_name}}, this week we are cooking {{dish}}.',
            example: { body_text_named_params: [{ param_name: 'first_name' }, { param_name: 'dish' }] },
        }],
    }

    it('reads positional placeholders in order', () => {
        const t = readTemplate(positional)
        expect(t.variables).toEqual(['1', '2'])
        expect(t.namedParams).toBe(false)
        expect(t.bodyPreview).toContain('the kitchen reopens')
    })

    it('reads named placeholders and marks them as named', () => {
        const t = readTemplate(named)
        expect(t.variables).toEqual(['first_name', 'dish'])
        expect(t.namedParams).toBe(true)
    })

    it('only stamps approved_at for a template Meta actually approved', () => {
        expect(readTemplate(positional).approved).toBe(true)
        expect(readTemplate({ ...positional, status: 'PENDING' }).approved).toBe(false)
        expect(readTemplate({ ...positional, status: 'REJECTED' }).approved).toBe(false)
    })

    it('handles a template with no variables at all', () => {
        const t = readTemplate({ ...positional, components: [{ type: 'BODY', text: 'We are open again.' }] })
        expect(t.variables).toEqual([])
    })

    it('does not mistake a repeated placeholder for two variables', () => {
        const t = readTemplate({ ...positional, components: [{ type: 'BODY', text: '{{1}} and {{1}} again, then {{2}}' }] })
        expect(t.variables).toEqual(['1', '2'])
    })
})

describe('buildBodyParameters', () => {
    // Meta rejects positional parameters on a named template and vice versa,
    // which is the single most common way a send 132000s at runtime.
    it('sends bare text for a positional template', () => {
        expect(buildBodyParameters(['1', '2'], false, { '1': 'Saad', '2': 'Sunday' }))
            .toEqual([{ type: 'text', text: 'Saad' }, { type: 'text', text: 'Sunday' }])
    })

    it('carries parameter_name for a named template', () => {
        expect(buildBodyParameters(['first_name'], true, { first_name: 'Saad' }))
            .toEqual([{ type: 'text', parameter_name: 'first_name', text: 'Saad' }])
    })

    it('keeps the template order, not the order the values were typed in', () => {
        const out = buildBodyParameters(['1', '2'], false, { '2': 'second', '1': 'first' })
        expect(out.map(p => p.text)).toEqual(['first', 'second'])
    })

    it('substitutes an empty value rather than dropping the slot', () => {
        // A missing slot shifts every later parameter by one and sends the
        // wrong text to a real person; an empty string only reads oddly.
        expect(buildBodyParameters(['1', '2'], false, { '1': 'Saad' }))
            .toEqual([{ type: 'text', text: 'Saad' }, { type: 'text', text: '' }])
    })
})

describe('estimateCostAed', () => {
    it('multiplies recipients by the per-message rate', () => {
        expect(estimateCostAed(100, 0.12)).toBe(12)
    })

    it('rounds to fils, so the number reads like money', () => {
        expect(estimateCostAed(3, 0.111)).toBe(0.33)
    })

    it('is zero for nobody', () => {
        expect(estimateCostAed(0, 0.12)).toBe(0)
    })
})
