'use client'

import { ChefHat, HeartHandshake } from 'lucide-react'
import { useAdminTheme } from '../../_components/AdminThemeProvider'
import { AdminEmptyState } from '../../_components/AdminEmptyState'
import { WeeklyReviewCard, MonthlyReviewCard } from '../../reviews/ReviewCards'
import { TONE } from '../../reviews/labels'
import type { CustomerReviews } from '@/infra/supabase/reviews-repo'

export function ReviewsTab({ reviews }: { reviews: CustomerReviews }) {
    const { t } = useAdminTheme()
    const { weekly, monthly } = reviews

    if (weekly.length === 0 && monthly.length === 0) {
        return <AdminEmptyState icon={<ChefHat size={30} strokeWidth={1.8} />} title="No reviews yet" description="This customer hasn't submitted any weekly reviews or monthly wraps." />
    }

    const spark = [...weekly].reverse() // oldest → newest
    const avg = weekly.length ? weekly.reduce((s, w) => s + w.rating, 0) / weekly.length : null

    return (
        <div className="flex flex-col gap-5">
            {/* Snapshot */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Mini label="Weekly reviews" value={String(weekly.length)} />
                <Mini label="Monthly wraps" value={String(monthly.length)} />
                <Mini label="Avg rating" value={avg != null ? `${avg.toFixed(1)}★` : '—'} accent />
                <div className={`${t.card} rounded-lg px-3 py-2`}>
                    <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint} mb-1`}>Rating trend</div>
                    {spark.length === 0 ? <div className={`text-[12px] font-bold ${t.faint}`}>—</div> : (
                        <div className="flex items-end gap-1 h-7">
                            {spark.map(w => (
                                <div key={w.id} className="flex-1 rounded-t" title={`${w.rating}★`} style={{ height: `${(w.rating / 5) * 100}%`, minHeight: 3, backgroundColor: TONE.ok }} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {monthly.length > 0 && (
                <Section icon={<HeartHandshake size={14} strokeWidth={2.2} />} title="Monthly wraps">
                    <div className="flex flex-col gap-3">
                        {monthly.map(m => <MonthlyReviewCard key={m.id} review={m} />)}
                    </div>
                </Section>
            )}

            {weekly.length > 0 && (
                <Section icon={<ChefHat size={14} strokeWidth={2.2} />} title="Weekly reviews">
                    <div className="flex flex-col gap-3">
                        {weekly.map(w => <WeeklyReviewCard key={w.id} review={w} />)}
                    </div>
                </Section>
            )}
        </div>
    )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <div>
            <div className={`flex items-center gap-1.5 text-[10px] font-black tracking-[0.14em] uppercase mb-2.5 ${t.muted}`}>
                <span className={t.accent}>{icon}</span>{title}
            </div>
            {children}
        </div>
    )
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    const { t } = useAdminTheme()
    return (
        <div className={`${t.card} rounded-lg px-3 py-2`}>
            <div className={`text-[9px] font-bold tracking-[0.12em] uppercase ${t.faint}`}>{label}</div>
            <div className={`text-[16px] font-black tabular-nums ${accent ? t.accent : t.heading}`}>{value}</div>
        </div>
    )
}
