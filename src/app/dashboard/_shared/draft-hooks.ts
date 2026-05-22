'use client'

import { useEffect, useState } from 'react'

/**
 * Reads the in-progress weekly review draft for the given week from
 * localStorage. Returns true only when the draft has meaningful user input —
 * a draft that only carries `step: 1` (the form opened, the user bounced)
 * does NOT count, otherwise the trigger would lie about resumable work.
 */
export function useWeeklyDraftActive(week: number): boolean {
    const [active, setActive] = useState(false)
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const raw = window.localStorage.getItem(`dormers:weekly-review:draft:v1:${week}`)
            if (!raw) return
            const d = JSON.parse(raw) as Record<string, unknown>
            const meaningful =
                (typeof d.step === 'number' && d.step > 1) ||
                (typeof d.rating === 'number' && d.rating > 0) ||
                (Array.isArray(d.favorites) && d.favorites.length > 0) ||
                (Array.isArray(d.misses) && d.misses.length > 0) ||
                (typeof d.kitchenNote === 'string' && d.kitchenNote.length > 0) ||
                d.delivery === 'up' || d.delivery === 'down' ||
                d.packaging === 'up' || d.packaging === 'down'
            if (meaningful) setActive(true)
        } catch { /* corrupt draft — ignore */ }
    }, [week])
    return active
}

/**
 * Reads the in-progress monthly review draft and returns true only when it
 * carries meaningful input AND matches the current cycle. Used by the
 * monthly trigger card to flip "Open your wrap" → "Resume your wrap".
 */
export function useMonthlyDraftActive(cycleLabel: string): boolean {
    const [active, setActive] = useState(false)
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const raw = window.localStorage.getItem('dormers:monthly-review:draft:v1')
            if (!raw) return
            const d = JSON.parse(raw) as Record<string, unknown>
            if (d.cycleLabel !== cycleLabel) return
            const meaningful =
                (typeof d.step === 'number' && d.step > 0) ||
                (Array.isArray(d.signupTriggers) && d.signupTriggers.length > 0) ||
                (Array.isArray(d.jobs) && d.jobs.length > 0) ||
                (typeof d.bestMoment === 'string' && d.bestMoment.length > 0) ||
                (typeof d.frictionMoment === 'string' && d.frictionMoment.length > 0) ||
                (typeof d.alternative === 'string' && d.alternative.length > 0) ||
                (typeof d.renewalIntent === 'string' && d.renewalIntent.length > 0) ||
                (typeof d.recommend === 'string' && d.recommend.length > 0)
            if (meaningful) setActive(true)
        } catch { /* corrupt draft — ignore */ }
    }, [cycleLabel])
    return active
}
