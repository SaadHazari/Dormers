import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_ADS_PURCHASE, GOOGLE_ADS_SIGNUP_IN_AREA, GOOGLE_ADS_WAITLIST_IN_AREA,
  reportPurchase, reportSignupInArea, reportWaitlistJoinInArea,
} from './google-ads'

function stubWindow(hostname: string) {
  const w = { location: { hostname }, dataLayer: [] as unknown[] }
  vi.stubGlobal('window', w)
  return w
}

afterEach(() => vi.unstubAllGlobals())

describe('reportPurchase', () => {
  it('queues one conversion with the paid amount and the order as transaction id', () => {
    const w = stubWindow('dormers.ae')
    reportPurchase('order-123', 412.5)

    expect(w.dataLayer).toHaveLength(1)
    // gtag.js only reads Arguments objects, never plain arrays.
    const call = w.dataLayer[0] as IArguments
    expect(Array.isArray(call)).toBe(false)
    expect(Array.from(call)).toEqual([
      'event',
      'conversion',
      { send_to: GOOGLE_ADS_PURCHASE, value: 412.5, currency: 'AED', transaction_id: 'order-123' },
    ])
  })

  it.each(['localhost', 'www.dormers.ae', 'deploy-preview-12--dormers.netlify.app'])(
    'stays silent on %s',
    (host) => {
      const w = stubWindow(host)
      reportPurchase('order-123', 100)
      expect(w.dataLayer).toHaveLength(0)
    },
  )
})

describe('reportSignupInArea', () => {
  it('queues the sign-up conversion on the live site only', () => {
    const live = stubWindow('dormers.ae')
    reportSignupInArea()
    expect(Array.from(live.dataLayer[0] as IArguments)).toEqual([
      'event', 'conversion', { send_to: GOOGLE_ADS_SIGNUP_IN_AREA },
    ])

    const local = stubWindow('localhost')
    reportSignupInArea()
    expect(local.dataLayer).toHaveLength(0)
  })
})

describe('reportWaitlistJoinInArea', () => {
  it('queues the waitlist conversion on the live site only', () => {
    const live = stubWindow('dormers.ae')
    reportWaitlistJoinInArea()
    expect(Array.from(live.dataLayer[0] as IArguments)).toEqual([
      'event', 'conversion', { send_to: GOOGLE_ADS_WAITLIST_IN_AREA },
    ])

    const local = stubWindow('localhost')
    reportWaitlistJoinInArea()
    expect(local.dataLayer).toHaveLength(0)
  })
})
