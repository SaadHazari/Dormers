'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
    LayoutDashboard, Truck, Activity,
    Users, CreditCard, Coins,
    Share2, Swords,
    UtensilsCrossed, DollarSign, QrCode,
    ScrollText, MessageSquare,
    Search, X, Tag,
} from 'lucide-react'
import { useAdminTheme } from './_components/AdminThemeProvider'
import { AdminBadgeCount } from './_components/AdminBadge'
import { useCommandPalette } from './_components/CommandPaletteProvider'

interface SidebarProps {
    pendingReferrals: number
    pendingLayer4: number
    mobileOpen: boolean
    onMobileClose: () => void
}

const ICON_SIZE = 16
const ICON_STROKE = 2

const NAV_GROUPS = [
    {
        label: 'Operations',
        items: [
            { label: 'Overview',        href: '/admin',            icon: <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Delivery Queue',  href: '/admin/deliveries', icon: <Truck size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Labels',          href: '/admin/labels',     icon: <Tag size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Cron Health',     href: '/admin/cron',       icon: <Activity size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Customers',
        items: [
            { label: 'All Customers',   href: '/admin/customers',      icon: <Users size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Revenue',
        items: [
            { label: 'Payments',         href: '/admin/payments',  icon: <CreditCard size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Credits & Comps',  href: '/admin/credits',   icon: <Coins size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Engagement',
        items: [
            { label: 'Referrals',        href: '/admin/referrals',         icon: <Share2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />, badgeKey: 'referrals' as const },
            { label: 'Dorm Wars',        href: '/admin/dorm-wars',         icon: <Swords size={ICON_SIZE} strokeWidth={ICON_STROKE} />, badgeKey: 'layer4' as const },
        ],
    },
    {
        label: 'Content',
        items: [
            { label: 'Menu CMS',         href: '/admin/menu',     icon: <UtensilsCrossed size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'QR Codes',         href: '/admin/qr-codes', icon: <QrCode size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Pricing',           href: '/admin/pricing',  icon: <DollarSign size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'System',
        items: [
            { label: 'Audit Log',        href: '/admin/audit',    icon: <ScrollText size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Communications',    href: '/admin/comms',    icon: <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
] as const

type BadgeKey = 'referrals' | 'layer4'

export default function AdminSidebar({ pendingReferrals, pendingLayer4, mobileOpen, onMobileClose }: SidebarProps) {
    const pathname = usePathname()
    const { t } = useAdminTheme()
    const { setOpen: openPalette } = useCommandPalette()

    const badges: Record<BadgeKey, number> = {
        referrals: pendingReferrals,
        layer4: pendingLayer4,
    }

    function isActive(href: string) {
        if (href === '/admin') return pathname === '/admin'
        return pathname.startsWith(href)
    }

    const navContent = (
        <nav className="flex flex-col gap-1 py-3 px-2 overflow-y-auto flex-1">
            {/* Search trigger */}
            <button
                type="button"
                onClick={() => { openPalette(true); onMobileClose() }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold mb-2 transition-colors duration-100 ${t.sidebarItem}`}
            >
                <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                <span className="flex-1 text-left">Search</span>
                <kbd className={`hidden lg:inline text-[9px] font-bold px-1 py-0.5 rounded border ${t.border} ${t.faint}`}>⌘K</kbd>
            </button>

            {NAV_GROUPS.map(group => (
                <div key={group.label} className="mb-1">
                    <div className={`px-3 pt-3 pb-1 text-[9px] font-black tracking-[0.16em] uppercase ${t.sidebarGroupLabel}`}>
                        {group.label}
                    </div>
                    {group.items.map(item => {
                        const active = isActive(item.href)
                        const badgeKey = 'badgeKey' in item ? item.badgeKey : null
                        const badgeCount = badgeKey ? badges[badgeKey] : 0
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onMobileClose}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors duration-100 ${
                                    active ? t.sidebarItemActive : t.sidebarItem
                                }`}
                            >
                                {item.icon}
                                <span className="flex-1 truncate">{item.label}</span>
                                {badgeCount > 0 && <AdminBadgeCount count={badgeCount} />}
                            </Link>
                        )
                    })}
                </div>
            ))}
        </nav>
    )

    return (
        <>
            {/* Desktop sidebar — fixed rail */}
            <aside
                className="hidden lg:flex flex-col fixed top-0 left-0 h-full z-40"
                style={{
                    width: 220,
                    backgroundColor: t.sidebar,
                }}
            >
                <div className={`flex items-center gap-2 px-4 py-4 ${t.sidebarBorder.replace('border-r', 'border-b')}`}>
                    <div className="w-7 h-7 rounded-lg bg-[#f57f20] flex items-center justify-center text-white text-[11px] font-black">D</div>
                    <span className={`text-[14px] font-extrabold tracking-tight ${t.heading}`}>Admin</span>
                </div>
                <div className={`flex-1 overflow-y-auto ${t.sidebarBorder}`}>
                    {navContent}
                </div>
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-[100]">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onMobileClose} />
                    <aside
                        className="absolute top-0 left-0 h-full flex flex-col"
                        style={{
                            width: 280,
                            backgroundColor: t.sidebar,
                        }}
                    >
                        <div className="flex items-center justify-between px-4 py-4">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#f57f20] flex items-center justify-center text-white text-[11px] font-black">D</div>
                                <span className={`text-[14px] font-extrabold tracking-tight ${t.heading}`}>Admin</span>
                            </div>
                            <button
                                type="button"
                                onClick={onMobileClose}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg ${t.sidebarItem}`}
                                aria-label="Close menu"
                            >
                                <X size={18} strokeWidth={2} />
                            </button>
                        </div>
                        {navContent}
                    </aside>
                </div>
            )}
        </>
    )
}
