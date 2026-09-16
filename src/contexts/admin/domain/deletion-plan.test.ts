import { describe, it, expect } from 'vitest'
import { describeImpact, planDeletion, type DeleteImpactRow } from './deletion-plan'

function row(over: Partial<DeleteImpactRow> = {}): DeleteImpactRow {
    return {
        customer_id: 'c-1',
        name: 'Test Person',
        email: 'test@dormers.test',
        cid: 'DM001',
        impact: { subscriptions: 1, contacts: 1 },
        total_rows: 2,
        on_waitlist: false,
        waitlist_credit_aed: 0,
        is_staff: false,
        delivered_meals: 0,
        has_live_stripe: false,
        blocked_reason: null,
        ...over,
    }
}

describe('describeImpact', () => {
    it('reads the table names as plain words', () => {
        expect(describeImpact({ subscriptions: 3, customer_notifications: 12 }))
            .toBe('12 notifications, 3 plans')
    })

    it('puts the biggest groups first, so the scary number leads', () => {
        expect(describeImpact({ contacts: 1, comped_meal_ledger: 29, credits: 2 }))
            .toBe('29 free meals, 2 credits, 1 contact')
    })

    it('says nothing when nothing hangs off them', () => {
        expect(describeImpact({})).toBe('nothing else')
    })

    it('falls back to the raw table name rather than hiding a table', () => {
        expect(describeImpact({ some_new_table: 2 })).toContain('some_new_table')
    })

    it('gets singular and plural right', () => {
        expect(describeImpact({ subscriptions: 1 })).toBe('1 plan')
        expect(describeImpact({ credits: 1 })).toBe('1 credit')
    })
})

describe('planDeletion', () => {
    it('separates who can go from who cannot', () => {
        const plan = planDeletion([
            row({ customer_id: 'a' }),
            row({ customer_id: 'b', has_live_stripe: true, blocked_reason: 'Has a real Stripe payment' }),
        ])
        expect(plan.deletable.map(r => r.customer_id)).toEqual(['a'])
        expect(plan.blocked.map(r => r.customer_id)).toEqual(['b'])
    })

    it('adds up what would actually be destroyed, ignoring blocked rows', () => {
        const plan = planDeletion([
            row({ customer_id: 'a', total_rows: 4 }),
            row({ customer_id: 'b', total_rows: 10 }),
            row({ customer_id: 'c', total_rows: 99, blocked_reason: 'Has a real Stripe payment' }),
        ])
        // 14 children plus the three customer rows themselves... only the two
        // that are actually going.
        expect(plan.totalRows).toBe(14)
        expect(plan.totalPeople).toBe(2)
    })

    // Saad asked for waitlist members to stay reachable so his own test
    // accounts can be cleaned, but destroying a real member's pause credit is
    // irreversible — so it takes a second, separate acknowledgement.
    it('singles out waitlist members for their own acknowledgement', () => {
        const plan = planDeletion([
            row({ customer_id: 'a' }),
            row({ customer_id: 'b', on_waitlist: true, waitlist_credit_aed: 20 }),
        ])
        expect(plan.needsWaitlistAck.map(r => r.customer_id)).toEqual(['b'])
        expect(plan.totalCreditAed).toBe(20)
        expect(plan.requiresWaitlistAck).toBe(true)
    })

    it('asks for no acknowledgement when nobody is on the waitlist', () => {
        const plan = planDeletion([row(), row({ customer_id: 'b' })])
        expect(plan.requiresWaitlistAck).toBe(false)
        expect(plan.needsWaitlistAck).toEqual([])
    })

    it('does not count a blocked waitlist member towards the acknowledgement', () => {
        // They are not going anywhere, so warning about their credit is noise.
        const plan = planDeletion([
            row({ customer_id: 'b', on_waitlist: true, waitlist_credit_aed: 20, blocked_reason: 'Has a real Stripe payment' }),
        ])
        expect(plan.requiresWaitlistAck).toBe(false)
        expect(plan.totalCreditAed).toBe(0)
    })

    it('flags a customer the kitchen has actually cooked for', () => {
        const plan = planDeletion([
            row({ customer_id: 'a', delivered_meals: 24 }),
            row({ customer_id: 'b', delivered_meals: 0 }),
        ])
        expect(plan.served.map(r => r.customer_id)).toEqual(['a'])
    })

    it('flags a staff link, which deleting only breaks', () => {
        const plan = planDeletion([row({ customer_id: 'a', is_staff: true })])
        expect(plan.staff.map(r => r.customer_id)).toEqual(['a'])
    })

    it('handles an empty selection without inventing a plan', () => {
        const plan = planDeletion([])
        expect(plan).toMatchObject({ totalPeople: 0, totalRows: 0, totalCreditAed: 0, requiresWaitlistAck: false })
    })
})
