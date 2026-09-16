import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { processSeasonNotices, type SeasonNoticeDeps, type SeasonNoticeRow } from './season-notices-send'

const row = (over: Partial<SeasonNoticeRow> = {}): SeasonNoticeRow => ({
  id: 'n-1', customer_id: 'c-1', kind: 'season_plan_held', subject_id: 'h-1', cycle_started_at: '2026-09-14T08:00:00Z',
  payload: { plan_name: 'Monthly Premium', held_meals: 9, credit_aed: 20 }, email_sent_at: null, whatsapp_queued_at: null, ...over,
})

function deps(over: Partial<SeasonNoticeDeps> = {}) {
  const calls = { email: [] as unknown[], whatsapp: [] as unknown[], stamps: [] as Array<[string, unknown]> }
  const d: SeasonNoticeDeps = {
    claim: async () => [row()],
    customer: async () => ({ name: 'Omar Farouk', email: 'o@example.com' }),
    checkFact: async () => ({ ok: true }),
    sendEmail: async (input) => { calls.email.push(input) },
    queueWhatsApp: async (...args) => { calls.whatsapp.push(args) },
    stamp: async (id, patch) => { calls.stamps.push([id, patch]) },
    whatsappEnabled: true,
    now: () => new Date('2026-10-06T06:00:00Z'),
    ...over,
  }
  return { d, calls }
}

describe('processSeasonNotices (spec §12.3)', () => {
  it('sends the email, queues the WhatsApp and stamps both channels', async () => {
    const { d, calls } = deps()
    expect(await processSeasonNotices(d)).toEqual({ claimed: 1, emailed: 1, whatsapp: 1, dropped: 0, failed: 0 })
    expect(calls.email[0]).toEqual({
      toEmail: 'o@example.com', firstName: 'Omar',
      envKey: 'ZEPTOMAIL_TPL_SEASON_PLAN_HELD',
      mergeInfo: { plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' },
    })
    expect(calls.whatsapp[0]).toEqual(['c-1', 'season_plan_held', { plan_name: 'Monthly Premium', held_meals: '9', credit_aed: '20' }])
    expect(calls.stamps).toEqual([
      ['n-1', { email_sent_at: '2026-10-06T06:00:00.000Z', last_error: null }],
      ['n-1', { whatsapp_queued_at: '2026-10-06T06:00:00.000Z' }],
    ])
  })

  it('drops a notice whose fact is gone instead of sending it (spec §12.1)', async () => {
    const { d, calls } = deps({ checkFact: async () => ({ ok: false, reason: 'hold_changed' }) })
    expect(await processSeasonNotices(d)).toMatchObject({ dropped: 1, emailed: 0, whatsapp: 0 })
    expect(calls.stamps).toEqual([['n-1', { dropped_at: '2026-10-06T06:00:00.000Z', drop_reason: 'hold_changed' }]])
  })

  it('never re-sends a channel that already went', async () => {
    const { d, calls } = deps({ claim: async () => [row({ email_sent_at: '2026-10-06T05:00:00Z' })] })
    expect(await processSeasonNotices(d)).toMatchObject({ emailed: 0, whatsapp: 1 })
    expect(calls.email).toEqual([])
  })

  it('finishes the WhatsApp channel with a readable reason when the templates are off or the amount is 0', async () => {
    const off = deps({ whatsappEnabled: false })
    await processSeasonNotices(off.d)
    expect(off.calls.whatsapp).toEqual([])
    expect(off.calls.stamps[1]).toEqual(['n-1', { whatsapp_queued_at: '2026-10-06T06:00:00.000Z', last_error: 'whatsapp skipped: season templates not enabled' }])
    const zero = deps({ claim: async () => [row({ payload: { plan_name: 'Monthly Premium', held_meals: 9, credit_aed: 0 } })] })
    await processSeasonNotices(zero.d)
    expect(zero.calls.whatsapp).toEqual([])
    expect(zero.calls.stamps[1][1]).toMatchObject({ last_error: 'whatsapp skipped: amount is 0' })
  })

  it('skips the email without an address, still queues the WhatsApp, and records a send failure for the retry', async () => {
    const noEmail = deps({ customer: async () => ({ name: 'Omar', email: null }) })
    expect(await processSeasonNotices(noEmail.d)).toMatchObject({ emailed: 0, whatsapp: 1, failed: 0 })
    expect(noEmail.calls.stamps[0][1]).toMatchObject({ last_error: 'email skipped: no address' })

    const failing = deps({ sendEmail: async () => { throw new Error('zepto 500') } })
    expect(await processSeasonNotices(failing.d)).toMatchObject({ failed: 1, emailed: 0 })
    expect(failing.calls.stamps).toEqual([['n-1', { last_error: 'zepto 500' }]])
  })
})
