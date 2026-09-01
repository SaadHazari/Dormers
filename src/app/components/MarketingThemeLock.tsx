'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { readMarketingTheme } from '@/ui-system/theme/marketing-theme'

/**
 * Holds the marketing shell to its own remembered theme (navy unless the
 * visitor picked light *here*). Hard loads are already handled flash-free by
 * the inline script in the root layout; this covers client-side navigation —
 * chiefly /login → /home, where the auth funnel has just forced light into
 * next-themes' store.
 *
 * Mount-only on purpose: it must not fight the nav toggle, which writes the
 * marketing key before flipping next-themes.
 *
 * Ordering note: React runs unmount cleanups before new mount effects, so this
 * lands after LoginForm's restore-on-unmount and wins.
 */
export function MarketingThemeLock() {
  const { setTheme } = useTheme()
  useEffect(() => {
    setTheme(readMarketingTheme())
  }, [setTheme])
  return null
}
