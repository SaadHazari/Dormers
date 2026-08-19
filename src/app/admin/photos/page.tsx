import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { PhotosClient, type ChainDay } from './PhotosClient'

export const metadata = { title: 'Delivery Photos — Dormers Admin' }
export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_S = 60 * 60 // 1h — page is short-lived, links shouldn't be shareable for a week

function todayAeIso(): string {
    return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface DayEventRow {
    event_type: string
    veg_count: number | null
    nonveg_count: number | null
    expected_veg_count: number | null
    expected_nonveg_count: number | null
    dorm_counts: Record<string, number> | null
    expected_dorm_counts: Record<string, number> | null
    total_count: number | null
    gemini_count: number | null
    photo_path: string | null
    matched: boolean | null
    mismatch_details: string | null
    confirmed_at: string | null
    photo_paths: string[] | null
    attempts: number | null
    accepted: boolean | null
}

interface DeliveryRow {
    dorm_name: string
    expected_count: number | null
    rider_count: number | null
    gemini_count: number | null
    verified: boolean | null
    photo_path: string | null
    photo_paths: string[] | null
    delivered_at: string | null
    escalated_at: string | null
    verify_attempts: number | null
    confirmed_at: string | null
}

export default async function PhotosPage({
    searchParams,
}: {
    searchParams: Promise<{ date?: string }>
}) {
    const { date } = await searchParams
    const dateIso = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayAeIso()

    // Photos older than 31 days are archived out of the working set — the
    // page only serves the last month (see /api/internal/archive-ops-photos).
    const cutoffIso = new Date(Date.now() + 4 * 60 * 60 * 1000 - 31 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
    if (dateIso < cutoffIso) {
        return <PhotosClient day={{ dateIso, packing: null, pickup: null, deliveries: [] }} archived cutoffIso={cutoffIso} />
    }

    const sb = createAdminSupabaseClient()

    const [dayEventsRes, deliveriesRes] = await Promise.all([
        sb.from('ops_day_events')
            .select('event_type, veg_count, nonveg_count, expected_veg_count, expected_nonveg_count, dorm_counts, expected_dorm_counts, total_count, gemini_count, photo_path, matched, mismatch_details, confirmed_at, photo_paths, attempts, accepted')
            .eq('event_date', dateIso),
        sb.from('delivery_events')
            .select('dorm_name, expected_count, rider_count, gemini_count, verified, photo_path, photo_paths, delivered_at, escalated_at, verify_attempts, confirmed_at')
            .eq('delivery_date', dateIso)
            .eq('trip_number', 1)
            .order('dorm_name'),
    ])

    const dayEvents = (dayEventsRes.data ?? []) as DayEventRow[]
    const deliveries = (deliveriesRes.data ?? []) as DeliveryRow[]

    // Sign every photo path in one pass. Drop-offs can carry two attempts —
    // both are kept so a disputed count can be judged on the full evidence,
    // not just whichever photo happened to come last.
    const paths = Array.from(new Set([
        ...dayEvents.flatMap(e => e.photo_paths?.length ? e.photo_paths : [e.photo_path]),
        ...deliveries.flatMap(d => d.photo_paths?.length ? d.photo_paths : [d.photo_path]),
    ].filter((p): p is string => !!p)))

    const urlMap = new Map<string, string>()
    if (paths.length > 0) {
        const { data: signed } = await sb.storage
            .from('delivery-photos')
            .createSignedUrls(paths, SIGNED_URL_TTL_S)
        for (const s of signed ?? []) {
            if (s.signedUrl && s.path) urlMap.set(s.path, s.signedUrl)
        }
    }

    const timeLabel = (iso: string | null) => {
        if (!iso) return null
        const ae = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000)
        return `${String(ae.getUTCHours()).padStart(2, '0')}:${String(ae.getUTCMinutes()).padStart(2, '0')}`
    }

    const packingRow = dayEvents.find(e => e.event_type === 'kitchen_packing') ?? null
    const pickupRow = dayEvents.find(e => e.event_type === 'rider_pickup') ?? null

    const day: ChainDay = {
        dateIso,
        packing: packingRow
            ? {
                photoUrl: packingRow.photo_path ? urlMap.get(packingRow.photo_path) ?? null : null,
                vegCount: packingRow.veg_count,
                nonvegCount: packingRow.nonveg_count,
                expectedVegCount: packingRow.expected_veg_count,
                expectedNonvegCount: packingRow.expected_nonveg_count,
                dormCounts: packingRow.dorm_counts ?? {},
                expectedDormCounts: packingRow.expected_dorm_counts ?? {},
                geminiCount: packingRow.gemini_count,
                matched: packingRow.matched,
                mismatchDetails: packingRow.mismatch_details,
                timeLabel: timeLabel(packingRow.confirmed_at),
            }
            : null,
        pickup: pickupRow
            ? {
                photoUrl: pickupRow.photo_path ? urlMap.get(pickupRow.photo_path) ?? null : null,
                photoUrls: (pickupRow.photo_paths?.length
                    ? pickupRow.photo_paths
                    : pickupRow.photo_path ? [pickupRow.photo_path] : []
                ).map(p => urlMap.get(p) ?? null).filter((u): u is string => !!u),
                attempts: pickupRow.attempts ?? 0,
                accepted: pickupRow.accepted !== false,
                expectedTotal: pickupRow.total_count,
                geminiCount: pickupRow.gemini_count,
                matched: pickupRow.matched,
                mismatchDetails: pickupRow.mismatch_details,
                timeLabel: timeLabel(pickupRow.confirmed_at),
            }
            : null,
        deliveries: deliveries.map(d => {
            const attemptPaths = d.photo_paths?.length
                ? d.photo_paths
                : d.photo_path ? [d.photo_path] : []
            return {
                dormName: d.dorm_name,
                photoUrl: attemptPaths.length ? urlMap.get(attemptPaths[0]) ?? null : null,
                photoUrls: attemptPaths
                    .map(p => urlMap.get(p) ?? null)
                    .filter((u): u is string => !!u),
                expectedCount: d.expected_count,
                riderCount: d.rider_count,
                geminiCount: d.gemini_count,
                verified: d.verified === true,
                delivered: d.delivered_at !== null || d.verified === true,
                escalated: d.escalated_at !== null && d.verified !== true,
                attempts: d.verify_attempts ?? 0,
                timeLabel: timeLabel(d.confirmed_at),
            }
        }),
    }

    return <PhotosClient day={day} cutoffIso={cutoffIso} />
}
