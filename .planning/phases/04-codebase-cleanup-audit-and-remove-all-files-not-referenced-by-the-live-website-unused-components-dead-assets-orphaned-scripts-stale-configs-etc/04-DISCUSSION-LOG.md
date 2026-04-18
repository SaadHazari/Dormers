# Phase 4: Codebase Cleanup — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 04-codebase-cleanup
**Areas discussed:** Orphaned source files, Duplicate & unused images, Root artifacts & config duplication

---

## Orphaned Source Files

### CurtleAboutUs.jsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Not imported anywhere. AboutUs.tsx is the active one. | ✓ |
| Keep it | Hold onto it for reference or future use. | |

**User's choice:** Delete
**Notes:** None

---

### MatrixText.tsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Purely experimental — no reference to it anywhere. | ✓ |
| Keep it | Hold onto it in case we want this effect later. | |

**User's choice:** Delete
**Notes:** None

---

### useResize.jsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Nothing uses it. React 19 has built-in approaches. | ✓ |
| Keep it | Keep as a utility hook for potential future use. | |

**User's choice:** Delete
**Notes:** None

---

### ChiliIcon.tsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Superseded by emoji approach decided in Phase 2. | ✓ |
| Keep it | We might switch back to SVG icons. | |

**User's choice:** Delete
**Notes:** Phase 2 decision D-07 locked in emoji approach

---

### DishGallery.tsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Superseded by the split mobile/desktop implementation. | ✓ |
| Keep it | May contain useful logic to reference. | |

**User's choice:** Delete
**Notes:** Replaced by MobileMenuCard.tsx + DesktopMenuCarousel.tsx

---

### ChatWindow.tsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Not connected to anything on the live site. | ✓ |
| Keep it | Planned for a future chat feature — don't delete yet. | |

**User's choice:** Delete
**Notes:** Prototype/planned feature that never launched

---

### QualifyForm.tsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Not wired up. Rebuild when ready. | ✓ |
| Keep it | Planning to use this soon for lead capture. | |

**User's choice:** Delete
**Notes:** Designed but never launched

---

### AboutUs.tsx + AboutUs.css

| Option | Description | Selected |
|--------|-------------|----------|
| Delete both AboutUs.tsx + AboutUs.css | Neither is mounted on any live page. Clean sweep. | ✓ |
| Keep AboutUs.tsx + CSS | About Us section is coming back. | |

**User's choice:** Delete both
**Notes:** CSS only used by this component — orphaned together

---

### CustomSelect.jsx

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it now | Already unused. No need to wait for Phase 3. | ✓ |
| Keep until Phase 3 completes | Delete as part of Phase 3 cleanup. | |

**User's choice:** Delete now
**Notes:** STATE.md flagged it for deletion post WEEK-03; already orphaned so deleting now

---

## Duplicate & Unused Images

### Week1 Duplication

| Option | Description | Selected |
|--------|-------------|----------|
| Keep nonveg1/, delete Nonveg/ | Menu.tsx imports from nonveg1/ — keep what code uses | ✓ |
| Migrate imports to Nonveg/, delete nonveg1/ | Canonical casing convention | |
| Keep both | Too risky | |

**User's choice:** Keep nonveg1/, delete Nonveg/
**Notes:** Menu.tsx has 5 static imports from nonveg1/

---

### Unused Stock Photos (14 files)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete all 14 | None referenced in any component | ✓ |
| Keep them | May be needed for future sections | |

**User's choice:** Delete all 14
**Files:** beef-teriyaki.jpg, butter-chicken.jpg, chicken-afghani.jpg, eggplant-parm.jpg, falafel-bowl.jpg, grilled-fish.jpg, lamb-tagine.jpg, mediterranean-chicken.jpg, mushroom-risotto.jpg, paneer-tikka.jpg, quinoa-bowl.jpg, salmon-quinoa.jpg, thai-curry.jpg, Veg-biryani.jpg

---

### Next.js Template SVGs (5 files)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete all 5 | Boilerplate from create-next-app | ✓ |
| Keep them | — | |

**User's choice:** Delete all 5
**Files:** file.svg, globe.svg, next.svg, window.svg, vercel.svg

---

## Root Artifacts & Config Duplication

### git_hub_production

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Old code dump, in git history if needed | ✓ |
| Keep it | Want to reference it | |

**User's choice:** Delete
**Notes:** 730-line old source code dump

---

### test-flex.html

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | Scratch test file | ✓ |
| Keep it | Still using it | |

**User's choice:** Delete

---

### update_menu.js

| Option | Description | Selected |
|--------|-------------|----------|
| Delete it | One-off batch update script | |
| Keep it | Still using this script to manage menu data | ✓ |

**User's choice:** Keep
**Notes:** User confirmed it's still needed for menu data management

---

### Dual ESLint Configs

| Option | Description | Selected |
|--------|-------------|----------|
| Delete .eslintrc.js, keep eslint.config.mjs | Modern flat config format | ✓ |
| Delete eslint.config.mjs, keep .eslintrc.js | Keep legacy format | |

**User's choice:** Delete .eslintrc.js, keep eslint.config.mjs

---

## Claude's Discretion

- Font library audit (Montserrat weights, Typo Round) — user skipped this area; deferred
- .DS_Store files — safe to remove incidentally but not a focus
- tsconfig.tsbuildinfo — could be gitignored; not prioritized

## Deferred Ideas

- Font trimming: audit which Montserrat weights and Typo Round variants are actually used in globals.css — future backlog
