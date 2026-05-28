/**
 * Tests for the typed event bus — subscribe / emit / error isolation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eventBus } from './event-bus'

beforeEach(() => {
  eventBus._clearAllForTests()
  vi.restoreAllMocks()
})

describe('eventBus', () => {
  it('emit with no subscribers is a no-op', async () => {
    await expect(
      eventBus.emit('subscription.notification-due', {
        customerId: 'c1', kind: 'plan_paused_confirm', scheduledFor: new Date(),
      }),
    ).resolves.toBeUndefined()
  })

  it('runs all subscribers in registration order with the payload', async () => {
    const calls: string[] = []
    eventBus.on('subscription.notification-due', async (p) => { calls.push(`a:${p.customerId}`) })
    eventBus.on('subscription.notification-due', async (p) => { calls.push(`b:${p.customerId}`) })

    await eventBus.emit('subscription.notification-due', {
      customerId: 'cust-1', kind: 'plan_paused_confirm', scheduledFor: new Date(),
    })

    expect(calls).toEqual(['a:cust-1', 'b:cust-1'])
  })

  it('isolates handler failures — later handlers still run; emit rejects with AggregateError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls: string[] = []
    eventBus.on('subscription.notification-due', async () => { throw new Error('handler a failed') })
    eventBus.on('subscription.notification-due', async () => { calls.push('b ran') })

    await expect(
      eventBus.emit('subscription.notification-due', {
        customerId: 'cust-1', kind: 'plan_paused_confirm', scheduledFor: new Date(),
      }),
    ).rejects.toBeInstanceOf(AggregateError)

    expect(calls).toEqual(['b ran'])
  })

  it('handler count tracks registrations per event', () => {
    expect(eventBus._handlerCount('subscription.notification-due')).toBe(0)
    eventBus.on('subscription.notification-due', async () => {})
    eventBus.on('subscription.notification-due', async () => {})
    expect(eventBus._handlerCount('subscription.notification-due')).toBe(2)
  })
})
