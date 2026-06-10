'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminBadge } from '../_components/AdminBadge'
import { createPricingRow, endPricingRow } from './actions'

export interface PricingRow {
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

/** One Veg/NonVeg line of the effective price table (server-derived). */
export interface EffectiveRow {
    plan: string
    pref: 'Veg' | 'NonVeg'
    codeDefault: number
    effective: number
}

/** Religious-mix prices for one plan, per veg-day count (server-derived). */
export interface ReligiousPlanRow {
    plan: string
    /** Trial — single flat price, count column is meaningless. */
    flat: boolean
    cells: Array<{ count: number; codeDefault: number; effective: number }>
}

interface Props {
    rows: PricingRow[]
    effective: EffectiveRow[]
    religious: ReligiousPlanRow[]
}

// Today in Asia/Dubai — effective_to is EXCLUSIVE: a row ending today is
// already retired. Mirrors fetchActivePriceOverrides / the checkout band.
function todayAE(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function rowStatus(r: PricingRow): 'active' | 'scheduled' | 'expired' {
    const today = todayAE()
    if (r.effective_to && r.effective_to <= today) return 'expired'
    if (r.effective_from > today) return 'scheduled'
    return 'active'
}

export function PricingClient({ rows, effective, religious }: Props) {
    const { t } = useAdminTheme()
    const [showForm, setShowForm] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
    const [isEnding, startEnding] = useTransition()
    const [endingId, setEndingId] = useState<string | null>(null)

    const handleEnd = (row: PricingRow) => {
        if (!window.confirm(`End this override now? ${row.plan_id} ${row.preference} reverts to its code-default price immediately.`)) return
        setEndingId(row.id)
        startEnding(async () => {
            const res = await endPricingRow(row.id)
            setResult(res)
            setEndingId(null)
        })
    }

    const overriddenCount = effective.filter(e => e.effective !== e.codeDefault).length
        + religious.reduce((n, r) => n + r.cells.filter(c => c.effective !== c.codeDefault).length, 0)

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Pricing</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                These are the prices customers see and pay right now — code defaults overlaid with your DB overrides.
                {overriddenCount > 0 ? ` ${overriddenCount} price${overriddenCount === 1 ? '' : 's'} currently overridden.` : ' No overrides active — all prices are code defaults.'}
            </p>

            {/* Effective prices — Veg / Non-Veg */}
            <div className={`${t.card} rounded-xl p-4 mb-5`}>
                <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                    Effective Prices — Veg / Non-Veg (AED per meal)
                </h2>
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className={t.tableHeader}>
                                <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Preference</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Code Default</th>
                                <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Effective Now</th>
                                <th className="text-center px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {effective.map(e => {
                                const overridden = e.effective !== e.codeDefault
                                return (
                                    <tr key={`${e.plan}-${e.pref}`} className={t.tableRow}>
                                        <td className={`px-3 py-2 font-bold ${t.body}`}>{e.plan.replace(/-/g, ' ')}</td>
                                        <td className={`px-3 py-2 ${t.muted}`}>{e.pref === 'NonVeg' ? 'Non-Veg' : 'Veg'}</td>
                                        <td className={`px-3 py-2 text-right tabular-nums ${overridden ? `line-through ${t.faint}` : `font-bold ${t.heading}`}`}>
                                            {e.codeDefault.toFixed(2)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-black tabular-nums ${overridden ? 'text-[#f57f20]' : t.heading}`}>
                                            {e.effective.toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <AdminBadge variant={overridden ? 'active' : 'ended'}>
                                                {overridden ? 'DB Override' : 'Code'}
                                            </AdminBadge>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="sm:hidden flex flex-col gap-1.5">
                    {effective.map(e => {
                        const overridden = e.effective !== e.codeDefault
                        return (
                            <div key={`${e.plan}-${e.pref}`} className="flex items-center justify-between py-1.5">
                                <span className={`text-[12px] font-bold ${t.body}`}>
                                    {e.plan.replace(/-/g, ' ')} · {e.pref === 'NonVeg' ? 'Non-Veg' : 'Veg'}
                                </span>
                                <span className={`text-[13px] font-black tabular-nums ${overridden ? 'text-[#f57f20]' : t.heading}`}>
                                    {overridden && <span className={`mr-2 line-through font-medium ${t.faint}`}>{e.codeDefault.toFixed(2)}</span>}
                                    AED {e.effective.toFixed(2)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Effective prices — Religious mix */}
            <div className={`${t.card} rounded-xl p-4 mb-5`}>
                <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-1 ${t.muted}`}>
                    Effective Prices — Religious Mix (AED per meal, by veg days/week)
                </h2>
                <p className={`text-[11px] mb-3 ${t.faint}`}>
                    6-day week shown; 5-day customers use columns 1–4 of the same table. Trial is one flat price. Orange = DB override.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className={t.tableHeader}>
                                <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <th key={n} className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">{n} veg</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {religious.map(r => (
                                <tr key={r.plan} className={t.tableRow}>
                                    <td className={`px-3 py-2 font-bold ${t.body}`}>{r.plan.replace(/-/g, ' ')}</td>
                                    {r.flat ? (
                                        <td colSpan={5} className={`px-3 py-2 text-right tabular-nums ${r.cells[0].effective !== r.cells[0].codeDefault ? 'font-black text-[#f57f20]' : `font-bold ${t.heading}`}`}>
                                            {r.cells[0].effective.toFixed(2)} <span className={`font-medium ${t.faint}`}>(flat, any mix)</span>
                                        </td>
                                    ) : (
                                        r.cells.map(c => {
                                            const overridden = c.effective !== c.codeDefault
                                            return (
                                                <td key={c.count} className={`px-3 py-2 text-right tabular-nums ${overridden ? 'font-black text-[#f57f20]' : `font-bold ${t.heading}`}`}>
                                                    {c.effective.toFixed(2)}
                                                </td>
                                            )
                                        })
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DB override rows — full history with status + end action */}
            {rows.length > 0 && (
                <div className={`${t.card} rounded-xl p-4 mb-5`}>
                    <h2 className={`text-[10px] font-black tracking-[0.14em] uppercase mb-3 ${t.muted}`}>
                        DB Overrides (plan_pricing)
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className={t.tableHeader}>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Plan</th>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Preference</th>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Week</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Per Meal</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">From</th>
                                    <th className="text-center px-3 py-2 text-[10px] font-bold tracking-[0.06em] uppercase">Status</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const status = rowStatus(r)
                                    return (
                                        <tr key={r.id} className={t.tableRow}>
                                            <td className={`px-3 py-2 font-bold ${t.body}`}>{r.plan_id.replace(/-/g, ' ')}</td>
                                            <td className={`px-3 py-2 ${t.muted}`}>
                                                {r.preference === 'NonVeg' ? 'Non-Veg' : r.preference}
                                                {r.preference === 'Religious' && (
                                                    <span className={t.faint}> · {r.veg_day_count == null ? 'all counts' : `${r.veg_day_count} veg`}</span>
                                                )}
                                            </td>
                                            <td className={`px-3 py-2 ${t.muted}`}>{r.week_type}</td>
                                            <td className={`px-3 py-2 text-right font-bold tabular-nums ${t.heading}`}>AED {Number(r.price_per_meal).toFixed(2)}</td>
                                            <td className={`px-3 py-2 text-right text-[11px] tabular-nums ${t.faint}`}>
                                                {r.effective_from}{r.effective_to ? ` → ${r.effective_to}` : ''}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <AdminBadge variant={status === 'expired' ? 'ended' : 'active'}>
                                                    {status === 'active' ? 'Active' : status === 'scheduled' ? 'Scheduled' : 'Expired'}
                                                </AdminBadge>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {status !== 'expired' && (
                                                    <AdminButton
                                                        variant="ghost"
                                                        loading={isEnding && endingId === r.id}
                                                        onClick={() => handleEnd(r)}
                                                    >
                                                        End
                                                    </AdminButton>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
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
    const [preference, setPreference] = useState('Veg')

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const vegDayRaw = fd.get('veg_day_count') as string | null
        startTransition(async () => {
            const res = await createPricingRow(
                fd.get('plan_id') as string,
                fd.get('preference') as string,
                fd.get('week_type') as string,
                parseFloat(fd.get('price_per_meal') as string),
                fd.get('effective_from') as string,
                vegDayRaw && vegDayRaw !== '' ? parseInt(vegDayRaw, 10) : null,
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
                    <select name="preference" required className={fieldCls} value={preference} onChange={e => setPreference(e.target.value)}>
                        <option value="Veg">Veg</option>
                        <option value="NonVeg">Non-Veg</option>
                        <option value="Religious">Religious</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Week Type</label>
                    <select name="week_type" required className={fieldCls}>
                        <option value="6DAYS">6 Days (default for everyone)</option>
                        <option value="5DAYS">5 Days only</option>
                    </select>
                </div>
                {preference === 'Religious' && (
                    <div>
                        <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Veg Days / Week</label>
                        <select name="veg_day_count" className={fieldCls} defaultValue="">
                            <option value="">All counts (flat price)</option>
                            {[1, 2, 3, 4, 5].map(n => (
                                <option key={n} value={n}>{n} veg day{n === 1 ? '' : 's'}</option>
                            ))}
                        </select>
                    </div>
                )}
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Price Per Meal (AED)</label>
                    <input name="price_per_meal" type="number" step="0.01" min="0" required className={fieldCls} placeholder="17.50" />
                </div>
                <div>
                    <label className={`block text-[10px] font-bold tracking-[0.08em] uppercase mb-1 ${t.faint}`}>Effective From</label>
                    <input name="effective_from" type="date" required className={fieldCls} defaultValue={todayAE()} />
                </div>
            </div>
            <p className={`text-[11px] mb-3 ${t.faint}`}>
                Takes effect on the plan page, checkout, and server-side price validation the moment it&apos;s active — a 6-day row prices everyone unless a 5-day row exists.
            </p>
            <div className="flex gap-2">
                <AdminButton type="submit" loading={isPending}>Save</AdminButton>
                <AdminButton variant="ghost" type="button" onClick={onCancel}>Cancel</AdminButton>
            </div>
        </form>
    )
}
