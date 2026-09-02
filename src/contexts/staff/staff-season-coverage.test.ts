/**
 * Every door into a staff cycle asks the season first.
 *
 * The original defect was an absence: no file in the staff context mentioned
 * intake at all, so the free 5-day plan wrote straight into the
 * subscriptions table while sign-ups were paused and every customer was
 * locked out. An absence can't be caught by testing behaviour that isn't
 * there, so these assert the wiring at each entry point — the same
 * source-scanning approach as admin-notification-coverage.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { staffSeasonRefusal } from './domain/staff-season-copy'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

const DOORS: Array<[label: string, file: string]> = [
  ['first staff plan', 'src/contexts/staff/usecases/provision-plan.ts'],
  ['free 5-day renewal', 'src/contexts/staff/usecases/renewal.ts'],
  ['paid 6-day choice', 'src/app/staff/plan/actions.ts'],
  ['admin approval', 'src/app/admin/staff/actions.ts'],
]

describe.each(DOORS)('%s', (_label, file) => {
  const src = read(file)

  it('asks the season before starting a cycle', () => {
    expect(src).toContain('staffIntakeGate')
    expect(src).toContain('getIntakeState')
  })

  it('refuses with staff wording, never the customer sign-up copy', () => {
    expect(src).toContain('staffSeasonRefusal')
  })
})

describe('the refusal is worded for whoever is reading it', () => {
  const PAUSED = { ok: false, reason: 'paused', lastDeliveryDay: null } as const
  const ENDING = { ok: false, reason: 'season-ending', lastDeliveryDay: '2026-09-30' } as const

  it('tells an intern their pay is not lost and asks nothing of them', () => {
    const msg = staffSeasonRefusal(PAUSED, 'intern')
    expect(msg).toContain('Nothing is lost')
    expect(msg).toContain("nothing for you to do")
  })

  it('never shows an employee the customer sign-up line about their own pay', () => {
    for (const gate of [PAUSED, ENDING]) {
      expect(staffSeasonRefusal(gate, 'intern')).not.toContain('Save your spot')
      expect(staffSeasonRefusal(gate, 'intern')).not.toContain('waiting list')
    }
  })

  it('tells the admin which switch to flip', () => {
    expect(staffSeasonRefusal(PAUSED, 'admin')).toContain('/admin/season')
  })

  it('names the last delivery day when that is the reason', () => {
    expect(staffSeasonRefusal(ENDING, 'intern')).toContain('30 September')
    expect(staffSeasonRefusal(ENDING, 'admin')).toContain('30 September')
  })
})

describe('a refused plan changes nothing', () => {
  it('the first-plan gate runs before the profile write it would otherwise strand', () => {
    const src = read('src/contexts/staff/usecases/provision-plan.ts')
    expect(src.indexOf('staffIntakeGate')).toBeLessThan(src.indexOf("week_type: '5DAYS', pending_week_type: null"))
  })

  it('the renewal gate runs before the pending week-type write', () => {
    const src = read('src/contexts/staff/usecases/renewal.ts')
    expect(src.indexOf('staffIntakeGate')).toBeLessThan(src.indexOf("pending_week_type: '5DAYS'"))
  })
})

describe('the chooser screen states the closure instead of failing on tap', () => {
  it('asks for the season note and hands it to the client', () => {
    expect(read('src/app/staff/plan/page.tsx')).toContain('staffSeasonNote')
  })

  it('the client renders it in place of the two cards', () => {
    expect(read('src/app/staff/plan/StaffPlanClient.tsx')).toContain("if (seasonNote && mode !== 'awaiting')")
  })
})
