import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { ImportClient } from './ImportClient'

export const metadata = { title: 'Import contacts — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface ImportBatch {
    id: string
    filename: string
    uploaded_by: string
    source: string
    total_rows: number
    created: number
    matched: number
    skipped: number
    created_at: string
}

export default async function ImportContactsPage() {
    await requireAdmin()

    const sb = createAdminSupabaseClient()
    const { data } = await sb
        .from('contact_imports')
        .select('id, filename, uploaded_by, source, total_rows, created, matched, skipped, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    return <ImportClient recent={(data ?? []) as ImportBatch[]} />
}
