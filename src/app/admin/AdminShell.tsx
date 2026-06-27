'use client'

import { useState, useEffect } from 'react'
import { Menu as MenuIcon } from 'lucide-react'
import { AdminThemeProvider, useAdminTheme } from './_components/AdminThemeProvider'
import { CommandPaletteProvider, useCommandPalette, type PaletteCommand } from './_components/CommandPaletteProvider'
import { CommandPalette } from './_components/CommandPalette'
import { KeyboardShortcuts } from './_components/KeyboardShortcuts'
import AdminSidebar from './AdminSidebar'

interface Props {
    pendingReferrals: number
    pendingLayer4: number
    children: React.ReactNode
}

const NAV_COMMANDS: PaletteCommand[] = [
    { id: 'nav-overview',    label: 'Overview',         group: 'Navigation', href: '/admin',            keywords: ['home', 'dashboard', 'kpi'] },
    { id: 'nav-deliveries',  label: 'Delivery Queue',   group: 'Navigation', href: '/admin/deliveries', keywords: ['orders', 'today', 'meals'] },
    { id: 'nav-labels',      label: 'Labels',           group: 'Navigation', href: '/admin/labels',     keywords: ['print', 'thermal', 'sticker', 'kitchen', 'label'] },
    { id: 'nav-cron',        label: 'Cron Health',      group: 'Navigation', href: '/admin/cron',       keywords: ['jobs', 'tick', 'health', 'status'] },
    { id: 'nav-holidays',    label: 'Holidays',         group: 'Navigation', href: '/admin/holidays',   keywords: ['holiday', 'closure', 'eid', 'shutdown', 'pause', 'national'] },
    { id: 'nav-customers',   label: 'All Customers',    group: 'Navigation', href: '/admin/customers',  keywords: ['users', 'search', 'lookup'] },
    { id: 'nav-staff',       label: 'Staff',            group: 'Navigation', href: '/admin/staff',      keywords: ['intern', 'staff', 'employee', 'claim', 'code', 'remuneration'] },
    { id: 'nav-payments',    label: 'Payments',         group: 'Navigation', href: '/admin/payments',   keywords: ['stripe', 'billing', 'charges'] },
    { id: 'nav-credits',     label: 'Credits & Comps',  group: 'Navigation', href: '/admin/credits',    keywords: ['credit', 'comped', 'wallet', 'refund'] },
    { id: 'nav-referrals',   label: 'Referrals',        group: 'Navigation', href: '/admin/referrals',  keywords: ['invite', 'fraud', 'queue'] },
    { id: 'nav-dormwars',    label: 'Dorm Wars',        group: 'Navigation', href: '/admin/dorm-wars',  keywords: ['gamification', 'streaks', 'rewards', 'layer4'] },
    { id: 'nav-reviews',     label: 'Reviews & Feedback', group: 'Navigation', href: '/admin/reviews',  keywords: ['review', 'feedback', 'rating', 'wrap', 'survey', 'kitchen', 'nps', 'sentiment', 'renewal'] },
    { id: 'nav-menu',        label: 'Menu CMS',         group: 'Navigation', href: '/admin/menu',       keywords: ['dishes', 'food', 'rotation', 'catalog'] },
    { id: 'nav-qr',          label: 'QR Codes',         group: 'Navigation', href: '/admin/qr-codes',   keywords: ['qr', 'code', 'scan', 'print', 'dish'] },
    { id: 'nav-pricing',     label: 'Pricing',          group: 'Navigation', href: '/admin/pricing',    keywords: ['price', 'plans', 'aed'] },
    { id: 'nav-audit',       label: 'Audit Log',        group: 'Navigation', href: '/admin/audit',      keywords: ['log', 'history', 'who'] },
    { id: 'nav-comms',       label: 'Communications',   group: 'Navigation', href: '/admin/comms',      keywords: ['email', 'whatsapp', 'notifications', 'messages'] },
    { id: 'nav-ops-tokens',  label: 'Ops Tokens',       group: 'Navigation', href: '/admin/ops-tokens', keywords: ['token', 'rotate', 'kitchen', 'rider', 'ops', 'key', 'revoke'] },
]

export default function AdminShell({ pendingReferrals, pendingLayer4, children }: Props) {
    return (
        <AdminThemeProvider>
            <CommandPaletteProvider>
                <ShellInner pendingReferrals={pendingReferrals} pendingLayer4={pendingLayer4}>
                    {children}
                </ShellInner>
            </CommandPaletteProvider>
        </AdminThemeProvider>
    )
}

function ShellInner({ pendingReferrals, pendingLayer4, children }: Props) {
    const { t } = useAdminTheme()
    const { register } = useCommandPalette()
    const [mobileOpen, setMobileOpen] = useState(false)

    useEffect(() => {
        register(NAV_COMMANDS)
    }, [register])

    return (
        <div
            className="admin-root min-h-screen"
            style={{
                backgroundColor: t.pageBg,
                fontFamily: 'var(--font-montserrat), Arial, Helvetica, sans-serif',
                transition: 'background-color 200ms ease',
            }}
        >
            <AdminSidebar
                pendingReferrals={pendingReferrals}
                pendingLayer4={pendingLayer4}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
            />

            {/* Mobile hamburger */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                className={`lg:hidden fixed top-4 left-4 z-50 w-11 h-11 flex items-center justify-center rounded-xl transition-colors duration-100 ${t.card}`}
                style={{ backdropFilter: 'blur(12px)' }}
            >
                <MenuIcon size={18} strokeWidth={2} className={t.heading} />
            </button>

            {/* Main content — generous gutters so pages never crowd the rail */}
            <main className="lg:ml-[220px] min-h-screen">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 pt-16 pb-12 lg:pt-8">
                    {children}
                </div>
            </main>

            <CommandPalette />
            <KeyboardShortcuts />
        </div>
    )
}
