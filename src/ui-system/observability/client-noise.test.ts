import { describe, it, expect } from 'vitest'
import { isForeignScriptEvent, isNetworkDropError, NETWORK_DROP_MESSAGE } from './client-noise'

function eventWithFrames(...filenames: (string | undefined)[]) {
    return {
        exception: {
            values: [{
                type: 'TypeError',
                value: 'x',
                stacktrace: { frames: filenames.map((filename) => ({ filename })) },
            }],
        },
    }
}

describe('isForeignScriptEvent', () => {
    // The real one, straight out of Sentry (JAVASCRIPT-NEXTJS-1K): a script a
    // visitor's extension or bot injected, reading `M_ID` off nothing. The
    // file does not exist on dormers.ae; the SDK stripped its origin.
    it('drops an error whose whole stack is an injected script', () => {
        expect(isForeignScriptEvent(eventWithFrames('app:///executors/200.js', 'app:///executors/200.js'))).toBe(true)
    })

    it('drops extension and third-party scripts before the SDK rewrites them', () => {
        expect(isForeignScriptEvent(eventWithFrames('chrome-extension://abcdef/executors/200.js'))).toBe(true)
        expect(isForeignScriptEvent(eventWithFrames('https://www.googletagmanager.com/gtag/js?id=AW-1'))).toBe(true)
        // …and after, when any origin becomes app://.
        expect(isForeignScriptEvent(eventWithFrames('app:///gtag/js?id=AW-1'))).toBe(true)
    })

    it('keeps an error that passes through our own bundle, even once', () => {
        // Our code called into something foreign and it threw: still ours to see.
        expect(isForeignScriptEvent(eventWithFrames(
            'app:///executors/200.js',
            'app:///_next/static/chunks/app/dashboard/page-abc123.js',
        ))).toBe(false)
        expect(isForeignScriptEvent(eventWithFrames('https://dormers.ae/_next/static/chunks/1948-166925ee67a9fecf.js'))).toBe(false)
    })

    it('keeps inline page scripts', () => {
        // Inline <script> frames carry the page URL, not a .js file.
        expect(isForeignScriptEvent(eventWithFrames('app:///dashboard/menu'))).toBe(false)
    })

    it('keeps errors it cannot place', () => {
        // No stack at all, or only native frames: nothing proves it is foreign.
        expect(isForeignScriptEvent({})).toBe(false)
        expect(isForeignScriptEvent(eventWithFrames())).toBe(false)
        expect(isForeignScriptEvent(eventWithFrames('<anonymous>', '[native code]', undefined))).toBe(false)
    })
})

describe('isNetworkDropError', () => {
    // JAVASCRIPT-NEXTJS-1F: an iPhone lost signal on /dashboard. Safari says
    // "Load failed", Chrome "Failed to fetch", Firefox "NetworkError…".
    it('recognises every browser’s wording for a dropped connection', () => {
        for (const msg of ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource.']) {
            expect(isNetworkDropError(new TypeError(msg))).toBe(true)
            expect(NETWORK_DROP_MESSAGE.test(`TypeError: ${msg}`)).toBe(true)
        }
    })

    it('is not fooled by a real error that merely mentions a fetch', () => {
        for (const msg of ['Failed to fetch menu: 500', 'Load failed for order 12', 'fetch failed', '']) {
            expect(isNetworkDropError(new Error(msg))).toBe(false)
        }
        expect(isNetworkDropError(null)).toBe(false)
        expect(isNetworkDropError('Load failed')).toBe(false)
    })
})
