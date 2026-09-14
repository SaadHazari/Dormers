/**
 * Every screen that picks a customer's dish by its veg flag has to ask
 * veg-day.ts which days are veg.
 *
 * On 2026-09-14 a religious customer who had signed up but not bought a plan
 * saw a non-veg dinner on their Wednesday veg day: /dashboard/menu read veg
 * days from the subscription only, and there was no subscription. The support
 * page had its own `meal_preference_type === 'Veg'`, so religious customers
 * never got a veg dish there at all. This test fails the build when a file
 * picks a dish by veg flag without the shared resolver, or compares a
 * customer's preference to a string by hand.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../../..')
const SRC = join(ROOT, 'src')
const RESOLVER_IMPORT = "@/contexts/subscriptions/domain/veg-day"

// Files that pick a dish by veg flag without a customer row behind the choice.
const NOT_PER_CUSTOMER: Record<string, string> = {
  'src/contexts/menu/domain/catalog-data.ts': 'defines findDishForDate',
  'src/infra/supabase/menu-catalog.ts': 'defines findDishForDateWithOverrides',
  'src/app/kitchen/[token]/page.tsx': "shows both of tonight's dishes; per-customer counts come from getKitchenCounts",
  'src/app/components/Menu.tsx': 'public menu with a Veg toggle',
  'src/app/r/[cid]/ReferralClient.tsx': 'a prospect choosing Veg or Non Veg for a trial, before any customer row exists',
}

const PICKS_DISH_BY_VEG = [
  /\.isVeg\s*===/,
  /dishByDayAndVeg\.get\(/,
  /\bfindDishForDate(WithOverrides)?\(/,
]
const HAND_ROLLED_PREF = /meal_preference_type\s*[!=]==\s*['"`]/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({
  rel: relative(ROOT, path),
  text: readFileSync(path, 'utf-8'),
}))
const dishPickers = files.filter((f) => PICKS_DISH_BY_VEG.some((re) => re.test(f.text)))

describe('veg-day resolver coverage', () => {
  it('finds the known dish-picking screens (the scan is not silently empty)', () => {
    const found = dishPickers.map((f) => f.rel)
    expect(found).toEqual(expect.arrayContaining([
      'src/app/dashboard/menu/MenuClient.tsx',
      'src/app/dashboard/ActiveDashboard.tsx',
      'src/app/dashboard/menu/review/[week]/page.tsx',
      'src/app/dashboard/support/page.tsx',
      'src/app/admin/labels/data.ts',
    ]))
  })

  it('every per-customer dish pick goes through veg-day.ts', () => {
    const offenders = dishPickers
      .filter((f) => !(f.rel in NOT_PER_CUSTOMER))
      .filter((f) => !f.text.includes(RESOLVER_IMPORT))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('no file compares meal_preference_type to a string by hand', () => {
    const offenders = files.filter((f) => HAND_ROLLED_PREF.test(f.text)).map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  // The plan's own diet (subscriptions.meal_preference_type, 2026-09-14) only
  // wins when the row handed to veg-day.ts carries it. A plan row fetched with
  // its veg_days but not its diet silently falls back to the customer's — the
  // renewal flip that column exists to stop.
  it("every plan row handed to veg-day.ts carries the plan's diet", () => {
    const offenders: string[] = []
    for (const f of files.filter((f) => f.text.includes(RESOLVER_IMPORT))) {
      for (const m of f.text.matchAll(/from\('subscriptions'\)\s*\.select\(\s*'([^']*)'/g)) {
        if (m[1].includes('veg_days') && !m[1].includes('meal_preference_type')) offenders.push(`${f.rel}: select('${m[1]}')`)
      }
      for (const m of f.text.matchAll(/subscription:\s*\{[^}]*veg_days[^}]*\}/g)) {
        if (!m[0].includes('meal_preference_type')) offenders.push(`${f.rel}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every exemption still exists and still picks a dish by veg flag', () => {
    for (const rel of Object.keys(NOT_PER_CUSTOMER)) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true)
      expect(dishPickers.some((f) => f.rel === rel), rel).toBe(true)
    }
  })
})
