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

// Mirrors the sidebar groups and order, so the palette and the rail teach the
// same map. Renamed pages keep their old wording in `keywords`, so searching
// "cron" or "CMS" still lands on the right page.
const NAV_COMMANDS: PaletteCommand[] = [
    // Overview sits ungrouped in the rail, but a one-item "Overview" heading
    // above an "Overview" row reads as noise here, so it leads the daily group.
    { id: 'nav-overview',    label: 'Overview',           group: 'Today',     href: '/admin',            keywords: ['home', 'dashboard', 'kpi'] },
    { id: 'nav-deliveries',  label: 'Delivery Queue',     group: 'Today',     href: '/admin/deliveries', keywords: ['orders', 'today', 'meals'] },
    { id: 'nav-photos',      label: 'Delivery Photos',    group: 'Today',     href: '/admin/photos',     keywords: ['photo', 'proof', 'pickup', 'custody', 'rider', 'box', 'count'] },
    { id: 'nav-labels',      label: 'Labels',             group: 'Today',     href: '/admin/labels',     keywords: ['print', 'thermal', 'sticker', 'kitchen', 'label'] },

    { id: 'nav-customers',   label: 'Customers',          group: 'Customers', href: '/admin/customers',  keywords: ['users', 'search', 'lookup', 'all'] },
    { id: 'nav-referrals',   label: 'Referrals',          group: 'Customers', href: '/admin/referrals',  keywords: ['invite', 'fraud', 'queue'] },
    { id: 'nav-reviews',     label: 'Reviews & Feedback', group: 'Customers', href: '/admin/reviews',    keywords: ['review', 'feedback', 'rating', 'wrap', 'survey', 'kitchen', 'nps', 'sentiment', 'renewal'] },
    { id: 'nav-dormwars',    label: 'Dorm Wars',          group: 'Customers', href: '/admin/dorm-wars',  keywords: ['gamification', 'streaks', 'rewards', 'layer4'] },
    { id: 'nav-comms',       label: 'Messages',           group: 'Customers', href: '/admin/comms',      keywords: ['email', 'whatsapp', 'notifications', 'messages', 'communications', 'comms'] },

    { id: 'nav-payments',    label: 'Payments',           group: 'Money',     href: '/admin/payments',   keywords: ['stripe', 'billing', 'charges'] },
    { id: 'nav-credits',     label: 'Credits',            group: 'Money',     href: '/admin/credits',    keywords: ['credit', 'comp', 'comps', 'comped', 'wallet', 'refund'] },
    { id: 'nav-pricing',     label: 'Pricing',            group: 'Money',     href: '/admin/pricing',    keywords: ['price', 'plans', 'aed'] },

    { id: 'nav-menu',        label: 'Menu',               group: 'Kitchen',   href: '/admin/menu',       keywords: ['dishes', 'food', 'rotation', 'catalog', 'cms', 'recipe'] },
    { id: 'nav-pantry',      label: 'Pantry',             group: 'Kitchen',   href: '/admin/pantry',     keywords: ['pantry', 'ingredient', 'stock', 'kitchen', 'recipe', 'supplier', 'cost'] },
    { id: 'nav-qr',          label: 'QR Codes',           group: 'Kitchen',   href: '/admin/qr-codes',   keywords: ['qr', 'code', 'scan', 'print', 'dish'] },

    { id: 'nav-dorms',       label: 'Dorms',              group: 'Setup',     href: '/admin/dorms',      keywords: ['dorm', 'location', 'locations', 'building', 'shape', 'cid', 'alias'] },
    { id: 'nav-holidays',    label: 'Holidays',           group: 'Setup',     href: '/admin/holidays',   keywords: ['holiday', 'closure', 'eid', 'shutdown', 'pause', 'national'] },
    { id: 'nav-staff',       label: 'Staff',              group: 'Setup',     href: '/admin/staff',      keywords: ['intern', 'staff', 'employee', 'claim', 'code', 'remuneration'] },
    { id: 'nav-ops-tokens',  label: 'Access Links',       group: 'Setup',     href: '/admin/ops-tokens', keywords: ['token', 'tokens', 'ops', 'rotate', 'kitchen', 'rider', 'key', 'revoke', 'link'] },

    { id: 'nav-cron',        label: 'Scheduled Jobs',     group: 'System',    href: '/admin/cron',       keywords: ['jobs', 'cron', 'tick', 'health', 'status', 'schedule'] },
    { id: 'nav-audit',       label: 'Audit Log',          group: 'System',    href: '/admin/audit',      keywords: ['log', 'history', 'who'] },
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
