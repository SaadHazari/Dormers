'use client'

import { useState, useTransition } from 'react'
import { Check, Circle, StickyNote } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { setReviewAddressed, saveReviewNote } from './actions'
import type { ReviewAdminStatus } from '@/infra/supabase/reviews-repo'

interface Props {
    reviewType: 'weekly' | 'monthly'
    reviewId: string
    initialStatus: ReviewAdminStatus | null
    initialNote: string | null
}

export function ReviewTriage({ reviewType, reviewId, initialStatus, initialNote }: Props) {
    const { t } = useAdminTheme()
    const [status, setStatus] = useState<ReviewAdminStatus>(initialStatus ?? 'open')
    const [note, setNote] = useState(initialNote ?? '')
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(initialNote ?? '')
    const [err, setErr] = useState<string | null>(null)
    const [pending, start] = useTransition()

    const addressed = status === 'addressed'

    function toggle() {
        const next: ReviewAdminStatus = addressed ? 'open' : 'addressed'
        const prev = status
        setStatus(next) // optimistic
        setErr(null)
        start(async () => {
            const res = await setReviewAddressed(reviewType, reviewId, next === 'addressed')
            if (!res.ok) { setStatus(prev); setErr(res.message) }
        })
    }

    function save() {
        const value = draft.trim()
        setErr(null)
        start(async () => {
            const res = await saveReviewNote(reviewType, reviewId, value)
            if (res.ok) { setNote(value); setEditing(false) }
            else setErr(res.message)
        })
    }

    return (
        <div className={`mt-2.5 pt-2.5 border-t ${t.border}`}>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={toggle}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.06em] border transition-colors disabled:opacity-50 ${
                        addressed ? `${t.successBg} ${t.success}` : `${t.card} ${t.muted}`
                    }`}
                >
                    {addressed ? <Check size={12} strokeWidth={2.6} /> : <Circle size={12} strokeWidth={2.4} />}
                    {addressed ? 'Addressed' : 'Mark addressed'}
                </button>

                {!editing && (
                    <button
                        type="button"
                        onClick={() => { setDraft(note); setEditing(true); setErr(null) }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.06em] border ${t.card} ${t.muted} transition-colors`}
                    >
                        <StickyNote size={12} strokeWidth={2.4} />
                        {note ? 'Edit note' : 'Add note'}
                    </button>
                )}

                {err && <span className={`text-[11px] font-bold ${t.danger}`}>{err}</span>}
            </div>

            {!editing && note && (
                <p className={`mt-2 text-[12px] leading-relaxed px-2.5 py-2 rounded-lg ${t.tableHeader} ${t.body}`}>
                    <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${t.faint} block mb-0.5`}>Internal note</span>
                    {note}
                </p>
            )}

            {editing && (
                <div className="mt-2">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="Internal note — only admins see this…"
                        className={`w-full rounded-lg border px-2.5 py-2 text-[12px] font-semibold outline-none ${t.input} ${t.inputFocus}`}
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                        <button
                            type="button"
                            onClick={save}
                            disabled={pending}
                            className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.06em] bg-[#f57f20] text-white transition-opacity disabled:opacity-50"
                        >
                            {pending ? 'Saving…' : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setEditing(false); setDraft(note); setErr(null) }}
                            className={`inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.06em] border ${t.card} ${t.muted}`}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
