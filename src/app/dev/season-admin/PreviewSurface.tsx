'use client'

import { useAdminTheme } from '@/app/admin/_components/AdminThemeProvider'

/** The admin shell's page ground, so the preview reads as the real page does. */
export function PreviewSurface({ children }: { children: React.ReactNode }) {
  const { t } = useAdminTheme()
  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-8" style={{ backgroundColor: t.pageBg, fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif' }}>
      {children}
    </div>
  )
}
