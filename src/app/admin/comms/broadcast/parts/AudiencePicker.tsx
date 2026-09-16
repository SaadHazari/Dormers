'use client'

import { Users } from 'lucide-react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'
import { AdminSwitch } from '../../../_components/AdminSwitch'
import type { AudienceCount } from '../actions'
import { AUDIENCES, type AudienceKey } from './audiences'

const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * Step 1: who.
 *
 * Each audience is a card carrying its own headcount, so the choice is made by
 * number. The consent switch lives HERE and not in a confirmation dialog: on
 * WhatsApp, "include people who never opted in" changes who the audience is,
 * and it used to sit behind a button that stayed disabled precisely because
 * the switch was off.
 */
export function AudiencePicker({
    channel, selected, onSelect, counts, loading, includeUnknown, onIncludeUnknown,
    dorms, dormName, onDorm,
}: {
    channel: 'email' | 'whatsapp'
    selected: AudienceKey
    onSelect: (k: AudienceKey) => void
    counts: Record<string, AudienceCount>
    loading: boolean
    includeUnknown: boolean
    onIncludeUnknown: (v: boolean) => void
    dorms: string[]
    dormName: string
    onDorm: (d: string) => void
}) {
    const { t } = useAdminTheme()
    const whatsapp = channel === 'whatsapp'
    const current = counts[selected]
    const gain = current ? current.all - current.optedIn : 0

    return (
        <div className="flex flex-col gap-6">
            {whatsapp && (
                <div
                    className={`flex items-start gap-4 rounded-xl border px-4 py-4 transition-colors ${
                        includeUnknown ? t.accentBg : t.border
                    }`}
                >
                    <div className="pt-0.5">
                        <AdminSwitch
                            checked={includeUnknown}
                            onChange={onIncludeUnknown}
                            label="Include people who never opted in"
                        />
                    </div>
                    <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] font-bold ${t.heading}`}>
                            Include people who never opted in
                        </span>
                        <span className={`block text-[13px] font-medium mt-1 leading-relaxed ${t.muted}`}>
                            They gave you their number for orders, not for news. Almost everyone in your
                            book is in this group, so without this most audiences are empty. Anyone who
                            replied STOP, or who you marked “Don’t message”, is never included.
                        </span>
                    </span>
                    {/* The signature: what the switch is worth, as a number. */}
                    {!loading && gain > 0 && (
                        <span className={`shrink-0 text-right ${includeUnknown ? t.accent : t.muted}`}>
                            <span className="block text-[20px] font-black tabular-nums leading-none">
                                +{fmt(gain)}
                            </span>
                            <span className="block text-[11px] font-bold mt-1">people</span>
                        </span>
                    )}
                </div>
            )}

            <Group title="Your whole contact book" columns={4}>
                {AUDIENCES.filter(a => a.group === 'book').map(a => (
                    <AudienceCard
                        key={a.key}
                        def={a}
                        count={counts[a.key]}
                        loading={loading}
                        active={selected === a.key}
                        whatsapp={whatsapp}
                        includeUnknown={includeUnknown}
                        onClick={() => onSelect(a.key)}
                    />
                ))}
            </Group>

            <Group title="People you’ve served" columns={3}>
                {AUDIENCES.filter(a => a.group === 'people').map(a => (
                    <AudienceCard
                        key={a.key}
                        def={a}
                        count={counts[a.key]}
                        loading={loading}
                        active={selected === a.key}
                        whatsapp={whatsapp}
                        includeUnknown={includeUnknown}
                        onClick={() => onSelect(a.key)}
                    />
                ))}
            </Group>

            {selected === 'dorm' && (
                <label className="flex flex-col gap-2 max-w-sm">
                    <span className={`text-[12px] font-bold ${t.muted}`}>Which dorm?</span>
                    <select
                        value={dormName}
                        onChange={e => onDorm(e.target.value)}
                        className={`rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${t.input} ${t.inputFocus}`}
                    >
                        {dorms.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
            )}
        </div>
    )
}

function Group({ title, columns, children }: { title: string; columns: 3 | 4; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    // Column count matches the card count, so no group ends on an orphan.
    const lg = columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
    return (
        <div>
            <h3 className={`text-[11px] font-black uppercase tracking-[0.12em] mb-3 ${t.faint}`}>{title}</h3>
            <div className={`grid gap-2.5 grid-cols-1 sm:grid-cols-2 ${lg}`}>{children}</div>
        </div>
    )
}

function AudienceCard({
    def, count, loading, active, whatsapp, includeUnknown, onClick,
}: {
    def: (typeof AUDIENCES)[number]
    count: AudienceCount | undefined
    loading: boolean
    active: boolean
    whatsapp: boolean
    includeUnknown: boolean
    onClick: () => void
}) {
    const { t } = useAdminTheme()
    const n = count?.count ?? 0
    const empty = !loading && count !== undefined && n === 0
    // Worth saying on an empty WhatsApp card: the people are there, the switch is off.
    const hidden = whatsapp && !includeUnknown && count ? count.all - count.optedIn : 0

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`group text-left rounded-xl border px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20] ${
                active ? t.cardActive : `${t.border} ${t.cardHover}`
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className={`text-[14px] font-bold ${active ? t.accent : t.heading}`}>{def.label}</div>
                    <div className={`text-[12px] font-medium mt-0.5 ${t.muted}`}>{def.hint}</div>
                </div>
                {def.key === 'dorm' ? (
                    <Users size={18} strokeWidth={2} className={`shrink-0 mt-0.5 ${t.faint}`} />
                ) : (
                    <div className={`shrink-0 tabular-nums leading-none ${
                        empty
                            ? `text-[15px] font-bold pt-1 ${t.faint}`
                            : `text-[22px] font-black ${loading ? t.faint : active ? t.accent : t.heading}`
                    }`}>
                        {loading || count === undefined ? '…' : fmt(n)}
                    </div>
                )}
            </div>
            {empty && hidden > 0 && (
                <div className={`text-[12px] font-bold mt-2 ${t.warning}`}>
                    {fmt(hidden)} here if you include everyone
                </div>
            )}
        </button>
    )
}
