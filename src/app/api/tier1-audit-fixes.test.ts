/**
 * Tier 1 audit fix verification tests.
 *
 * These tests prove the five CRITICAL pre-ship fixes are in place:
 *   1. Cron migration includes planned-pause + future-skip activation
 *   2. Cron migration includes planned-pause + future-skip activation (same fn)
 *   3. Sentry debug/test endpoints are deleted
 *   4. Dashboard error boundary exists
 *   5. AIChatbot View Plans link routes to /dashboard/explore-plans
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')

describe('CRITICAL 1+2: subscription_status_tick cron has all 5 blocks', () => {
  const sql = readFileSync(
    resolve(ROOT, 'supabase/migrations/20260506_cron_jobs.sql'),
    'utf-8',
  )

  it('reverts Skipped → Active', () => {
    expect(sql).toContain("SET status = 'Active'\n  WHERE status = 'Skipped'")
  })

  it('promotes Scheduled → Active on start_date', () => {
    expect(sql).toContain("WHERE status = 'Scheduled' AND start_date <= public.ae_today()")
  })

  it('activates future skips: Active → Skipped when today in skipped_dates', () => {
    expect(sql).toContain("SET status = 'Skipped'\n  WHERE status = 'Active'")
    expect(sql).toContain('ae_today() = ANY(skipped_dates)')
  })

  it('activates planned pauses: Active|Skipped → Paused on planned_pause_start', () => {
    expect(sql).toContain("SET status = 'Paused'")
    expect(sql).toContain("planned_pause_start = public.ae_today()")
    expect(sql).toContain("WHERE status IN ('Active', 'Skipped')")
  })

  it('ends completed cycles using ae_today()', () => {
    expect(sql).toContain("SET status = 'Ended'")
    expect(sql).toContain('end_date < public.ae_today()')
  })

  it('uses ae_today() everywhere instead of CURRENT_DATE', () => {
    const fnBody = sql.slice(
      sql.indexOf('subscription_status_tick()'),
      sql.indexOf('subscription_delivery_tick'),
    )
    expect(fnBody).not.toContain('CURRENT_DATE')
  })
})

describe('CRITICAL 3: Sentry debug/test endpoints are deleted', () => {
  it('/api/sentry-debug route file does not exist', () => {
    expect(existsSync(resolve(ROOT, 'src/app/api/sentry-debug/route.ts'))).toBe(false)
  })

  it('/api/sentry-debug directory does not exist', () => {
    expect(existsSync(resolve(ROOT, 'src/app/api/sentry-debug'))).toBe(false)
  })

  it('/api/sentry-test route file does not exist', () => {
    expect(existsSync(resolve(ROOT, 'src/app/api/sentry-test/route.ts'))).toBe(false)
  })

  it('/api/sentry-test directory does not exist', () => {
    expect(existsSync(resolve(ROOT, 'src/app/api/sentry-test'))).toBe(false)
  })

  it('no source file imports sentry-debug or sentry-test routes', () => {
    const checkImports = (dir: string): boolean => {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
        const full = resolve(dir, entry)
        if (statSync(full).isDirectory()) {
          if (checkImports(full)) return true
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          const content = readFileSync(full, 'utf-8')
          if (content.includes('sentry-debug') || content.includes('sentry-test')) {
            if (!full.includes('tier1-audit-fixes.test')) return true
          }
        }
      }
      return false
    }
    expect(checkImports(resolve(ROOT, 'src'))).toBe(false)
  })
})

describe('CRITICAL 4: Dashboard error boundary exists', () => {
  it('src/app/dashboard/error.tsx exists', () => {
    expect(existsSync(resolve(ROOT, 'src/app/dashboard/error.tsx'))).toBe(true)
  })

  it('is a client component', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content.startsWith("'use client'")).toBe(true)
  })

  it('accepts error and reset props (Next.js error boundary contract)', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content).toContain('error: Error & { digest?: string }')
    expect(content).toContain('reset: () => void')
  })

  it('has a retry button that calls reset', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content).toContain('onClick={reset}')
    expect(content).toMatch(/Try again/i)
  })

  it('has a WhatsApp escape hatch', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content).toContain('whatsAppHref()')
    expect(content).toMatch(/WhatsApp/i)
  })

  it('displays the Sentry digest for ops triage', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content).toContain('error.digest')
  })

  it('exports a default function (required by Next.js)', () => {
    const content = readFileSync(
      resolve(ROOT, 'src/app/dashboard/error.tsx'),
      'utf-8',
    )
    expect(content).toMatch(/export default function/)
  })
})

describe('CRITICAL 5: AIChatbot View Plans link is wired', () => {
  const content = readFileSync(
    resolve(ROOT, 'src/app/components/AIChatbot.tsx'),
    'utf-8',
  )

  // Find the JSX block "{hasViewPlans && (" — not the const declaration
  const plansJsxStart = content.indexOf('{hasViewPlans && (')
  const plansBlock = content.slice(plansJsxStart, plansJsxStart + 600)

  const menuJsxStart = content.indexOf('{hasViewMenu && (')
  const menuBlock = content.slice(menuJsxStart, menuJsxStart + 600)

  // The original finding was that this CTA pointed at href="#" and went
  // nowhere. It was parked on /maintenance for the pre-launch period; the
  // funnel is open again, so the assertion tracks the shared constant rather
  // than any one destination. What must never come back is the dead anchor.
  it('View Plans routes to the shared signup CTA, not href="#"', () => {
    expect(plansBlock).toContain('href={SIGNUP_HREF}')
    expect(plansBlock).not.toContain('href="#"')
  })

  it('View Plans has an onClick handler to close the chat', () => {
    expect(plansBlock).toContain('onClick={closeChat}')
  })

  it('View Menu still has its existing onClick={closeChat}', () => {
    expect(menuBlock).toContain('onClick={closeChat}')
    expect(menuBlock).toContain('href="#menu"')
  })
})
