'use client'

import { Check } from 'lucide-react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'

export type StepState = 'active' | 'done' | 'upcoming'

/**
 * One step of the send, with three honest states.
 *
 * Active is open and is the only place orange appears on the page apart from
 * the Send button — so the eye lands where the next decision is. Done folds to
 * a single line that says what was decided, with a way back. Upcoming is
 * present but quiet, so the shape of the whole job is visible from the start
 * without competing with the question in front of you.
 */
export function StepCard({
    n, title, state, summary, onEdit, children,
}: {
    n: number
    title: string
    state: StepState
    /** What was decided, shown once the step is done. */
    summary?: React.ReactNode
    onEdit?: () => void
    children?: React.ReactNode
}) {
    const { t } = useAdminTheme()
    const active = state === 'active'
    const done = state === 'done'

    return (
        <section
            aria-current={active ? 'step' : undefined}
            // One surface colour for every step; the active one is marked by a
            // ring, not a tint. A tinted card read brown against blue ones in
            // the dark theme — two hues where there should be one.
            className={`rounded-2xl transition-shadow ${t.card} ${active ? 'ring-1 ring-[#f57f20]/45' : ''}`}
        >
            <header className="flex items-center gap-3 px-5 py-4">
                <span
                    className={`grid place-items-center shrink-0 w-7 h-7 rounded-full text-[12px] font-black tabular-nums ${
                        done
                            ? `${t.successBg} ${t.success} border`
                            : active
                                ? 'bg-[#f57f20] text-white'
                                : `border ${t.border} ${t.faint}`
                    }`}
                >
                    {done ? <Check size={14} strokeWidth={3} /> : n}
                </span>

                <div className="min-w-0 flex-1">
                    <h2 className={`text-[15px] font-black tracking-tight ${state === 'upcoming' ? t.faint : t.heading}`}>
                        {title}
                    </h2>
                    {done && summary && (
                        <div className={`text-[13px] font-medium mt-0.5 truncate ${t.muted}`}>{summary}</div>
                    )}
                </div>

                {done && onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className={`shrink-0 text-[12px] font-bold ${t.accent} hover:underline underline-offset-4`}
                    >
                        Change
                    </button>
                )}
            </header>

            {active && children && (
                <div className={`border-t ${t.border} px-5 py-5`}>{children}</div>
            )}
        </section>
    )
}
