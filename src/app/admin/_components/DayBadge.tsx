'use client'

import { AdminBadge } from './AdminBadge'

function todayDubai(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
}

type DayTag = 'first' | 'last' | null

export function getDayTag(startDate: string | null, endDate: string | null, status: string | null): DayTag {
    if (!status || !['Active', 'Paused', 'Skipped', 'Scheduled'].includes(status)) return null
    const today = todayDubai()
    if (today === startDate) return 'first'
    if (today === endDate) return 'last'
    return null
}

export function DayBadge({ startDate, endDate, status }: {
    startDate: string | null
    endDate: string | null
    status: string | null
}) {
    const tag = getDayTag(startDate, endDate, status)
    if (!tag) return null
    return (
        <AdminBadge variant={tag === 'first' ? 'active' : 'warning'}>
            {tag === 'first' ? 'First day' : 'Last day'}
        </AdminBadge>
    )
}
