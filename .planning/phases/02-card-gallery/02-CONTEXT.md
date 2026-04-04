# Phase 2: Card Gallery — Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the 6 letter-button day selector (M T W T F S) with a horizontally scrollable food card gallery. Each card shows: dish photo (top 60%), day label, dish name, and spice level icons. Tapping or drag-snapping to a card selects that day and updates the large dish display below.

This phase covers GALL-01 through GALL-05 only. Week tabs, veg/non-veg toggle refinement, and the detail sheet are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Card Layout

- **D-01:** Card orientation is **portrait** — photo on top (~60% height), info below (~40%). Each card is roughly 120–140px wide.
- **D-02:** Info section (bottom 40%) contains: day label, dish name (1 line truncated), spice emoji row. Allergens are NOT shown on the card — they surface in the Phase 3 detail sheet.
- **D-03:** Card corner radius should follow the existing Tailwind `rounded-2xl` pattern already established in Menu.tsx for consistency.

### Selection Treatment

- **D-04:** Selected card gets a **cream (#EEE9DA) border + scale-105** treatment. Unselected cards are slightly dimmed (opacity ~80%).
- **D-05:** Framer Motion handles the selection transition (scale + border fade-in) to match the animation library already in use.
- **D-06:** Border color is `#EEE9DA` (Dormer's cream) — matches the brand palette and contrasts clearly with the navy card background.

### Spice Icons

- **D-07:** Spice level is displayed as **chilli emojis × N** (🌶️ = mild, 🌶️🌶️ = medium, 🌶️🌶️🌶️ = hot). No custom SVG needed.
- **D-08:** Allergen icons are **omitted from the gallery card** — intentional deviation from GALL-02 draft. Allergens will be shown in the Phase 3 slide-up detail sheet where there is room. This keeps the card info section uncluttered.

### Scroll Mechanics

- **D-09:** Gallery uses **Framer Motion drag** (not CSS overflow-x-auto/scroll-snap) for spring physics and momentum feel.
- **D-10:** Drag + release **auto-selects** the nearest card — dragging and snapping automatically changes the active dish. The researcher should investigate how to detect which card is nearest/centered after a Framer Motion drag completes.
- **D-11:** GALL-04 (auto-scroll to today's day on initial load) still applies — on mount, the gallery should scroll/animate to the card matching today's day index.

### Claude's Discretion

- Card gap spacing, padding inside the info section, and font sizes — match existing Montserrat/Poppins type conventions from Menu.tsx.
- Exact card width and height values — size to fit 6 cards with partial peek of the next card on mobile, so the user understands the gallery is scrollable.
- Drag constraints (dragElastic, dragTransition) — tune for snappy, non-jittery feel on mobile.
- Whether to extract the gallery into a separate component file (e.g. `DishGallery.tsx`) or keep it inline in Menu.tsx — prefer extraction if it keeps Menu.tsx below ~1800 lines.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — GALL-01 through GALL-05 are the acceptance criteria for this phase. Note D-08 above intentionally revises GALL-02 (allergens moved to detail sheet).

### Project Context
- `.planning/PROJECT.md` — Core value, brand colors (#1E3A4F navy, #EEE9DA cream), constraints
- `.planning/STATE.md` — Architecture notes including `react-swipeable` availability and Framer Motion usage patterns

### Source Files
- `src/app/components/Menu.tsx` — Full component (~1,600 lines). State vars at ~line 1271. Day buttons at ~line 1467. The 6 letter buttons (lines 1468–1491) are what this phase replaces.

### No external specs
No external design specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Framer Motion ^12.5.0` — already installed, used in HeroReveal, OrderForm, TestimonialsBubbles. Available for gallery drag and card selection animation.
- `react-swipeable` — installed but unused. Framer Motion drag is preferred (D-09) so this can be ignored for this phase.
- `useRef` — already imported in Menu.tsx. Can be used to hold a ref to the gallery container for programmatic scroll-to on mount (GALL-04).
- `next/image` — `<Image fill sizes="(max-width: 1024px) 140px, 336px">` pattern established in Phase 1. Gallery cards will need their own sizes attribute appropriate to card width.

### Established Patterns
- `"use client"` at top of all interactive components.
- Framer Motion variant objects defined as module-level `const` outside the component.
- Theme-aware styling via `useTheme()` from next-themes — navy bg in dark, cream bg in light.
- `SCREAMING_SNAKE_CASE` for static data constants (MENU_DATA, etc.).
- `handle` prefix for event handlers (handleOrderFormOpen, etc.).

### Integration Points
- `selectedDay` state (line 1272) drives the current dish display — gallery cards call `setSelectedDay(item.dayOfWeek)` just as the old letter buttons did.
- `availableDishes` (derived from isVegOnly + selectedWeek, line 1281) is the data source — gallery iterates this, not raw MENU_DATA.
- The large dish image/info display below the gallery reads from `currentDish` (line 1284) — no changes needed there.
- `setSelectedDay` is the only integration point — gallery is a drop-in replacement for the 6 letter buttons.

</code_context>

<specifics>
## Specific Ideas

- Card gallery replaces the 6 letter buttons block at lines 1468–1491 in Menu.tsx.
- The Framer Motion drag implementation needs to detect which card is "centered" after drag ends — likely via measuring card positions relative to the container's scroll offset or using a `onDragEnd` callback that checks index distance from center.
- For GALL-04 (auto-scroll to today on mount): use `useEffect` on mount to animate the gallery to the card matching `selectedDay` — same way `useEffect` already drives scroll on day change (line 1290–1295 in Menu.tsx).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-card-gallery*
*Context gathered: 2026-04-04*
