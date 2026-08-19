import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every `var(--ds-*)` reference must resolve. An undefined custom property
 * is not an error in CSS — it silently computes to nothing, so a card
 * background just doesn't paint. That is exactly how the monthly wrap
 * force overlay shipped unreadable: its card referenced `--ds-bg`, a token
 * that never existed, leaving navy text on the navy backdrop.
 *
 * A usage passes if the token is defined (globals.css or an inline
 * `'--ds-x': value` style) or the var() carries a literal fallback.
 */

const SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full, out)
        else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
    return out
}

describe('design token references', () => {
    it('every var(--ds-*) without a fallback points at a defined token', () => {
        const files = walk(SRC)

        const defined = new Set<string>()
        const usedNoFallback = new Map<string, string[]>() // token -> files

        for (const file of files) {
            const text = readFileSync(file, 'utf8')

            // Definitions: CSS declarations `--ds-x: ...` and inline style
            // custom properties `'--ds-x': ...`.
            for (const m of text.matchAll(/(?:^|[{;\s'"])(--ds-[a-z0-9-]+)\s*'?\s*:/gm)) {
                defined.add(m[1])
            }

            // Usages: `var(--ds-x)` (no fallback) vs `var(--ds-x, fallback)`.
            for (const m of text.matchAll(/var\(\s*(--ds-[a-z0-9-]+)\s*([,)])/g)) {
                if (m[2] === ')') {
                    const list = usedNoFallback.get(m[1]) ?? []
                    if (!list.includes(file)) list.push(file)
                    usedNoFallback.set(m[1], list)
                }
            }
        }

        const missing: string[] = []
        for (const [token, tokenFiles] of usedNoFallback) {
            if (defined.has(token)) continue
            missing.push(`${token} (used in ${tokenFiles.map(f => f.replace(SRC, 'src')).join(', ')})`)
        }

        expect(missing, `undefined design tokens:\n${missing.join('\n')}`).toEqual([])
    })
})
