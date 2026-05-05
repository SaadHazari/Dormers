'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

// Pre-mount returns `false` to match the layout's `defaultTheme="dark"` and
// the SSR-injected `class="dark"` on <html>. Returning `true` here would
// cause a one-frame flash from light → dark on first paint for default users.
export function useIsLight(): boolean {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const { resolvedTheme } = useTheme()
    return mounted ? resolvedTheme === 'light' : false
}
