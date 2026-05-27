import { useEffect, useRef } from 'react'

/**
 * Locks page scroll while `isLocked` is true. iOS-safe: saves the
 * current scroll position and pins `body` with `position: fixed` so
 * iOS Safari can't rubber-band scroll behind the modal/sheet. Restores
 * the original scroll position on unlock.
 *
 * Replaces three near-identical inlined effects in AIChatbot,
 * OrderForm, and Preloader. AIChatbot's was the most thorough — its
 * iOS scroll-position-preserve logic is now the canonical version.
 *
 * Usage:
 *   useBodyScrollLock(isOpen)
 */
export function useBodyScrollLock(isLocked: boolean): void {
    const savedScrollY = useRef(0)

    useEffect(() => {
        if (isLocked) {
            savedScrollY.current = window.scrollY
            document.body.style.position = 'fixed'
            document.body.style.top = `-${savedScrollY.current}px`
            document.body.style.width = '100%'
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.position = ''
            document.body.style.top = ''
            document.body.style.width = ''
            document.body.style.overflow = ''
            window.scrollTo({ top: savedScrollY.current, behavior: 'instant' as ScrollBehavior })
        }

        return () => {
            // Defensive cleanup — avoids stuck-locked body if the
            // component unmounts mid-lock (e.g. route change with modal
            // still open).
            document.body.style.position = ''
            document.body.style.top = ''
            document.body.style.width = ''
            document.body.style.overflow = ''
        }
    }, [isLocked])
}
