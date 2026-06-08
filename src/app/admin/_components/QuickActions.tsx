'use client'

import Link from 'next/link'
import { Search, ShieldCheck, Star, Users } from 'lucide-react'
import { useAdminTheme } from './AdminThemeProvider'
import { useCommandPalette } from './CommandPaletteProvider'

interface Props {
    pendingReferrals: number
    pendingLayer4: number
}

export function QuickActions({ pendingReferrals, pendingLayer4 }: Props) {
    const { t } = useAdminTheme()
    const { setOpen } = useCommandPalette()

    const actions = [
        {
            label: 'Search Customer',
            icon: <Search size={14} strokeWidth={2.2} />,
            onClick: () => setOpen(true),
        },
        ...(pendingReferrals > 0 ? [{
            label: `Review ${pendingReferrals} Referral${pendingReferrals > 1 ? 's' : ''}`,
            icon: <ShieldCheck size={14} strokeWidth={2.2} />,
            href: '/admin/referral-review-queue',
        }] : []),
        ...(pendingLayer4 > 0 ? [{
            label: `Review ${pendingLayer4} Layer 4`,
            icon: <Star size={14} strokeWidth={2.2} />,
            href: '/admin/layer4-queue',
        }] : []),
        {
            label: 'All Customers',
            icon: <Users size={14} strokeWidth={2.2} />,
            href: '/admin/customers',
        },
    ]

    return (
        <div className="flex flex-wrap gap-2">
            {actions.map(action => {
                const cls = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.04em] uppercase transition-all duration-100 border ${t.card} ${t.cardHover} cursor-pointer`

                if ('href' in action && action.href) {
                    return (
                        <Link key={action.label} href={action.href} className={cls}>
                            {action.icon}
                            {action.label}
                        </Link>
                    )
                }
                return (
                    <button
                        key={action.label}
                        type="button"
                        onClick={'onClick' in action ? action.onClick : undefined}
                        className={cls}
                    >
                        {action.icon}
                        {action.label}
                    </button>
                )
            })}
        </div>
    )
}
