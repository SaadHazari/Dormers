// Shared registry for the System Pulse strip and the Cron Health page.
//
// Naming rule: a label names the exact thing the customer sees, or the exact
// bad state a watchdog hunts, plus a plain role word (sender, checker,
// watchdog, reminder). Never the internal mechanics. Impact lines are written
// as "who is affected right now" and only surface when a job is overdue,
// failed, or not running.

import type { AdminTokens } from '@/ui-system/tokens/admin-theme'

export interface CronJob {
    jobname: string
    schedule: string
    active: boolean
    last_run: string | null
    last_end: string | null
    last_status: string | null
    last_duration_ms: number | null
    last_message: string | null
}

export type JobGroup = 'customer' | 'engine' | 'watchdog' | 'other' | 'housekeeping'

export interface JobInfo {
    label: string
    /** One line: what this job does, in customer terms. Shown on Cron Health. */
    does: string
    /** Who is affected while the job is down. Shown when overdue/failed. */
    impact: string
    group: JobGroup
    /** Where to act on the underlying problem, beyond reading the cron error. */
    actionHref?: string
    actionLabel?: string
}

export const JOB_INFO: Record<string, JobInfo> = {
    // ── Customer messages and money ─────────────────────────────────────────
    dispatch_customer_notifications_tick: {
        label: 'Customer WhatsApp sender',
        does: 'Sends the queued WhatsApp messages customers are waiting on.',
        impact: 'Customers are not getting WhatsApp messages',
        group: 'customer',
        actionHref: '/admin/comms',
        actionLabel: 'Open Communications',
    },
    dispatch_start_day_emails_9am_ae: {
        label: '"Starts today" email (9 AM)',
        does: 'Emails customers whose plan begins today, at 9 AM.',
        impact: 'New customers didn’t get their starts-today email',
        group: 'customer',
    },
    retry_post_payment_fanout_hourly: {
        label: 'After-payment auto-retry (hourly)',
        does: 'Retries the invoice, welcome message and plan setup steps that failed after a payment.',
        impact: 'Paid customers may be stuck without invoice or welcome',
        group: 'customer',
        actionHref: '/admin/layer4-queue',
        actionLabel: 'Open Layer 4 queue',
    },
    dispatch_renew_nudges_18_ae: {
        label: 'Renewal reminder (6 PM)',
        does: 'Reminds customers at 6 PM when their plan is about to end.',
        impact: 'Expiring customers aren’t being reminded to renew',
        group: 'customer',
    },
    dispatch_subscription_ended_0045_ae: {
        label: '"Plan ended" message (12:45 AM)',
        does: 'Messages customers the night their plan finishes, right after the nightly switch-off.',
        impact: 'Finished customers aren’t getting their plan-ended message',
        group: 'customer',
    },
    dispatch_zoho_due_every_minute: {
        label: 'Invoice sender (after payment)',
        does: 'Creates and sends the Zoho invoice for every paid order.',
        impact: 'Paid orders aren’t getting invoices',
        group: 'customer',
    },

    // ── Plan engine ─────────────────────────────────────────────────────────
    subscription_status_tick: {
        label: 'Plan on/off switch (nightly)',
        does: 'Turns plans on when their start date arrives and off when they finish.',
        impact: 'Plans are not starting or ending on the right day',
        group: 'engine',
    },
    subscription_delivery_tick: {
        label: '"Meals left" countdown (nightly)',
        does: 'Counts down each customer’s remaining meals every delivery night.',
        impact: 'Meal counts are frozen, plans will end on the wrong day',
        group: 'engine',
    },
    subscription_pause_tick: {
        label: 'Paused plan extender (nightly)',
        does: 'Extends a paused plan’s end date so the customer keeps their missed days.',
        impact: 'Paused customers are losing the days they paused to keep',
        group: 'engine',
    },
    subscription_closure_tick: {
        label: 'Closure day extender (nightly)',
        does: 'Extends every live plan by a day when the company was closed on a delivery day.',
        impact: 'Customers are losing the meals a closure day owes them',
        group: 'engine',
        actionHref: '/admin/holidays',
        actionLabel: 'Open Holidays',
    },

    // ── Watchdogs ───────────────────────────────────────────────────────────
    notify_stale_fraud_queue_tick: {
        label: 'Unreviewed referrals watchdog',
        does: 'Pings you on WhatsApp when referral reviews sit too long.',
        impact: 'You won’t be warned when referral reviews pile up',
        group: 'watchdog',
        actionHref: '/admin/referral-review-queue',
        actionLabel: 'Open referral queue',
    },
    alert_failed_notifications_30min: {
        label: 'Failed message watchdog',
        does: 'Pings you when messages to customers have failed.',
        impact: 'Failed customer messages are going unnoticed',
        group: 'watchdog',
        actionHref: '/admin/comms',
        actionLabel: 'Open Communications',
    },
    detect_orphan_subscriptions_30min: {
        label: 'Paid but no plan watchdog',
        does: 'Looks for customers who paid but never got a plan.',
        impact: 'A customer who paid could be sitting without a plan',
        group: 'watchdog',
    },
    reconcile_notification_meta_responses_5min: {
        label: 'WhatsApp delivery checker',
        does: 'Asks Meta whether sent WhatsApp messages actually arrived.',
        impact: '"Sent" messages may never have arrived',
        group: 'watchdog',
        actionHref: '/admin/comms',
        actionLabel: 'Open Communications',
    },
    ops_failsafe_20_ae: {
        label: 'Unconfirmed delivery failsafe (8 PM)',
        does: 'Pings you at 8 PM about dorms whose delivery was never confirmed today.',
        impact: 'Unconfirmed deliveries are going unnoticed',
        group: 'watchdog',
        actionHref: '/admin/photos',
        actionLabel: 'Open Photos',
    },

    // ── Housekeeping ────────────────────────────────────────────────────────
    review_credit_cleanup_tick: {
        label: 'Review credit expiry',
        does: 'Clears review credits that have expired.',
        impact: 'Expired review credits are not being cleared',
        group: 'housekeeping',
    },
    cleanup_cron_history: {
        label: 'Old cron logs cleanup',
        does: 'Deletes old cron run logs.',
        impact: 'Old cron logs are piling up',
        group: 'housekeeping',
    },
    cleanup_expired_otps: {
        label: 'Expired login codes cleanup',
        does: 'Deletes expired login codes.',
        impact: 'Expired login codes are piling up',
        group: 'housekeeping',
    },
    cleanup_old_notifications: {
        label: 'Old messages cleanup',
        does: 'Deletes old message records.',
        impact: 'Old message records are piling up',
        group: 'housekeeping',
    },
    'rate-limit-gc': {
        label: 'Rate limit counter cleanup',
        does: 'Deletes stale rate-limit counters every half hour.',
        impact: 'Stale rate-limit counters are piling up',
        group: 'housekeeping',
    },
    archive_ops_photos_daily: {
        label: 'Ops photo archival (nightly)',
        does: 'Moves kitchen, pickup and delivery photos older than a month into the archive.',
        impact: 'Old ops photos are staying in the Photos page working set',
        group: 'housekeeping',
        actionHref: '/admin/photos',
        actionLabel: 'Open Photos',
    },
}

export function getJobInfo(jobname: string): JobInfo {
    return JOB_INFO[jobname] ?? {
        label: jobname.replace(/_/g, ' '),
        does: 'New job, no description yet. Add it to the job registry.',
        impact: 'New job, no description yet. Read its last message below.',
        group: 'other',
    }
}

export const GROUP_ORDER: JobGroup[] = ['customer', 'engine', 'watchdog', 'other', 'housekeeping']

export const GROUP_LABELS: Record<JobGroup, string> = {
    customer: 'Customer messages and money',
    engine: 'Plan engine',
    watchdog: 'Watchdogs',
    other: 'New jobs (no description yet)',
    housekeeping: 'Housekeeping',
}

export interface JobSection {
    group: JobGroup
    label: string
    jobs: CronJob[]
}

export function groupJobs(jobs: CronJob[]): JobSection[] {
    return GROUP_ORDER
        .map(group => ({
            group,
            label: GROUP_LABELS[group],
            jobs: jobs.filter(j => getJobInfo(j.jobname).group === group),
        }))
        .filter(section => section.jobs.length > 0)
}

// ── Health ──────────────────────────────────────────────────────────────────
// "failed" and "stopped" are deliberately separate reds: failed means the last
// run errored (go read the error), stopped means the schedule itself is dead.

export type JobHealth = 'ok' | 'overdue' | 'failed' | 'stopped' | 'off' | 'never'

export const HEALTH_WORDS: Record<JobHealth, string> = {
    ok:      'OK',
    overdue: 'Overdue',
    failed:  'Failed',
    stopped: 'Not running',
    off:     'Off',
    never:   'Never ran',
}

export function getJobHealth(job: CronJob): JobHealth {
    if (!job.active) return 'off'
    if (!job.last_run) return 'never'
    if (job.last_status === 'failed') return 'failed'

    const intervalMs = parseScheduleIntervalMs(job.schedule)
    if (!intervalMs) return job.last_status === 'succeeded' ? 'ok' : 'overdue'

    const ageMs = Date.now() - new Date(job.last_run).getTime()
    if (ageMs >= intervalMs * 5) return 'stopped'
    if (ageMs >= intervalMs * 2) return 'overdue'
    return 'ok'
}

export function isUnhealthy(health: JobHealth): boolean {
    return health === 'overdue' || health === 'failed' || health === 'stopped'
}

export function healthTextClass(t: AdminTokens, health: JobHealth): string {
    switch (health) {
        case 'ok':      return t.success
        case 'overdue': return t.warning
        case 'failed':
        case 'stopped': return t.danger
        default:        return t.faint
    }
}

export const DOT_COLORS: Record<JobHealth, string> = {
    ok:      'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
    overdue: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
    failed:  'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse',
    stopped: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse',
    off:     'bg-gray-500/40',
    never:   'bg-gray-500/40',
}

function parseScheduleIntervalMs(schedule: string): number | null {
    const parts = schedule.split(' ')
    if (parts.length !== 5) return null

    const [minute, hour] = parts

    if (minute === '*' && hour === '*') return 60_000
    if (minute.startsWith('*/')) return parseInt(minute.slice(2)) * 60_000

    if (minute.includes(',')) {
        const mins = minute.split(',').map(Number)
        if (mins.length >= 2) return (mins[1] - mins[0]) * 60_000
    }

    // Daily jobs (specific hour + minute)
    if (!minute.includes('*') && !hour.includes('*')) return 24 * 60 * 60_000

    // Hourly jobs (specific minute, every hour)
    if (!minute.includes('*') && hour === '*') return 60 * 60_000

    return null
}

export function formatAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime()
    const mins = Math.round(ms / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
}
