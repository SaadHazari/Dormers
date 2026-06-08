'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { createPricingRow } from './actions'

interface PricingRow {
    id: string
    plan_id: string
    preference: string
    week_type: string
    veg_day_count: number | null
    price_per_meal: number
    effective_from: string
    effective_to: string | null
    created_by: string | null
    created_at: string
}

interface Props {
    rows: PricingRow[]
}

const CODE_PRICES: Array<{ plan: string; pref: string; perMeal: number }> = [
    { plan: 'monthly-max',     pref: 'Veg',    perMeal: 17.5 },
    { plan: 'monthly-max',     pref: 'NonVeg', perMeal: 21.5 },
    { plan: 'monthly-premium', pref: 'Veg',    perMeal: 18 },
    { plan: 'monthly-premium', pref: 'NonVeg', perMeal: 23 },
    { plan: 'weekly-flex',     pref: 'Veg',    perMeal: 19 },
    { plan: 'weekly-flex',     pref: 'NonVeg', perMeal: 25 },
    { plan: 'trial',           pref: 'Veg',    perMeal: 20 },
    { plan: 'trial',           pref: 'NonVeg', perMeal: 20 },
]

export function PricingClient({ rows }: Props) {
    const { t } = useAdminTheme()
    const [showForm, setShowForm] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

    const hasDbPrices = rows.length > 0

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Pricing</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                {hasDbPrices
                    ? `${rows.length} DB-backed price entries`
                    : 'Prices currently live in code (plans.ts). Add DB entries to override.'}
            </p>

            {/* Code-defined prices (always shown as reference) */}
            <div className={`${t.card} rounded-xl p-4 mb-5`}>
                <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                    Code-Defined Prices (plans.ts)
                </h2>
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className={t.tableHeader}>
                                <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Preference</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Per Meal (AED)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CODE_PRICES.map(p => (
                                <tr key={`${p.plan}-${p.pref}`} className={t.tableRow}>
                                    <td className={`px-3 py-2 font-bold ${t.body}`}>{p.plan.replace(/-/g, ' ')}</td>
                                    <td className={`px-3 py-2 ${t.muted}`}>{p.pref}</td>
                                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${t.heading}`}>{p.perMeal.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="sm:hidden flex flex-col gap-1.5">
                    {CODE_PRICES.map(p => (
                        <div key={`${p.plan}-${p.pref}`} className="flex items-center justify-between py-1.5">
                            <span className={`text-[12px] font-bold ${t.body}`}>
                                {p.plan.replace(/-/g, ' ')} · {p.pref}
                            </span>
                            <span className={`text-[13px] font-black tabular-nums ${t.heading}`}>AED {p.perMeal}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* DB overrides */}
            {hasDbPrices && (
                <div className={`${t.card} rounded-xl p-4 mb-5`}>
                    <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                        DB Overrides (plan_pricing)
                    </h2>
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Preference</th>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Week</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Per Meal</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Effective</th>
                                    <th className="text-center px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const isCurrent = !r.effective_to || new Date(r.effective_to) > new Date()
                                    return (
                                        <tr key={r.id} className={t.tableRow}>
                                            <td className={`px-3 py-2 font-bold ${t.body}`}>{r.plan_id.replace(/-/g, ' ')}</td>
                                            <td className={`px-3 py-2 ${t.muted}`}>{r.preference}</td>
                                            <td className={`px-3 py-2 ${t.muted}`}>{r.week_type}</td>
                                            <td className={`px-3 py-2 text-right font-bold tabular-nums ${t.heading}`}>AED {Number(r.price_per_meal).toFixed(2)}</td>
                                            <td className={`px-3 py-2 text-right text-[11px] tabular-nums ${t.faint}`}>{r.effective_from}</td>
                                            <td className="px-3 py-2 text-center">
                                                <AdminBadge variant={isCurrent ? 'active' : 'ended'}>
                                                    {isCurrent ? 'Active' : 'Expired'}
                                                </AdminBadge>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="sm:hidden flex flex-col gap-2">
                        {rows.map(r => (
                            <div key={r.id} className="flex items-center justify-between py-1.5">
                                <div>
                                    <div className={`text-[12px] font-bold ${t.body}`}>{r.plan_id.replace(/-/g, ' ')} · {r.preference}</div>
                                    <div className={`text-[10px] ${t.faint}`}>From {r.effective_from}</div>
                                </div>
                                <span className={`text-[13px] font-black tabular-nums ${t.heading}`}>AED {Number(r.price_per_meal).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add new price */}
            {!showForm ? (
                <AdminButton variant="ghost" icon={<Plus size={13} />} onClick={() => setShowForm(true)}>
                    Add Price Override
                </AdminButton>
            ) : (
                <NewPriceForm onResult={r => { setResult(r); setShowForm(false) }} onCancel={() => setShowForm(false)} />
            )}

            {result && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-[12px] font-bold border ${
                    result.ok ? t.successBg : t.dangerBg
                } ${result.ok ? t.success : t.danger}`}>
                    {result.message}
                </div>
            )}
        </div>
    )
}

function NewPriceForm({ onResult, onCancel }: {
    onResult: (r: { ok: boolean; message: string }) => void
    onCancel: () => void
}) {
    const { t } = useAdminTheme()
    const [isPending, startTransition] = useTransition()

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
            const res = await createPricingRow(
                fd.get('plan_id') as string,
                fd.get('preference') as string,
                fd.get('week_type') as string,
                parseFloat(fd.get('price_per_meal') as string),
                fd.get('effective_from') as string,
            )
            onResult(res)
        })
    }

    const fieldCls = `w-full px-3 py-2 rounded-lg border text-[13px] font-medium ${t.input} ${t.inputFocus}`

    return (
        <form onSubmit={handleSubmit} className={`${t.card} rounded-xl p-4`}>
            <h3 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                New Price Override
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Plan</label>
                    <select name="plan_id" required className={fieldCls}>
                        <option value="monthly-max">Monthly Max</option>
                        <option value="monthly-premium">Monthly Premium</option>
                        <option value="weekly-flex">Weekly Flex</option>
                        <option value="trial">Trial</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Preference</label>
                    <select name="preference" required className={fieldCls}>
                        <option value="Veg">Veg</option>
                        <option value="NonVeg">Non-Veg</option>
                        <option value="Religious">Religious</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Week Type</label>
                    <select name="week_type" required className={fieldCls}>
                        <option value="6DAYS">6 Days</option>
                        <option value="5DAYS">5 Days</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Price Per Meal (AED)</label>
                    <input name="price_per_meal" type="number" step="0.01" min="0" required className={fieldCls} placeholder="17.50" />
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Effective From</label>
                    <input name="effective_from" type="date" required className={fieldCls} defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
            </div>
            <div className="flex gap-2">
                <AdminButton type="submit" loading={isPending}>Save</AdminButton>
                <AdminButton variant="ghost" type="button" onClick={onCancel}>Cancel</AdminButton>
            </div>
        </form>
    )
}
