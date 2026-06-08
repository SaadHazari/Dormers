export function adminTokens(isLight: boolean) {
    return {
        // ── Page surface ────────────────────────────────────────────────────
        pageBg: isLight ? '#f5f0e8' : '#091825',

        // ── Card surfaces (three tiers) ─────────────────────────────────────
        card: isLight
            ? 'bg-white border border-[#091825]/[0.08]'
            : 'bg-[#0d2035] border border-white/[0.08]',
        cardHover: isLight
            ? 'hover:border-[#091825]/[0.16] hover:shadow-sm'
            : 'hover:border-white/[0.14] hover:shadow-sm',
        cardActive: isLight
            ? 'border-[#f57f20]/40 bg-[#f57f20]/[0.04]'
            : 'border-[#f57f20]/40 bg-[#f57f20]/[0.06]',

        // ── Sidebar ─────────────────────────────────────────────────────────
        sidebar: isLight ? '#f0ebe3' : '#060f18',
        sidebarBorder: isLight
            ? 'border-r border-[#091825]/[0.08]'
            : 'border-r border-white/[0.06]',
        sidebarItem: isLight
            ? 'text-[#091825]/65 hover:text-[#091825] hover:bg-[#091825]/[0.05]'
            : 'text-[#ede8da]/55 hover:text-[#ede8da] hover:bg-white/[0.05]',
        sidebarItemActive: isLight
            ? 'text-[#f57f20] bg-[#f57f20]/[0.08] font-bold'
            : 'text-[#f57f20] bg-[#f57f20]/[0.10] font-bold',
        sidebarGroupLabel: isLight
            ? 'text-[#091825]/40'
            : 'text-[#ede8da]/30',

        // ── Input / control ─────────────────────────────────────────────────
        input: isLight
            ? 'bg-[#091825]/[0.04] border-[#091825]/[0.10] hover:border-[#091825]/[0.20] focus:border-[#f57f20]/60 text-[#091825] placeholder-[#091825]/45'
            : 'bg-white/[0.04] border-white/[0.10] hover:border-white/[0.18] focus:border-[#f57f20]/60 text-[#ede8da] placeholder-[#ede8da]/40',
        inputFocus: 'focus:shadow-[0_0_0_3px_rgba(245,127,32,0.08)] focus:outline-none',

        // ── Typography ──────────────────────────────────────────────────────
        heading:   isLight ? 'text-[#091825]'      : 'text-[#ede8da]',
        body:      isLight ? 'text-[#091825]/80'   : 'text-[#ede8da]/75',
        muted:     isLight ? 'text-[#091825]/55'   : 'text-[#ede8da]/50',
        faint:     isLight ? 'text-[#091825]/35'   : 'text-[#ede8da]/30',

        // ── Status ──────────────────────────────────────────────────────────
        success:     isLight ? 'text-[#1d8a30]' : 'text-[#5fb479]',
        successBg:   isLight ? 'bg-[#1d8a30]/[0.08] border-[#1d8a30]/20' : 'bg-[#5fb479]/[0.10] border-[#5fb479]/20',
        danger:      isLight ? 'text-[#c0392b]' : 'text-[#e0716e]',
        dangerBg:    isLight ? 'bg-[#c0392b]/[0.08] border-[#c0392b]/20' : 'bg-[#e0716e]/[0.10] border-[#e0716e]/20',
        warning:     isLight ? 'text-[#b8860b]' : 'text-[#ffaa00]',
        warningBg:   isLight ? 'bg-[#b8860b]/[0.08] border-[#b8860b]/20' : 'bg-[#ffaa00]/[0.08] border-[#ffaa00]/20',
        accent:      'text-[#f57f20]',
        accentBg:    isLight ? 'bg-[#f57f20]/[0.08] border-[#f57f20]/25' : 'bg-[#f57f20]/[0.10] border-[#f57f20]/30',

        // ── Borders ─────────────────────────────────────────────────────────
        border:       isLight ? 'border-[#091825]/[0.08]'  : 'border-white/[0.06]',
        borderStrong: isLight ? 'border-[#091825]/[0.15]'  : 'border-white/[0.12]',

        // ── Table ───────────────────────────────────────────────────────────
        tableHeader: isLight
            ? 'bg-[#091825]/[0.03] text-[#091825]/55'
            : 'bg-white/[0.03] text-[#ede8da]/45',
        tableRow: isLight
            ? 'hover:bg-[#091825]/[0.03] border-b border-[#091825]/[0.06]'
            : 'hover:bg-white/[0.03] border-b border-white/[0.05]',
        tableRowSelected: isLight
            ? 'bg-[#f57f20]/[0.05]'
            : 'bg-[#f57f20]/[0.06]',

        // ── Overlay (command palette, modals) ───────────────────────────────
        overlay: isLight
            ? 'bg-white border border-[#091825]/[0.12] shadow-2xl'
            : 'bg-[#0d2035] border border-white/[0.10] shadow-2xl',
        backdrop: 'bg-black/50 backdrop-blur-sm',

        // ── Badge ───────────────────────────────────────────────────────────
        badgeCount: 'bg-[#f57f20] text-white',
    } as const
}

export type AdminTokens = ReturnType<typeof adminTokens>
