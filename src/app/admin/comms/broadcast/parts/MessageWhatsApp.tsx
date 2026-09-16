'use client'

import { RefreshCw } from 'lucide-react'
import { useAdminTheme } from '../../../_components/AdminThemeProvider'
import type { WhatsAppTemplateRow } from '../page'

/**
 * Step 2 on WhatsApp: pick an approved template and fill its blanks.
 *
 * Meta will not carry free text for marketing, so there is no message box to
 * type into — pretending otherwise was part of what made the old composer hard
 * to read. The templates are cards showing their actual wording, because
 * "season_credit_waiting" tells you nothing about what a customer will see.
 */
export function MessageWhatsApp({
    templates, selectedKey, onSelect, values, onValue, onSync, syncing, syncNote,
}: {
    templates: WhatsAppTemplateRow[]
    selectedKey: string
    onSelect: (key: string) => void
    values: Record<string, string>
    onValue: (name: string, value: string) => void
    onSync: () => void
    syncing: boolean
    syncNote: string | null
}) {
    const { t } = useAdminTheme()
    const approved = templates.filter(x => x.approved_at && x.category === 'MARKETING')
    const template = approved.find(x => keyOf(x) === selectedKey) ?? null

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                    <p className={`text-[13px] font-medium ${t.muted}`}>
                        {approved.length} marketing templates approved by Meta.
                    </p>
                    <button
                        type="button"
                        onClick={onSync}
                        disabled={syncing}
                        className={`inline-flex items-center gap-1.5 text-[12px] font-bold ${t.muted} hover:opacity-80 disabled:opacity-50`}
                    >
                        <RefreshCw size={13} strokeWidth={2.4} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Checking Meta…' : 'Refresh from Meta'}
                    </button>
                </div>
                {syncNote && <p className={`text-[12px] font-bold -mt-3 ${t.muted}`}>{syncNote}</p>}

                {approved.length === 0 ? (
                    <div className={`rounded-xl border px-4 py-5 ${t.border}`}>
                        <p className={`text-[14px] font-bold ${t.heading}`}>No marketing templates yet</p>
                        <p className={`text-[13px] font-medium mt-1 ${t.muted}`}>
                            Create one in Meta Business Manager under Message Templates, wait for approval,
                            then press Refresh from Meta.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Template">
                        {approved.map(x => {
                            const active = keyOf(x) === selectedKey
                            return (
                                <button
                                    key={keyOf(x)}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => onSelect(keyOf(x))}
                                    className={`text-left rounded-xl border px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20] ${
                                        active ? t.cardActive : `${t.border} ${t.cardHover}`
                                    }`}
                                >
                                    <div className={`text-[13px] font-bold ${active ? t.accent : t.heading}`}>
                                        {humanise(x.name)}
                                    </div>
                                    <div className={`text-[12px] font-medium mt-1 leading-relaxed line-clamp-2 ${t.muted}`}>
                                        {x.body_preview}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}

                {template && template.variables.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <h3 className={`text-[11px] font-black uppercase tracking-[0.12em] ${t.faint}`}>
                            Fill in the blanks
                        </h3>
                        {template.variables.map(name => (
                            <label key={name} className="flex flex-col gap-1.5">
                                <span className={`text-[13px] font-bold ${t.heading}`}>{humanise(name)}</span>
                                <input
                                    type="text"
                                    value={values[name] ?? ''}
                                    onChange={e => onValue(name, e.target.value)}
                                    placeholder={name === 'first_name' ? '{{first_name}} — each person’s own name' : ''}
                                    className={`rounded-lg border px-3 py-2.5 text-[14px] font-medium ${t.input} ${t.inputFocus}`}
                                />
                            </label>
                        ))}
                        <p className={`text-[12px] font-medium ${t.faint}`}>
                            Type <code className={t.muted}>{'{{first_name}}'}</code> in any blank to use each person’s name.
                        </p>
                    </div>
                )}
            </div>

            <div className="lg:sticky lg:top-6 self-start">
                <h3 className={`text-[11px] font-black uppercase tracking-[0.12em] mb-3 ${t.faint}`}>
                    What Ahmed will see
                </h3>
                <PhonePreview text={template ? fillIn(template, values) : null} />
            </div>
        </div>
    )
}

/**
 * A WhatsApp bubble, not an email frame. What is being reviewed is a chat
 * message on a phone, and it should look like one.
 */
function PhonePreview({ text }: { text: string | null }) {
    const { t } = useAdminTheme()
    return (
        <div className="rounded-2xl p-4 min-h-[180px]" style={{ backgroundColor: '#efe7dd' }}>
            {text ? (
                <div
                    className="max-w-[92%] rounded-lg rounded-tl-none px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap shadow-sm"
                    style={{ backgroundColor: '#ffffff', color: '#111b21' }}
                >
                    {whatsAppFormat(text)}
                    <div className="text-right text-[11px] mt-1" style={{ color: '#667781' }}>9:41 PM</div>
                </div>
            ) : (
                <p className={`text-[13px] font-medium text-center pt-12 ${t.muted}`} style={{ color: '#667781' }}>
                    Pick a template to see it here.
                </p>
            )}
        </div>
    )
}

/**
 * WhatsApp's own markup — *bold*, _italic_, ~strike~ — as it renders on the
 * phone. Showing the raw asterisks would misrepresent the message the preview
 * exists to show. Built as React nodes, never HTML, so template text cannot
 * inject markup.
 */
function whatsAppFormat(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = []
    const re = /([*_~])([^*_~\n]+?)\1/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const inner = m[2]
        out.push(
            m[1] === '*' ? <strong key={m.index}>{inner}</strong>
                : m[1] === '_' ? <em key={m.index}>{inner}</em>
                    : <s key={m.index}>{inner}</s>,
        )
        last = m.index + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}

export function keyOf(x: { name: string; language: string }) {
    return `${x.name}|${x.language}`
}

/** "season_credit_waiting" → "Season credit waiting"; "credit_aed" → "Credit AED". */
function humanise(s: string) {
    const words = s.replace(/_/g, ' ').trim()
        .replace(/\b(aed|id|url|cta|v\d+)\b/gi, m => m.toUpperCase())
    return words.charAt(0).toUpperCase() + words.slice(1)
}

function fillIn(template: WhatsAppTemplateRow, values: Record<string, string>) {
    return template.variables.reduce((text, name) => {
        const v = (values[name] || '').trim() || `[${humanise(name).toLowerCase()}]`
        const shown = v.replace(/\{\{\s*first_name\s*\}\}/g, 'Ahmed')
        return text.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), shown)
    }, template.body_preview)
}
