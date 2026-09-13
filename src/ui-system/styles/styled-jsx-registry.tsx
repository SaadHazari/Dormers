'use client'

/**
 * StyledJsxRegistry — server-renders every `<style jsx>` block in the app.
 *
 * The App Router does not do this on its own: Next wires styled-jsx into the
 * Pages Router renderer only. Without a registry each block is injected by
 * JavaScript after hydration, so the first paint carries none of its rules.
 * On a phone that showed the dashboard's desktop rail and desktop card tree,
 * with no drawer burger, for ~200ms on a fast machine and seconds on a slow
 * one — on every load of every dashboard page. With it, the rules a render
 * pass collected are flushed into the HTML stream ahead of the markup that
 * uses them, and styled-jsx adopts those tags once it runs on the client.
 *
 * Wraps the whole tree in src/app/layout.tsx (Next's documented setup).
 * Deliberately not a package.json dependency: `styled-jsx` has to be the copy
 * Next compiles `<style jsx>` against, and a pin of our own could drift from
 * Next's and install a second copy with its own, empty registry.
 * scripts/check-reload-flash.mjs fails if the rules stop reaching the HTML.
 */

import { useState, type ReactNode } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  // Lazy initial state — one registry for the whole render, kept across re-renders.
  const [registry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
