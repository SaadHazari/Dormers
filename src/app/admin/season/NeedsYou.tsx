'use client'

/**
 * Everything on the Season page that is waiting for the owner, in one amber
 * list. It renders nothing when nothing is waiting: a calm season says nothing.
 */

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { RefundQueue } from './RefundQueue'
import type { SeasonHoldRow, SeasonPlanRow } from './season-data'
import type { WaitlistMember } from './page'
import { plural } from './season-ui'
import { SEASON_REFUNDS_LIVE } from '@/contexts/season/domain/season-release'

export function NeedsYou({ refunds, drift, cookingDuringBreak, unminted }: {
    refunds: SeasonHoldRow[]
    drift: string | null
    cookingDuringBreak: SeasonPlanRow[]
    unminted: WaitlistMember[]
}) {
    const { t } = useAdminTheme()
    const showRefunds = SEASON_REFUNDS_LIVE && refunds.length > 0
    const count = (showRefunds ? 1 : 0) + (drift ? 1 : 0) + (cookingDuringBreak.length ? 1 : 0) + (unminted.length ? 1 : 0)
    if (count === 0) return null

    return (
        <section aria-label="Needs you" className={`rounded-xl border p-4 sm:p-6 ${t.warningBg}`}>
            <h2 className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] ${t.warning}`}>
                <AlertTriangle size={14} strokeWidth={2.4} aria-hidden />
                Needs you
            </h2>
            <div className="mt-4 flex flex-col gap-6">
                {cookingDuringBreak.length > 0 && (
                    <Item testId="season-invariant" alert>
                        <strong>{plural(cookingDuringBreak.length, 'plan is', 'plans are')} still switched on, so the kitchen would cook during the break:</strong>{' '}
                        {cookingDuringBreak.map((p) => `${p.customerName} (${p.planName})`).join(', ')}. Pause each one from the customer&apos;s page.
                    </Item>
                )}
                {drift && <Item testId="season-drift" alert>{drift}</Item>}
                {showRefunds && <RefundQueue queue={refunds} />}
                {unminted.length > 0 && (
                    <Item>
                        <strong>{plural(unminted.length, 'person', 'people')} joined the waiting list but got no credit:</strong>{' '}
                        {unminted.map((m) => m.name).join(', ')}. Add it by hand on{' '}
                        <Link href="/admin/credits" className={`font-bold underline underline-offset-2 ${t.accent}`}>Credits</Link>.
                    </Item>
                )}
            </div>
        </section>
    )
}

function Item({ children, testId, alert }: { children: React.ReactNode; testId?: string; alert?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <p data-testid={testId} role={alert ? 'alert' : undefined} className={`text-[13px] leading-relaxed max-w-[80ch] ${t.body}`}>
            {children}
        </p>
    )
}
