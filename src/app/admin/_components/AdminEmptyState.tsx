'use client'

import { useAdminTheme } from './AdminThemeProvider'

interface Props {
    icon?: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
}

export function AdminEmptyState({ icon, title, description, action }: Props) {
    const { t } = useAdminTheme()

    return (
        <div className={`flex flex-col items-center justify-center py-16 px-6 rounded-xl border border-dashed ${t.border}`}>
            {icon && <div className="text-3xl mb-3">{icon}</div>}
            <div className={`text-base font-extrabold mb-1 ${t.heading}`}>{title}</div>
            {description && <div className={`text-xs font-semibold ${t.muted}`}>{description}</div>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}
