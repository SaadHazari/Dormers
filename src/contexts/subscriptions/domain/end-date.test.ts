/**
 * Characterization tests for end-date.ts — locks in the canonical Notion-formula
 * port that drives kitchen-ops scheduling.
 *
 * Converted from src/lib/end-date.verify.ts (manual `npx tsx` script) to a
 * vitest suite so the math is verified on every `npm test` run.
 *
 * Each case is hand-computed against the Notion formula. If a case fails here,
 * the TS port has drifted from the spec — fix the port BEFORE touching anything
 * else (the DB function and the dashboard previews both depend on this math
 * being correct).
 */

import { describe, it, expect } from 'vitest'
import { computeEndDate, isoDate, type ComputeEndDateInput } from './end-date'

interface Case {
  name: string
  input: ComputeEndDateInput
  expected: string // YYYY-MM-DD
  why: string
}

const CASES: Case[] = [
  {
    name: 'Monthly 6DAYS, start Mon, no skips, no pauses',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '6DAYS' },
    expected: '2026-03-28',
    why: 'D=24, x=23, penalty=floor(23/6)=3, total=26 days from Mon Mar 2',
  },
  {
    name: 'Monthly 6DAYS, start Sun (shifts to Mon), no skips',
    input: { startDate: '2026-03-01', planKind: 'monthly', weekType: '6DAYS' },
    expected: '2026-03-28',
    why: 'Sun Mar 1 → shift +1 → S2=Mon Mar 2. Same as case above.',
  },
  {
    name: 'Monthly 6DAYS, start Tue, no skips',
    input: { startDate: '2026-03-03', planKind: 'monthly', weekType: '6DAYS' },
    expected: '2026-03-30',
    why: 'D=24, x=23, wd2=2, penalty=floor((1+23)/6)=4, total=27 days',
  },
  {
    name: 'Weekly 6DAYS, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'weekly', weekType: '6DAYS' },
    expected: '2026-03-07',
    why: 'D=6, x=5, penalty=floor(5/6)=0, total=5 days. Mon→Sat.',
  },
  {
    name: 'Trial, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'trial', weekType: '6DAYS' },
    expected: '2026-03-02',
    why: 'D=1, x=0, penalty=0, total=0 days. Same-day end.',
  },
  {
    name: 'Monthly 6DAYS, start Mon, +2 skips',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '6DAYS', skipCount: 2 },
    expected: '2026-03-31',
    why: '2 skips → D=26, x=25, penalty=floor(25/6)=4, total=29 days',
  },
  {
    name: 'Monthly 6DAYS, start Mon, +5 pause days',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '6DAYS', pauseDays: 5 },
    expected: '2026-04-03',
    why: 'Base end Sat Mar 28, then 5 DELIVERY days back: Mon 30, Tue 31, Wed 1, Thu 2, Fri 3. (Calendar maths gave Apr 2 — four slots for five paused days.)',
  },
  {
    name: 'Monthly 5DAYS, start Mon Aug 24, 1 closure day',
    input: { startDate: '2026-08-24', planKind: 'monthly', weekType: '5DAYS', closureDays: 1 },
    expected: '2026-09-21',
    why: 'Base end Fri Sep 18; one delivery day back is Mon Sep 21.',
  },
  {
    name: 'Monthly 5DAYS, start Mon Aug 24, 3 closure days (Eid-shaped, crosses a weekend)',
    input: { startDate: '2026-08-24', planKind: 'monthly', weekType: '5DAYS', closureDays: 3 },
    expected: '2026-09-23',
    why: 'Base end Fri Sep 18; three delivery days back are Mon 21, Tue 22, Wed 23. The live formula returned Sep 21 for 1, 2 AND 3 closures until 2026-09-13.',
  },
  {
    name: 'Weekly 5DAYS, start Mon, 2 pause + 2 closure days',
    input: { startDate: '2026-09-14', planKind: 'weekly', weekType: '5DAYS', pauseDays: 2, closureDays: 2 },
    expected: '2026-09-24',
    why: 'Base end Fri Sep 18; four delivery days back: Mon 21, Tue 22, Wed 23, Thu 24.',
  },
  {
    name: 'Monthly 7DAYS, start Mon, +3 pause days',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '7DAYS', pauseDays: 3 },
    expected: '2026-04-01',
    why: 'Every day delivers, so the walk equals the old calendar shift: Mar 29 + 3.',
  },
  {
    name: 'Weekly 5DAYS, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'weekly', weekType: '5DAYS' },
    expected: '2026-03-06',
    why: 'D=5, x=4, wd2=1, penalty=2×floor((0+4)/5)=0, total=4. Mon→Fri.',
  },
  {
    name: 'Monthly 5DAYS, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '5DAYS' },
    expected: '2026-03-27',
    why: 'D=20, x=19, penalty=2×floor(19/5)=2×3=6, total=25 days',
  },
  {
    name: 'Weekly 5DAYS, start Sat (shifts +2 to Mon)',
    input: { startDate: '2026-03-07', planKind: 'weekly', weekType: '5DAYS' },
    expected: '2026-03-13',
    why: 'Sat → shift +2 → S2=Mon Mar 9. Then weekly = +4 days to Fri Mar 13.',
  },
  {
    name: 'Monthly 7DAYS, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '7DAYS' },
    expected: '2026-03-29',
    why: 'D=28, x=27, penalty=0, total=27 days. 7DAYS has no penalty.',
  },
]

describe('computeEndDate — Notion formula port', () => {
  for (const c of CASES) {
    it(`${c.name} — ${c.why}`, () => {
      expect(isoDate(computeEndDate(c.input))).toBe(c.expected)
    })
  }
})

/** Delivery-day slots in [start, end] for a cadence — what the grid draws. */
function slots(startIso: string, endIso: string, weekType: '5DAYS' | '6DAYS' | '7DAYS'): number {
  let n = 0
  const d = new Date(startIso + 'T00:00:00Z')
  const end = new Date(endIso + 'T00:00:00Z')
  while (d <= end) {
    const dow = d.getUTCDay()
    if (weekType === '7DAYS' || (weekType === '6DAYS' ? dow !== 0 : dow !== 0 && dow !== 6)) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

describe('computeEndDate — every paused or closed day is paid back in delivery days', () => {
  // The invariant the dashboard grid relies on: the window always holds
  // exactly D + pause + closure delivery-day slots, whatever weekday the
  // base end lands on and however many weekends the payback crosses.
  const starts = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
  for (const weekType of ['5DAYS', '6DAYS'] as const) {
    for (const planKind of ['weekly', 'monthly'] as const) {
      const W = weekType === '5DAYS' ? 5 : 6
      const D = planKind === 'weekly' ? W : 4 * W
      for (const start of starts) {
        for (let owed = 0; owed <= 7; owed++) {
          it(`${weekType} ${planKind} from ${start} with ${owed} owed days holds ${D + owed} slots`, () => {
            const end = isoDate(computeEndDate({ startDate: start, planKind, weekType, pauseDays: owed }))
            const s2 = isoDate(computeEndDate({ startDate: start, planKind: 'trial', weekType }))
            expect(slots(s2, end, weekType)).toBe(D + owed)
          })
        }
      }
    }
  }
})
