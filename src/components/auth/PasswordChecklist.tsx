'use client'

import { Check } from 'lucide-react'
import { useIsLight } from '@/ui-system/hooks/useIsLight'
import { authTokens } from '@/ui-system/tokens/auth-theme'
import { checkPassword } from '@/shared/validation'

// Live checklist that ticks each rule on as the user types. Sits below the
// password input in onboarding's EmailStep and the reset flow's set-password
// phase. Uses the same `authTokens` palette as the rest of the auth funnel so
// it inherits both themes (dark live / light prep).
export function PasswordChecklist({ password }: { password: string }) {
    const isLight = useIsLight()
    const tokens = authTokens(isLight)
    const c = checkPassword(password)

    const rules: { key: keyof typeof c; label: string }[] = [
        { key: 'length',  label: 'At least 8 characters' },
        { key: 'upper',   label: 'One uppercase letter' },
        { key: 'lower',   label: 'One lowercase letter' },
        { key: 'number',  label: 'One number' },
        { key: 'special', label: 'One special character' },
    ]

    const idleDot = isLight
        ? 'border border-[#091825]/[0.18] bg-transparent'
        : 'border border-white/[0.18] bg-transparent'
    const doneDot = 'bg-[#22c55e] border border-[#22c55e]'
    const idleText = tokens.subline
    const doneText = isLight ? 'text-[#091825]/85' : 'text-white/85'

    return (
        <ul className="mt-2 space-y-1" aria-label="Password requirements">
            {rules.map(r => {
                const ok = c[r.key]
                return (
                    <li key={r.key} className="flex items-center gap-2 text-[12px]">
                        <span
                            aria-hidden
                            className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full transition-colors ${ok ? doneDot : idleDot}`}
                        >
                            {ok && <Check size={9} strokeWidth={3.5} className="text-white" />}
                        </span>
                        <span className={`transition-colors ${ok ? doneText : idleText}`}>{r.label}</span>
                    </li>
                )
            })}
        </ul>
    )
}
