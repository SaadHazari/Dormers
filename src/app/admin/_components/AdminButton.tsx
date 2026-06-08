'use client'

import { useAdminTheme } from './AdminThemeProvider'

type Variant = 'primary' | 'danger' | 'ghost'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    loading?: boolean
    icon?: React.ReactNode
    children: React.ReactNode
}

export function AdminButton({
    variant = 'primary',
    loading = false,
    icon,
    children,
    disabled,
    className = '',
    ...rest
}: Props) {
    const { isLight } = useAdminTheme()

    const base = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold tracking-[0.04em] uppercase transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f57f20]'

    const variants: Record<Variant, string> = {
        primary: 'bg-[#f57f20] text-white shadow-[0_4px_16px_rgba(245,127,32,0.35)] hover:shadow-[0_4px_20px_rgba(245,127,32,0.5)] active:scale-[0.97]',
        danger: isLight
            ? 'bg-[#c0392b]/10 text-[#c0392b] border border-[#c0392b]/25 hover:bg-[#c0392b]/15'
            : 'bg-[#e0716e]/10 text-[#e0716e] border border-[#e0716e]/25 hover:bg-[#e0716e]/15',
        ghost: isLight
            ? 'bg-transparent text-[#091825]/65 border border-[#091825]/10 hover:bg-[#091825]/[0.04] hover:border-[#091825]/[0.18]'
            : 'bg-transparent text-[#ede8da]/55 border border-white/[0.08] hover:bg-white/[0.05] hover:border-white/[0.14]',
    }

    const disabledCls = (disabled || loading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'

    return (
        <button
            disabled={disabled || loading}
            className={`${base} ${variants[variant]} ${disabledCls} ${className}`}
            {...rest}
        >
            {loading ? <Spinner /> : icon}
            {children}
        </button>
    )
}

function Spinner() {
    return (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
    )
}
