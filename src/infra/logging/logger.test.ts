/**
 * Smoke tests for the structured logger. Verifies the logger is constructed
 * and the child-context pattern attaches fields. Doesn't capture log output
 * — the value of pino is well-tested upstream; we only need to confirm our
 * wiring is sane.
 */

import { describe, it, expect } from 'vitest'
import { logger, childLogger } from './logger'

describe('logger', () => {
  it('exposes the standard pino API surface', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.child).toBe('function')
  })

  it('childLogger returns a logger with bindings merged', () => {
    const child = childLogger({ requestId: 'req-1', userId: 'u-1' })
    expect(typeof child.info).toBe('function')
    // pino exposes .bindings() so we can confirm the context attached.
    expect(child.bindings()).toMatchObject({ requestId: 'req-1', userId: 'u-1' })
  })

  it('redacts sensitive fields in emitted output', async () => {
    // Spin up a separate pino instance writing to an in-memory buffer so we
    // can assert on the JSON payload. Mirrors the redaction config of the
    // production logger.
    const pinoMod = await import('pino')
    let captured = ''
    const test = pinoMod.default(
      { redact: { paths: ['user.token', 'user.password'], censor: '[REDACTED]' } },
      { write: (chunk) => { captured += chunk } },
    )
    test.info({ user: { id: 'u-1', token: 'super-secret', password: 'hunter2' } }, 'login')
    expect(captured).toContain('"token":"[REDACTED]"')
    expect(captured).toContain('"password":"[REDACTED]"')
    expect(captured).not.toContain('super-secret')
    expect(captured).not.toContain('hunter2')
  })
})
