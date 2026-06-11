'use client'

import { useEffect } from 'react'
import { useAdminTheme } from './AdminThemeProvider'

/**
 * Shared admin modal shell.
 *
 * - Centers the dialog over the CONTENT area, not the raw viewport — on
 *   desktop the fixed 220px sidebar is excluded via padding, so the dialog
 *   never drifts over the rail.
 * - Locks body scroll while open (the page behind no longer scrolls).
 * - Backdrop click closes; consumers own Esc handling (some step back first).
 */
export function AdminModal({ label, maxW = 'max-w-[460px]', onBackdrop, children }: {
    label: string
    maxW?: string
    onBackdrop: () => void
    children: React.ReactNode
}) {
    const { t } = useAdminTheme()

    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    return (
        <div
            className={`fixed inset-0 z-[150] flex items-center justify-center p-4 lg:pl-[236px] ${t.backdrop}`}
            onClick={onBackdrop}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={label}
                className={`w-full ${maxW} max-h-[86vh] flex flex-col rounded-2xl overflow-hidden ${t.overlay}`}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    )
}
