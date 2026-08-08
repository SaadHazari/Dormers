'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import {
    DOT_COLORS, HEALTH_WORDS, formatAge, getJobHealth, getJobInfo, groupJobs,
    healthTextClass, isUnhealthy,
    type CronJob, type JobHealth,
} from '../_components/cron-registry'

import { fetchJobHistory } from './actions'

interface RunDetail {
    runid: number
    status: string
    start_time: string
    end_time: string | null
    duration_ms: number | null
    message: string | null
}

export function CronClient({ jobs }: { jobs: Array<Record<string, unknown>> }) {
    const { t } = useAdminTheme()
    const typedJobs = jobs as unknown as CronJob[]
    const focusJob = useSearchParams().get('job')

    const counts: Partial<Record<JobHealth, number>> = {}
    for (const job of typedJobs) {
        const health = getJobHealth(job)
        counts[health] = (counts[health] ?? 0) + 1
    }

    return (
        <div>
            <h1 className={`text-xl font-black tracking-tight mb-1 ${t.heading}`}>Scheduled Jobs</h1>
            <p className={`text-[13px] font-medium mb-5 ${t.muted}`}>
                {typedJobs.length} jobs
                {(['ok', 'overdue', 'failed', 'stopped', 'off', 'never'] as JobHealth[]).map(health => (
                    counts[health] ? (
                        <span key={health}>
                            {' · '}
                            <span className={healthTextClass(t, health)}>
                                {counts[health]} {HEALTH_WORDS[health].toLowerCase()}
                            </span>
                        </span>
                    ) : null
                ))}
            </p>

            <div className="flex flex-col gap-5">
                {groupJobs(typedJobs).map(section => (
                    <div key={section.group}>
                        <div className={`text-[10px] font-black tracking-[0.12em] uppercase mb-2 ${t.faint}`}>
                            {section.label}
                        </div>
                        <div className="flex flex-col gap-3">
                            {section.jobs.map(job => (
                                <JobCard key={job.jobname} job={job} focus={job.jobname === focusJob} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function JobCard({ job, focus }: { job: CronJob; focus: boolean }) {
    const { t } = useAdminTheme()
    const health = getJobHealth(job)
    const info = getJobInfo(job.jobname)
    const [expanded, setExpanded] = useState(focus)
    const [history, setHistory] = useState<RunDetail[] | null>(null)
    const [loading, startTransition] = useTransition()
    const cardRef = useRef<HTMLDivElement>(null)
    const didFocus = useRef(false)

    useEffect(() => {
        if (focus && !didFocus.current) {
            didFocus.current = true
            cardRef.current?.scrollIntoView({ block: 'center' })
            startTransition(async () => {
                const runs = await fetchJobHistory(job.jobname)
                setHistory(runs)
            })
        }
    }, [focus, job.jobname, startTransition])

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
        <div ref={cardRef} className={`${t.card} rounded-xl overflow-hidden`}>
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={toggleHistory}
            >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLORS[health]}`} />
                <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-bold ${t.heading}`}>
                        {info.label}
                    </div>
                    <div className={`text-[10px] font-semibold tabular-nums ${t.faint}`}>
                        {job.schedule}
                        {job.last_run && ` · Last: ${formatAge(job.last_run)}`}
                        {job.last_duration_ms != null && ` · ${Math.round(job.last_duration_ms)}ms`}
                    </div>
                </div>
                {health !== 'ok' && (
                    <span className={`text-[10px] font-bold shrink-0 ${healthTextClass(t, health)}`}>
                        {HEALTH_WORDS[health]}
                    </span>
                )}
                <span className={t.faint}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
            </div>

            {expanded && (
                <div className={`px-4 pb-3 border-t ${t.border}`}>
                    {/* What this job does, in customer terms */}
                    <div className={`mt-2 text-[11px] font-medium ${t.muted}`}>
                        {info.does}
                    </div>

                    {/* Who is affected right now + where to act */}
                    {isUnhealthy(health) && (
                        <div className={`mt-2 px-3 py-2 rounded-lg border text-[11px] font-semibold ${
                            health === 'overdue'
                                ? `${t.warningBg} ${t.warning}`
                                : `${t.dangerBg} ${t.danger}`
                        }`}>
                            {info.impact}.
                            {info.actionHref && (
                                <Link
                                    href={info.actionHref}
                                    className="underline font-bold ml-2"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {info.actionLabel ?? 'Open'}
                                </Link>
                            )}
                        </div>
                    )}

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

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString('en-AE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Dubai',
    })
}
