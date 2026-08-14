import { describe, it, expect } from 'vitest'
import type { CustomerRow } from './page'
import { getAttention, matchesFilter, sortCustomers, urgencyRank } from './priority'

const TODAY = '2026-08-14'

function row(over: Partial<CustomerRow> = {}): CustomerRow {
    return {
        id: over.id ?? 'id-1',
        cid: 'DM001',
        name: 'Test Customer',
        email: 'test@example.com',
        whatsapp_number: null,
        dorm_name: 'Dorm A',
        meal_preference_type: null,
        week_type: '5DAYS',
        created_at: '2026-08-01T00:00:00Z',
        active_plan: 'monthly',
        sub_status: 'Active',
        delivered_meals: 5,
        total_meals: 20,
        sub_id: 'sub-1',
        sub_start_date: '2026-08-01',
        sub_end_date: '2026-09-01',
        ...over,
    }
}

describe('getAttention', () => {
    it('flags a subscription still live past its end date', () => {
        const a = getAttention(row({ sub_end_date: '2026-08-10' }), TODAY)
        expect(a?.label).toBe('Past end date')
        expect(a?.tone).toBe('danger')
    })

    it('flags the last day', () => {
        expect(getAttention(row({ sub_end_date: TODAY }), TODAY)?.label).toBe('Last day')
    })

    it('flags endings inside three days, and ranks nearer endings higher', () => {
        const tomorrow = getAttention(row({ sub_end_date: '2026-08-15' }), TODAY)
        const threeDays = getAttention(row({ sub_end_date: '2026-08-17' }), TODAY)
        expect(tomorrow?.label).toBe('Ends tomorrow')
        expect(threeDays?.label).toBe('Ends in 3 days')
        expect(tomorrow!.rank).toBeLessThan(threeDays!.rank)
    })

    it('ignores endings further out than three days', () => {
        expect(getAttention(row({ sub_end_date: '2026-08-18' }), TODAY)).toBeNull()
    })

    it('flags the first day', () => {
        expect(getAttention(row({ sub_start_date: TODAY }), TODAY)?.label).toBe('First day')
    })

    it('flags an active plan that has delivered nothing', () => {
        expect(getAttention(row({ delivered_meals: 0 }), TODAY)?.label).toBe('No meals yet')
    })

    it('flags paused and skipped plans, without repeating the status badge', () => {
        const paused = getAttention(row({ sub_status: 'Paused' }), TODAY)
        const skipped = getAttention(row({ sub_status: 'Skipped' }), TODAY)
        expect(paused?.label).toBe('Paused')
        expect(skipped?.label).toBe('Skipping today')
        expect(paused?.redundantWithStatus).toBe(true)
        expect(skipped?.redundantWithStatus).toBe(true)
    })

    it('keeps date-driven reasons visible, since no status badge says them', () => {
        expect(getAttention(row({ sub_end_date: TODAY }), TODAY)?.redundantWithStatus).toBeUndefined()
        expect(getAttention(row({ sub_status: 'Paused', sub_end_date: TODAY }), TODAY)?.label).toBe('Last day')
    })

    it('never flags ended plans or customers with no plan', () => {
        expect(getAttention(row({ sub_status: 'Ended', sub_end_date: TODAY }), TODAY)).toBeNull()
        expect(getAttention(row({ sub_status: null, sub_end_date: TODAY }), TODAY)).toBeNull()
    })

    it('leaves a healthy mid-plan customer alone', () => {
        expect(getAttention(row(), TODAY)).toBeNull()
    })
})

describe('sortCustomers', () => {
    const lastDay = row({ id: 'last', sub_end_date: TODAY })
    const endingSoon = row({ id: 'soon', sub_end_date: '2026-08-16' })
    const healthy = row({ id: 'healthy' })
    const ended = row({ id: 'ended', sub_status: 'Ended', sub_end_date: '2026-07-01' })

    it('puts the most urgent first', () => {
        const out = sortCustomers([ended, healthy, endingSoon, lastDay], 'urgency', TODAY)
        expect(out.map(c => c.id)).toEqual(['last', 'soon', 'healthy', 'ended'])
    })

    it('breaks urgency ties with the newest signup', () => {
        const older = row({ id: 'older', created_at: '2026-07-01T00:00:00Z' })
        const newer = row({ id: 'newer', created_at: '2026-08-09T00:00:00Z' })
        const out = sortCustomers([older, newer], 'urgency', TODAY)
        expect(out.map(c => c.id)).toEqual(['newer', 'older'])
    })

    it('sorts by newest and by name on request', () => {
        const a = row({ id: 'a', name: 'Zara', created_at: '2026-08-10T00:00:00Z' })
        const b = row({ id: 'b', name: 'Adam', created_at: '2026-08-12T00:00:00Z' })
        expect(sortCustomers([a, b], 'newest', TODAY).map(c => c.id)).toEqual(['b', 'a'])
        expect(sortCustomers([a, b], 'name', TODAY).map(c => c.id)).toEqual(['b', 'a'])
    })

    it('pushes unnamed customers to the end of a name sort', () => {
        const named = row({ id: 'named', name: 'Adam' })
        const unnamed = row({ id: 'unnamed', name: null })
        expect(sortCustomers([unnamed, named], 'name', TODAY).map(c => c.id)).toEqual(['named', 'unnamed'])
    })

    it('does not mutate the input array', () => {
        const input = [ended, lastDay]
        sortCustomers(input, 'urgency', TODAY)
        expect(input.map(c => c.id)).toEqual(['ended', 'last'])
    })
})

describe('matchesFilter', () => {
    it('matches the attention chip to anything getAttention flags', () => {
        expect(matchesFilter(row({ sub_end_date: TODAY }), 'attention', TODAY)).toBe(true)
        expect(matchesFilter(row(), 'attention', TODAY)).toBe(false)
    })

    it('matches status chips exactly and "no plan" to a missing subscription', () => {
        expect(matchesFilter(row({ sub_status: 'Paused' }), 'Paused', TODAY)).toBe(true)
        expect(matchesFilter(row({ sub_status: 'Active' }), 'Paused', TODAY)).toBe(false)
        expect(matchesFilter(row({ sub_status: null }), 'none', TODAY)).toBe(true)
        expect(matchesFilter(row(), 'all', TODAY)).toBe(true)
    })
})

describe('urgencyRank', () => {
    it('orders resting customers active, scheduled, no plan, ended', () => {
        const rank = (s: string | null) => urgencyRank(row({ sub_status: s, sub_end_date: '2026-12-01', sub_start_date: '2026-01-01' }), TODAY)
        expect(rank('Active')).toBeLessThan(rank('Scheduled'))
        expect(rank('Scheduled')).toBeLessThan(rank(null))
        expect(rank(null)).toBeLessThan(rank('Ended'))
    })
})
