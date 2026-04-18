# Phase 4: Codebase Cleanup — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit and delete all files not referenced by the live website: orphaned source components, duplicate image directories, unused public assets, and root-level artifacts. No new features — pure removal.

This phase does NOT include font library trimming (deferred) or .DS_Store cleanup.

</domain>

<decisions>
## Implementation Decisions

### Orphaned Source Components — Delete All 9

Every file below was confirmed as having zero importers in the codebase:

- **D-01:** Delete `src/app/components/CurtleAboutUs.jsx` — old About Us variant, superseded
- **D-02:** Delete `src/app/components/ChiliIcon.tsx` — Phase 2 decided to use emoji (🌶️×N) instead
- **D-03:** Delete `src/app/components/DishGallery.tsx` — replaced by MobileMenuCard.tsx + DesktopMenuCarousel.tsx in Phase 2
- **D-04:** Delete `src/components/MatrixText.tsx` — experimental text effect, never used
- **D-05:** Delete `src/components/customHook/useResize.jsx` — window resize hook, no importers
- **D-06:** Delete `src/app/(main)/home/ChatWindow.tsx` — prototype chat UI, never mounted
- **D-07:** Delete `src/app/(main)/home/QualifyForm.tsx` — lead capture form, never mounted
- **D-08:** Delete `src/app/components/AboutUs.tsx` AND `src/style/AboutUs.css` — component never imported; CSS only used by this component
- **D-09:** Delete `src/app/components/CustomSelect.jsx` — old week dropdown, already unused (STATE.md flagged for deletion post WEEK-03, deleting now since it's already orphaned)

### Image Cleanup

- **D-10:** Keep `public/images/Week1/nonveg1/` — Menu.tsx uses static imports from this folder (5 .png files)
- **D-11:** Delete `public/images/Week1/Nonveg/` — duplicate of nonveg1/, the code uses nonveg1/
- **D-12:** Delete the 14 unused stock food photos from `public/images/`:
  - `beef-teriyaki.jpg`, `butter-chicken.jpg`, `chicken-afghani.jpg`, `eggplant-parm.jpg`
  - `falafel-bowl.jpg`, `grilled-fish.jpg`, `lamb-tagine.jpg`, `mediterranean-chicken.jpg`
  - `mushroom-risotto.jpg`, `paneer-tikka.jpg`, `quinoa-bowl.jpg`, `salmon-quinoa.jpg`
  - `thai-curry.jpg`, `Veg-biryani.jpg`
- **D-13:** Delete the 5 Next.js default template SVGs from `public/`:
  - `file.svg`, `globe.svg`, `next.svg`, `window.svg`, `vercel.svg`

### Root Artifacts

- **D-14:** Delete `git_hub_production` — 730-line old source code dump, no purpose in the repo
- **D-15:** Delete `test-flex.html` — scratch flexbox test file, not part of the Next.js site
- **D-16:** Keep `update_menu.js` — user confirmed this script is still needed for menu data management
- **D-17:** Delete `.eslintrc.js` (legacy ESLint config) — keep `eslint.config.mjs` (modern flat config)

### Verification Approach

- **D-18:** After all deletions, run `next build` to confirm the live site builds cleanly with no broken imports

### Claude's Discretion

- `.DS_Store` files — safe to delete if encountered, but not a primary focus of this phase
- `tsconfig.tsbuildinfo` — build cache, can be deleted (it regenerates); not a priority
- Font library trimming (Montserrat weights, Typo Round) — deferred; user skipped this area
- `public/images/Main_Logo_1.png` in `src/app/` — check if used before touching; out of scope for this pass

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of Truth
- `.planning/REQUIREMENTS.md` — No active requirements map to Phase 4; this phase is cleanup-only
- `.planning/PROJECT.md` — Brand constraints (do not remove logo files, brand SVGs, or anything live-facing)
- `.planning/STATE.md` — Architecture notes: confirms CustomSelect.jsx is pending deletion, confirms nonveg1/ is the active import path for Week1 static images

### Active Source Files (do NOT touch)
- `src/app/components/Menu.tsx` — Imports from `Week1/nonveg1/` (5 static .png imports at top of file). Confirm these paths before deleting anything from that folder.
- `src/app/components/MobileMenuCard.tsx` — Active replacement for DishGallery
- `src/app/components/DesktopMenuCarousel.tsx` — Active replacement for DishGallery

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a deletion phase

### Established Patterns
- Static imports in Menu.tsx reference `Week1/nonveg1/` paths — must not be broken by image cleanup
- All other week images (Week2–4) use string paths, not static imports — safe to remove unused images without import changes

### Integration Points
- `next build` is the integration check — confirms nothing is broken after deletions
- `eslint.config.mjs` is the surviving ESLint config; verify it lints correctly after `.eslintrc.js` is removed

</code_context>

<specifics>
## Specific Ideas

- The `git_hub_production` file appears to be an old export/backup of the home page component — contains `"use client"`, ChatWindow import, Menu import. Confirms it's stale code, not a config file.
- `DishGallery.tsx` was the first Phase 2 implementation; it was superseded when the gallery was split into MobileMenuCard + DesktopMenuCarousel for responsive handling.
- `AboutUs.tsx` imports `@/style/AboutUs.css` — deleting the component means the CSS is also orphaned. Delete both together.

</specifics>

<deferred>
## Deferred Ideas

- **Font trimming** — Audit Montserrat weights and Typo Round Demo fonts; trim to only what globals.css actually uses. Deferred by user — scope it as a separate phase or backlog item.
- **tsconfig.tsbuildinfo** — Build cache file; could be gitignored rather than deleted.
- **`src/app/Main_Logo_1.png`** — Image file in the src directory, unusual location. Check if referenced before removing.

</deferred>

---

*Phase: 04-codebase-cleanup*
*Context gathered: 2026-04-18*
