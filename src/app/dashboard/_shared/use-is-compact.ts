'use client'

import { useEffect, useState } from 'react'
import { COMPACT } from './breakpoints'

/**
 * Compact-viewport flag for BEHAVIOUR, not layout.
 *
 * Layout switching is pure CSS — both the mobile and desktop trees are always
 * mounted and toggled with `display: none` (see ActiveDashboard.tsx) — so this
 * hook must never decide what renders. Use it only to gate behaviour that must
 * not fire on the hidden tree, e.g. a sheet whose open-state is shared between
 * both.
 *
 * Returns false on the server and first paint, then settles on the client.
 * That is deliberate and preserves the old `_mobile/kit.tsx` contract: sheets
 * open post-interaction, by which point the value has settled, so there is no
 * flash. Anything that needs a correct value during first paint belongs in CSS.
 *
 * Lives apart from ./breakpoints.ts because the server-rendered dashboard
 * layout imports COMPACT, and a server component cannot import a module that
 * pulls in React hooks.
 */
export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(COMPACT)
    setCompact(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact
}
