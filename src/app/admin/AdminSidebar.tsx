'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
    LayoutDashboard, Truck, Activity, CalendarOff,
    Users, CreditCard, Coins,
    Share2, Swords, Star,
    UtensilsCrossed, DollarSign, QrCode,
    ScrollText, MessageSquare, Megaphone,
    Search, X, Tag, LogOut, UserCog, KeyRound, Building2, Camera, Carrot,
    CalendarClock,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
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

type BadgeKey = 'referrals' | 'layer4'

interface NavItem {
    label: string
    href: string
    icon: React.ReactNode
    /** Extra path prefixes that keep this row lit — the sub-queues that hang off it. */
    matchHrefs?: string[]
    badgeKey?: BadgeKey
    /** Where the row goes while its badge is live: straight to the waiting work. */
    badgeHref?: string
}

// Overview is the root of the panel, not a member of any group — it sits above
// the headings so the one page you always come back to is never buried in a list.
const OVERVIEW: NavItem = {
    label: 'Overview',
    href: '/admin',
    icon: <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
}

// Grouped by when you come here, not by what kind of data it is: the daily loop
// at the top, quarterly setup at the bottom, alarm-time pages last.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
        label: 'Today',
        items: [
            { label: 'Delivery Queue',   href: '/admin/deliveries', icon: <Truck size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Delivery Photos',  href: '/admin/photos',     icon: <Camera size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Labels',           href: '/admin/labels',     icon: <Tag size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Customers',
        items: [
            { label: 'Customers',        href: '/admin/customers',  icon: <Users size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            {
                label: 'Referrals',
                href: '/admin/referrals',
                icon: <Share2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
                matchHrefs: ['/admin/referral-review-queue'],
                badgeKey: 'referrals',
                badgeHref: '/admin/referral-review-queue',
            },
            { label: 'Reviews & Feedback', href: '/admin/reviews',  icon: <Star size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            {
                label: 'Dorm Wars',
                href: '/admin/dorm-wars',
                icon: <Swords size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
                matchHrefs: ['/admin/layer4-queue'],
                badgeKey: 'layer4',
                badgeHref: '/admin/layer4-queue',
            },
            { label: 'Messages',         href: '/admin/comms',      icon: <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Broadcast',        href: '/admin/comms/broadcast', icon: <Megaphone size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Money',
        items: [
            { label: 'Payments',         href: '/admin/payments',   icon: <CreditCard size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Credits',          href: '/admin/credits',    icon: <Coins size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Pricing',          href: '/admin/pricing',    icon: <DollarSign size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Kitchen',
        items: [
            { label: 'Menu',             href: '/admin/menu',       icon: <UtensilsCrossed size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Pantry',           href: '/admin/pantry',     icon: <Carrot size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'QR Codes',         href: '/admin/qr-codes',   icon: <QrCode size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'Setup',
        items: [
            { label: 'Dorms',            href: '/admin/dorms',      icon: <Building2 size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Holidays',         href: '/admin/holidays',   icon: <CalendarOff size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Season',           href: '/admin/season',     icon: <CalendarClock size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Staff',            href: '/admin/staff',      icon: <UserCog size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Access Links',     href: '/admin/ops-tokens', icon: <KeyRound size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
    {
        label: 'System',
        items: [
            { label: 'Scheduled Jobs',   href: '/admin/cron',       icon: <Activity size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
            { label: 'Audit Log',        href: '/admin/audit',      icon: <ScrollText size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
        ],
    },
]

// Every nav href, used to settle which row owns a nested path.
const ALL_HREFS = [OVERVIEW, ...NAV_GROUPS.flatMap(g => g.items)].map(i => i.href)

export default function AdminSidebar({ pendingReferrals, pendingLayer4, mobileOpen, onMobileClose }: SidebarProps) {
    const pathname = usePathname()
    const { t, isLight } = useAdminTheme()
    const { setOpen: openPalette } = useCommandPalette()

    const badges: Record<BadgeKey, number> = {
        referrals: pendingReferrals,
        layer4: pendingLayer4,
    }

    const logoLockup = (
        <div className="flex items-center gap-2">
            <Image
                src={isLight ? '/favicon.svg' : '/favicon-dark.svg'}
                alt=""
                width={28}
                height={28}
                className="w-7 h-7"
            />
            <div className="flex flex-col justify-center">
                <span className={`text-[13px] leading-none font-extrabold tracking-tight ${t.heading}`}>Dormers</span>
                <span className={`mt-[3px] text-[10px] leading-none font-bold tracking-[0.10em] uppercase ${t.muted}`}>Admin</span>
            </div>
        </div>
    )

    function isActive(item: NavItem) {
        if (item.href === '/admin') return pathname === '/admin'
        if (pathname.startsWith(item.href)) {
            // A page that lives under another row's href (Broadcast under
            // Messages) lights its own row only, never both.
            return !ALL_HREFS.some(h => h !== item.href && h.startsWith(item.href) && pathname.startsWith(h))
        }
        return (item.matchHrefs ?? []).some(h => pathname.startsWith(h))
    }

    function renderItem(item: NavItem) {
        const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0
        // A live badge means work is waiting, so the row takes you to the work
        // itself rather than to the summary page that links on to it.
        const href = badgeCount > 0 && item.badgeHref ? item.badgeHref : item.href
        const active = isActive(item)
        return (
            <Link
                key={item.href}
                href={href}
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
    }

    const navContent = (
        <nav className="flex flex-col gap-1 py-3 px-2 overflow-y-auto flex-1">
            {/* Search trigger */}
            <button
                type="button"
                onClick={() => { openPalette(true); onMobileClose() }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors duration-100 ${t.sidebarItem}`}
            >
                <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                <span className="flex-1 text-left">Search</span>
                <kbd className={`hidden lg:inline text-[9px] font-bold px-1 py-0.5 rounded border ${t.border} ${t.faint}`}>⌘K</kbd>
            </button>

            {renderItem(OVERVIEW)}

            {NAV_GROUPS.map(group => (
                <div key={group.label}>
                    {/* pt-4 (not pt-3) so the heading reads as a break between
                        groups rather than as a caption on the row below it. */}
                    <div className={`px-3 pt-4 pb-1.5 text-[9px] font-black tracking-[0.16em] uppercase ${t.sidebarGroupLabel}`}>
                        {group.label}
                    </div>
                    {group.items.map(renderItem)}
                </div>
            ))}
        </nav>
    )

    // Sign out — pinned footer, goes danger-red on hover (mirrors the dashboard pattern)
    const signoutItem = isLight
        ? 'text-[#091825]/65 hover:text-[#c0392b] hover:bg-[#c0392b]/[0.08]'
        : 'text-[#ede8da]/55 hover:text-[#e0716e] hover:bg-[#e0716e]/[0.10]'

    const signoutFooter = (
        <div className="px-2 py-3">
            <form action={signout}>
                <button
                    type="submit"
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors duration-100 ${signoutItem}`}
                >
                    <LogOut size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                    <span className="flex-1 text-left">Sign out</span>
                </button>
            </form>
        </div>
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
                <div className={`flex items-center px-4 py-4 ${t.sidebarBorder.replace('border-r', 'border-b')}`}>
                    {logoLockup}
                </div>
                <div className={`flex-1 overflow-y-auto ${t.sidebarBorder}`}>
                    {navContent}
                </div>
                <div className={`${t.sidebarBorder} border-t`}>
                    {signoutFooter}
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
                            {logoLockup}
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
                        <div className={`border-t ${t.border}`}>
                            {signoutFooter}
                        </div>
                    </aside>
                </div>
            )}
        </>
    )
}
