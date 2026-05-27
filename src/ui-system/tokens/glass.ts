/**
 * Glassmorphism + theme tokens for the marketing menu carousels
 * (Desktop + Mobile). Was redeclared as a 10-line block in each file
 * with subtle drift — Mobile uses smaller fonts and tighter padding,
 * Desktop has hover variants on inactive items.
 *
 * `size` parameterises the variants that intentionally differ between
 * the two contexts (font sizes on macros, allergen tag padding,
 * inactive hover styles, dark-mode panel blur). All other tokens are
 * identical between sizes — they only branch on `isLight`.
 */

export type GlassSize = 'desktop' | 'mobile'

export type GlassTokens = {
    /** Glass panel — used for week navigators and dish card surfaces. */
    panel: string
    /** Inactive nav text — has hover state on desktop only. */
    inactiveText: string
    /** Strongest text color on the panel surface. */
    primaryText: string
    /** Body text on the panel surface. */
    bodyText: string
    /** Muted text — labels, secondary info. */
    mutedText: string
    /** Border color for dividers between rows. */
    divider: string
    /** Background panel for the macros 3-col grid. */
    macroGrid: string
    /** Macro labels (Protein / Carbs / Fat). */
    macroLabel: string
    /** Macro values (54.6g, etc). */
    macroValue: string
    /** Pill style for individual allergen tags. */
    allergenTag: string
}

export function glassTokens(isLight: boolean, size: GlassSize = 'desktop'): GlassTokens {
    const isDesktop = size === 'desktop'

    return {
        panel: isLight
            ? 'bg-[#1E3A4F]/10 border border-[#1E3A4F]/18 shadow-[0_8px_32px_0_rgba(9,24,37,0.10)]'
            : isDesktop
                ? 'bg-white/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]'
                : 'bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]',

        inactiveText: isLight
            ? (isDesktop ? 'text-[#1E3A4F]/55 hover:text-[#1E3A4F]/80' : 'text-[#1E3A4F]/55')
            : (isDesktop ? 'text-white/60 hover:text-white/80' : 'text-white/60'),

        primaryText: isLight ? 'text-[#091825]' : 'text-white',
        bodyText: isLight ? 'text-[#1E3A4F]/70' : 'text-white/80',
        mutedText: isLight ? 'text-[#1E3A4F]/45' : 'text-white/50',
        divider: isLight ? 'border-[#1E3A4F]/10' : 'border-white/10',
        macroGrid: isLight
            ? 'bg-[#1E3A4F]/06 rounded-xl border border-[#1E3A4F]/10'
            : 'bg-white/5 rounded-xl border border-white/10',

        macroLabel: isLight
            ? (isDesktop
                ? 'text-[#1E3A4F]/50 text-[9px] tracking-wider uppercase font-semibold mb-1'
                : 'text-[#1E3A4F]/50 text-[8px] tracking-wider uppercase font-semibold mb-[2px]')
            : (isDesktop
                ? 'text-white/60 text-[9px] tracking-wider uppercase font-semibold mb-1'
                : 'text-white/70 text-[8px] tracking-wider uppercase font-semibold mb-[2px]'),

        macroValue: isLight
            ? (isDesktop
                ? 'text-[#091825] font-bold text-[14px]'
                : 'text-[#091825] font-bold text-[13px] drop-shadow-sm')
            : (isDesktop
                ? 'text-white font-bold text-[14px]'
                : 'text-white font-bold text-[13px] drop-shadow-sm'),

        allergenTag: isLight
            ? (isDesktop
                ? 'bg-[#1E3A4F]/08 border border-[#1E3A4F]/15 rounded-full px-2.5 py-0.5 text-[10px] text-[#1E3A4F] capitalize backdrop-blur-sm shadow-sm'
                : 'bg-[#1E3A4F]/08 border border-[#1E3A4F]/15 rounded-full px-2 py-[2px] text-[10px] text-[#1E3A4F] capitalize backdrop-blur-sm shadow-sm')
            : (isDesktop
                ? 'bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-[10px] text-white capitalize backdrop-blur-sm shadow-sm'
                : 'bg-white/10 border border-white/20 rounded-full px-2 py-[2px] text-[10px] text-white capitalize backdrop-blur-sm shadow-sm'),
    }
}
