'use client'

import Link from 'next/link'
import { useAdminTheme } from './AdminThemeProvider'
import {
    DOT_COLORS, HEALTH_WORDS, formatAge, getJobHealth, getJobInfo, groupJobs,
    healthTextClass, isUnhealthy,
    type CronJob, type JobHealth,
} from './cron-registry'

export type { CronJob } from './cron-registry'

interface Props {
    jobs: CronJob[]
}

export function PulseStrip({ jobs }: Props) {
    const { t } = useAdminTheme()

    const counts: Partial<Record<JobHealth, number>> = {}
    for (const job of jobs) {
        const health = getJobHealth(job)
        counts[health] = (counts[health] ?? 0) + 1
    }

    const sections = groupJobs(jobs)
    const visibleSections = sections.filter(s => s.group !== 'housekeeping')
    const housekeeping = sections.find(s => s.group === 'housekeeping')
    const housekeepingBad = housekeeping?.jobs.filter(j => isUnhealthy(getJobHealth(j))).length ?? 0

    return (
        <div className={`${t.card} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
                <h2 className={`text-[11px] font-black tracking-[0.14em] uppercase ${t.muted}`}>
                    System Pulse
                </h2>
                <div className="flex items-center gap-3">
                    {(['ok', 'overdue', 'failed', 'stopped'] as JobHealth[]).map(health => (
                        counts[health] ? (
                            <span key={health} className={`text-[10px] font-bold tabular-nums ${healthTextClass(t, health)}`}>
                                {counts[health]} {HEALTH_WORDS[health].toLowerCase()}
                            </span>
                        ) : null
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                {visibleSections.map(section => (
                    <div key={section.group}>
                        <div className={`text-[9px] font-black tracking-[0.12em] uppercase mb-1.5 ${t.faint}`}>
                            {section.label}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {section.jobs.map(job => (
                                <JobTile key={job.jobname} job={job} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {housekeeping && (
                <details className="mt-3">
                    <summary className={`text-[10px] font-bold tracking-[0.08em] uppercase cursor-pointer ${t.faint} hover:${t.muted}`}>
                        Housekeeping · {housekeeping.jobs.length} jobs
                        {housekeepingBad > 0 && (
                            <span className={t.danger}> · {housekeepingBad} need attention</span>
                        )}
                    </summary>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {housekeeping.jobs.map(job => (
                            <JobTile key={job.jobname} job={job} />
                        ))}
                    </div>
                </details>
            )}
        </div>
    )
}

function JobTile({ job }: { job: CronJob }) {
    const { t, isLight } = useAdminTheme()
    const health = getJobHealth(job)
    const info = getJobInfo(job.jobname)

    return (
        <Link
            href={`/admin/cron?job=${encodeURIComponent(job.jobname)}`}
            className={`flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors duration-100 ${
                isLight ? 'hover:bg-[#091825]/[0.04]' : 'hover:bg-white/[0.04]'
            }`}
        >
            <span className={`w-2 h-2 rounded-full shrink-0 mt-[3px] ${DOT_COLORS[health]}`} />
            <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-bold leading-tight ${t.body}`}>
                    {info.label}
                </div>
                <div className={`text-[9px] font-semibold tabular-nums ${t.faint}`}>
                    {health !== 'ok' && (
                        <span className={healthTextClass(t, health)}>{HEALTH_WORDS[health]}</span>
                    )}
                    {job.last_run && (
                        <span>{health !== 'ok' ? ' · ' : ''}{formatAge(job.last_run)}</span>
                    )}
                    {job.last_duration_ms != null && <span> · {Math.round(job.last_duration_ms)}ms</span>}
                </div>
                {isUnhealthy(health) && (
                    <div className={`mt-0.5 text-[9px] font-semibold leading-snug ${
                        health === 'overdue' ? t.warning : t.danger
                    }`}>
                        {info.impact}
                    </div>
                )}
            </div>
        </Link>
    )
}
