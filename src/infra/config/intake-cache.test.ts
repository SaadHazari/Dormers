/**
 * The intake cache must never make the operator wrong.
 *
 * Two failures this locks out. A debug override (DEV_FORCE_INTAKE_PAUSED)
 * that forced paused:true from an env var and was labelled "remove before
 * commit" — had it reached a deployed environment, checkout, gift claims
 * and plan changes would all have refused while /admin/season, which reads
 * the row directly, still showed the season open. And a 30-second cache
 * with no invalidation, so flipping the switch and immediately acting on it
 * could be answered from the old row.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')
const INTAKE = read('src/infra/config/intake.ts')
const SEASON = read('src/app/admin/season/actions.ts')

describe('no env var can force the season shut', () => {
  it('the debug override is gone', () => {
    expect(INTAKE).not.toContain('DEV_FORCE_INTAKE_PAUSED')
  })

  it('paused comes from the row and nothing else', () => {
    expect(INTAKE).toContain('paused: row.paused === true')
    // No process.env anywhere in the module: the switch is data, not config.
    expect(INTAKE).not.toContain('process.env')
  })

  it('still fails open when the row cannot be read', () => {
    expect(INTAKE).toContain('return FAIL_OPEN')
    expect(INTAKE).toContain('paused: false')
  })
})

describe('an admin write is never answered from the old row', () => {
  it('the cache can be dropped', () => {
    expect(INTAKE).toContain('export function invalidateIntakeCache()')
  })

  it('every write to intake_settings drops it', () => {
    const writes = SEASON.split('.update(').length - 1
    const invalidations = SEASON.split('invalidateIntakeCache()').length - 1
    expect(writes).toBeGreaterThan(0)
    expect(invalidations).toBe(writes)
  })

  it('a caller that cannot tolerate any lag can bypass the cache', () => {
    expect(INTAKE).toContain('opts?: { fresh?: boolean }')
    expect(INTAKE).toContain("if (!opts?.fresh && cache")
  })

  it('the admin approval button reads fresh', () => {
    // Pressed seconds after reopening the season; a stale refusal would
    // contradict what the operator just did.
    expect(read('src/app/admin/staff/actions.ts')).toContain('getIntakeState({ fresh: true })')
  })
})
