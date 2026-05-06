/**
 * Manual sanity script for end-date.ts.
 *
 * Run with `npx tsx src/lib/end-date.verify.ts`.
 *
 * Each case is hand-computed against the Notion formula. If a case fails
 * here, the TS port has drifted from the spec — fix the port BEFORE
 * touching anything else (the DB function and the dashboard previews
 * both depend on this math being correct).
 */

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
    // Mon Mar 2 + 26 days = Sat Mar 28. 4 weeks × 6 deliveries = 24 meals.
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
    // Tue Mar 3 + 27 days = Mon Mar 30. Counted: Tue-Sat (5), Mon-Sat ×3 (18), Mon (1) = 24
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
    // D=26, x=25, wd2=1, penalty=floor(25/6)=4, total=29 days from Mon Mar 2 = Tue Mar 31
    why: '2 skips → D=26, x=25, penalty=floor(25/6)=4, total=29 days',
  },
  {
    name: 'Monthly 6DAYS, start Mon, +5 pause days',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '6DAYS', pauseDays: 5 },
    expected: '2026-04-02',
    // Base = Sat Mar 28, +5 calendar = Thu Apr 2 (still a working day, no shift)
    why: 'Base end Mar 28 + 5 pause days = Thu Apr 2',
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
    // 4 weeks × 5 = 20 meals. Mon-Fri ×4 weeks = Mon Mar 2 to Fri Mar 27.
    why: 'D=20, x=19, penalty=2×floor(19/5)=2×3=6, total=25 days',
  },
  {
    name: 'Weekly 5DAYS, start Sat (shifts +2 to Mon)',
    input: { startDate: '2026-03-07', planKind: 'weekly', weekType: '5DAYS' },
    expected: '2026-03-13',
    // Sat Mar 7 + 2 = Mon Mar 9. D=5, x=4, penalty=0. End = Mon + 4 = Fri Mar 13.
    why: 'Sat → shift +2 → S2=Mon Mar 9. Then weekly = +4 days to Fri Mar 13.',
  },
  {
    name: 'Monthly 7DAYS, start Mon, no skips',
    input: { startDate: '2026-03-02', planKind: 'monthly', weekType: '7DAYS' },
    expected: '2026-03-29',
    // D=28, x=27, penalty=0, total=27. Mon Mar 2 + 27 = Sun Mar 29.
    why: 'D=28, x=27, penalty=0, total=27 days. 7DAYS has no penalty.',
  },
]

function run() {
  let pass = 0
  let fail = 0
  for (const c of CASES) {
    const actual = isoDate(computeEndDate(c.input))
    const ok = actual === c.expected
    if (ok) {
      pass++
      console.log(`✓ ${c.name}`)
    } else {
      fail++
      console.log(`✗ ${c.name}`)
      console.log(`    expected: ${c.expected}`)
      console.log(`    actual:   ${actual}`)
      console.log(`    why:      ${c.why}`)
    }
  }
  console.log(`\n${pass}/${CASES.length} passed${fail > 0 ? ` — ${fail} failed` : ''}`)
  if (fail > 0) process.exit(1)
}

run()
