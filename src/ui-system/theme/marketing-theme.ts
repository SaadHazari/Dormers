/**
 * The marketing site's own remembered light/dark choice.
 *
 * next-themes persists ONE preference for the whole app (localStorage
 * `theme`), and the auth funnel deliberately forces light on mount
 * (src/app/login/LoginForm.tsx) so the password/OTP fields stay legible. That
 * write outlives the visit — when the user carries on into onboarding or the
 * dashboard nothing hands the preference back — so without a key of its own
 * the marketing site greeted every returning signed-up user in beige, even
 * though they never asked for it. Navy is the designed default and the CSS
 * default (globals.css treats `html.light` as the override), so the toggle
 * is the ONLY thing allowed to move the marketing site off it.
 *
 * Only the marketing toggles write this key — ThemeToggleOrb (desktop nav)
 * and the mobile nav's toggle row. No key stored = navy. It is reconciled
 * into next-themes' store in two places:
 *   - a blocking inline script in the root layout, for hard loads (no flash)
 *   - <MarketingThemeLock /> in (main)/layout.tsx, for client-side navigation
 *     out of the auth funnel back to /home
 */

export const MARKETING_THEME_KEY = 'dormers-marketing-theme'

/** The key next-themes reads/writes. Pinned via `storageKey` on the provider
 *  in the root layout, because the inline script hard-codes it too. */
export const NEXT_THEMES_STORAGE_KEY = 'theme'

/** Routes rendered by the (main) marketing shell. `/` redirects to /home
 *  server-side but is listed so the inline script covers it regardless. */
export const MARKETING_PATHS = ['/', '/home', '/privacy', '/terms', '/vip-success'] as const

export type MarketingTheme = 'light' | 'dark'

export function readMarketingTheme(): MarketingTheme {
  try {
    return localStorage.getItem(MARKETING_THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    // Private-mode / storage-blocked browsers: fall back to the design default.
    return 'dark'
  }
}

export function rememberMarketingTheme(theme: MarketingTheme): void {
  try {
    localStorage.setItem(MARKETING_THEME_KEY, theme)
  } catch {
    // Non-fatal — the toggle still works for this page view.
  }
}
