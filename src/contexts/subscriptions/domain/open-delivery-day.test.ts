import { describe, it, expect } from 'vitest'
import { firstOpenDeliveryDay, isoOfUtc } from './open-delivery-day'

const day = (iso: string) => new Date(iso + 'T00:00:00Z')
const open = (iso: string, wt: '5DAYS' | '6DAYS' | '7DAYS', closures: string[] = []) =>
  isoOfUtc(firstOpenDeliveryDay(day(iso), wt, new Set(closures)))

describe('firstOpenDeliveryDay', () => {
  it('keeps an ordinary delivery day', () => {
    expect(open('2026-09-14', '5DAYS')).toBe('2026-09-14')
  })
  it('rolls a rest day forward like nextDeliveryDay always did', () => {
    expect(open('2026-09-19', '5DAYS')).toBe('2026-09-21') // Sat → Mon
    expect(open('2026-09-20', '6DAYS')).toBe('2026-09-21') // Sun → Mon
  })
  it('rolls past a closure day', () => {
    expect(open('2026-09-16', '5DAYS', ['2026-09-16'])).toBe('2026-09-17')
  })
  it('rolls past a closure run that ends on a weekend', () => {
    // Closed Wed–Fri; Sat/Sun are rest days; the first open night is Monday.
    expect(open('2026-09-16', '5DAYS', ['2026-09-16', '2026-09-17', '2026-09-18'])).toBe('2026-09-21')
  })
  it('ignores closures on days the plan never delivers anyway', () => {
    expect(open('2026-09-14', '5DAYS', ['2026-09-19'])).toBe('2026-09-14')
  })
})
