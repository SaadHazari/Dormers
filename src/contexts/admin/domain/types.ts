export interface AuditLogEntry {
    id: string
    admin_email: string
    action: string
    entity_type: string | null
    entity_id: string | null
    payload: Record<string, unknown>
    created_at: string
}

export interface AdminKPIs {
    active_subs: number
    scheduled_subs: number
    todays_deliveries: number
    pending_referrals: number
    pending_layer4: number
    total_customers: number
    mrr_estimate: number
}

export interface CronJobHealth {
    jobname: string
    schedule: string
    active: boolean
    last_run: string | null
    last_status: string | null
    last_duration_ms: number | null
    last_message: string | null
}

export type AdminNavGroup = {
    label: string
    items: AdminNavItem[]
}

export type AdminNavItem = {
    label: string
    href: string
    icon: string
    badge?: number
}
