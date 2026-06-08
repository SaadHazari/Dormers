'use client'

import { useAdminTheme } from './AdminThemeProvider'

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

interface Props {
    jobs: CronJob[]
}

const FRIENDLY_NAMES: Record<string, string> = {
    subscription_status_tick:                    'Status Tick',
    subscription_delivery_tick:                  'Delivery Tick',
    subscription_pause_tick:                     'Pause Tick',
    dispatch_customer_notifications_tick:        'Notif Dispatch',
    dispatch_start_day_emails_9am_ae:            'Start-Day Email',
    retry_post_payment_fanout_hourly:            'Payment Retry',
    dispatch_renew_nudges_18_ae:                 'Renew Nudge',
    dispatch_zoho_due_every_minute:              'Zoho Dispatch',
    notify_stale_fraud_queue_tick:               'Fraud Alert',
    alert_failed_notifications_30min:            'Fail Alert',
    detect_orphan_subscriptions_30min:           'Orphan Detect',
    reconcile_notification_meta_responses_5min:  'Meta Reconcile',
    review_credit_cleanup_tick:                  'Credit Cleanup',
    cleanup_cron_history:                        'Cron Cleanup',
    cleanup_expired_otps:                        'OTP Cleanup',
    cleanup_old_notifications:                   'Notif Cleanup',
}

// Key operational jobs shown in the strip (not cleanup/maintenance)
const KEY_JOBS = [
    'subscription_status_tick',
    'subscription_delivery_tick',
    'subscription_pause_tick',
    'dispatch_customer_notifications_tick',
    'dispatch_start_day_emails_9am_ae',
    'retry_post_payment_fanout_hourly',
    'dispatch_renew_nudges_18_ae',
    'dispatch_zoho_due_every_minute',
]

function getHealthColor(job: CronJob): 'green' | 'amber' | 'red' | 'gray' {
    if (!job.active) return 'gray'
    if (!job.last_run) return 'gray'
    if (job.last_status === 'failed') return 'red'

    const lastRun = new Date(job.last_run).getTime()
    const now = Date.now()
    const ageMs = now - lastRun

    const intervalMs = parseScheduleIntervalMs(job.schedule)
    if (!intervalMs) return job.last_status === 'succeeded' ? 'green' : 'amber'

    // Green if ran within 2x the expected interval, amber if 3x, red if 5x+
    if (ageMs < intervalMs * 2) return 'green'
    if (ageMs < intervalMs * 5) return 'amber'
    return 'red'
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

function formatAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime()
    const mins = Math.round(ms / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
}

const DOT_COLORS = {
    green: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
    amber: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
    red:   'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse',
    gray:  'bg-gray-500/40',
}

export function PulseStrip({ jobs }: Props) {
    const { t } = useAdminTheme()

    const keyJobs = KEY_JOBS
        .map(name => jobs.find(j => j.jobname === name))
        .filter((j): j is CronJob => j != null)

    const otherJobs = jobs.filter(j => !KEY_JOBS.includes(j.jobname))

    const healthSummary = jobs.reduce(
        (acc, j) => {
            const color = getHealthColor(j)
            acc[color] = (acc[color] || 0) + 1
            return acc
        },
        {} as Record<string, number>,
    )

    return (
        <div className={`${t.card} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
                <h2 className={`text-[11px] font-black tracking-[0.14em] uppercase ${t.muted}`}>
                    System Pulse
                </h2>
                <div className="flex items-center gap-3">
                    {healthSummary.green && (
                        <span className={`text-[10px] font-bold tabular-nums ${t.success}`}>
                            {healthSummary.green} ok
                        </span>
                    )}
                    {healthSummary.amber && (
                        <span className={`text-[10px] font-bold tabular-nums ${t.warning}`}>
                            {healthSummary.amber} late
                        </span>
                    )}
                    {healthSummary.red && (
                        <span className={`text-[10px] font-bold tabular-nums ${t.danger}`}>
                            {healthSummary.red} failed
                        </span>
                    )}
                </div>
            </div>

            {/* Key operational jobs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {keyJobs.map(job => (
                    <JobDot key={job.jobname} job={job} />
                ))}
            </div>

            {/* Other jobs — collapsed */}
            {otherJobs.length > 0 && (
                <details className="mt-3">
                    <summary className={`text-[10px] font-bold tracking-[0.08em] uppercase cursor-pointer ${t.faint} hover:${t.muted}`}>
                        {otherJobs.length} more jobs
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {otherJobs.map(job => (
                            <JobDot key={job.jobname} job={job} />
                        ))}
                    </div>
                </details>
            )}
        </div>
    )
}

function JobDot({ job }: { job: CronJob }) {
    const { t } = useAdminTheme()
    const health = getHealthColor(job)
    const name = FRIENDLY_NAMES[job.jobname] ?? job.jobname.replace(/_/g, ' ')

    return (
        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors duration-100`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[health]}`} />
            <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-bold truncate ${t.body}`}>
                    {name}
                </div>
                <div className={`text-[9px] font-semibold tabular-nums ${t.faint}`}>
                    {job.last_run ? formatAge(job.last_run) : 'never'}
                    {job.last_duration_ms != null && ` · ${Math.round(job.last_duration_ms)}ms`}
                </div>
            </div>
        </div>
    )
}
