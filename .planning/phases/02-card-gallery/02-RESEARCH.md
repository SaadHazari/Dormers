# Phase 2: Card Gallery — Research

**Researched:** 2026-04-04
**Domain:** Framer Motion drag gallery, React horizontal scroll, Next.js Image, Tailwind CSS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Card orientation is **portrait** — photo on top (~60% height), info below (~40%). Each card is roughly 120–140px wide.
- **D-02:** Info section (bottom 40%) contains: day label, dish name (1 line truncated), spice emoji row. Allergens are NOT shown on the card — they surface in the Phase 3 detail sheet.
- **D-03:** Card corner radius should follow the existing Tailwind `rounded-2xl` pattern already established in Menu.tsx for consistency.
- **D-04:** Selected card gets a **cream (#EEE9DA) border + scale-105** treatment. Unselected cards are slightly dimmed (opacity ~80%).
- **D-05:** Framer Motion handles the selection transition (scale + border fade-in) to match the animation library already in use.
- **D-06:** Border color is `#EEE9DA` (Dormer's cream) — matches the brand palette and contrasts clearly with the navy card background.
- **D-07:** Spice level is displayed as **chilli emojis × N** (🌶 = mild, 🌶🌶 = medium, 🌶🌶🌶 = hot). No custom SVG needed.
- **D-08:** Allergen icons are **omitted from the gallery card** — intentional deviation from GALL-02 draft. Allergens will be shown in the Phase 3 slide-up detail sheet where there is room. This keeps the card info section uncluttered.
- **D-09:** Gallery uses **Framer Motion drag** (not CSS overflow-x-auto/scroll-snap) for spring physics and momentum feel.
- **D-10:** Drag + release **auto-selects** the nearest card — dragging and snapping automatically changes the active dish.
- **D-11:** GALL-04 (auto-scroll to today's day on initial load) still applies — on mount, the gallery should scroll/animate to the card matching today's day index.

### Claude's Discretion

- Card gap spacing, padding inside the info section, and font sizes — match existing Montserrat/Poppins type conventions from Menu.tsx.
- Exact card width and height values — size to fit 6 cards with partial peek of the next card on mobile, so the user understands the gallery is scrollable.
- Drag constraints (dragElastic, dragTransition) — tune for snappy, non-jittery feel on mobile.
- Whether to extract the gallery into a separate component file (e.g. `DishGallery.tsx`) or keep it inline in Menu.tsx — prefer extraction if it keeps Menu.tsx below ~1800 lines.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GALL-01 | Day navigation is a horizontally scrollable card gallery — all 6 days visible as swipeable cards | Framer Motion `drag="x"` + `dragConstraints` pattern; `useMotionValue` for x tracking |
| GALL-02 | Each gallery card shows: day label (Mon–Sat), food photo, dish name, spice icon row (allergen row deferred per D-08) | `next/image` fill + `sizes="140px"` pattern from Phase 1; chilli emoji string from D-07 |
| GALL-03 | Selected day card is visually distinct (highlighted border + scale-105 per D-04) | Framer Motion `animate` prop with conditional variants; `layout` prop for smooth transitions |
| GALL-04 | Gallery auto-scrolls to selected day on initial load (today's day) | `useEffect` on mount + `useAnimate` or `motionValue.set()` to position gallery x |
| GALL-05 | Scroll behavior is smooth and touch-friendly (no scrollbar visible) | `dragDirectionLock` + `touch-action: pan-y` on card elements; `overflow-hidden` on container |
</phase_requirements>

---

## Summary

Phase 2 replaces the 6 letter-button day selector in Menu.tsx (lines 1468–1491) with a horizontally draggable card gallery. All technical decisions are locked: Framer Motion drag (not CSS overflow scroll), portrait card layout at 120px mobile / 140px desktop, cream border + scale-105 selection treatment, and chilli emoji spice indicators.

The primary implementation challenge is the Framer Motion drag-to-snap pattern: after drag release, the gallery must snap to the nearest card and update `selectedDay`. This is solved by combining `useMotionValue` (for tracking the gallery's x position without re-renders), `dragTransition.modifyTarget` (for automatic snap-to-grid physics), and an `onDragEnd` callback (for syncing `selectedDay` state to the snapped position). The auto-scroll-to-today feature on mount uses a `useEffect` that calls `animate(x, targetOffset)` from `useAnimate`.

Menu.tsx is currently 1,765 lines — already at the 1,800-line threshold. Extraction to `DishGallery.tsx` is mandatory. The extracted component receives `availableDishes`, `selectedDay`, and `setSelectedDay` as props, leaving Menu.tsx's integration points unchanged. The `NutrientRow` helper function at the bottom of Menu.tsx stays in place.

**Primary recommendation:** Build `DishGallery.tsx` as a standalone `"use client"` component with a `useMotionValue` x-track, `dragTransition.modifyTarget` snap logic, and a `useEffect` mount animation. Import it into Menu.tsx as a drop-in replacement for the letter buttons block.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | 12.5.0 (installed) | Drag gesture, spring physics, card selection animation | Already in project; `drag="x"`, `dragConstraints`, `dragTransition`, `useMotionValue`, `useAnimate` all available |
| next/image | Next.js 15.5.14 (installed) | Optimized card images with `fill` + `sizes` | Phase 1 established the pattern; WebP/AVIF delivery already enabled |
| tailwindcss | v4 (installed) | Layout, typography, card dimensions, color | All existing UI uses Tailwind utility classes |
| react | 19.0.0 (installed) | `useRef`, `useEffect`, `useState` for gallery state | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-themes | 0.4.6 (installed) | `useTheme()` for light/dark card backgrounds | Same pattern as existing Menu.tsx |
| react-swipeable | 7.0.2 (installed) | Touch swipe detection | NOT needed for this phase — Framer Motion drag replaces it (D-09) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Framer Motion drag | CSS `overflow-x: scroll` + `scroll-snap-type: x mandatory` | CSS scroll-snap is simpler but was explicitly rejected (D-09) — no spring physics or momentum |
| Framer Motion drag | react-swipeable | react-swipeable is installed but provides no animation primitives — still needs manual x-offset tracking |
| chilli emoji | Custom SVG icons | SVG was explicitly rejected (D-07) — emoji works at 10–11px card sizes |

**Installation:** No new packages required — all dependencies already installed.

**Version verification:** framer-motion 12.5.0 confirmed via `node -e "require('./node_modules/framer-motion/package.json').version"` on 2026-04-04. Import path `framer-motion` still valid in v12 (the package was rebranded to `motion` but `framer-motion` remains a working alias).

---

## Architecture Patterns

### Recommended Project Structure

```
src/app/components/
├── Menu.tsx              # ~1,765 lines — remove letter buttons block, import DishGallery
├── DishGallery.tsx       # NEW — extracted gallery component (~120–150 lines)
└── CustomSelect.jsx      # Unchanged (Phase 3 will remove this)
```

DishGallery.tsx is a `"use client"` component. It receives three props from Menu.tsx:
- `availableDishes: Dish[]` — already derived in Menu.tsx
- `selectedDay: number | null` — existing state
- `setSelectedDay: (day: number) => void` — existing setter

### Pattern 1: Framer Motion Drag with useMotionValue

**What:** Track the gallery strip's x position as a MotionValue (not React state) so drag movements don't trigger re-renders. Apply drag constraints computed from measured container/track widths.

**When to use:** Any horizontal gallery where you need physics-based drag + programmatic position control (mount animation).

```typescript
// Source: motion.dev/docs/react-drag (verified 2026-04-04)
// All Framer Motion variants defined as module-level const outside component
const galleryVariants = {
  // no animation variants needed for the track itself
};

export function DishGallery({ availableDishes, selectedDay, setSelectedDay }) {
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [constraints, setConstraints] = useState({ left: 0, right: 0 });

  const CARD_WIDTH = 120;   // mobile
  const CARD_GAP = 8;       // sm token
  const STEP = CARD_WIDTH + CARD_GAP;

  // Compute drag constraints after mount
  useEffect(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const trackW = STEP * availableDishes.length;
    setConstraints({ left: -(trackW - containerW), right: 0 });
  }, [availableDishes.length]);

  // Auto-scroll to today's card on mount
  useEffect(() => {
    if (selectedDay === null) return;
    const idx = availableDishes.findIndex(d => d.dayOfWeek === selectedDay);
    if (idx < 0) return;
    const target = -(idx * STEP);
    animate(x, target, { type: "spring", stiffness: 300, damping: 30 });
  }, []); // mount only

  function handleDragEnd() {
    const currentX = x.get();
    const idx = Math.round(-currentX / STEP);
    const clamped = Math.max(0, Math.min(idx, availableDishes.length - 1));
    const snap = -(clamped * STEP);
    animate(x, snap, { type: "spring", stiffness: 400, damping: 35 });
    setSelectedDay(availableDishes[clamped].dayOfWeek);
  }

  return (
    <div ref={containerRef} className="overflow-hidden relative">
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={constraints}
        dragElastic={0.1}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
        dragDirectionLock
        onDragEnd={handleDragEnd}
        className="flex gap-2"
      >
        {availableDishes.map(dish => (
          <DishCard
            key={dish.dayOfWeek}
            dish={dish}
            isSelected={dish.dayOfWeek === selectedDay}
            onSelect={() => setSelectedDay(dish.dayOfWeek)}
          />
        ))}
      </motion.div>
    </div>
  );
}
```

### Pattern 2: Card Selection Animation via Framer Motion animate prop

**What:** Each card uses `motion.button` with an `animate` prop that conditionally applies scale and border. No external variant — the animate object is computed inline from `isSelected`.

**When to use:** Per-item selection state that must animate smoothly when selection changes.

```typescript
// Source: motion.dev/docs/react-motion-component (verified 2026-04-04)
function DishCard({ dish, isSelected, onSelect }) {
  return (
    <motion.button
      onClick={onSelect}
      animate={{
        scale: isSelected ? 1.05 : 1,
        opacity: isSelected ? 1 : 0.8,
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`relative flex-shrink-0 rounded-2xl overflow-hidden
        ${isSelected ? "border-2 border-[#EEE9DA]" : "border-2 border-transparent"}`}
      style={{ width: 120, height: 168 }}
      aria-label={`${dayLabel(dish.dayOfWeek)} — ${dish.name}`}
      aria-current={isSelected ? "true" : undefined}
    >
      {/* Photo section: 60% height */}
      <div className="relative w-full" style={{ height: "60%" }}>
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          sizes="140px"
          className="object-cover"
        />
      </div>
      {/* Info section: 40% height */}
      <div className="flex flex-col justify-between px-2 py-1" style={{ height: "40%" }}>
        <span style={{ fontFamily: "Montserrat", fontWeight: 700, fontSize: 10, lineHeight: "100%" }}>
          {dayLabel(dish.dayOfWeek)}
        </span>
        <span style={{ fontFamily: "Montserrat", fontWeight: 600, fontSize: 12, lineHeight: "120%" }}
              className="truncate">
          {dish.name}
        </span>
        <span style={{ fontSize: 10, lineHeight: "100%" }}>
          {"🌶".repeat(dish.spiceLevel)}
        </span>
      </div>
    </motion.button>
  );
}
```

### Pattern 3: useAnimate for Programmatic Gallery Position

**What:** Import `useAnimate` from `framer-motion` alongside `useMotionValue`. Use `animate(x, targetValue, springConfig)` to programmatically animate the gallery x position on mount and after tap-select.

**When to use:** Required for GALL-04 (auto-scroll to today) and for tap-to-select updating gallery position to center the tapped card.

```typescript
import { motion, useMotionValue, useAnimate } from "framer-motion";

// Inside component:
const x = useMotionValue(0);
const [scope, animate] = useAnimate();

// useEffect on mount:
animate(x, targetX, { type: "spring", stiffness: 300, damping: 30 });
```

Note: `animate` from `useAnimate` can animate a `MotionValue` directly, not just DOM elements. This is the correct way to programmatically drive x without resetting drag state.

### Pattern 4: Day Label Mapping

**What:** Map `dayOfWeek` integer (0–5) to "Mon"–"Sat" abbreviations as specified in the copywriting contract.

```typescript
// Module-level const (SCREAMING_SNAKE_CASE convention)
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const dayLabel = (idx: number) => DAY_LABELS[idx] ?? "—";
```

### Pattern 5: Empty State Card

**What:** When `availableDishes` has no entry for a given day slot (can happen with veg filter), render a placeholder card.

```typescript
// Build a full 6-slot array, filling missing days with null
const DAY_INDICES = [0, 1, 2, 3, 4, 5];
const slots = DAY_INDICES.map(
  i => availableDishes.find(d => d.dayOfWeek === i) ?? null
);
```

Render null slots as a card showing "Not available" / "No veg option today" per the copywriting contract.

### Anti-Patterns to Avoid

- **Storing x as React state:** Use `useMotionValue(0)` not `useState(0)` — MotionValues do not trigger re-renders, which is critical for smooth drag performance.
- **Importing from `motion/react` in this project:** The project uses `framer-motion` as the import. Do not switch — the import path is different from `motion` (new package). Both work, but consistency with existing project code (`HeroReveal.tsx`, `TestimonialsBubbles.tsx`) requires `framer-motion`.
- **Using CSS `overflow-x: scroll` on the gallery container:** Decision D-09 prohibits this. The container must have `overflow-hidden` with Framer Motion drag handling all scroll-like behavior.
- **Animating `border` width directly:** CSS border changes cause layout reflow. Use `border-2 border-transparent` on all cards and `border-2 border-[#EEE9DA]` on selected — same width always, only color changes. This avoids layout shift during selection.
- **Inline variant objects inside JSX:** Follow project pattern from `HeroReveal.tsx` — define variants as module-level `const` outside the component function.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spring physics after drag release | Custom inertia/momentum math | `dragTransition` with `bounceStiffness` + `bounceDamping` | Framer Motion handles inertia, momentum, and bounce internally — custom math produces jank |
| Snap-to-grid after drag | Custom position calculation in `onDragEnd` | `dragTransition.modifyTarget: target => Math.round(target / STEP) * STEP` | Built-in `modifyTarget` runs before the physics settle, producing correct snap without fighting momentum |
| Programmatic scroll to card | `scrollIntoView()` or CSS `scroll-behavior: smooth` | `animate(x, targetOffset, springConfig)` via `useAnimate` | CSS scroll APIs don't integrate with Framer Motion's MotionValue system — mixing them breaks drag state |
| Touch-scroll conflict detection | Custom `touchstart`/`touchmove` event listeners | `dragDirectionLock={true}` prop | Built-in direction lock detects first-axis movement and prevents cross-axis conflict |
| Image optimization | Manual WebP conversion or srcset | `next/image` with `sizes="140px"` | Phase 1 already enabled Next.js image optimization — gallery cards inherit it for free |

**Key insight:** Framer Motion's drag system is a complete physics engine. Adding custom math on top of it (custom snap, custom momentum) almost always produces conflicts. Trust `dragTransition` and `modifyTarget` for snap logic; use `onDragEnd` only to sync React state after the snap is complete.

---

## Common Pitfalls

### Pitfall 1: dragTransition modifyTarget vs onDragEnd for snap — doing both

**What goes wrong:** Developer implements snap logic in both `dragTransition.modifyTarget` AND `onDragEnd`, causing the gallery to snap twice — once by physics, once by the manual animate call.

**Why it happens:** `modifyTarget` runs during the physics simulation; `onDragEnd` fires after the animation settles. If both set x position, the second one overrides the first after a visible pause.

**How to avoid:** Use `modifyTarget` for x-position snapping; use `onDragEnd` only to call `setSelectedDay` (state sync). Do not call `animate(x, ...)` in `onDragEnd` if `modifyTarget` is already handling position.

**Warning signs:** Gallery visibly "jumps" after releasing drag — snaps to one position then immediately jumps to another.

### Pitfall 2: drag="x" blocking vertical page scroll on iOS

**What goes wrong:** Framer Motion's drag sets `touch-action: none` internally on the draggable element when `drag` is active. On iOS, this prevents the user from scrolling the page by starting a touch gesture on the gallery.

**Why it happens:** iOS respects `touch-action` on the element where the touch begins. If the user's thumb starts on a gallery card and tries to scroll down the page, the touch is consumed by the drag handler.

**How to avoid:** Apply `style={{ touchAction: "pan-y" }}` on the inner card buttons (not the drag track). The drag track itself may need `touch-action: none` for Framer Motion to function — the mitigation is that `dragDirectionLock={true}` causes Framer Motion to release the gesture to native scroll if the user's first movement is vertical. Test on a real iOS device.

**Warning signs:** Page cannot be scrolled when thumb starts on the gallery area. GALL-05 verification must include real-device touch test.

### Pitfall 3: dragConstraints computed before layout (zero-width container)

**What goes wrong:** `dragConstraints.left` is computed as 0 (no constraint) because `containerRef.current.offsetWidth` is 0 at the time the `useEffect` runs — SSR or first paint hasn't measured the DOM yet.

**Why it happens:** In Next.js with SSR, the component renders on the server where no DOM measurement is possible. On client hydration, refs are available but dimensions may still be 0 if the parent hasn't painted.

**How to avoid:** Guard the constraint calculation with a `ResizeObserver` or compute lazily in the first `onDrag` call. Alternatively, compute constraints inline from known fixed values (STEP * 6 - containerWidth) where containerWidth is estimated from Tailwind breakpoints.

**Warning signs:** Gallery can be dragged infinitely to the right (no right constraint) or the left constraint is too permissive.

### Pitfall 4: `image` field is StaticImageData for Week 1 non-veg, string path for all others

**What goes wrong:** `next/image` `src` prop works with both `string` and `StaticImageData`, but the gallery cards need the same `sizes` attribute regardless. Passing a `StaticImageData` object to a `fill`-mode Image with `sizes` is valid — but the developer may accidentally write a guard that breaks one type.

**Why it happens:** Menu.tsx uses static imports (`import ChickenAfghani from '...'`) for Week 1 non-veg images, and string paths (`"/images/Week{2-4}/..."`) for other weeks. The TypeScript type is `string | StaticImageData`.

**How to avoid:** Do not branch on image type in the gallery card. `<Image src={dish.image} fill sizes="140px" />` works for both types. The `src` prop of `next/image` accepts the union type.

**Warning signs:** TypeScript error "Type StaticImageData is not assignable to string" if you accidentally annotate the prop as `string` only.

### Pitfall 5: border-2 causing layout shift on selection

**What goes wrong:** Switching from `border-0` to `border-2` on selection changes the card's box model, pushing adjacent cards by 2px and causing visible layout jitter.

**Why it happens:** `border` changes affect layout flow.

**How to avoid:** All cards always have `border-2`. Unselected cards use `border-[#EEE9DA]/0` or `border-transparent`. Only the color changes on selection — never the width. This is the Tailwind convention for "invisible border that becomes visible."

---

## Code Examples

### snap-to-card modifyTarget

```typescript
// Source: motion.dev/docs/react-drag — dragTransition.modifyTarget
// STEP = cardWidth + cardGap (e.g. 120 + 8 = 128px)
dragTransition={{
  bounceStiffness: 300,
  bounceDamping: 30,
  modifyTarget: (target) => Math.round(target / STEP) * STEP,
}}
```

### onDragEnd state sync (used alongside modifyTarget — no extra animate call)

```typescript
function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
  // x.get() reflects post-modifyTarget snapped position
  const snappedX = x.get();
  const idx = Math.max(0, Math.min(
    Math.round(-snappedX / STEP),
    availableDishes.length - 1
  ));
  setSelectedDay(availableDishes[idx].dayOfWeek);
}
```

Note: `info.offset.x` in `onDragEnd` is the total drag distance. For snapped index calculation, read from `x.get()` after `modifyTarget` has settled, or calculate from `info.offset.x` + initial position.

### Auto-scroll to today on mount

```typescript
// Runs once on mount — animates gallery to center selectedDay card
useEffect(() => {
  const idx = availableDishes.findIndex(d => d.dayOfWeek === selectedDay);
  if (idx < 0) return;
  // Negative offset: gallery track moves left to show idx card
  const targetX = -(idx * STEP);
  // Clamp to constraints
  const clamped = Math.max(constraints.left, Math.min(targetX, 0));
  animate(x, clamped, { type: "spring", stiffness: 300, damping: 30 });
}, []); // empty deps = mount only
```

### Gallery container with overflow-hidden and touch-action

```tsx
// Outer container: hides overflowing cards, no visible scrollbar
<div
  ref={containerRef}
  className="overflow-hidden relative"
  // 12px horizontal padding = peek of adjacent card
  style={{ paddingLeft: 12, paddingRight: 12 }}
>
  <motion.div
    drag="x"
    style={{ x }}
    dragConstraints={constraints}
    dragElastic={0.1}
    dragDirectionLock
    dragTransition={{
      bounceStiffness: 300,
      bounceDamping: 30,
      modifyTarget: (t) => Math.round(t / STEP) * STEP,
    }}
    onDragEnd={handleDragEnd}
    className="flex"
    style={{ gap: 8 }}
  >
    {slots.map((dish, i) => dish
      ? <DishCard key={i} dish={dish} isSelected={dish.dayOfWeek === selectedDay} onSelect={...} />
      : <EmptyCard key={i} idx={i} />
    )}
  </motion.div>
</div>
```

### Props interface for DishGallery

```typescript
// Dish type already declared in Menu.tsx — re-export or co-locate
interface DishGalleryProps {
  availableDishes: Dish[];
  selectedDay: number | null;
  setSelectedDay: (day: number) => void;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` npm package | `motion` npm package (alias: `framer-motion`) | Late 2024 | Import `from "framer-motion"` still works; no migration needed for this project |
| Manual inertia after drag | `dragTransition.modifyTarget` snap | Framer Motion v6+ | No custom math needed for snap-to-grid |
| CSS `scroll-snap-type` for gallery | Framer Motion `drag="x"` + physics | Project decision D-09 | Spring feel, momentum, programmatic control |

**Deprecated/outdated:**
- `onChange` on MotionValue: The old `.onChange()` subscription API was deprecated in Framer Motion v10 in favour of `useMotionValueEvent`. For this phase we don't need to subscribe to x changes (we use `x.get()` in callbacks), so this is not a concern.

---

## Open Questions

1. **`onDragEnd` x.get() timing vs modifyTarget settle**
   - What we know: `modifyTarget` modifies the physics target before the animation runs. `onDragEnd` fires when the gesture ends, not when the animation settles.
   - What's unclear: At `onDragEnd` call time, has `modifyTarget` already updated `x.get()`? Or does `x.get()` still reflect the pre-snap position?
   - Recommendation: Calculate snap index from `info.offset.x` relative to drag start (not from `x.get()`), or listen with `x.on("change", ...)` for the final settled value. Alternatively, compute index from `modifyTarget`'s output directly (same formula: `Math.round(rawX / STEP)`).

2. **Tap on card vs. drag gesture conflict**
   - What we know: Framer Motion distinguishes `onClick` and drag gestures — a short tap fires `onClick`, a longer movement fires drag.
   - What's unclear: Whether tap `onClick` also needs to animate gallery x to center the tapped card, or whether visual selection (scale + border) is sufficient without centering.
   - Recommendation: On card tap, also call `animate(x, -(idx * STEP), spring)` to center the selected card. This provides consistent behavior between tap and drag.

3. **`dragConstraints` with ref vs. pixel values**
   - What we know: Framer Motion supports both `dragConstraints={{ left: -N, right: 0 }}` (pixel values) and `dragConstraints={containerRef}` (ref-based).
   - What's unclear: Ref-based constraints auto-update on resize; pixel-value constraints require manual `ResizeObserver`. For a fixed 6-card gallery at fixed card sizes, pixel values are simpler and more predictable.
   - Recommendation: Use pixel values computed from known card dimensions. Guard with a `useEffect` that recalculates on mount after DOM is measured.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all libraries are already installed; phase is purely code changes within the existing Next.js project).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| framer-motion | Gallery drag + animations | Yes | 12.5.0 | — |
| next/image | Card photo display | Yes | Next.js 15.5.14 | — |
| tailwindcss | Layout + styling | Yes | v4 | — |
| next-themes | Theme-aware card colors | Yes | 0.4.6 | — |

---

## Validation Architecture

`nyquist_validation` is set to `false` in `.planning/config.json` — this section is skipped.

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md does not exist in the project root. No project-level constraints file found.

Conventions extracted from existing codebase (`Menu.tsx`, `HeroReveal.tsx`):

- `"use client"` at top of all interactive components — required for Framer Motion hooks
- Framer Motion variant objects defined as module-level `const` outside the component function
- `SCREAMING_SNAKE_CASE` for static data constants (e.g., `DAY_LABELS`, `STEP`)
- `handle` prefix for event handlers (e.g., `handleDragEnd`, `handleCardSelect`)
- Theme-aware styling via `useTheme()` from `next-themes`
- TypeScript throughout — no `.jsx` for new files
- Import from `"framer-motion"` (not `"motion/react"`) — matches existing project imports

---

## Sources

### Primary (HIGH confidence)
- `motion.dev/docs/react-drag` — drag props: `dragConstraints`, `dragElastic`, `dragTransition`, `dragDirectionLock`, `dragMomentum`, `onDragEnd` info object shape (verified 2026-04-04)
- `motion.dev/docs/react` — React integration, `"use client"` requirement (verified 2026-04-04)
- `framer-motion` npm package — v12.5.0 confirmed installed via local `node_modules` inspection
- `Menu.tsx` source — line count (1765), state vars, letter button block (1468–1491), `selectedDay` type, `availableDishes` derivation, `Dish` interface, existing imports
- `package.json` — all dependency versions confirmed

### Secondary (MEDIUM confidence)
- WebSearch + motion.dev docs: `dragTransition.modifyTarget` for snap-to-grid — confirmed in official docs pattern (multiple sources agree)
- WebSearch: `framer-motion` → `motion` package rename in late 2024 — confirmed via npm page and upgrade guide
- GitHub issues (motiondivision/motion): iOS touch/scroll conflict with `drag="x"` — longstanding known issue, `dragDirectionLock` is the primary mitigation

### Tertiary (LOW confidence)
- `onDragEnd` timing vs `modifyTarget` settle: exact timing of when x.get() reflects snapped value — documented as open question; no official source found confirming exact sequence

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages installed and version-verified locally
- Architecture: HIGH — patterns derived from official Framer Motion docs + existing project code
- Pitfalls: MEDIUM — iOS touch conflict is a documented open issue; exact `modifyTarget` + `onDragEnd` interaction timing is LOW
- Code examples: HIGH for structure; MEDIUM for exact physics values (dragElastic 0.1, bounceStiffness 300 — tunable at implementation time)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable stack — framer-motion v12, Next.js 15, Tailwind v4 unlikely to have breaking changes in 30 days)
