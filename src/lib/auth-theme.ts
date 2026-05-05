// Single source of truth for class strings shared across the auth funnel
// (login, forgot-password, onboarding). Each token maps a semantic role to a
// className for the current theme. Co-locating them here is what stops the
// 5-different-field-style drift the audit found.

export function authTokens(isLight: boolean) {
    return {
        // ── Page surface ─────────────────────────────────────────────────────
        pageBackground: isLight
            ? 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)'
            : 'linear-gradient(160deg, #061520 0%, #0a1d2c 60%, #06121b 100%)',

        // ── Card surface (translucent + blurred) ─────────────────────────────
        card: isLight
            ? 'bg-white/70 border-[#091825]/[0.08] backdrop-blur-2xl'
            : 'bg-[#0d2035]/70 border-white/[0.08] backdrop-blur-2xl',
        cardShadow: isLight
            ? 'shadow-[0_8px_40px_rgba(9,24,37,0.10),inset_0_1px_0_rgba(255,255,255,0.90)]'
            : 'shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]',

        // ── Field input ──────────────────────────────────────────────────────
        // Dark borders use solid navy hex (not white-alpha) — alpha-white reads
        // as a foreign gray outline against the navy fill; navy-tinted edges
        // sit inside the palette and feel intentional.
        field: isLight
            ? 'bg-white/80 border-[#091825]/[0.12] hover:border-[#091825]/[0.22] focus:bg-white text-[#091825] placeholder-[#091825]/55'
            : 'bg-[#0d2035]/80 border-[#1e3448] hover:border-[#2a4a68] focus:bg-[#0d2035] text-white placeholder-white/55',
        fieldFocus:
            'focus:border-[#f57f20]/70 focus:shadow-[0_0_0_3px_rgba(245,127,32,0.09)]',

        // ── Selectable cards (SelectCard / PillCard / dorm + university lists)
        selectableUnselected: isLight
            ? 'bg-white border-[#091825]/[0.10] hover:border-[#091825]/[0.22]'
            : 'bg-[#0d2035] border-[#1e3448] hover:border-[#2a4a68]',
        selectableSelected: isLight
            ? 'border-[#f57f20] bg-[#f57f20]/[0.10]'
            : 'border-[#f57f20] bg-[#f57f20]/[0.14]',

        // ── Typography ───────────────────────────────────────────────────────
        // Alpha values clear WCAG AA against both the cream light bg and the
        // dark navy page bg (≥4.5:1 for body, ≥3:1 for incidental). Earlier
        // values dipped to ~3:1 in dark mode — never drop these without
        // re-checking against #061520 / #091825.
        heading:    isLight ? 'text-[#091825]'      : 'text-white',
        subline:    isLight ? 'text-[#091825]/65'   : 'text-white/65',
        label:      isLight ? 'text-[#091825]/65'   : 'text-white/65',
        helpText:   isLight ? 'text-[#091825]/65'   : 'text-white/65',

        // ── Interactive helpers ──────────────────────────────────────────────
        eyeBtn:     isLight ? 'text-[#091825]/60 hover:text-[#091825]/85' : 'text-white/60 hover:text-white/90',
        backLink:   isLight ? 'text-[#091825]/65 hover:text-[#091825]/85' : 'text-white/65 hover:text-white/85',
        // termsBase = wrapper paragraph color (link inherits); termsHover = link-only hover
        termsBase:  isLight ? 'text-[#091825]/60' : 'text-white/60',
        termsHover: isLight ? 'hover:text-[#091825]/85' : 'hover:text-white/85',

        // ── Status ───────────────────────────────────────────────────────────
        errorText:   isLight ? 'text-red-600' : 'text-red-400',
        errorBanner: 'px-4 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.18] text-[13px] text-center leading-snug',
    } as const
}

export type AuthTokens = ReturnType<typeof authTokens>
