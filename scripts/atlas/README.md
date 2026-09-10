# Dashboard screen & state atlas

Re-generates the "Customer Dashboard Screen & State Atlas" PDF: every `/dashboard`
state on mobile (iPhone 15, 2×) and desktop (1440×900, 2×), one page per state,
driven entirely by the dev-only `?preview=1` fixtures (no accounts, no production data).

```bash
npm run dev                                   # in another terminal
export ATLAS_OUT=./scripts/atlas/atlas-out    # optional; default is this folder's atlas-out/
node scripts/atlas/manifest.mjs               # → atlas-out/manifest.json (266 states)
node scripts/atlas/capture.mjs $ATLAS_OUT/manifest.json [--sections=3,4] [--only=id] [--vp=mobile] [--force]
node scripts/atlas/build-booklet.mjs [--deskpx=2160 --mobpx=786 --quality=80] [--out=…pdf]
```

Requirements: system Google Chrome (or `CHROME_PATH`), the global `@playwright/cli`
install (or `PLAYWRIGHT_MODULE`), `sharp` (already a dependency) and `pdf-lib`
(`npm i -D pdf-lib`, not committed as a dependency).

Capture rules learned the hard way (all encoded in capture.mjs):
- Desktop pages are shot with `fullPage: true` and the rail turned absolute for the shot —
  never by growing the viewport: a 1440-wide viewport taller than 1440 is *portrait* and
  the app switches to its mobile tree.
- Both breakpoint trees are mounted; `>> nth=` selectors count visible matches only and
  text actions use `:text-is()` (regex `getByText` misses icon+text buttons). Prefer
  `:text-is("2")` over `:has-text("2")` — the latter is a substring match and happily
  returns five buttons.
- Entries with a faked clock wait for `load`, not `networkidle` (fake timers keep the
  network busy). Auto-dismissing banners are held with an `initScript`.
- **A static fake clock cannot move text inside `suppressHydrationWarning`.** React keeps
  the server's string unless the client's own value *changes* after mount, so the node is
  frozen at the server time forever. Land the clock just before the boundary and add a
  `clockForward` action across it (see `menu-delivered`). Keep the jump under 30 minutes or
  `IdleRefreshToast` fires and covers the page.
- Anything `position: fixed` (the Dorm Wars premium gate) must be captured viewport-sized
  via `fullPage: false`; a full-page shot dims only the first viewport and the rest of the
  page renders sharp under a hard edge.
- Seeded ids rot. The weekly-review draft hard-coded meal ids that no longer existed, so
  the grid and its counter disagreed. Drive such grids by position instead.
- After a run, md5 the shots and look for duplicate pairs — two pages sharing one image
  means a knob or an action silently did nothing.
- Fixture knobs: see `_shared/preview-shell.ts`, `_shared/preview-plan.ts`, and the
  preview blocks in each `page.tsx` (home, menu, profile, dorm-wars, review routes).

`observations.json` is the appendix: 112 UI findings from the 2026-09-10 run, each tagged
`code` (traced to a source line), `screenshot` (confirmed on the capture by an independent
verifier) or `reviewer` (raised by the screenshot review, not independently confirmed).
