/**
 * Reviews data-access — the admin read layer over `weekly_reviews` and
 * `monthly_reviews`.
 *
 * Customers submit two kinds of feedback from their dashboard and, until this
 * module, none of it was readable on the admin side. The repo returns the
 * FULL, detailed review records (dish names resolved, customer + admin-triage
 * meta attached); the admin client derives every aggregate, the submissions
 * feed, AND the drill-downs from that single source — so every number on the
 * dashboard is linked to the exact records behind it.
 *
 *   • getReviewsOverview()      — all weekly + monthly reviews, detailed, with
 *                                 customer name + admin meta. Powers the whole
 *                                 /admin/reviews dashboard.
 *   • getReviewsForCustomer(id) — the same detail scoped to one customer (the
 *                                 customer-detail Reviews tab).
 *   • getAdminEmailsForCustomer(id) — sent-email log for the message composer.
 *
 * Layering: infra → depends only on other infra (the admin client + the menu
 * catalog for dish-name resolution). Monthly enum keys stay RAW — the human
 * labels live in the subscriptions domain and are applied client-side.
 */

import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { getMenuDishes } from '@/infra/supabase/menu-catalog'

type Sb = ReturnType<typeof createAdminSupabaseClient>

// ── Row shapes (the detailed selects) ────────────────────────────────────────

interface WeeklyDetailRow {
    id: string
    customer_id: string | null
    week_number: number | null
    week_start_date: string | null
    week_end_date: string | null
    rating: number
    favorites: string[] | null
    misses: string[] | null
    miss_reasons: Record<string, string[]> | null
    delivery_thumbs: string | null
    delivery_reasons: string[] | null
    packaging_thumbs: string | null
    packaging_reasons: string[] | null
    kitchen_note: string | null
    reward_pct: number | null
    submitted_at: string
}

interface MonthlyDetailRow {
    id: string
    customer_id: string | null
    signup_triggers: string[] | null
    signup_triggers_other: string | null
    jobs: string[] | null
    jobs_other: string | null
    best_moment: string | null
    friction_moment: string | null
    alternative: string | null
    alternative_other: string | null
    alternative_cost_aed: string | null
    renewal_intent: string | null
    renewal_reason: string | null
    recommend: string | null
    recommend_text: string | null
    reward_pct: number | null
    submitted_at: string
}

const WEEKLY_COLS = 'id, customer_id, week_number, week_start_date, week_end_date, rating, favorites, misses, miss_reasons, delivery_thumbs, delivery_reasons, packaging_thumbs, packaging_reasons, kitchen_note, reward_pct, submitted_at'
const MONTHLY_COLS = 'id, customer_id, signup_triggers, signup_triggers_other, jobs, jobs_other, best_moment, friction_moment, alternative, alternative_other, alternative_cost_aed, renewal_intent, renewal_reason, recommend, recommend_text, reward_pct, submitted_at'

// ── Returned shapes ──────────────────────────────────────────────────────────

export type ReviewAdminStatus = 'open' | 'addressed'

export interface CustomerWeeklyReview {
    id: string
    weekNumber: number | null
    weekStart: string | null
    weekEnd: string | null
    rating: number
    favorites: Array<{ id: string; name: string }>
    misses: Array<{ id: string; name: string; reasons: string[] }>
    deliveryThumbs: string | null
    deliveryReasons: string[]
    packagingThumbs: string | null
    packagingReasons: string[]
    kitchenNote: string | null
    rewardPct: number | null
    submittedAt: string
    adminStatus: ReviewAdminStatus | null
    adminNote: string | null
}

export interface CustomerMonthlyReview {
    id: string
    signupTriggers: string[]
    signupTriggersOther: string | null
    jobs: string[]
    jobsOther: string | null
    bestMoment: string | null
    frictionMoment: string | null
    alternative: string | null
    alternativeOther: string | null
    alternativeCostAed: string | null
    renewalIntent: string | null
    renewalReason: string | null
    recommend: string | null
    recommendText: string | null
    rewardPct: number | null
    submittedAt: string
    adminStatus: ReviewAdminStatus | null
    adminNote: string | null
}

export interface CustomerReviews {
    weekly: CustomerWeeklyReview[]
    monthly: CustomerMonthlyReview[]
}

/** A weekly review with the customer it belongs to — the dashboard-wide shape. */
export interface OverviewWeekly extends CustomerWeeklyReview {
    customerId: string | null
    customerName: string | null
}
export interface OverviewMonthly extends CustomerMonthlyReview {
    customerId: string | null
    customerName: string | null
}
export interface ReviewsOverview {
    weekly: OverviewWeekly[]
    monthly: OverviewMonthly[]
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const cleanStr = (s: string | null | undefined): string | null => (s ?? '').trim() || null

/** Build a meal-id → dish-name map from the CMS catalog (IDs stored as strings in reviews). */
async function dishNameMap(): Promise<Map<string, string>> {
    const dishes = await getMenuDishes()
    const map = new Map<string, string>()
    for (const d of dishes) map.set(String(d.id), d.name)
    return map
}

/** Resolve customer_id → display name for the given ids (capacity-scoped lookup). */
async function customerNameMap(sb: Sb, ids: Array<string | null>): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))]
    const map = new Map<string, string | null>()
    if (unique.length === 0) return map
    const { data } = await sb.from('customers').select('id, name').in('id', unique)
    for (const c of (data ?? []) as Array<{ id: string; name: string | null }>) {
        map.set(c.id, c.name)
    }
    return map
}

export interface ReviewAdminMeta { status: ReviewAdminStatus; note: string | null }

/**
 * Map review_id → admin triage meta (addressed flag + internal note) from the
 * `review_admin_meta` side-table. review_ids are uuids (globally unique across
 * both review tables), so keying by id alone is unambiguous.
 */
async function adminMetaMap(sb: Sb, reviewIds: string[]): Promise<Map<string, ReviewAdminMeta>> {
    const unique = [...new Set(reviewIds)]
    const map = new Map<string, ReviewAdminMeta>()
    if (unique.length === 0) return map
    const { data } = await sb.from('review_admin_meta').select('review_id, status, note').in('review_id', unique)
    for (const m of (data ?? []) as Array<{ review_id: string; status: string; note: string | null }>) {
        map.set(m.review_id, { status: m.status === 'addressed' ? 'addressed' : 'open', note: m.note })
    }
    return map
}

// ── Row → detail mappers (shared by overview + per-customer) ─────────────────

function mapWeeklyDetail(r: WeeklyDetailRow, dishMap: Map<string, string>, meta: Map<string, ReviewAdminMeta>): CustomerWeeklyReview {
    const nameOf = (id: string) => dishMap.get(id) ?? `Dish #${id}`
    return {
        id: r.id,
        weekNumber: r.week_number,
        weekStart: r.week_start_date,
        weekEnd: r.week_end_date,
        rating: r.rating,
        favorites: (r.favorites ?? []).map(id => ({ id: String(id), name: nameOf(String(id)) })),
        misses: (r.misses ?? []).map(id => ({ id: String(id), name: nameOf(String(id)), reasons: (r.miss_reasons ?? {})[String(id)] ?? [] })),
        deliveryThumbs: r.delivery_thumbs,
        deliveryReasons: r.delivery_reasons ?? [],
        packagingThumbs: r.packaging_thumbs,
        packagingReasons: r.packaging_reasons ?? [],
        kitchenNote: cleanStr(r.kitchen_note),
        rewardPct: r.reward_pct,
        submittedAt: r.submitted_at,
        adminStatus: meta.get(r.id)?.status ?? null,
        adminNote: meta.get(r.id)?.note ?? null,
    }
}

function mapMonthlyDetail(r: MonthlyDetailRow, meta: Map<string, ReviewAdminMeta>): CustomerMonthlyReview {
    return {
        id: r.id,
        signupTriggers: r.signup_triggers ?? [],
        signupTriggersOther: cleanStr(r.signup_triggers_other),
        jobs: r.jobs ?? [],
        jobsOther: cleanStr(r.jobs_other),
        bestMoment: cleanStr(r.best_moment),
        frictionMoment: cleanStr(r.friction_moment),
        alternative: r.alternative,
        alternativeOther: cleanStr(r.alternative_other),
        alternativeCostAed: r.alternative_cost_aed,
        renewalIntent: r.renewal_intent,
        renewalReason: cleanStr(r.renewal_reason),
        recommend: r.recommend,
        recommendText: cleanStr(r.recommend_text),
        rewardPct: r.reward_pct,
        submittedAt: r.submitted_at,
        adminStatus: meta.get(r.id)?.status ?? null,
        adminNote: meta.get(r.id)?.note ?? null,
    }
}

// ── Dashboard-wide overview (all reviews, detailed) ──────────────────────────

/**
 * Every weekly + monthly review, detailed and newest-first, with customer
 * names + admin-triage meta attached. The admin dashboard computes all
 * aggregates and drill-downs from this one payload.
 */
export async function getReviewsOverview(): Promise<ReviewsOverview> {
    const sb = createAdminSupabaseClient()
    const [weeklyRes, monthlyRes, dishMap] = await Promise.all([
        sb.from('weekly_reviews').select(WEEKLY_COLS).order('submitted_at', { ascending: false }),
        sb.from('monthly_reviews').select(MONTHLY_COLS).order('submitted_at', { ascending: false }),
        dishNameMap(),
    ])
    const weeklyRows = (weeklyRes.data ?? []) as WeeklyDetailRow[]
    const monthlyRows = (monthlyRes.data ?? []) as MonthlyDetailRow[]

    const [names, meta] = await Promise.all([
        customerNameMap(sb, [...weeklyRows.map(r => r.customer_id), ...monthlyRows.map(r => r.customer_id)]),
        adminMetaMap(sb, [...weeklyRows.map(r => r.id), ...monthlyRows.map(r => r.id)]),
    ])
    const nameFor = (id: string | null) => (id ? names.get(id) ?? null : null)

    return {
        weekly: weeklyRows.map(r => ({ ...mapWeeklyDetail(r, dishMap, meta), customerId: r.customer_id, customerName: nameFor(r.customer_id) })),
        monthly: monthlyRows.map(r => ({ ...mapMonthlyDetail(r, meta), customerId: r.customer_id, customerName: nameFor(r.customer_id) })),
    }
}

// ── Per-customer review history ──────────────────────────────────────────────

/** Full weekly + monthly review history for one customer, newest first. */
export async function getReviewsForCustomer(customerId: string): Promise<CustomerReviews> {
    const sb = createAdminSupabaseClient()
    const [weeklyRes, monthlyRes, dishMap] = await Promise.all([
        sb.from('weekly_reviews').select(WEEKLY_COLS).eq('customer_id', customerId).order('submitted_at', { ascending: false }),
        sb.from('monthly_reviews').select(MONTHLY_COLS).eq('customer_id', customerId).order('submitted_at', { ascending: false }),
        dishNameMap(),
    ])
    const weeklyRows = (weeklyRes.data ?? []) as WeeklyDetailRow[]
    const monthlyRows = (monthlyRes.data ?? []) as MonthlyDetailRow[]
    const meta = await adminMetaMap(sb, [...weeklyRows.map(r => r.id), ...monthlyRows.map(r => r.id)])

    return {
        weekly: weeklyRows.map(r => mapWeeklyDetail(r, dishMap, meta)),
        monthly: monthlyRows.map(r => mapMonthlyDetail(r, meta)),
    }
}

// ── Admin-sent email log (per customer) ──────────────────────────────────────

export interface AdminEmailLogEntry {
    id: string
    subject: string
    status: 'sent' | 'failed'
    sentBy: string
    includeSupportBox: boolean
    error: string | null
    createdAt: string
}

/** The on-brand emails an admin has sent this customer from the panel, newest first. */
export async function getAdminEmailsForCustomer(customerId: string): Promise<AdminEmailLogEntry[]> {
    const sb = createAdminSupabaseClient()
    const { data } = await sb.from('admin_customer_emails')
        .select('id, subject, status, sent_by, include_support_box, error, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50)
    return ((data ?? []) as Array<{ id: string; subject: string; status: string; sent_by: string; include_support_box: boolean; error: string | null; created_at: string }>)
        .map(r => ({
            id: r.id,
            subject: r.subject,
            status: r.status === 'failed' ? 'failed' : 'sent',
            sentBy: r.sent_by,
            includeSupportBox: r.include_support_box,
            error: r.error,
            createdAt: r.created_at,
        }))
}
