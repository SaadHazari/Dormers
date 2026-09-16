import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { captureError } from '@/infra/logging/capture-error'
import { ContactTable } from './ContactTable'
import { CONTACT_PAGE_SIZE } from './constants'

export const metadata = { title: 'Contacts — Dormers Admin' }
export const dynamic = 'force-dynamic'

export interface ContactRow {
    id: string
    email: string | null
    phone_e164: string | null
    name: string | null
    source: string
    source_detail: string | null
    /** Set when this person also has an account. Null for everyone else. */
    customer_id: string | null
    tags: string[]
    email_status: string
    whatsapp_status: string
    last_emailed_at: string | null
    /** Resolved by admin_contact_search so it agrees with the customers list. */
    on_waitlist: boolean
    first_seen_at: string
    created_at: string
}

/**
 * Total contacts matching the same predicate as admin_contact_search, so the
 * list can say "38 of 412" instead of implying the fetched page is everyone.
 * Returns null if the count fails — the UI then just omits the total rather
 * than blocking the list.
 */
async function countMatching(
    sb: ReturnType<typeof createAdminSupabaseClient>,
    query: string,
): Promise<number | null> {
    let q = sb.from('contacts').select('id', { count: 'exact', head: true })
    if (query) {
        const like = `%${query}%`
        q = q.or(
            ['name', 'email', 'phone_e164']
                .map(col => `${col}.ilike.${like}`)
                .join(','),
        )
    }
    const { count, error } = await q
    if (error) {
        captureError(error, { area: 'admin', op: 'contactsPage.countMatching' })
        return null
    }
    return count ?? null
}

export default async function ContactsPage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string }>
}) {
    const sp = (await searchParams) ?? {}
    const query = sp.q ?? ''
    const sb = createAdminSupabaseClient()

    const [searchResult, totalCount] = await Promise.all([
        sb.rpc('admin_contact_search', {
            p_query: query,
            p_limit: CONTACT_PAGE_SIZE,
            p_offset: 0,
        }),
        countMatching(sb, query),
    ])

    if (searchResult.error) {
        captureError(searchResult.error, { area: 'admin', op: 'contactsPage.search' })
    }

    const contacts = (searchResult.data ?? []) as ContactRow[]

    return (
        // Keyed by query so a new search resets the filter chips and the
        // rendered window instead of leaving a stale view hiding the person
        // you just searched for.
        <ContactTable
            key={query}
            contacts={contacts}
            initialQuery={query}
            totalCount={totalCount}
        />
    )
}
