'use client'

import { useAdminTheme } from './AdminThemeProvider'

/**
 * An on/off switch for a setting that changes what happens.
 *
 * A native checkbox renders as a black square in the dark admin theme and
 * cannot be restyled; for "include these people or not" a switch also reads
 * more like the decision it is. Real <button role="switch">, so keyboard and
 * screen readers get the state for free.
 */
export function AdminSwitch({
    checked, onChange, label, disabled,
}: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
}) {
    const { isLight } = useAdminTheme()
    const off = isLight ? 'bg-[#091825]/[0.14]' : 'bg-white/[0.14]'

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20] disabled:opacity-50 ${
                checked ? 'bg-[#f57f20]' : off
            }`}
        >
            <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${
                    checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
                }`}
            />
        </button>
    )
}
