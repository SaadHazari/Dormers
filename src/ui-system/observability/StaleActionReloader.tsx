'use client'

import { useEffect, useState } from 'react'
import { isStaleActionError } from './stale-action'

// Shared with global-error.tsx, so the two nets cannot take turns reloading.
const RELOADED_AT_KEY = 'dormers:stale-action-reloaded-at'

/**
 * Reload at most once every ten seconds. If the fresh page still posts a dead
 * action id (a CDN serving an old bundle), reloading again would trap the
 * visitor in a loop — so the error is left to surface normally instead.
 */
function mayReload(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) || 0)
        if (Date.now() - last <= 10_000) return false
        sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()))
    } catch {
        // Storage blocked: one reload is still better than a dead button.
    }
    return true
}

/**
 * Catches the one failure a redeploy causes in already-open tabs.
 *
 * Every server action on the site is reachable this way, so this sits in the
 * root layout rather than being wired into each button: a tab left open
 * overnight would otherwise hang on the FIRST thing pressed, whichever page
 * that happened to be. It began in the admin shell (JAVASCRIPT-NEXTJS-1G);
 * customer pages call server actions too, so it now covers them as well.
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
            if (!mayReload()) return
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
            Dormers was updated while this page was open. Reloading…
        </div>
    )
}
