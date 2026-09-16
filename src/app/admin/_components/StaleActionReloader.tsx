'use client'

import { useEffect, useState } from 'react'
import { isStaleActionError, STALE_ACTION_MESSAGE } from './stale-action'

/**
 * Catches the one failure a redeploy causes in already-open tabs.
 *
 * Every server action in the admin panel is reachable this way, so this sits
 * in the shell rather than being wired into each button: a tab left open
 * overnight would otherwise hang on the FIRST thing pressed, whichever page
 * that happened to be.
 *
 * Individual handlers still catch it themselves where they can, so the button
 * stops spinning immediately. This is the net underneath them, for every
 * action whose rejection nobody caught.
 */
export function StaleActionReloader() {
    const [reloading, setReloading] = useState(false)

    useEffect(() => {
        let done = false

        function recover(err: unknown) {
            if (done || !isStaleActionError(err)) return
            done = true
            setReloading(true)
            // A beat so the message is actually readable, rather than the page
            // blinking and leaving someone wondering what they just clicked.
            setTimeout(() => window.location.reload(), 900)
        }

        const onRejection = (e: PromiseRejectionEvent) => recover(e.reason)
        const onError = (e: ErrorEvent) => recover(e.error ?? e.message)

        window.addEventListener('unhandledrejection', onRejection)
        window.addEventListener('error', onError)
        return () => {
            window.removeEventListener('unhandledrejection', onRejection)
            window.removeEventListener('error', onError)
        }
    }, [])

    if (!reloading) return null

    return (
        <div
            role="status"
            className="fixed inset-x-0 top-0 z-[200] px-4 py-2.5 text-center text-[13px] font-bold"
            style={{ backgroundColor: '#f57f20', color: '#091825' }}
        >
            {STALE_ACTION_MESSAGE}
        </div>
    )
}
