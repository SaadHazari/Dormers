import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COUNTRIES, combinePhone, splitPhone, type Country } from './countries'

// ─── shared UI primitives ─────────────────────────────────────────────────────

export const SelectCard = ({
    selected, onClick, emoji, label, desc,
}: { selected: boolean; onClick: () => void; emoji: string; label: string; desc?: string }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border text-left transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.06]'
                : 'border-[#1e3448] bg-[#0d2035] hover:border-[#2a4a68] hover:bg-[#0f2540]'
        }`}
    >
        <span className="text-xl shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
            <p className={`font-semibold text-[14px] ${selected ? 'text-white' : 'text-white/80'}`}>{label}</p>
            {desc && <p className="text-white/40 text-[12px] mt-0.5 leading-snug">{desc}</p>}
        </div>
        {selected && <Check size={15} className="text-[#f57f20] shrink-0" strokeWidth={2.5} />}
    </button>
)

export const PillCard = ({
    selected, onClick, label,
}: { selected: boolean; onClick: () => void; label: string }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all duration-150 ${
            selected
                ? 'border-[#f57f20] bg-[#f57f20]/[0.07] text-white'
                : 'border-[#1e3448] bg-[#0d2035] text-white/55 hover:border-[#2a4a68] hover:text-white/80'
        }`}
    >
        {selected && <Check size={12} className="text-[#f57f20] shrink-0" strokeWidth={3} />}
        <span className="text-[13px] font-semibold">{label}</span>
    </button>
)

export const CtaButton = ({
    children, onClick, disabled = false, type = 'button',
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none text-white font-bold text-[14px] py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_4px_28px_rgba(245,127,32,0.4)]"
    >
        {children}
    </button>
)

export const FieldInput = ({
    label, ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
        <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
            {label}
        </label>
        <input
            {...props}
            className={`w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 text-white text-[14px] placeholder-white/20 outline-none transition-all ${props.className ?? ''}`}
        />
    </div>
)

// Phone with split country-code dropdown + local-number input.
// Lifts the combined E.164 string ("+971504619384") to the parent via onChange,
// which stays compatible with the existing customers.whatsapp_number TEXT column.
export const PhoneField = ({
    label, value, onChange, placeholder, disabled,
}: {
    label: string
    value: string
    onChange: (e164: string) => void
    placeholder?: string
    disabled?: boolean
}) => {
    const initial = useMemo(() => splitPhone(value), []) // eslint-disable-line react-hooks/exhaustive-deps
    const [country, setCountry] = useState<Country>(initial.country)
    const [local,   setLocal]   = useState(initial.local)
    const [open,    setOpen]    = useState(false)
    const [query,   setQuery]   = useState('')
    const [mounted, setMounted] = useState(false)
    const [anchor,  setAnchor]  = useState<{ left: number; top: number } | null>(null)
    const wrapRef    = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const popRef     = useRef<HTMLDivElement>(null)
    const searchRef  = useRef<HTMLInputElement>(null)

    // Portal needs document.body — only available on the client.
    useEffect(() => { setMounted(true) }, [])

    // Keep parent in sync whenever either part changes.
    useEffect(() => {
        onChange(combinePhone(country, local))
    }, [country, local]) // eslint-disable-line react-hooks/exhaustive-deps

    // Compute the trigger's screen rect so the portal'd popover can pin to it.
    // Recalc on open + on scroll/resize while open so the popover tracks the
    // input even if the page moves under it.
    useLayoutEffect(() => {
        if (!open) return
        const update = () => {
            const r = triggerRef.current?.getBoundingClientRect()
            if (r) setAnchor({ left: r.left, top: r.bottom }) // popover top sits just under the trigger
        }
        update()
        window.addEventListener('scroll',  update, true)
        window.addEventListener('resize',  update)
        return () => {
            window.removeEventListener('scroll', update, true)
            window.removeEventListener('resize', update)
        }
    }, [open])

    // Click-outside to close. Checks both the trigger wrapper AND the portal'd
    // popover, since the popover is no longer a DOM descendant of the field.
    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            const t = e.target as Node
            if (wrapRef.current?.contains(t)) return
            if (popRef.current?.contains(t))  return
            setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    // Esc closes; focus the search field on open.
    useEffect(() => {
        if (!open) return
        searchRef.current?.focus()
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const filtered = query.trim()
        ? COUNTRIES.filter(c => {
            const q = query.toLowerCase()
            return c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q)
        })
        : COUNTRIES

    return (
        <div ref={wrapRef} className="relative">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/35 mb-1.5">
                {label}
            </label>
            <div className="flex gap-2">
                {/* Country code trigger */}
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={`shrink-0 flex items-center gap-1.5 bg-[#0d2035] border rounded-xl px-3 py-3 text-white text-[14px] outline-none transition-all disabled:opacity-60 disabled:pointer-events-none ${
                        open
                            ? 'border-[#f57f20]/70 shadow-[0_0_0_3px_rgba(245,127,32,0.08)]'
                            : 'border-[#1e3448] hover:border-[#2a4a68]'
                    }`}
                >
                    <span className="text-[16px] leading-none">{country.flag}</span>
                    <span className="font-semibold tracking-tight">{country.dial}</span>
                    <ChevronDown size={14} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                </button>

                {/* Local number */}
                <input
                    type="tel"
                    inputMode="numeric"
                    value={local}
                    onChange={e => setLocal(e.target.value.replace(/[^\d\s-]/g, ''))}
                    placeholder={placeholder ?? '50 000 0000'}
                    disabled={disabled}
                    className="flex-1 min-w-0 w-full bg-[#0d2035] border border-[#1e3448] hover:border-[#2a4a68] focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] rounded-xl px-4 py-3 text-white text-[14px] placeholder-white/20 outline-none transition-all disabled:opacity-60"
                />
            </div>

            {/* Popover renders into <body> via portal. The step's parent
                <motion.div> sets `transform`, which creates a stacking context —
                rendering the popover inside the field wrapper made z-index local
                to that context, so the orange CTA showed through. Portaling to
                body escapes the context entirely.

                Opens downward from the trigger (the standard pattern users
                expect). The backdrop scrim dims the rest of the form so the
                Continue CTA below the popover recedes visually instead of
                competing with the country list. Click backdrop to dismiss.

                Position is computed from the trigger's getBoundingClientRect()
                and lives in viewport coords (position: fixed). */}
            {mounted && open && anchor && createPortal(
                <>
                    {/* Scrim — dims the form behind the popover */}
                    <div
                        onClick={() => setOpen(false)}
                        aria-hidden
                        style={{
                            position:        'fixed',
                            inset:           0,
                            zIndex:          9998,
                            backgroundColor: 'rgba(6,21,32,0.65)',
                        }}
                    />
                    {/* Popover card */}
                    <div
                        ref={popRef}
                        role="listbox"
                        style={{
                            position:        'fixed',
                            zIndex:          9999,
                            left:            anchor.left,
                            top:             anchor.top + 8,
                            width:           280,
                            overflow:        'clip',
                            borderRadius:    12,
                            border:          '1px solid #2a4a68',
                            backgroundColor: '#0d2035',
                            backgroundImage: 'none',
                            boxShadow:       '0 24px 50px -8px rgba(0,0,0,0.75), 0 4px 12px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Integrated search header — no form-field framing; reads
                            as part of the popover, separated only by a hairline. */}
                        <div className="px-3 pt-3 pb-2 border-b border-white/[0.06]">
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search country or code"
                                className="w-full bg-transparent text-white text-[13px] placeholder-white/30 outline-none"
                            />
                        </div>
                        <div
                            style={{
                                maxHeight:         240,
                                overflowY:         'auto',
                                overflowX:         'hidden',
                                paddingTop:        4,
                                paddingBottom:     4,
                                overscrollBehavior:'contain',
                                WebkitOverflowScrolling: 'touch',
                            }}
                        >
                            {filtered.length === 0 && (
                                <p className="px-3 py-3 text-white/40 text-[12px]">No matches.</p>
                            )}
                            {filtered.map(c => {
                                const selected = c.code === country.code
                                return (
                                    <button
                                        key={c.code}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => { setCountry(c); setOpen(false); setQuery('') }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                            selected ? 'bg-[#f57f20]/[0.12]' : 'hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <span className="text-[16px] leading-none shrink-0">{c.flag}</span>
                                        <span className="flex-1 text-white text-[13px] font-medium truncate">{c.name}</span>
                                        <span className={`text-[12px] tabular-nums shrink-0 ${selected ? 'text-[#f57f20] font-semibold' : 'text-white/55'}`}>{c.dial}</span>
                                        {selected && <Check size={12} className="text-[#f57f20] shrink-0" strokeWidth={2.5} />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    )
}
