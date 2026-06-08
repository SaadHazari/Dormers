'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'

import { fetchJobHistory } from './actions'

interface CronJob {
    jobname: string
    schedule: string
    active: boolean
    last_run: string | null
    last_end: string | null
    last_status: string | null
    last_duration_ms: number | null
    last_message: string | null
}

interface RunDetail {
    runid: number
    status: string
    start_time: string
    end_time: string | null
    duration_ms: number | null
    message: string | null
}

const FRIENDLY: Record<string, string> = {
    subscription_status_tick:                    'Subscription Status Tick',
    subscription_delivery_tick:                  'Delivery Tick',
    subscription_pause_tick:                     'Pause Tick',
    dispatch_customer_notifications_tick:        'Notification Dispatch',
    dispatch_start_day_emails_9am_ae:            'Start-Day Emails (9 AM)',
    retry_post_payment_fanout_hourly:            'Payment Retry (Hourly)',
    dispatch_renew_nudges_18_ae:                 'Renew Nudge (6 PM)',
    dispatch_zoho_due_every_minute:              'Zoho Invoice Dispatch',
    notify_stale_fraud_queue_tick:               'Stale Fraud Alert',
    alert_failed_notifications_30min:            'Failed Notification Alert',
    detect_orphan_subscriptions_30min:           'Orphan Sub Detection',
    reconcile_notification_meta_responses_5min:  'Meta Status Reconcile',
    review_credit_cleanup_tick:                  'Credit Cleanup',
    cleanup_cron_history:                        'Cron History Cleanup',
    cleanup_expired_otps:                        'OTP Cleanup',
    cleanup_old_notifications:                   'Notification Cleanup',
}

function healthColor(job: CronJob): 'green' | 'amber' | 'red' | 'gray' {
    if (!job.active) return 'gray'
    if (!job.last_run) return 'gray'
    if (job.last_status === 'failed') return 'red'
    return 'green'
}

const DOT_CLS = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-400',
    red:   'bg-red-500 animate-pulse',
    gray:  'bg-gray-500/40',
}

export function CronClient({ jobs }: { jobs: Array<Record<string, unknown>> }) {
    const { t } = useAdminTheme()
    const typedJobs = jobs as unknown as CronJob[]

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Cron Health</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                {typedJobs.length} jobs · {typedJobs.filter(j => j.last_status === 'succeeded').length} healthy · {typedJobs.filter(j => j.last_status === 'failed').length} failed
            </p>

            <div className="flex flex-col gap-3">
                {typedJobs.map(job => (
                    <JobCard key={job.jobname} job={job} />
                ))}
            </div>
        </div>
    )
}

function JobCard({ job }: { job: CronJob }) {
    const { t } = useAdminTheme()
    const health = healthColor(job)
    const [expanded, setExpanded] = useState(false)
    const [history, setHistory] = useState<RunDetail[] | null>(null)
    const [loading, startTransition] = useTransition()

    function toggleHistory() {
        if (expanded) {
            setExpanded(false)
            return
        }
        setExpanded(true)
        if (!history) {
            startTransition(async () => {
                const runs = await fetchJobHistory(job.jobname)
                setHistory(runs)
            })
        }
    }

    return (
        <div className={`${t.card} rounded-xl overflow-hidden`}>
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={toggleHistory}
            >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLS[health]}`} />
                <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-bold ${t.heading}`}>
                        {FRIENDLY[job.jobname] ?? job.jobname}
                    </div>
                    <div className={`text-[10px] font-semibold tabular-nums ${t.faint}`}>
                        {job.schedule}
                        {job.last_run && ` · Last: ${formatAge(job.last_run)}`}
                        {job.last_duration_ms != null && ` · ${Math.round(job.last_duration_ms)}ms`}
                    </div>
                </div>
                <span className={t.faint}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
            </div>

            {expanded && (
                <div className={`px-4 pb-3 border-t ${t.border}`}>
                    {/* Last message */}
                    {job.last_message && (
                        <div className={`mt-2 px-3 py-2 rounded-lg text-[11px] font-medium whitespace-pre-wrap ${
                            job.last_status === 'failed' ? t.dangerBg : `${t.muted} bg-current/[0.03]`
                        } ${job.last_status === 'failed' ? t.danger : t.body}`}>
                            {job.last_message}
                        </div>
                    )}

                    {/* Run history */}
                    <div className={`mt-3 text-[10px] font-bold tracking-[0.10em] uppercase mb-2 ${t.faint}`}>
                        Run History
                    </div>
                    {loading && <div className={`text-[11px] py-2 ${t.faint}`}>Loading...</div>}
                    {history && history.length === 0 && <div className={`text-[11px] py-2 ${t.faint}`}>No run history</div>}
                    {history && history.length > 0 && (
                        <div className="flex flex-col gap-0">
                            {history.map(run => (
                                <div key={run.runid} className={`flex items-center gap-2 py-1.5 border-b last:border-b-0 ${t.border}`}>
                                    <span className={run.status === 'succeeded' ? t.success : t.danger}>
                                        {run.status === 'succeeded' ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                                    </span>
                                    <span className={`text-[11px] font-medium flex-1 ${t.body}`}>
                                        {run.status}
                                    </span>
                                    {run.duration_ms != null && (
                                        <span className={`text-[10px] tabular-nums ${t.faint}`}>
                                            {Math.round(run.duration_ms)}ms
                                        </span>
                                    )}
                                    <span className={`text-[10px] tabular-nums ${t.faint}`}>
                                        {formatTimestamp(run.start_time)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function formatAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime()
    const mins = Math.round(ms / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.round(hours / 24)}d ago`
}

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
