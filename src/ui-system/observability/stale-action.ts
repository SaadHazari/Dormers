/**
 * The error a deploy leaves behind in an open tab.
 *
 * Next.js gives every server action an id baked into the page's JavaScript.
 * Deploy a new build and those ids change, so a tab someone left open
 * yesterday posts an id the server has never heard of. The request fails, the
 * promise rejects, and whatever button was pressed sits in its loading state
 * for ever — which is exactly what Saad kept hitting and Sentry recorded as
 * UnrecognizedActionError at /admin/customers (JAVASCRIPT-NEXTJS-1G).
 *
 * It is not a server fault and retrying cannot fix it: the page itself is out
 * of date. The only cure is to load the new page, so the callers reload.
 *
 * Deliberately narrow. Matching too broadly would reload the page on ordinary
 * failures too, hiding real errors and throwing away anything half-typed.
 */

const STALE_NAME = 'UnrecognizedActionError'
// Next has used both wordings across versions; match either.
const STALE_MESSAGE = /server action .*(was not found on the server|failed to find server action)|failed to find server action/i

export function isStaleActionError(err: unknown): boolean {
    if (err == null) return false

    if (typeof err === 'string') return STALE_MESSAGE.test(err)

    if (typeof err === 'object') {
        const e = err as { name?: unknown; message?: unknown }
        if (e.name === STALE_NAME) return true
        if (typeof e.message === 'string' && STALE_MESSAGE.test(e.message)) return true
    }
    return false
}

/** What to show while the page reloads itself. */
export const STALE_ACTION_MESSAGE = 'The admin panel was updated while this page was open. Reloading…'
