'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CornerDownLeft } from 'lucide-react'
import { useCommandPalette, type PaletteCommand } from './CommandPaletteProvider'
import { useAdminTheme } from './AdminThemeProvider'

export function CommandPalette() {
    const { commands, open, setOpen } = useCommandPalette()
    const { t } = useAdminTheme()
    const router = useRouter()
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen(!open)
            }
            if (e.key === 'Escape' && open) {
                setOpen(false)
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open, setOpen])

    useEffect(() => {
        if (open) {
            setQuery('')
            setActiveIndex(0)
            setTimeout(() => inputRef.current?.focus(), 10)
        }
    }, [open])

    const filtered = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        if (words.length === 0) return commands
        // Every word must land somewhere on the command, but they don't have to
        // land on the same field — so "ops token" still finds Access Links, whose
        // keywords carry "ops" and "token" separately.
        return commands.filter(c => {
            const haystack = [c.label, c.group, ...(c.keywords ?? [])].join(' ').toLowerCase()
            return words.every(w => haystack.includes(w))
        })
    }, [commands, query])

    const grouped = useMemo(() => {
        const groups = new Map<string, PaletteCommand[]>()
        for (const cmd of filtered) {
            const list = groups.get(cmd.group) ?? []
            list.push(cmd)
            groups.set(cmd.group, list)
        }
        return groups
    }, [filtered])

    function execute(cmd: PaletteCommand) {
        setOpen(false)
        if (cmd.href) router.push(cmd.href)
        else cmd.action?.()
    }

    function onKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter' && filtered[activeIndex]) {
            e.preventDefault()
            execute(filtered[activeIndex])
        }
    }

    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
        el?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    if (!open) return null

    let flatIndex = -1

    return (
        <div className={`fixed inset-0 z-[200] flex items-start justify-center pt-[min(20vh,160px)] ${t.backdrop}`} onClick={() => setOpen(false)}>
            <div
                className={`w-full max-w-[520px] mx-4 rounded-2xl overflow-hidden ${t.overlay}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${t.border}`}>
                    <Search size={16} className={t.muted} strokeWidth={2.2} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setActiveIndex(0) }}
                        onKeyDown={onKeyDown}
                        placeholder="Search pages, actions..."
                        className={`flex-1 bg-transparent text-[14px] font-medium outline-none ${t.heading} placeholder:${t.faint}`}
                    />
                    <kbd className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${t.muted} border ${t.border}`}>
                        ESC
                    </kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[320px] overflow-y-auto py-2">
                    {filtered.length === 0 && (
                        <div className={`text-center py-8 text-sm font-semibold ${t.muted}`}>
                            No results
                        </div>
                    )}
                    {Array.from(grouped.entries()).map(([group, cmds]) => (
                        <div key={group}>
                            <div className={`px-4 pt-3 pb-1 text-[10px] font-black tracking-[0.14em] uppercase ${t.faint}`}>
                                {group}
                            </div>
                            {cmds.map(cmd => {
                                flatIndex++
                                const idx = flatIndex
                                const isActive = idx === activeIndex
                                return (
                                    <button
                                        key={cmd.id}
                                        type="button"
                                        data-index={idx}
                                        className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[13px] font-semibold transition-colors duration-75 ${
                                            isActive
                                                ? `${t.accentBg} ${t.accent}`
                                                : `${t.body} hover:bg-[#f57f20]/[0.05]`
                                        }`}
                                        onClick={() => execute(cmd)}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                    >
                                        {cmd.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-70">{cmd.icon}</span>}
                                        <span className="flex-1 truncate">{cmd.label}</span>
                                        {isActive && <CornerDownLeft size={12} className="opacity-40 shrink-0" strokeWidth={2.5} />}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div className={`flex items-center gap-4 px-4 py-2 border-t ${t.border} ${t.faint} text-[10px] font-bold tracking-[0.08em]`}>
                    <span className="inline-flex items-center gap-1">
                        <kbd className={`px-1 py-0.5 rounded border ${t.border}`}>↑↓</kbd> Navigate
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <kbd className={`px-1 py-0.5 rounded border ${t.border}`}>↵</kbd> Open
                    </span>
                </div>
            </div>
        </div>
    )
}
