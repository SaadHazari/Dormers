// Dev-only harness for the broadcast composer.
//
// /admin/comms/broadcast needs a real admin session and live Meta and Supabase
// calls, so it is not reviewable in practice. This renders BroadcastClient
// against the real per-audience counts from 2026-09-16 (nobody opted in to
// WhatsApp yet) so every state can be looked at.
// Unreachable in production.
//
// Query params:
//   ?health=green|yellow|red   number health (default green)
//   ?history=0             no past sends
import { notFound } from 'next/navigation'
import { AdminThemeProvider } from '@/app/admin/_components/AdminThemeProvider'
import { BroadcastClient, type BroadcastFixtures } from '@/app/admin/comms/broadcast/BroadcastClient'
import type { BroadcastRow, WhatsAppTemplateRow } from '@/app/admin/comms/broadcast/page'
import { ThemedPage } from './ThemedPage'

export const dynamic = 'force-dynamic'

// Real per-audience counts from the live book on 2026-09-16. Nobody has
// opted in to WhatsApp marketing, and the 54 deletions that morning emptied
// "On a plan now" and "Lapsed" — both worth being able to look at.
const COUNTS: BroadcastFixtures['counts'] = {
    whatsapp: {
        everyone:          { optedIn: 0, all: 1018 },
        imported:          { optedIn: 0, all: 972 },
        never_customers:   { optedIn: 0, all: 999 },
        customers:         { optedIn: 0, all: 19 },
        active_plans:      { optedIn: 0, all: 0 },
        waitlist_all:      { optedIn: 0, all: 10 },
        early_signup:      { optedIn: 0, all: 9 },
        ended_not_renewed: { optedIn: 0, all: 0 },
        early_access:      { optedIn: 0, all: 6 },
        dorm:              { optedIn: 0, all: 4 },
    },
    email: {
        everyone:          { optedIn: 301, all: 301 },
        imported:          { optedIn: 254, all: 254 },
        never_customers:   { optedIn: 281, all: 281 },
        customers:         { optedIn: 20, all: 20 },
        active_plans:      { optedIn: 0, all: 0 },
        waitlist_all:      { optedIn: 10, all: 10 },
        early_signup:      { optedIn: 10, all: 10 },
        ended_not_renewed: { optedIn: 0, all: 0 },
        early_access:      { optedIn: 6, all: 6 },
        dorm:              { optedIn: 4, all: 4 },
        reopen:            { optedIn: 6, all: 6 },
    },
}

const TEMPLATES: WhatsAppTemplateRow[] = [
    {
        name: 'intake_back_open', language: 'en', category: 'MARKETING', status: 'APPROVED',
        approved_at: '2026-09-16T00:00:00Z', named_params: true, variables: ['plan_name'],
        body_preview: 'Dinner is handled again.\nSame rotation, same dorm, same hours. Your {{plan_name}} is ready to restart whenever you are.',
        synced_at: '2026-09-16T00:00:00Z',
    },
    {
        name: 'season_credit_waiting', language: 'en', category: 'MARKETING', status: 'APPROVED',
        approved_at: '2026-09-16T00:00:00Z', named_params: true, variables: ['credit_aed'],
        body_preview: '*AED {{credit_aed}}* is sitting in your Credit Wallet, and it’s yours to spend on your next plan.',
        synced_at: '2026-09-16T00:00:00Z',
    },
    {
        name: 'dormers_intake_ended_offer_v1', language: 'en', category: 'MARKETING', status: 'APPROVED',
        approved_at: '2026-09-16T00:00:00Z', named_params: true, variables: ['plan_name', 'delivered_meals', 'offer_aed'],
        body_preview: 'That’s your {{plan_name}} done. *{{delivered_meals}}* dinners, all hot. Come back this week and we’ll take AED {{offer_aed}} off.',
        synced_at: '2026-09-16T00:00:00Z',
    },
    {
        name: 'referral_converted', language: 'en', category: 'MARKETING', status: 'APPROVED',
        approved_at: '2026-09-16T00:00:00Z', named_params: true, variables: ['referral', 'x'],
        body_preview: '{{referral}} just joined Dormers because of you. {{x}} is on its way to your wallet.',
        synced_at: '2026-09-16T00:00:00Z',
    },
]

const HISTORY: BroadcastRow[] = [
    {
        id: 'b1', kind: 'custom', subject: 'WhatsApp: intake_back_open', audience: 'waitlist_all', dorm_name: null,
        status: 'done', recipient_count: 9, created_by: 'admin@dormers.ae',
        created_at: '2026-09-15T15:20:00Z', finished_at: '2026-09-15T15:21:00Z', channel: 'whatsapp',
    },
    {
        id: 'b2', kind: 'season_reopen', subject: 'Season reopening (ZeptoMail template)', audience: 'reopen', dorm_name: null,
        status: 'done', recipient_count: 16, created_by: 'admin@dormers.ae',
        created_at: '2026-09-02T08:00:00Z', finished_at: '2026-09-02T08:02:00Z', channel: 'email',
    },
]

export default async function BroadcastPreviewPage({
    searchParams,
}: {
    searchParams: Promise<{ health?: string; history?: string }>
}) {
    if (process.env.NODE_ENV === 'production') notFound()
    const p = await searchParams
    const verdict = p.health === 'red' ? 'block' : p.health === 'yellow' ? 'warn' : 'ok'
    const quality = p.health === 'red' ? 'RED' : p.health === 'yellow' ? 'YELLOW' : 'GREEN'

    return (
        <AdminThemeProvider>
            <ThemedPage>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12">
                    <BroadcastClient
                        broadcasts={p.history === '0' ? [] : HISTORY}
                        dorms={['Yugo Dubailand', 'The Myriad', 'KSK Homes', 'DSOA Residence']}
                        parked={{}}
                        templates={TEMPLATES}
                        fixtures={{
                            counts: COUNTS,
                            health: { quality, verdict, remaining: 1000, sentToday: 0, rate: 0.12 },
                        }}
                    />
                </div>
            </ThemedPage>
        </AdminThemeProvider>
    )
}
