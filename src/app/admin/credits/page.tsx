import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { CreditsClient } from './CreditsClient'

export const metadata = { title: 'Credits & Comps — Dormers Admin' }
export const dynamic = 'force-dynamic'

export default async function CreditsPage() {
    const sb = createAdminSupabaseClient()

    const [creditsRes, compedRes, customersRes] = await Promise.all([
        sb.from('credits')
            .select('id, customer_id, amount_aed, source, status, created_at, applied_at')
            .order('created_at', { ascending: false })
            .limit(200),
        sb.from('comped_meal_ledger')
            .select('id, customer_id, plan_name, cogs_aed, expense_category, delivered_at, created_at')
            .order('created_at', { ascending: false })
            .limit(100),
        sb.from('customers').select('id, name, email'),
    ])

    const customerMap = new Map<string, { name: string | null; email: string | null }>()
    for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
        customerMap.set(c.id, { name: c.name, email: c.email })
    }

    const rawCredits = (creditsRes.data ?? []) as Array<Record<string, unknown>>
    const credits = rawCredits.map(c => ({
        ...c,
        customer_name: customerMap.get(c.customer_id as string)?.name ?? null,
    }))

    const rawComped = (compedRes.data ?? []) as Array<Record<string, unknown>>
    const comped = rawComped.map(c => ({
        ...c,
        customer_name: customerMap.get(c.customer_id as string)?.name ?? null,
    }))

    const summary = {
        totalApproved: rawCredits.filter(c => c.status === 'approved').reduce((s, c) => s + Number(c.amount_aed), 0),
        totalPending: rawCredits.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_aed), 0),
        totalApplied: rawCredits.filter(c => c.status === 'applied').reduce((s, c) => s + Number(c.amount_aed), 0),
        totalComped: rawComped.reduce((s, c) => s + Number(c.cogs_aed ?? 0), 0),
    }

    return <CreditsClient credits={credits} comped={comped} summary={summary} />
}
