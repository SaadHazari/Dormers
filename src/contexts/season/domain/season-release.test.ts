import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SEASON_BREAK_RELEASE_LIVE, SEASON_REFUNDS_LIVE } from './season-release'

const ROOT = resolve(__dirname, '../../../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('season release flags', () => {
  it('the break and refunds are live (Plans C and D)', () => {
    expect(SEASON_BREAK_RELEASE_LIVE).toBe(true)
    expect(SEASON_REFUNDS_LIVE).toBe(true)
  })

  it('every season surface that words a refund is gated on SEASON_REFUNDS_LIVE', () => {
    const files = [
      'src/app/admin/season/SeasonPlanner.tsx',
      'src/app/admin/season/BreakBoard.tsx',
      'src/app/dashboard/_shared/season-break-copy.ts',
      'src/app/dashboard/_shared/HeldPlanCard.tsx',
      'src/app/dashboard/_shared/SeasonBreakNotice.tsx',
      'src/app/dashboard/_shared/SeasonSplitSheet.tsx',
      'src/app/dashboard/_shared/BreakResumeSheet.tsx',
      'src/app/admin/season/RefundQueue.tsx',
      'src/app/admin/season/NeedsYou.tsx',
      'src/app/admin/season/season-data.ts',
      'src/infra/supabase/season-holds-repo.ts',
    ]
    for (const file of files) {
      const code = withoutComments(read(file))
      if (/refund/i.test(code)) expect(code, file).toMatch(/SEASON_REFUNDS_LIVE|refundsLive/)
    }
  })
})
