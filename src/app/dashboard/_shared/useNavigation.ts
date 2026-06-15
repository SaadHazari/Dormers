'use client'

import { useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Wraps router.push in a React transition so callers get an `isPending`
 * boolean they can use to show a spinner / disable buttons while the
 * destination page loads.
 */
export function useNavigation() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const hrefRef = useRef<string | null>(null)

    const navigate = useCallback(
        (href: string) => {
            hrefRef.current = href
            startTransition(() => {
                router.push(href)
            })
        },
        [router, startTransition],
    )

    return {
        navigate,
        isPending,
        isNavigatingTo: (href: string) => isPending && hrefRef.current?.startsWith(href),
    } as const
}
