import { describe, it, expect } from 'vitest'
import { resolveEndedNotice, SEASON_CTA_URL } from './pause-suppression'

const OPEN = { paused: false, unspentCreditAed: 0, offerAed: 20 }

describe('resolveEndedNotice', () => {
  it('sends both channels unchanged while intake is open', () => {
    expect(resolveEndedNotice(OPEN)).toEqual({
      whatsapp: { mode: 'send' },
      email: { variant: 'normal' },
    })
  })

  it('still sends normally when intake is open even if credit is held', () => {
    // An unspent waitlist credit from a past pause must not divert a customer
    // whose plan ended while the shop is open — they can renew right now, and
    // the credit comes off that renewal at checkout.
    expect(resolveEndedNotice({ ...OPEN, unspentCreditAed: 20 })).toEqual({
      whatsapp: { mode: 'send' },
      email: { variant: 'normal' },
    })
  })

  describe('while intake is paused', () => {
    it('never sends the normal WhatsApp template', () => {
      // The approved subscription_ended template pushes a renewal that cannot
      // complete during a pause, so it is wrong on this channel either way.
      expect(resolveEndedNotice({ ...OPEN, paused: true }).whatsapp).toEqual({ mode: 'skip' })
      expect(resolveEndedNotice({ ...OPEN, paused: true, unspentCreditAed: 20 }).whatsapp).toEqual({ mode: 'skip' })
    })

    it('stays silent on WhatsApp until the season templates are confirmed live', () => {
      // Fails closed. Queueing a kind the dispatcher has no Vault entry for
      // used to jam the queue permanently, so "unset" must never mean "send".
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 20, offerAed: 15 }).whatsapp)
        .toEqual({ mode: 'skip' })
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 20, offerAed: 15, seasonWhatsAppReady: false }).whatsapp)
        .toEqual({ mode: 'skip' })
    })

    it('queues the credit template once the season templates are live', () => {
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 20, offerAed: 15, seasonWhatsAppReady: true }).whatsapp)
        .toEqual({ mode: 'season', kind: 'intake_ended_credit', aed: 20 })
    })

    it('queues the offer template for an empty wallet', () => {
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 0, offerAed: 15, seasonWhatsAppReady: true }).whatsapp)
        .toEqual({ mode: 'season', kind: 'intake_ended_offer', aed: 15 })
    })

    it('tells both channels the same story', () => {
      // Two templates exist precisely because WhatsApp cannot do the email's
      // either/or block. If they ever disagreed, one customer would be told
      // their money is waiting and offered it as new in the same minute.
      for (const unspentCreditAed of [0, 20, 40, Number.NaN, -5]) {
        const n = resolveEndedNotice({ paused: true, unspentCreditAed, offerAed: 15, seasonWhatsAppReady: true })
        if (n.email.variant !== 'season' || n.whatsapp.mode !== 'season') throw new Error('expected season on both')
        expect(n.whatsapp.kind).toBe(
          n.email.block === 'credit' ? 'intake_ended_credit' : 'intake_ended_offer',
        )
        expect(n.whatsapp.aed).toBe(n.email.aed)
      }
    })

    it('shows the credit block to someone holding unspent credit', () => {
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 20, offerAed: 15 })).toEqual({
        whatsapp: { mode: 'skip' },
        email: {
          variant: 'season',
          block: 'credit',
          aed: 20,
          ctaLabel: 'See my wallet',
          ctaUrl: SEASON_CTA_URL,
        },
      })
    })

    it('reports the real balance, not the standard offer', () => {
      // Credits stack across pauses, so the wallet can hold more than one
      // cycle's worth. Quoting offerAed here would under-report their money.
      const notice = resolveEndedNotice({ paused: true, unspentCreditAed: 40, offerAed: 20 })
      expect(notice.email).toMatchObject({ block: 'credit', aed: 40 })
    })

    it('shows the offer block to someone with an empty wallet', () => {
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 0, offerAed: 15 })).toEqual({
        whatsapp: { mode: 'skip' },
        email: {
          variant: 'season',
          block: 'offer',
          aed: 15,
          ctaLabel: 'Save my spot',
          ctaUrl: SEASON_CTA_URL,
        },
      })
    })

    it('treats a spent wallet as empty and offers rather than promises', () => {
      // Someone who joined a past cycle and redeemed the credit holds nothing.
      // Telling them money is waiting would be a lie the wallet contradicts.
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: 0, offerAed: 20 }).email)
        .toMatchObject({ block: 'offer', aed: 20 })
    })

    it('treats an unusable balance as empty', () => {
      // Defensive: PostgREST hands numerics back as strings, so a coercion slip
      // upstream can produce NaN. A negative balance should be impossible. In
      // both cases offer rather than render "Your AED NaN is waiting".
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: Number.NaN, offerAed: 20 }).email)
        .toMatchObject({ block: 'offer', aed: 20 })
      expect(resolveEndedNotice({ paused: true, unspentCreditAed: -5, offerAed: 20 }).email)
        .toMatchObject({ block: 'offer', aed: 20 })
    })
  })

  it('never points the season CTA at the renewal flow', () => {
    // The template's own notes forbid ?renew=1: it opens a checkout that
    // refuses the customer while intake is paused.
    expect(SEASON_CTA_URL).not.toContain('renew')
  })
})
