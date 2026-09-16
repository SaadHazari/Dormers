'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/contexts/admin/usecases/require-admin'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { logAdminAction } from '@/contexts/admin/usecases/audit'
import { captureError } from '@/infra/logging/capture-error'
import {
    planImport, tallyPlan,
    type Bucket, type ExistingContact, type PlannedRow, type RawRow,
} from '@/contexts/contacts/domain/import-plan'
import { MAX_IMPORT_ROWS } from './constants'

/** Sources an import may be tagged with. Mirrors the contacts.source check. */
const IMPORTABLE_SOURCES = ['zoho_import', 'website', 'referral', 'free_signup', 'manual'] as const
export type ImportSource = (typeof IMPORTABLE_SOURCES)[number]

/** How many rows of each bucket the preview shows as evidence. */
const SAMPLE_SIZE = 8

export interface PreviewResult {
    ok: boolean
    message?: string
    tally: Record<Bucket, number>
    samples: Record<Bucket, PlannedRow[]>
    total: number
}

const EMPTY_TALLY: Record<Bucket, number> = {
    new: 0, existing_contact: 0, existing_customer: 0, duplicate_in_file: 0, invalid: 0,
}
const EMPTY_SAMPLES: Record<Bucket, PlannedRow[]> = {
    new: [], existing_contact: [], existing_customer: [], duplicate_in_file: [], invalid: [],
}

/**
 * Every contact we already know, as the flat index planImport wants.
 *
 * Read in pages: PostgREST caps a plain select at 1000 rows, and silently
 * returning the first thousand would make the preview call known people
 * "new" and the commit then create duplicates — exactly the failure this
 * screen exists to prevent.
 */
async function loadExisting(
    sb: ReturnType<typeof createAdminSupabaseClient>,
): Promise<ExistingContact[] | null> {
    const PAGE = 1000
    const out: ExistingContact[] = []
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
            .from('contacts')
            .select('email, phone_e164, customer_id')
            .range(from, from + PAGE - 1)
        if (error) {
            captureError(error, { area: 'admin', op: 'contactImport.loadExisting' })
            return null
        }
        const rows = (data ?? []) as Array<{ email: string | null; phone_e164: string | null; customer_id: string | null }>
        out.push(...rows.map(r => ({
            email: r.email,
            phone_e164: r.phone_e164,
            isCustomer: r.customer_id !== null,
        })))
        if (rows.length < PAGE) return out
    }
}

function sample(plan: PlannedRow[]): Record<Bucket, PlannedRow[]> {
    const samples: Record<Bucket, PlannedRow[]> = {
        new: [], existing_contact: [], existing_customer: [], duplicate_in_file: [], invalid: [],
    }
    for (const row of plan) {
        if (samples[row.bucket].length < SAMPLE_SIZE) samples[row.bucket].push(row)
    }
    return samples
}

/**
 * What committing this file would do. Writes nothing.
 *
 * The plan is recomputed at commit time rather than carried across from here,
 * so the numbers can only ever be stale in the safe direction: a contact
 * created between preview and commit is matched rather than duplicated.
 */
export async function previewImport(rows: RawRow[]): Promise<PreviewResult> {
    await requireAdmin()

    if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, message: 'That file has no rows in it.', tally: EMPTY_TALLY, samples: EMPTY_SAMPLES, total: 0 }
    }
    if (rows.length > MAX_IMPORT_ROWS) {
        return {
            ok: false,
            message: `That file has ${rows.length.toLocaleString()} rows. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString()} or fewer and import them one at a time.`,
            tally: EMPTY_TALLY, samples: EMPTY_SAMPLES, total: rows.length,
        }
    }

    const existing = await loadExisting(createAdminSupabaseClient())
    if (!existing) {
        return { ok: false, message: 'Could not read the existing contacts, so the preview would be wrong. Try again.', tally: EMPTY_TALLY, samples: EMPTY_SAMPLES, total: rows.length }
    }

    const plan = planImport(rows, existing)
    return { ok: true, tally: tallyPlan(plan), samples: sample(plan), total: rows.length }
}

export interface CommitResult {
    ok: boolean
    message: string
    importId?: string
    created?: number
    matched?: number
    skipped?: number
}

/**
 * Write the new rows. Only rows the plan calls 'new' are inserted; everything
 * else is counted and left alone.
 *
 * Inserts go in chunks with ignoreDuplicates, so a contact created by someone
 * else between the plan and the write is skipped rather than aborting the
 * whole import. The batch row records what actually happened, which is also
 * what makes a bad import undoable: the created rows carry its import_id.
 */
export async function commitImport(
    rows: RawRow[],
    source: ImportSource,
    filename: string,
    sourceDetail?: string,
): Promise<CommitResult> {
    const admin = await requireAdmin()

    if (!IMPORTABLE_SOURCES.includes(source)) {
        return { ok: false, message: 'Pick where these contacts came from.' }
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, message: 'That file has no rows in it.' }
    }
    if (rows.length > MAX_IMPORT_ROWS) {
        return { ok: false, message: `That file is too big. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString()} rows or fewer.` }
    }

    const sb = createAdminSupabaseClient()
    const existing = await loadExisting(sb)
    if (!existing) return { ok: false, message: 'Could not read the existing contacts. Nothing was imported.' }

    const plan = planImport(rows, existing)
    const tally = tallyPlan(plan)
    const fresh = plan.filter(r => r.bucket === 'new')

    const { data: batch, error: batchErr } = await sb
        .from('contact_imports')
        .insert({
            filename: filename.slice(0, 200),
            uploaded_by: admin.email,
            source,
            total_rows: rows.length,
            matched: tally.existing_contact + tally.existing_customer,
            skipped: tally.duplicate_in_file + tally.invalid,
        })
        .select('id')
        .single()
    if (batchErr || !batch) {
        return { ok: false, message: `Could not start the import: ${batchErr?.message}` }
    }

    let created = 0
    const CHUNK = 500
    for (let i = 0; i < fresh.length; i += CHUNK) {
        const payload = fresh.slice(i, i + CHUNK).map(r => ({
            email: r.email,
            phone_e164: r.phone,
            name: r.name,
            source,
            source_detail: sourceDetail?.trim() || null,
            import_id: batch.id,
        }))
        const { data, error } = await sb
            .from('contacts')
            .upsert(payload, { onConflict: 'email', ignoreDuplicates: true })
            .select('id')
        if (error) {
            captureError(error, { area: 'admin', op: 'contactImport.commit', importId: batch.id })
            // Record what did land before giving up, so the batch row is not a lie.
            await sb.from('contact_imports').update({ created }).eq('id', batch.id)
            return {
                ok: false,
                importId: batch.id,
                created,
                message: `Imported ${created} contacts, then stopped: ${error.message}. Re-running the same file will pick up the rest.`,
            }
        }
        created += (data ?? []).length
    }

    await sb.from('contact_imports').update({ created }).eq('id', batch.id)
    await logAdminAction(admin.email, 'import_contacts', 'contact_import', batch.id, {
        source, filename, total: rows.length, created,
        matched: tally.existing_contact + tally.existing_customer,
        skipped: tally.duplicate_in_file + tally.invalid,
    })
    revalidatePath('/admin/contacts')

    return {
        ok: true,
        importId: batch.id,
        created,
        matched: tally.existing_contact + tally.existing_customer,
        skipped: tally.duplicate_in_file + tally.invalid,
        message: created === 0
            ? 'Everyone in that file was already in the contact book.'
            : `${created} contact${created === 1 ? '' : 's'} added.`,
    }
}
