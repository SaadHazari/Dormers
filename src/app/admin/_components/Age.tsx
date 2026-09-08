'use client'

/**
 * "3m ago" that does not break hydration.
 *
 * `formatAge` reads `Date.now()`. On a server-rendered page that is two
 * different clocks: the server formats "3m ago", the browser hydrates a few
 * seconds later and formats "4m ago", the strings differ, and React throws
 * away the server HTML for that subtree (error #418, the text-mismatch
 * variant). It is intermittent by nature — it only fires when the value
 * happens to tick over between render and hydration, which is why a page full
 * of "2d ago" looks fine for a day and the cron page, full of minute-old
 * timestamps, fails constantly.
 *
 * The fix is not a better relative-time function. Any function of "now" has
 * this problem. So: render nothing time-dependent during hydration, then fill
 * it in on the client where there is only one clock. `suppressHydrationWarning`
 * covers the swap itself.
 *
 * The em-width placeholder keeps the row from reflowing when the text lands.
 */

import { useEffect, useState } from 'react'
import { formatAge } from './cron-registry'

export function Age({ iso }: { iso: string | null | undefined }) {
    const [text, setText] = useState<string | null>(null)

    useEffect(() => {
        if (!iso) return
        const tick = () => setText(formatAge(iso))
        tick()
        // Keep it honest while an admin leaves the tab open — a cron page that
        // says "2m ago" for an hour is worse than no number at all.
        const id = setInterval(tick, 30_000)
        return () => clearInterval(id)
    }, [iso])

    if (!iso) return null
    return <span suppressHydrationWarning>{text ?? '    '}</span>
}
