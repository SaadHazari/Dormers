'use client'

// Chain-of-custody photo wall: kitchen packing → rider pickup → per-dorm
// drop-offs for one delivery day. One glance answers "where did the box go
// missing?" — every stage shows its photo, its counts, and a match badge.

import { useRouter } from 'next/navigation'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminCard } from '../_components/AdminCard'
import { ChevronLeft, ChevronRight, Camera, CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react'

export interface PackingSummary {
    photoUrl: string | null
    vegCount: number | null
    nonvegCount: number | null
    expectedVegCount: number | null
    expectedNonvegCount: number | null
    dormCounts: Record<string, number>
    expectedDormCounts: Record<string, number>
    geminiCount: number | null
    matched: boolean | null
    mismatchDetails: string | null
    timeLabel: string | null
}

export interface PickupSummary {
    photoUrl: string | null
    expectedTotal: number | null
    geminiCount: number | null
    matched: boolean | null
    mismatchDetails: string | null
    timeLabel: string | null
}

export interface DeliverySummary {
    dormName: string
    photoUrl: string | null
    /** Every attempt photo, oldest first. Two means the count was disputed once. */
    photoUrls: string[]
    expectedCount: number | null
    riderCount: number | null
    geminiCount: number | null
    /** Counts agreed. Audit fact. */
    verified: boolean
    /** Food recorded as arrived. This is what sent the customer WhatsApps. */
    delivered: boolean
    /** Flagged to you and still unresolved. */
    escalated: boolean
    attempts: number
    timeLabel: string | null
}

export interface ChainDay {
    dateIso: string
    packing: PackingSummary | null
    pickup: PickupSummary | null
    deliveries: DeliverySummary[]
}

function shiftDate(dateIso: string, days: number): string {
    const d = new Date(dateIso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

function MatchBadge({ ok, label }: { ok: boolean | null; label?: string }) {
    if (ok === true) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-semibold text-emerald-600">
                <CheckCircle2 size={13} /> {label ?? 'Matched'}
            </span>
        )
    }
    if (ok === false) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[12px] font-semibold text-red-500">
                <AlertTriangle size={13} /> {label ?? 'Mismatch'}
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2.5 py-1 text-[12px] font-semibold text-slate-500">
            <CircleDashed size={13} /> {label ?? 'Pending'}
        </span>
    )
}

function Photo({ url, alt, tall = false }: { url: string | null; alt: string; tall?: boolean }) {
    const { t } = useAdminTheme()
    if (!url) {
        return (
            <div className={`flex ${tall ? 'h-48' : 'h-36'} w-full items-center justify-center rounded-lg border border-dashed ${t.border} ${t.muted}`}>
                <div className="flex flex-col items-center gap-1 text-[12px]">
                    <Camera size={18} />
                    No photo
                </div>
            </div>
        )
    }
    return (
        <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived, next/image can't optimize them */}
            <img src={url} alt={alt} className={`${tall ? 'h-48' : 'h-36'} w-full rounded-lg object-cover`} />
        </a>
    )
}

function CountRow({ label, value, expected }: { label: string; value: number | null; expected?: number | null }) {
    const { t } = useAdminTheme()
    const mismatch = value !== null && expected !== null && expected !== undefined && value !== expected
    return (
        <div className="flex items-center justify-between text-[13px]">
            <span className={t.muted}>{label}</span>
            <span className={`font-semibold ${mismatch ? 'text-red-500' : t.heading}`}>
                {value ?? '—'}
                {expected !== undefined && expected !== null && (
                    <span className={`ml-1 font-normal ${t.muted}`}>/ {expected} expected</span>
                )}
            </span>
        </div>
    )
}

export function PhotosClient({ day, archived = false, cutoffIso }: { day: ChainDay; archived?: boolean; cutoffIso?: string }) {
    const { t } = useAdminTheme()
    const router = useRouter()
    const { packing, pickup, deliveries } = day

    const dateLabel = new Date(day.dateIso + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    })

    const go = (iso: string) => router.push(`/admin/photos?date=${iso}`)

    // Per-dorm packing rows, sorted worst-first so mismatches surface
    const packingDorms = packing
        ? Object.entries({ ...packing.expectedDormCounts, ...packing.dormCounts })
            .filter(([name]) => name !== 'Other')
            .map(([name]) => ({
                name,
                entered: packing.dormCounts[name] ?? null,
                expected: packing.expectedDormCounts[name] ?? 0,
            }))
            .sort((a, b) => Number((b.entered ?? 0) !== b.expected) - Number((a.entered ?? 0) !== a.expected) || a.name.localeCompare(b.name))
        : []

    return (
        <div className="mx-auto max-w-5xl">
            {/* ── Header + day nav ─────────────────────────────────────────── */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className={`text-[22px] font-extrabold tracking-tight ${t.heading}`}>Delivery Photos</h1>
                    <p className={`text-[13px] ${t.muted}`}>Kitchen to pickup to every dorm, one day at a time.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => go(shiftDate(day.dateIso, -1))} className={`rounded-lg border p-2 ${t.border} ${t.heading}`} aria-label="Previous day">
                        <ChevronLeft size={16} />
                    </button>
                    <input
                        type="date"
                        value={day.dateIso}
                        min={cutoffIso}
                        onChange={e => e.target.value && go(e.target.value)}
                        className={`rounded-lg border px-3 py-2 text-[13px] font-semibold ${t.border} ${t.heading} bg-transparent`}
                    />
                    <button onClick={() => go(shiftDate(day.dateIso, 1))} className={`rounded-lg border p-2 ${t.border} ${t.heading}`} aria-label="Next day">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <p className={`mb-4 text-[13px] font-semibold ${t.muted}`}>{dateLabel}</p>

            {archived && (
                <AdminCard>
                    <p className={`text-[14px] font-semibold ${t.heading}`}>This day is archived.</p>
                    <p className={`mt-1 text-[13px] ${t.muted}`}>
                        Photos older than a month move out of this page automatically. They are kept in storage under the archive folder, not deleted.
                        {cutoffIso && ` The oldest day you can view here is ${cutoffIso}.`}
                    </p>
                </AdminCard>
            )}

            {!archived && (<>
            <div className="grid gap-4 lg:grid-cols-2">
                {/* ── 1. Kitchen packing ───────────────────────────────────── */}
                <AdminCard>
                    <div className="mb-3 flex items-center justify-between">
                        <div className={`text-[15px] font-bold ${t.heading}`}>1. Kitchen packing</div>
                        {packing
                            ? <MatchBadge ok={packing.matched} />
                            : <MatchBadge ok={null} label="Not done" />}
                    </div>
                    {packing ? (
                        <div className="space-y-3">
                            <Photo url={packing.photoUrl} alt="Kitchen packing" />
                            <CountRow label="Veg" value={packing.vegCount} expected={packing.expectedVegCount} />
                            <CountRow label="Non-veg" value={packing.nonvegCount} expected={packing.expectedNonvegCount} />
                            <CountRow label="AI count from photo" value={packing.geminiCount} />
                            {packingDorms.length > 0 && (
                                <div className={`rounded-lg border p-3 ${t.border}`}>
                                    <div className={`mb-2 text-[12px] font-bold uppercase tracking-wide ${t.muted}`}>By dorm</div>
                                    <div className="space-y-1.5">
                                        {packingDorms.map(d => (
                                            <CountRow key={d.name} label={d.name} value={d.entered} expected={d.expected} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {packing.timeLabel && <p className={`text-[12px] ${t.muted}`}>Checked at {packing.timeLabel}</p>}
                        </div>
                    ) : (
                        <p className={`text-[13px] ${t.muted}`}>The kitchen hasn’t done the packing check for this day.</p>
                    )}
                </AdminCard>

                {/* ── 2. Rider pickup ──────────────────────────────────────── */}
                <AdminCard>
                    <div className="mb-3 flex items-center justify-between">
                        <div className={`text-[15px] font-bold ${t.heading}`}>2. Rider pickup</div>
                        {pickup
                            ? <MatchBadge ok={pickup.matched} label={pickup.matched === false ? 'Flagged' : undefined} />
                            : <MatchBadge ok={null} label="Not done" />}
                    </div>
                    {pickup ? (
                        <div className="space-y-3">
                            <Photo url={pickup.photoUrl} alt="Rider pickup" tall />
                            <CountRow label="System expects" value={pickup.expectedTotal} />
                            <CountRow label="AI count from photo" value={pickup.geminiCount} />
                            {pickup.mismatchDetails && (
                                <p className="text-[13px] font-medium text-red-500">{pickup.mismatchDetails}</p>
                            )}
                            {pickup.timeLabel && <p className={`text-[12px] ${t.muted}`}>Picked up at {pickup.timeLabel}</p>}
                        </div>
                    ) : (
                        <p className={`text-[13px] ${t.muted}`}>No pickup confirmed for this day.</p>
                    )}
                </AdminCard>
            </div>

            {/* ── 3. Dorm deliveries ───────────────────────────────────────── */}
            <div className="mt-6">
                <div className={`mb-3 text-[15px] font-bold ${t.heading}`}>3. Dorm deliveries</div>
                {deliveries.length === 0 ? (
                    <AdminCard>
                        <p className={`text-[13px] ${t.muted}`}>No delivery records for this day.</p>
                    </AdminCard>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {deliveries.map(d => (
                            <AdminCard key={d.dormName}>
                                <div className="mb-2 flex items-center justify-between">
                                    <div className={`text-[14px] font-bold ${t.heading}`}>{d.dormName}</div>
                                    <MatchBadge
                                        ok={d.verified ? true : d.escalated ? false : d.delivered ? null : null}
                                        label={d.verified ? 'Verified' : d.escalated ? 'Count open' : d.delivered ? 'Delivered' : 'Pending'}
                                    />
                                </div>
                                <div className="space-y-2">
                                    {d.photoUrls.length > 1 ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {d.photoUrls.map((url, i) => (
                                                <div key={url} className="space-y-1">
                                                    <Photo url={url} alt={`Delivery at ${d.dormName}, photo ${i + 1}`} />
                                                    <p className={`text-[11px] ${t.muted}`}>Photo {i + 1}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Photo url={d.photoUrl} alt={`Delivery at ${d.dormName}`} />
                                    )}
                                    <CountRow label="Expected" value={d.expectedCount} />
                                    <CountRow label="Rider" value={d.riderCount} expected={d.expectedCount} />
                                    <CountRow label="AI" value={d.geminiCount} expected={d.expectedCount} />
                                    {/* The two facts read separately on purpose: a dorm can be fed
                                        and still have an open count, and that is not a failure. */}
                                    {d.delivered && !d.verified && (
                                        <p className={`text-[12px] ${t.muted}`}>
                                            Customers were told their food arrived.
                                            {d.escalated ? ' The count is still yours to settle.' : ' Counts were never checked.'}
                                        </p>
                                    )}
                                    {!d.delivered && d.riderCount !== null && (
                                        <p className={`text-[12px] ${t.muted}`}>Photo taken, drop-off not recorded yet.</p>
                                    )}
                                    {d.timeLabel && <p className={`text-[12px] ${t.muted}`}>Updated {d.timeLabel}</p>}
                                </div>
                            </AdminCard>
                        ))}
                    </div>
                )}
            </div>
            </>)}
        </div>
    )
}
