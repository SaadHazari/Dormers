import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { SeasonClient } from './SeasonClient'

export const metadata = { title: 'Season — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface IntakeSettingsRow {
    paused: boolean
    headline: string
    body: string
    creditNonvegAed: number
    creditVegAed: number
    creditReligiousAed: number
    pausedAt: string | null
    pausedBy: string | null
    pauseScheduledFor: string | null
    reopenTarget: number | null
}

// intake_settings singleton row shape as it actually comes back from
// PostgREST — numeric columns arrive as strings, so every numeric field
// below gets coerced with Number() before it reaches the client component.
interface RawRow {
    paused: boolean
    headline: string
    body: string
    credit_nonveg_aed: number | string
    credit_veg_aed: number | string
    credit_religious_aed: number | string
    paused_at: string | null
    paused_by: string | null
    pause_scheduled_for: string | null
    reopen_target: number | string | null
}

/** One person on the current cycle's early-access list, as the Season page
 *  renders them. Everything here is already in the admin's reach elsewhere
 *  (Customers, Credits); the point of gathering it on one row is that the
 *  restart decision is made from THIS list, not from five tabs. */
export interface WaitlistMember {
    id: string
    name: string
    dormName: string | null
    mealPreference: string | null
    whatsapp: string | null
    email: string | null
    joinedAt: string
    /** Actual minted credit for this waitlist row, or null when the mint never
     *  landed (joinIntakeWaitlist treats a failed mint as non-fatal — the spot
     *  is saved either way). A null here is a real reconciliation task, so the
     *  page marks it rather than printing a comfortable zero. */
    creditAed: number | null
    /** Set once a season-reopen broadcast has actually reached this person. */
    notifiedAt: string | null
}

export default async function SeasonPage() {
    // Deliberately its own query, not getIntakeState() — that reader caches
    // for 30s so an admin who just flipped the switch would see their own
    // change fail to appear here for up to half a minute. The admin page
    // must always show the row exactly as it is right now.
    const sb = createAdminSupabaseClient()

    const settingsRes = await sb
        .from('intake_settings')
        .select('paused, headline, body, credit_nonveg_aed, credit_veg_aed, credit_religious_aed, paused_at, paused_by, pause_scheduled_for, cycle_started_at, reopen_target')
        .maybeSingle()

    const row = settingsRes.data as (RawRow & { cycle_started_at: string | null }) | null
    const cycleStartedAt = row?.cycle_started_at ?? null

    const settings: IntakeSettingsRow = {
        paused: row?.paused === true,
        headline: row?.headline ?? '',
        body: row?.body ?? '',
        creditNonvegAed: Number(row?.credit_nonveg_aed ?? 20),
        creditVegAed: Number(row?.credit_veg_aed ?? 15),
        creditReligiousAed: Number(row?.credit_religious_aed ?? 20),
        pausedAt: row?.paused_at ?? null,
        pausedBy: row?.paused_by ?? null,
        pauseScheduledFor: row?.pause_scheduled_for ?? null,
        reopenTarget: row?.reopen_target == null ? null : Number(row.reopen_target),
    }

    // Journeys that already run past the scheduled last delivery day. The
    // taper only stops NEW sales, so these are the customers who were
    // already on the books when the date was set — they ride to completion,
    // and the owner deserves to know how many are in that tail. Only worth a
    // round trip when a date is actually scheduled.
    let overhangCount = 0
    if (settings.pauseScheduledFor) {
        const { count } = await sb
            .from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .gt('end_date', settings.pauseScheduledFor)
            .in('status', ['Active', 'Paused', 'Skipped', 'Scheduled'])
        overhangCount = count ?? 0
    }

    // The early-access list for the CURRENT cycle only.
    //
    // The old KPI counted every intake_waitlist row ever written, across all
    // pauses. That number answers a question nobody asks and disagrees with
    // what a broadcast would actually reach: broadcast_audience's
    // 'early_access' and 'reopen' arms both filter on
    // cycle_started_at = intake_settings.cycle_started_at. So the page could
    // read 12 while a send went to 3. Scoping here makes the number on screen
    // the number of people a reopen message will land on.
    const members = await fetchWaitlistMembers(sb, cycleStartedAt)

    return (
        <SeasonClient
            settings={settings}
            members={members}
            overhangCount={overhangCount}
        />
    )
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

async function fetchWaitlistMembers(
    sb: AdminClient,
    cycleStartedAt: string | null,
): Promise<WaitlistMember[]> {
    // No cycle epoch means intake has never been paused, so nobody can have
    // joined — resolveJoinCycle refuses the join outright in that state.
    if (!cycleStartedAt) return []

    const { data: rows, error } = await sb
        .from('intake_waitlist')
        .select('id, joined_at, notified_at, customers!intake_waitlist_customer_id_fkey(name, dorm_name, meal_preference_type, whatsapp_number, email)')
        .eq('cycle_started_at', cycleStartedAt)
        .order('joined_at', { ascending: true })

    if (error || !rows) return []

    type Joined = {
        id: string
        joined_at: string
        notified_at: string | null
        customers: {
            name: string | null
            dorm_name: string | null
            meal_preference_type: string | null
            whatsapp_number: string | null
            email: string | null
        } | null
    }
    const list = rows as unknown as Joined[]
    if (list.length === 0) return []

    // Credits are looked up by intake_waitlist_id, NOT by the waitlist row's
    // own credit_id column. That column is a convenience stamp written AFTER
    // the credit lands, and stampCreditId treats its own failure as non-fatal
    // — so a real, spendable credit can exist with credit_id still null. The
    // intake_waitlist_id side is the authoritative link (it carries the unique
    // index that makes the mint idempotent), which makes it the only join that
    // cannot under-report someone's money.
    const creditByWaitlistId = new Map<string, number>()
    const { data: credits } = await sb
        .from('credits')
        .select('intake_waitlist_id, amount_aed')
        .in('intake_waitlist_id', list.map(r => r.id))

    for (const c of (credits ?? []) as Array<{ intake_waitlist_id: string; amount_aed: number | string }>) {
        creditByWaitlistId.set(c.intake_waitlist_id, Number(c.amount_aed))
    }

    return list.map(r => ({
        id: r.id,
        name: r.customers?.name?.trim() || 'Unnamed',
        dormName: r.customers?.dorm_name ?? null,
        mealPreference: r.customers?.meal_preference_type ?? null,
        whatsapp: r.customers?.whatsapp_number ?? null,
        email: r.customers?.email ?? null,
        joinedAt: r.joined_at,
        creditAed: creditByWaitlistId.get(r.id) ?? null,
        notifiedAt: r.notified_at,
    }))
}
