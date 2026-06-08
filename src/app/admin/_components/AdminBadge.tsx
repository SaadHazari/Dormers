'use client'

import { useAdminTheme } from './AdminThemeProvider'

type Variant = 'pending' | 'active' | 'approved' | 'rejected' | 'ended' | 'warning' | 'neutral'

const VARIANT_MAP: Record<Variant, (t: ReturnType<typeof import('@/ui-system/tokens/admin-theme').adminTokens>) => string> = {
    pending:  (t) => `${t.warningBg} ${t.warning}`,
    active:   (t) => `${t.successBg} ${t.success}`,
    approved: (t) => `${t.successBg} ${t.success}`,
    rejected: (t) => `${t.dangerBg} ${t.danger}`,
    ended:    (t) => `${t.muted} bg-transparent border ${t.border}`,
    warning:  (t) => `${t.warningBg} ${t.warning}`,
    neutral:  (t) => `${t.muted} bg-transparent border ${t.border}`,
}

interface Props {
    variant: Variant
    children: React.ReactNode
    className?: string
}

export function AdminBadge({ variant, children, className = '' }: Props) {
    const { t } = useAdminTheme()
    const variantCls = VARIANT_MAP[variant](t)

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-[0.12em] uppercase border ${variantCls} ${className}`}>
            {children}
        </span>
    )
}

export function AdminBadgeCount({ count }: { count: number }) {
    const { t } = useAdminTheme()
    if (count <= 0) return null
    return (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black tabular-nums ${t.badgeCount}`}>
            {count > 99 ? '99+' : count}
        </span>
    )
}
