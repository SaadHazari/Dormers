import { describe, it, expect } from 'vitest'
import { SEASON_NOTICE_KINDS, aedText, seasonEmailFor, seasonWhatsAppPayload, seasonWhatsAppWanted, firstNameOf } from './season-messages'

const payload = { plan_name: 'Monthly Premium', wrap_up_day: '2026-10-03', last_dinner: '2026-10-01', held_meals: 9, credit_aed: 20, offer_aed: 15 }

describe('season messages (spec §12)', () => {
  it('reads amounts the way a customer does', () => {
    expect(aedText(20)).toBe('20')
    expect(aedText('19.8')).toBe('19.80')
    expect(aedText(null)).toBe('0')
    expect(firstNameOf('  Omar Farouk ')).toBe('Omar')
    expect(firstNameOf(null)).toBe('there')
  })

  it('every email uses plain words: no emoji, no dashes, the customer dates and amounts', () => {
    for (const kind of SEASON_NOTICE_KINDS) {
      const email = seasonEmailFor(kind, payload)
      expect(email.subject.length).toBeGreaterThan(8)
      expect(email.bodyText).not.toMatch(/[–—]/)
      expect(email.subject).not.toMatch(/[–—]/)
      expect(email.bodyText).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
      expect(email.cta?.url).toMatch(/^https:\/\/dormers\.ae\//)
    }
    expect(seasonEmailFor('season_plan_runs_past', payload).bodyText).toContain('The semester wraps up on Sat 3 Oct')
    expect(seasonEmailFor('season_plan_runs_past', payload).bodyText).toContain('Your last 9 meals of Monthly Premium will be kept for next semester, with AED 20 in your wallet')
    expect(seasonEmailFor('season_last_dinners', payload).bodyText).toContain('finishes on Thu 1 Oct')
    expect(seasonEmailFor('season_last_dinners', payload).bodyText).toContain('AED 15 goes to your wallet')
    expect(seasonEmailFor('season_plan_held', payload).bodyText).toContain('your last 9 meals of Monthly Premium are kept for you. AED 20 is in your wallet too.')
    expect(seasonEmailFor('season_pause_carries', payload).bodyText).toContain('Your Monthly Premium is still paused')
    expect(seasonEmailFor('season_plan_ready', { ...payload, held_meals: 1 }).bodyText).toContain('Your 1 meal of Monthly Premium is ready.')
    expect(seasonEmailFor('season_credit_waiting', payload).subject).toBe('AED 20 is waiting in your wallet')
  })

  it('leaves the credit line out when there is no credit', () => {
    expect(seasonEmailFor('season_plan_runs_past', { ...payload, credit_aed: 0 }).bodyText).not.toContain('wallet for your next')
    expect(seasonEmailFor('season_plan_held', { ...payload, credit_aed: 0 }).bodyText).not.toContain('is in your wallet too')
    expect(seasonEmailFor('season_pause_carries', { ...payload, offer_aed: 0 }).bodyText).not.toContain('Save your spot')
  })

  it('maps each kind to its template parameters (spec §12.4), dates left ISO for the dispatcher', () => {
    expect(seasonWhatsAppPayload('season_plan_runs_past', payload)).toEqual({ wrap_up_day: '2026-10-03', held_meals: '9', credit_aed: '20' })
    expect(seasonWhatsAppPayload('season_last_dinners', payload)).toEqual({ last_dinner: '2026-10-01', wrap_up_day: '2026-10-03', offer_aed: '15' })
    expect(seasonWhatsAppPayload('season_plan_held', payload)).toEqual({ plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' })
    expect(seasonWhatsAppPayload('season_pause_carries', payload)).toEqual({ plan_name: 'Monthly Premium', offer_aed: '15' })
    expect(seasonWhatsAppPayload('season_plan_ready', payload)).toEqual({ held_meals: '9', plan_name: 'Monthly Premium' })
    expect(seasonWhatsAppPayload('season_credit_waiting', payload)).toEqual({ credit_aed: '20' })
  })

  it('sends no template whose amount would read 0', () => {
    expect(seasonWhatsAppWanted('season_plan_held', payload)).toBe(true)
    expect(seasonWhatsAppWanted('season_plan_held', { ...payload, credit_aed: 0 })).toBe(false)
    expect(seasonWhatsAppWanted('season_last_dinners', { ...payload, offer_aed: 0 })).toBe(false)
    expect(seasonWhatsAppWanted('season_plan_ready', { ...payload, credit_aed: 0 })).toBe(true)
  })
})
