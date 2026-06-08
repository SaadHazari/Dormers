'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminTheme } from './AdminThemeProvider'
import { useCommandPalette } from './CommandPaletteProvider'

const SHORTCUTS: Array<{ keys: string; label: string; href?: string; action?: string }> = [
    { keys: 'g o', label: 'Go to Overview',       href: '/admin' },
    { keys: 'g c', label: 'Go to Customers',      href: '/admin/customers' },
    { keys: 'g p', label: 'Go to Payments',       href: '/admin/payments' },
    { keys: 'g r', label: 'Go to Referrals',      href: '/admin/referrals' },
    { keys: 'g w', label: 'Go to Dorm Wars',      href: '/admin/dorm-wars' },
    { keys: 'g m', label: 'Go to Menu CMS',       href: '/admin/menu' },
    { keys: 'g h', label: 'Go to Cron Health',    href: '/admin/cron' },
    { keys: '⌘ k', label: 'Command Palette',      action: 'palette' },
    { keys: '?',   label: 'Show Shortcuts',        action: 'help' },
]

export function KeyboardShortcuts() {
    const router = useRouter()
    const { setOpen: openPalette } = useCommandPalette()
    const [showHelp, setShowHelp] = useState(false)
    const [pending, setPending] = useState<string | null>(null)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null

        function onKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
            if (e.metaKey || e.ctrlKey || e.altKey) return

            const key = e.key.toLowerCase()

            if (key === '?' && !e.shiftKey) {
                e.preventDefault()
                setShowHelp(v => !v)
                return
            }

            if (pending === 'g') {
                e.preventDefault()
                setPending(null)
                if (timer) clearTimeout(timer)

                const combo = `g ${key}`
                const shortcut = SHORTCUTS.find(s => s.keys === combo)
                if (shortcut?.href) router.push(shortcut.href)
                return
            }

            if (key === 'g') {
                setPending('g')
                if (timer) clearTimeout(timer)
                timer = setTimeout(() => setPending(null), 800)
                return
            }

            setPending(null)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            if (timer) clearTimeout(timer)
        }
    }, [pending, router, openPalette])

    if (!showHelp) return null

    return <ShortcutsOverlay onClose={() => setShowHelp(false)} />
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
    const { t } = useAdminTheme()

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className={`fixed inset-0 z-[190] flex items-center justify-center ${t.backdrop}`} onClick={onClose}>
            <div className={`w-full max-w-[400px] mx-4 rounded-2xl overflow-hidden ${t.overlay}`} onClick={e => e.stopPropagation()}>
                <div className={`px-5 py-4 border-b ${t.border}`}>
                    <h2 className={`text-[14px] font-black ${t.heading}`}>Keyboard Shortcuts</h2>
                </div>
                <div className="px-5 py-3">
                    {SHORTCUTS.map(s => (
                        <div key={s.keys} className={`flex items-center justify-between py-2 border-b last:border-b-0 ${t.border}`}>
                            <span className={`text-[12px] font-semibold ${t.body}`}>{s.label}</span>
                            <kbd className={`px-2 py-0.5 rounded text-[11px] font-bold border ${t.border} ${t.muted} tracking-wider`}>
                                {s.keys}
                            </kbd>
                        </div>
                    ))}
                </div>
                <div className={`px-5 py-3 border-t ${t.border} ${t.faint} text-[10px] font-bold text-center`}>
                    Press <kbd className={`px-1 py-0.5 rounded border ${t.border}`}>?</kbd> or <kbd className={`px-1 py-0.5 rounded border ${t.border}`}>ESC</kbd> to close
                </div>
            </div>
        </div>
    )
}
