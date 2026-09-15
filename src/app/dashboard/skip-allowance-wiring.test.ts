/**
 * Every surface that offers a skip, or counts the skips left, counts credited
 * season skips against the allowance (spec X3). Source-level, like
 * src/app/api/admin-notification-coverage.test.ts: these are client components
 * and vitest runs in the node environment with no render harness.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('skip buttons count credited skips (spec X3)', () => {
  it('the plan bar only offers a pill skip while skips are left, credited ones included', () => {
    const src = read('src/app/dashboard/PlanProgress.tsx')
    expect(src).toContain('const skippedDeliveries = skipsUsedFor(sub)')
    expect(src).toContain('const hasCredits = (maxSkips - skippedDeliveries) > 0')
    expect(src).not.toContain('sub.skipped_meals_count')
  })

  it('the home skip quota, the mobile calendar and the future skip sheet count credited skips', () => {
    const active = read('src/app/dashboard/ActiveDashboard.tsx')
    expect(active).toContain('left:  Math.max(0, skipTotal - skipsUsedFor(effectiveSub)),')
    expect(active).toContain('skipped: skipsUsedFor(effectiveSub),')
    // MobileHome offers a cell skip from data.skipped, which ActiveDashboard now fills with skipsUsedFor.
    expect(read('src/app/dashboard/_mobile/MobileHome.tsx')).toContain('const hasCredits = data.maxSkips - data.skipped > 0')
    expect(read('src/app/dashboard/_shared/FutureSkipModal.tsx')).toContain('const skipsLeft = Math.max(0, maxSkips - skipsUsedFor(sub))')
  })

  it('the plan page counts credited skips on desktop and mobile', () => {
    for (const rel of ['src/app/dashboard/plan/PlanClient.tsx', 'src/app/dashboard/_mobile/MobilePlan.tsx']) {
      expect(read(rel)).toContain('const skipsLeft = Math.max(0, skipAllowance - skipsUsedFor(sub))')
    }
  })
})
