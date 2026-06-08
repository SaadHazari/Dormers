'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, User, Mail, Phone, MapPin,
    UtensilsCrossed, Calendar, Coins, Bell,
} from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminBadge } from '../../_components/AdminBadge'
import { AdminCard } from '../../_components/AdminCard'
import { CustomerTimeline } from './CustomerTimeline'
import { InterventionPanel } from './InterventionPanel'

interface Props {
    customer: Record<string, unknown>
    subscriptions: Array<Record<string, unknown>>
    orders: Array<Record<string, unknown>>
    credits: Array<Record<string, unknown>>
    notifications: Array<Record<string, unknown>>
    referralsAsInviter: Array<Record<string, unknown>>
    referralsAsInvitee: Array<Record<string, unknown>>
    creditBalance: number
    creditPending: number
}

type Tab = 'overview' | 'timeline' | 'subscriptions' | 'credits' | 'notifications'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview',      label: 'Overview',       icon: <User size={14} /> },
    { key: 'timeline',      label: 'Timeline',       icon: <Calendar size={14} /> },
    { key: 'subscriptions', label: 'Subscriptions',  icon: <UtensilsCrossed size={14} /> },
    { key: 'credits',       label: 'Credits',        icon: <Coins size={14} /> },
    { key: 'notifications', label: 'Notifications',  icon: <Bell size={14} /> },
]

const SUB_STATUS_VARIANT: Record<string, 'active' | 'pending' | 'ended' | 'warning' | 'neutral'> = {
    Active: 'active', Paused: 'warning', Skipped: 'warning', Scheduled: 'pending', Ended: 'ended',
}

export function CustomerDetail({
    customer, subscriptions, orders, credits, notifications,
    referralsAsInviter, referralsAsInvitee,
    creditBalance, creditPending,
}: Props) {
    const { t } = useAdminTheme()
    const [tab, setTab] = useState<Tab>('overview')

    const activeSub = subscriptions.find(s =>
        ['Active', 'Paused', 'Skipped', 'Scheduled'].includes(s.status as string)
    )

    return (
        <div>
            {/* Back link */}
            <Link
                href="/admin/customers"
                className={`inline-flex items-center gap-1.5 text-[12px] font-bold ${t.muted} hover:${t.heading} mb-4 transition-colors`}
            >
                <ArrowLeft size={14} strokeWidth={2} /> All Customers
            </Link>

            {/* Customer header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                <div>
                    <h1 className={`text-xl font-black tracking-tight ${t.heading}`}>
                        {(customer.name as string) || '(no name)'}
                    </h1>
                    <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[12px] font-medium ${t.muted}`}>
                        {customer.email ? (
                            <span className="inline-flex items-center gap-1">
                                <Mail size={11} strokeWidth={2} /> {String(customer.email)}
                            </span>
                        ) : null}
                        {customer.whatsapp_number ? (
                            <span className="inline-flex items-center gap-1">
                                <Phone size={11} strokeWidth={2} /> {String(customer.whatsapp_number)}
                            </span>
                        ) : null}
                        {customer.dorm_name ? (
                            <span className="inline-flex items-center gap-1">
                                <MapPin size={11} strokeWidth={2} /> {String(customer.dorm_name)}
                            </span>
                        ) : null}
                        {customer.cid ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                                CID: {String(customer.cid)}
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* Quick stats */}
                <div className="flex gap-3">
                    <MiniStat label="Balance" value={`AED ${creditBalance}`} accent={creditBalance > 0} />
                    <MiniStat label="Pending" value={`AED ${creditPending}`} />
                    <MiniStat label="Referrals" value={String(referralsAsInviter.length)} />
                </div>
            </div>

            {/* Tabs */}
            <div className={`flex gap-1 overflow-x-auto pb-1 mb-4 border-b ${t.border}`}>
                {TABS.map(({ key, label, icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-bold tracking-[0.04em] uppercase whitespace-nowrap transition-colors ${
                            tab === key
                                ? `${t.accent} border-b-2 border-[#f57f20]`
                                : `${t.muted} hover:${t.body}`
                        }`}
                    >
                        {icon} {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Customer info */}
                    <AdminCard className="lg:col-span-2">
                        <SectionTitle>Customer Info</SectionTitle>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                            <Field label="Preference" value={customer.meal_preference_type as string} />
                            <Field label="Week Type" value={customer.week_type as string} />
                            <Field label="Spice Level" value={customer.spice_level_preference as string} />
                            <Field label="Allergens" value={customer.allergens as string || 'None'} />
                            <Field label="WhatsApp Verified" value={customer.whatsapp_verified ? 'Yes' : 'No'} />
                            <Field label="Joined" value={formatDate(customer.created_at as string)} />
                        </div>
                    </AdminCard>

                    {/* Active subscription */}
                    <AdminCard>
                        <SectionTitle>Current Plan</SectionTitle>
                        {activeSub ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className={`text-[14px] font-bold ${t.heading}`}>
                                        {(activeSub.plan_name as string)?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </span>
                                    <AdminBadge variant={SUB_STATUS_VARIANT[activeSub.status as string] ?? 'neutral'}>
                                        {activeSub.status as string}
                                    </AdminBadge>
                                </div>
                                <div className={`text-[12px] space-y-1 ${t.muted}`}>
                                    <div>Meals: <strong className={t.body}>{activeSub.delivered_meals as number}/{activeSub.total_meals as number}</strong></div>
                                    <div>Start: <strong className={t.body}>{activeSub.start_date as string}</strong></div>
                                    <div>End: <strong className={t.body}>{activeSub.end_date as string}</strong></div>
                                    <div>Skips used: <strong className={t.body}>{activeSub.skipped_meals_count as number}</strong></div>
                                    {(activeSub.bonus_skips as number) > 0 && (
                                        <div>Bonus skips: <strong className={t.body}>{activeSub.bonus_skips as number}</strong></div>
                                    )}
                                </div>

                                {/* Progress bar */}
                                <div className={`h-1.5 rounded-full overflow-hidden ${t.border} bg-current/[0.06]`}>
                                    <div
                                        className="h-full rounded-full bg-[#f57f20] transition-all duration-300"
                                        style={{ width: `${Math.min(100, ((activeSub.delivered_meals as number) / (activeSub.total_meals as number)) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className={`text-sm font-semibold ${t.faint}`}>No active plan</div>
                        )}
                    </AdminCard>

                    {/* Intervention panel */}
                    <div className="lg:col-span-3">
                        <InterventionPanel
                            customerId={customer.id as string}
                            activeSub={activeSub ?? null}
                        />
                    </div>
                </div>
            )}

            {tab === 'timeline' && (
                <CustomerTimeline
                    subscriptions={subscriptions}
                    orders={orders}
                    credits={credits}
                    notifications={notifications}
                    referralsAsInviter={referralsAsInviter}
                    referralsAsInvitee={referralsAsInvitee}
                />
            )}

            {tab === 'subscriptions' && (
                <div className="flex flex-col gap-3">
                    {subscriptions.length === 0 && <div className={`text-sm font-semibold py-8 text-center ${t.faint}`}>No subscriptions</div>}
                    {subscriptions.map(sub => (
                        <AdminCard key={sub.id as string}>
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[14px] font-bold ${t.heading}`}>
                                    {(sub.plan_name as string)?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </span>
                                <AdminBadge variant={SUB_STATUS_VARIANT[sub.status as string] ?? 'neutral'}>
                                    {sub.status as string}
                                </AdminBadge>
                            </div>
                            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] ${t.muted}`}>
                                <div>Start: <strong className={t.body}>{sub.start_date as string}</strong></div>
                                <div>End: <strong className={t.body}>{sub.end_date as string}</strong></div>
                                <div>Meals: <strong className={t.body}>{sub.delivered_meals as number}/{sub.total_meals as number}</strong></div>
                                <div>Skips: <strong className={t.body}>{sub.skipped_meals_count as number}</strong></div>
                            </div>
                        </AdminCard>
                    ))}
                </div>
            )}

            {tab === 'credits' && (
                <div className="flex flex-col gap-2">
                    {credits.length === 0 && <div className={`text-sm font-semibold py-8 text-center ${t.faint}`}>No credits</div>}
                    {credits.map(credit => (
                        <div key={credit.id as string} className={`flex items-center justify-between py-2.5 border-b ${t.border}`}>
                            <div>
                                <div className={`text-[13px] font-bold ${t.body}`}>
                                    {(credit.source as string)?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </div>
                                <div className={`text-[10px] font-medium tabular-nums ${t.faint}`}>
                                    {formatDate(credit.created_at as string)}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[14px] font-black tabular-nums ${t.heading}`}>
                                    AED {Number(credit.amount_aed)}
                                </span>
                                <AdminBadge variant={credit.status === 'approved' ? 'approved' : credit.status === 'pending' ? 'pending' : credit.status === 'applied' ? 'active' : 'rejected'}>
                                    {credit.status as string}
                                </AdminBadge>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'notifications' && (
                <div className="flex flex-col gap-2">
                    {notifications.length === 0 && <div className={`text-sm font-semibold py-8 text-center ${t.faint}`}>No notifications</div>}
                    {notifications.map(notif => (
                        <div key={notif.id as string} className={`flex items-center justify-between py-2.5 border-b ${t.border}`}>
                            <div>
                                <div className={`text-[13px] font-bold ${t.body}`}>
                                    {(notif.kind as string)?.replace(/_/g, ' ')}
                                </div>
                                <div className={`text-[10px] font-medium tabular-nums ${t.faint}`}>
                                    {formatDate(notif.created_at as string)}
                                </div>
                            </div>
                            <AdminBadge variant={notif.sent_at ? 'active' : 'warning'}>
                                {notif.sent_at ? 'Sent' : 'Pending'}
                            </AdminBadge>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <h3 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
            {children}
        </h3>
    )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
    const { t } = useAdminTheme()
    return (
        <div>
            <span className={`text-[10px] font-bold tracking-[0.08em] uppercase ${t.faint}`}>{label}</span>
            <div className={`font-semibold ${t.body}`}>{value || '—'}</div>
        </div>
    )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-lg px-3 py-2 text-center`}>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div className={`text-[14px] font-black tabular-nums ${accent ? t.accent : t.heading}`}>{value}</div>
        </div>
    )
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric', month: 'short', year: 'numeric',
        timeZone: 'Asia/Dubai',
    })
}
