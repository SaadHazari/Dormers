/**
 * Browser errors that are not ours to fix.
 *
 * Kept apart from instrumentation-client.ts so the rules can be tested: a
 * filter that is too loose hides real bugs, and one that is too tight spends
 * the Sentry quota on a visitor's extensions.
 */

/**
 * A phone or laptop that lost its connection mid-request. Every browser has
 * its own wording; all three are a TypeError with exactly this message.
 * Anchored so "Failed to fetch menu: 500" is still reported.
 * See Sentry JAVASCRIPT-NEXTJS-1F (iPhone, "Load failed", /dashboard).
 */
export const NETWORK_DROP_MESSAGE =
    /^(TypeError: )?(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/

export function isNetworkDropError(err: unknown): boolean {
    if (err == null || typeof err !== 'object') return false
    const message = (err as { message?: unknown }).message
    return typeof message === 'string' && NETWORK_DROP_MESSAGE.test(message)
}

interface FrameLike { filename?: string }
interface EventLike {
    exception?: { values?: { stacktrace?: { frames?: FrameLike[] } }[] }
}

/** Our bundle, or the one worker we serve from /public. */
function isOurs(filename: string): boolean {
    return filename.includes('/_next/') || filename.includes('/pdf.worker')
}

/**
 * A script file that is not our bundle: an extension, a bot's injected code,
 * or a third-party tag. Inline page scripts carry the page URL (no `.js`),
 * so they do not count.
 */
function isForeignScript(filename: string): boolean {
    if (/^(chrome|moz|safari|safari-web)-extension:/.test(filename)) return true
    const path = filename.split(/[?#]/)[0]
    // Google's tag is served as /gtag/js, with no extension.
    return /\.m?js$/.test(path) || path.endsWith('/gtag/js')
}

/**
 * True when every frame we can place is someone else's script and none is
 * ours. The SDK rewrites any origin to `app://`, so an injected script with a
 * relative sourceURL arrives looking like `app:///executors/200.js` — which
 * is why this checks the path, not the origin.
 * See Sentry JAVASCRIPT-NEXTJS-1K (`M_ID` of undefined, executors/200.js).
 */
export function isForeignScriptEvent(event: EventLike): boolean {
    let foreign = 0
    for (const value of event.exception?.values ?? []) {
        for (const frame of value.stacktrace?.frames ?? []) {
            const filename = frame.filename
            if (!filename) continue
            if (isOurs(filename)) return false
            if (isForeignScript(filename)) foreign++
        }
    }
    return foreign > 0
}
