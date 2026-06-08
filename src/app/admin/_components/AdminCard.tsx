'use client'

import { useAdminTheme } from './AdminThemeProvider'

interface Props {
    children: React.ReactNode
    className?: string
    hover?: boolean
    active?: boolean
    onClick?: () => void
}

export function AdminCard({ children, className = '', hover = false, active = false, onClick }: Props) {
    const { t } = useAdminTheme()
    const base = active ? t.cardActive : t.card
    const hoverCls = hover && !active ? t.cardHover : ''
    const interactive = onClick ? 'cursor-pointer' : ''

    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
            className={`rounded-xl p-4 transition-all duration-150 ${base} ${hoverCls} ${interactive} ${className}`}
        >
            {children}
        </div>
    )
}
