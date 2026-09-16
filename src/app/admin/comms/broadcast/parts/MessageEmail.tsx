'use client'

import { useMemo } from 'react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'
import { buildBroadcastEmailHtml, reasonLineFor } from '@/infra/zeptomail/broadcast-shell'

const SUBJECT_MAX = 200
const BODY_MAX = 8000

/**
 * Step 2 on email.
 *
 * These go out through ZeptoMail, which suspends accounts that send marketing,
 * so this is for account notices only — the reopening notice, a service
 * change. The note at the top says so plainly, because the channel toggle
 * alone does not tell anyone where promotional email belongs.
 */
export function MessageEmail({
    mode, onMode, subject, onSubject, heading, onHeading, body, onBody,
    ctaLabel, onCtaLabel, ctaUrl, onCtaUrl, audience,
}: {
    mode: 'custom' | 'season_reopen'
    onMode: (m: 'custom' | 'season_reopen') => void
    subject: string; onSubject: (v: string) => void
    heading: string; onHeading: (v: string) => void
    body: string; onBody: (v: string) => void
    ctaLabel: string; onCtaLabel: (v: string) => void
    ctaUrl: string; onCtaUrl: (v: string) => void
    audience: string
}) {
    const { t } = useAdminTheme()

    const previewHtml = useMemo(() => buildBroadcastEmailHtml({
        firstName: 'Ahmed',
        heading: heading.trim() || 'Your heading',
        bodyText: body.trim() || 'Your message. Leave a blank line between paragraphs.',
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        reasonLine: reasonLineFor(audience),
    }), [heading, body, ctaLabel, ctaUrl, audience])

    return (
        <div className="flex flex-col gap-5">
            <div className={`rounded-xl border px-4 py-3 text-[13px] font-medium leading-relaxed ${t.warningBg} ${t.body}`}>
                <strong className={t.heading}>Account notices only.</strong> Email from here goes through ZeptoMail,
                which suspends accounts that send promotions — and that would stop your order confirmations too.
                Offers and news go out from Zoho Campaigns.
            </div>

            <div className={`inline-flex self-start rounded-lg border p-0.5 ${t.border}`} role="radiogroup" aria-label="Kind of email">
                {([
                    ['custom', 'Write a notice'],
                    ['season_reopen', 'Season reopening'],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={mode === key}
                        onClick={() => onMode(key)}
                        className={`px-3.5 py-1.5 rounded-md text-[13px] font-bold transition-colors ${
                            mode === key ? 'bg-[#f57f20] text-white' : t.muted
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {mode === 'season_reopen' ? (
                <p className={`text-[14px] font-medium leading-relaxed ${t.body}`}>
                    The reopening notice is a fixed ZeptoMail template, rendered per person: anyone holding
                    credit sees their amount and a <em>Use my credit</em> button, everyone else sees
                    <em> Restart my plan</em>. There is nothing to write — the wording lives in the template
                    so it always matches what each person actually has.
                </p>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-4 min-w-0">
                        <Field label="Subject" hint={`${subject.length}/${SUBJECT_MAX}`}>
                            <input
                                value={subject}
                                maxLength={SUBJECT_MAX}
                                onChange={e => onSubject(e.target.value)}
                                placeholder="What they see in their inbox"
                                className={`rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        </Field>
                        <Field label="Heading">
                            <input
                                value={heading}
                                onChange={e => onHeading(e.target.value)}
                                placeholder="The first line inside the email"
                                className={`rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${t.input} ${t.inputFocus}`}
                            />
                        </Field>
                        <Field label="Message" hint={`${body.length}/${BODY_MAX}`}>
                            <textarea
                                value={body}
                                maxLength={BODY_MAX}
                                onChange={e => onBody(e.target.value)}
                                rows={8}
                                placeholder={'Hi {{first_name}},\n\nLeave a blank line between paragraphs.'}
                                className={`rounded-lg border px-3 py-2.5 text-[14px] font-medium leading-relaxed resize-y ${t.input} ${t.inputFocus}`}
                            />
                        </Field>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Button text" hint="optional">
                                <input
                                    value={ctaLabel}
                                    onChange={e => onCtaLabel(e.target.value)}
                                    placeholder="See the menu"
                                    className={`rounded-lg border px-3 py-2.5 text-[14px] font-medium ${t.input} ${t.inputFocus}`}
                                />
                            </Field>
                            <Field label="Button link" hint="optional">
                                <input
                                    value={ctaUrl}
                                    onChange={e => onCtaUrl(e.target.value)}
                                    placeholder="https://dormers.ae/…"
                                    className={`rounded-lg border px-3 py-2.5 text-[14px] font-medium ${t.input} ${t.inputFocus}`}
                                />
                            </Field>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className={`text-[11px] font-black uppercase tracking-[0.12em] mb-3 ${t.faint}`}>
                            What Ahmed will see
                        </div>
                        <iframe
                            title="Email preview"
                            srcDoc={previewHtml}
                            className={`w-full h-[560px] rounded-xl border ${t.border}`}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    const { t } = useAdminTheme()
    return (
        <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
                <span className={`text-[13px] font-bold ${t.heading}`}>{label}</span>
                {hint && <span className={`text-[11px] font-medium tabular-nums ${t.faint}`}>{hint}</span>}
            </span>
            {children}
        </label>
    )
}
