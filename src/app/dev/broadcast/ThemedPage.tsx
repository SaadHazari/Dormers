'use client'

import { useAdminTheme } from '@/app/admin/_components/AdminThemeProvider'

/** Paints the real admin page colour, so the preview matches the panel in both themes. */
export function ThemedPage({ children }: { children: React.ReactNode }) {
    const { t, isLight } = useAdminTheme()
    return (
        <div className={`admin-root min-h-screen${isLight ? ' admin-light' : ''}`} style={{ backgroundColor: t.pageBg }}>
            {children}
        </div>
    )
}
