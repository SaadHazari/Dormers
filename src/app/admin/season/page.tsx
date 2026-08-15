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
}

export default async function SeasonPage() {
    // Deliberately its own query, not getIntakeState() — that reader caches
    // for 30s so an admin who just flipped the switch would see their own
    // change fail to appear here for up to half a minute. The admin page
    // must always show the row exactly as it is right now.
    const sb = createAdminSupabaseClient()

    const [settingsRes, waitlistCountRes] = await Promise.all([
        sb
            .from('intake_settings')
            .select('paused, headline, body, credit_nonveg_aed, credit_veg_aed, credit_religious_aed, paused_at, paused_by')
            .maybeSingle(),
        sb
            .from('intake_waitlist')
            .select('id', { count: 'exact', head: true }),
    ])

    const row = settingsRes.data as RawRow | null

    const settings: IntakeSettingsRow = {
        paused: row?.paused === true,
        headline: row?.headline ?? '',
        body: row?.body ?? '',
        creditNonvegAed: Number(row?.credit_nonveg_aed ?? 20),
        creditVegAed: Number(row?.credit_veg_aed ?? 15),
        creditReligiousAed: Number(row?.credit_religious_aed ?? 20),
        pausedAt: row?.paused_at ?? null,
        pausedBy: row?.paused_by ?? null,
    }

    return (
        <SeasonClient
            settings={settings}
            waitlistCount={waitlistCountRes.count ?? 0}
        />
    )
}
