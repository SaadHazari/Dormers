import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  create: vi.fn(),
  record: vi.fn(),
  email: vi.fn(),
  find: vi.fn(),
  read: vi.fn(),
  notify: vi.fn(),
  capture: vi.fn(),
  upsert: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
  state: { note: null as Record<string, unknown> | null },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/infra/zoho/credit-notes', () => ({
  createRefundCreditNote: m.create, recordCreditNoteRefund: m.record, emailCreditNote: m.email,
  findCreditNoteByReference: m.find, readCreditNote: m.read,
}))
vi.mock('@/infra/admin-alerts/notify', () => ({ notifyAdmin: m.notify }))
vi.mock('@/infra/logging/capture-error', () => ({ captureError: m.capture }))

const ORDER = { zoho_invoice_id: 'inv-1', order_number: 'DRM-1', plan: 'Monthly Max' }
const CUSTOMER = { cid: 'YUG1', email: 'o@example.com' }

vi.mock('@/infra/supabase/admin-client', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      const read = () => {
        const data = table === 'orders' ? ORDER : table === 'customers' ? CUSTOMER : m.state.note
        const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data, error: null }) }
        return chain
      }
      return {
        upsert: (row: Record<string, unknown>, opts: unknown) => {
          m.upsert(row, opts)
          if (!m.state.note) m.state.note = { id: 'n-1', attempts: 0, zoho_creditnote_id: null, zoho_creditnote_number: null, zoho_refund_id: null, emailed_at: null, ...row }
          return Promise.resolve({ error: null })
        },
        select: read,
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            // The claim is update().eq().or().select(); a plain save is update().eq().
            if ('claimed_until' in patch && Object.keys(patch).length === 1) {
              return {
                or: () => ({
                  select: () => {
                    const held = m.state.note?.claimed_until && new Date(String(m.state.note.claimed_until)) > new Date()
                    if (held) return Promise.resolve({ data: [], error: null })
                    Object.assign(m.state.note ?? {}, patch)
                    return Promise.resolve({ data: [{ id: 'n-1' }], error: null })
                  },
                }),
              }
            }
            m.updates.push(patch); Object.assign(m.state.note ?? {}, patch); return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }),
}))

import { sendRefundCreditNote, retryRefundCreditNote } from './refund-credit-note'

const INPUT = { kind: 'plan_refund' as const, refundId: 'r-1', orderId: 'o-1', customerId: 'c-1', refundedMeals: 14, cashFils: 28050, stripeRefundId: 're_1' }

beforeEach(() => {
  for (const fn of [m.create, m.record, m.email, m.notify, m.capture, m.upsert, m.find, m.read]) fn.mockReset()
  m.updates.length = 0
  m.state.note = null
  m.create.mockResolvedValue({ creditnoteId: 'cn-1', creditnoteNumber: 'CN-YUG1-20260916' })
  m.record.mockResolvedValue({ refundId: 'cnr-1' })
  m.email.mockResolvedValue(undefined)
  m.find.mockResolvedValue(null)
  m.read.mockResolvedValue({ refundId: null, emailed: false })
})

describe('sendRefundCreditNote', () => {
  it('skips a refund with no cash', async () => {
    expect(await sendRefundCreditNote({ ...INPUT, cashFils: 0 })).toEqual({ skipped: 'no_cash' })
    expect(await sendRefundCreditNote({ ...INPUT, stripeRefundId: null })).toEqual({ skipped: 'no_cash' })
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('creates the credit note against the invoice, records the refund, emails the PDF, saving each step', async () => {
    const result = await sendRefundCreditNote(INPUT)
    expect(result).toEqual({ ok: true, creditnoteNumber: 'CN-YUG1-20260916', emailed: true })
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plan_refund', refund_id: 'r-1', cash_fils: 28050 }), { onConflict: 'kind,refund_id', ignoreDuplicates: true })
    expect(m.find).toHaveBeenCalledWith('re_1')
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'inv-1', customerCid: 'YUG1', planName: 'Monthly Max', refundedMeals: 14, amountAed: 280.5, stripeRefundId: 're_1',
    }))
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ creditnoteId: 'cn-1', invoiceId: 'inv-1', amountAed: 280.5, stripeRefundId: 're_1' }))
    expect(m.email).toHaveBeenCalledWith('cn-1', 'o@example.com')
    expect(m.updates.map((u) => Object.keys(u).filter((k) => k !== 'updated_at'))).toEqual([
      ['zoho_creditnote_id', 'zoho_creditnote_number'], ['zoho_refund_id'], ['emailed_at', 'last_error', 'claimed_until'],
    ])
    expect(m.state.note?.claimed_until).toBeNull()
    expect(m.notify).not.toHaveBeenCalled()
  })

  it('on failure keeps what was done, counts the attempt and tells the owner; a retry resumes', async () => {
    m.record.mockRejectedValueOnce(new Error('Zoho 400'))
    const first = await sendRefundCreditNote(INPUT)
    expect(first).toEqual({ ok: false, error: 'Zoho 400' })
    expect(m.state.note).toMatchObject({ zoho_creditnote_id: 'cn-1', zoho_refund_id: null, attempts: 1, last_error: 'Zoho 400', claimed_until: null })
    expect(m.notify).toHaveBeenCalledWith(expect.stringContaining('Credit note FAILED for a AED 280.50 refund'), 'refund_credit_note')

    const again = await retryRefundCreditNote('n-1')
    expect(again).toEqual({ ok: true, creditnoteNumber: 'CN-YUG1-20260916', emailed: true })
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledTimes(2)
    expect(m.email).toHaveBeenCalledTimes(1)
  })

  it('does nothing more once the note is recorded and emailed', async () => {
    await sendRefundCreditNote(INPUT)
    await sendRefundCreditNote(INPUT)
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.email).toHaveBeenCalledTimes(1)
  })

  it('reuses a credit note, refund and email Zoho already has from a lost response', async () => {
    m.find.mockResolvedValue({ creditnoteId: 'cn-9', creditnoteNumber: 'CN-YUG1-20260916' })
    m.read.mockResolvedValue({ refundId: 'cnr-9', emailed: true })
    expect(await sendRefundCreditNote(INPUT)).toEqual({ ok: true, creditnoteNumber: 'CN-YUG1-20260916', emailed: true })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
    expect(m.email).not.toHaveBeenCalled()
    expect(m.state.note).toMatchObject({ zoho_creditnote_id: 'cn-9', zoho_refund_id: 'cnr-9' })
  })

  it('stands aside while another run holds the row', async () => {
    await sendRefundCreditNote({ ...INPUT, cashFils: 100 }).catch(() => null)
    m.state.note = { ...m.state.note, zoho_refund_id: null, emailed_at: null, claimed_until: new Date(Date.now() + 60_000).toISOString() }
    m.create.mockClear()
    expect(await retryRefundCreditNote('n-1')).toEqual({ skipped: 'busy' })
    expect(m.record).toHaveBeenCalledTimes(1)
  })
})
