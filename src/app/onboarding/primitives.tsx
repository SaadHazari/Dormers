'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COUNTRIES, combinePhone, splitPhone, type Country } from './countries'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'

// ─── shared UI primitives ─────────────────────────────────────────────────────

export const SelectCard = ({
    selected, onClick, emoji, label, desc,
}: { selected: boolean; onClick: () => void; emoji: string; label: string; desc?: string }) => {
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border text-left transition-all duration-150 ${
                selected ? tokens.selectableSelected : tokens.selectableUnselected
            }`}
        >
            <span className="text-xl shrink-0">{emoji}</span>
            <div className="flex-1 min-w-0">
                <p className={`font-semibold text-[14px] ${
                    selected
                        ? tokens.heading
                        : (isLight ? 'text-[#091825]/85' : 'text-white/80')
                }`}>{label}</p>
                {desc && <p className={`text-[12px] mt-0.5 leading-snug ${tokens.subline}`}>{desc}</p>}
            </div>
            {selected && <Check size={15} className="text-[#f57f20] shrink-0" strokeWidth={2.5} />}
        </button>
    )
}

export const PillCard = ({
    selected, onClick, label,
}: { selected: boolean; onClick: () => void; label: string }) => {
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    const selectedText = isLight ? 'text-[#091825]' : 'text-white'
    const unselectedText = isLight ? 'text-[#091825]/65 hover:text-[#091825]' : 'text-white/65 hover:text-white'
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all duration-150 ${
                selected
                    ? `${tokens.selectableSelected} ${selectedText}`
                    : `${tokens.selectableUnselected} ${unselectedText}`
            }`}
        >
            {selected && <Check size={12} className="text-[#f57f20] shrink-0" strokeWidth={3} />}
            <span className="text-[13px] font-semibold">{label}</span>
        </button>
    )
}

export const CtaButton = ({
    children, onClick, disabled = false, loading = false, type = 'button',
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; type?: 'button' | 'submit' }) => {
    const isLight = useIsLight()
    const off = disabled || loading
    const stateCls = off
        ? (isLight
            ? 'bg-[#091825]/[0.06] text-[#091825]/65 pointer-events-none'
            : 'bg-white/[0.07] text-white/65 pointer-events-none')
        : 'bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] text-white shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_4px_28px_rgba(245,127,32,0.4)]'
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={off}
            className={`w-full flex items-center justify-center gap-2 font-bold text-[14px] py-3.5 rounded-xl transition-all ${stateCls}`}
        >
            {loading ? <CtaSpinner /> : children}
        </button>
    )
}

function CtaSpinner() {
    return (
        <span
            style={{
                display: 'inline-block',
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid currentColor',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
            }}
        />
    )
}

export const FieldInput = ({
    label, ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => {
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    return (
        <div>
            <label className={`block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${tokens.label}`}>
                {label}
            </label>
            <input
                {...props}
                className={`w-full rounded-xl px-4 py-3 text-[14px] outline-none transition-all border ${tokens.field} ${tokens.fieldFocus} ${props.className ?? ''}`}
            />
        </div>
    )
}

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
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
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

    useEffect(() => { setMounted(true) }, [])
    useEffect(() => {
        onChange(combinePhone(country, local))
    }, [country, local]) // eslint-disable-line react-hooks/exhaustive-deps

    useLayoutEffect(() => {
        if (!open) return
        const update = () => {
            const r = triggerRef.current?.getBoundingClientRect()
            if (r) setAnchor({ left: r.left, top: r.bottom })
        }
        update()
        window.addEventListener('scroll',  update, true)
        window.addEventListener('resize',  update)
        return () => {
            window.removeEventListener('scroll', update, true)
            window.removeEventListener('resize', update)
        }
    }, [open])

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

    // Theme-aware popover colours — keeps the portal'd dropdown matching the
    // surrounding form even though it lives outside the React tree.
    const popoverBg     = isLight ? '#ffffff' : '#0d2035'
    const popoverBorder = isLight ? 'rgba(9,24,37,0.12)' : '#2a4a68'
    const popoverShadow = isLight
        ? '0 24px 50px -8px rgba(9,24,37,0.18), 0 4px 12px rgba(9,24,37,0.10)'
        : '0 24px 50px -8px rgba(0,0,0,0.75), 0 4px 12px rgba(0,0,0,0.5)'
    const scrimColor    = isLight ? 'rgba(9,24,37,0.30)' : 'rgba(6,21,32,0.65)'

    return (
        <div ref={wrapRef} className="relative">
            <label className={`block text-[11px] font-bold uppercase tracking-widest mb-1.5 ${tokens.label}`}>
                {label}
            </label>
            <div className="flex gap-2">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-3 text-[14px] outline-none transition-all border disabled:opacity-60 disabled:pointer-events-none ${
                        isLight ? 'bg-white/80 text-[#091825]' : 'bg-[#0d2035]/80 text-white'
                    } ${
                        open
                            ? 'border-[#f57f20]/70 shadow-[0_0_0_3px_rgba(245,127,32,0.08)]'
                            : (isLight ? 'border-[#091825]/[0.12] hover:border-[#091825]/[0.22]' : 'border-[#1e3448] hover:border-[#2a4a68]')
                    }`}
                >
                    <span className="text-[16px] leading-none">{country.flag}</span>
                    <span className="font-semibold tracking-tight">{country.dial}</span>
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''} ${isLight ? 'text-[#091825]/60' : 'text-white/60'}`} strokeWidth={2.5} />
                </button>

                <input
                    type="tel"
                    inputMode="numeric"
                    value={local}
                    onChange={e => setLocal(e.target.value.replace(/[^\d\s-]/g, ''))}
                    placeholder={placeholder ?? '50 000 0000'}
                    disabled={disabled}
                    className={`flex-1 min-w-0 rounded-xl px-4 py-3 text-[14px] outline-none transition-all border ${tokens.field} ${tokens.fieldFocus} disabled:opacity-60`}
                />
            </div>

            {mounted && open && anchor && createPortal(
                <>
                    <div
                        onClick={() => setOpen(false)}
                        aria-hidden
                        style={{
                            position:        'fixed',
                            inset:           0,
                            zIndex:          9998,
                            backgroundColor: scrimColor,
                        }}
                    />
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
                            border:          `1px solid ${popoverBorder}`,
                            backgroundColor: popoverBg,
                            backgroundImage: 'none',
                            boxShadow:       popoverShadow,
                        }}
                    >
                        <div className={`px-3 pt-3 pb-2 border-b ${isLight ? 'border-[#091825]/[0.06]' : 'border-white/[0.06]'}`}>
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search country or code"
                                className={`w-full bg-transparent text-[13px] outline-none ${
                                    isLight ? 'text-[#091825] placeholder-[#091825]/55' : 'text-white placeholder-white/55'
                                }`}
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
                                <p className={`px-3 py-3 text-[12px] ${isLight ? 'text-[#091825]/65' : 'text-white/65'}`}>No matches.</p>
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
                                            selected
                                                ? 'bg-[#f57f20]/[0.12]'
                                                : (isLight ? 'hover:bg-[#091825]/[0.04]' : 'hover:bg-white/[0.04]')
                                        }`}
                                    >
                                        <span className="text-[16px] leading-none shrink-0">{c.flag}</span>
                                        <span className={`flex-1 text-[13px] font-medium truncate ${isLight ? 'text-[#091825]' : 'text-white'}`}>{c.name}</span>
                                        <span className={`text-[12px] tabular-nums shrink-0 ${selected ? 'text-[#f57f20] font-semibold' : (isLight ? 'text-[#091825]/55' : 'text-white/55')}`}>{c.dial}</span>
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
