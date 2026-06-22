/**
 * Integration test for the Meta WhatsApp client's circuit breaker (Release It!
 * L4): after repeated send failures the breaker opens and further sends fail
 * fast WITHOUT hitting the network — shedding load during a Meta outage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetCircuitBreakers } from '@/infra/http/circuit-breaker'
import { sendOtpTemplate } from './client'

beforeEach(() => {
  __resetCircuitBreakers()
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'pnid'
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
  process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'otp_tpl'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('meta-whatsapp client — circuit breaker', () => {
  it('opens after 5 consecutive failures, then fast-fails without calling fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    // Threshold is 5 — each of these throws the underlying send error.
    for (let i = 0; i < 5; i++) {
      await expect(sendOtpTemplate('+971500000000', '123456')).rejects.toThrow(/send failed/)
    }
    expect(fetchMock).toHaveBeenCalledTimes(5)

    // 6th call: breaker is open → CircuitOpenError, fetch is NOT called again.
    await expect(sendOtpTemplate('+971500000000', '123456')).rejects.toThrow(
      /Circuit "meta-whatsapp" is open/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('does not open the breaker while sends succeed', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    for (let i = 0; i < 8; i++) {
      await sendOtpTemplate('+971500000000', '123456')
    }
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
})
