# Phase 1: Foundations & Data — Research

**Researched:** 2026-04-02
**Domain:** Next.js image optimization, TypeScript data modeling
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | Remove `unoptimized: true` from next.config.ts — enables WebP/AVIF with responsive sizing | Config change: delete one line; no migration needed for local images |
| PERF-02 | All dish images in Menu use `<Image>` with correct `sizes` attribute | `sizes="(max-width: 1024px) 140px, 336px"` maps to measured container widths |
| DATA-01 | All 48 dishes in MENU_DATA have a `spiceLevel` field (integer 1–3) | TypeScript union type `1 \| 2 \| 3`; add to `Dish` interface and all 48 objects |
| DATA-02 | All 48 dishes in MENU_DATA have an `allergens` field (array of strings) | Union string literal type; use `[]` as placeholder for all 48 dishes now |
| DATA-03 | Placeholder values ready for future fill-in without schema changes | Empty array `[]` for allergens; `2` as neutral spice placeholder — both are valid values, no schema change needed to fill in real data |
</phase_requirements>

---

## Summary

Phase 1 has two independent workstreams: image optimization and data model expansion. Both are self-contained changes to a single file (`Menu.tsx`) plus one config file (`next.config.ts`). Neither workstream requires new dependencies or architectural changes.

**Image optimization** is a one-line config removal (`unoptimized: true`) plus adding a `sizes` attribute to the single `<Image>` component that renders dish photos. The `<Image>` tag already exists and already uses `fill` — it simply lacks the `sizes` hint. Once `sizes` is correct, Next.js automatically serves WebP/AVIF at the right resolution for each device. The 21 PNG files in the project (some of which have transparent backgrounds) are handled transparently by Next.js — WebP and AVIF both support alpha channels, so transparency is preserved.

**Data model expansion** means uncommenting and expanding the existing commented-out `Dish` interface (lines 21–36 of Menu.tsx), adding `spiceLevel` and `allergens` fields, and adding placeholder values to all 48 objects in MENU_DATA. The safest placeholder strategy is `allergens: []` (empty array — no known allergens, visually inert) and `spiceLevel: 2` (medium — neutral default, visually renders a mid-level indicator). Neither placeholder misleads users: an empty allergen row simply shows nothing, and a mid-spice indicator is defensible until real values are confirmed.

**Primary recommendation:** Remove `unoptimized: true`, add `sizes="(max-width: 1024px) 140px, 336px"` to the Image tag, uncomment and expand the Dish interface with `spiceLevel` and `allergens`, then add placeholder values to all 48 MENU_DATA entries.

---

## Standard Stack

### Core (already installed — no new installs required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next/image | 15.5.14 | Image optimization, WebP/AVIF conversion, responsive srcset | Built into Next.js — zero config once `unoptimized` is removed |
| TypeScript | ~5.x | Type safety for Dish interface | Already the project language |

### No new dependencies needed
Phase 1 requires zero `npm install` commands. All tools are already present.

---

## Architecture Patterns

### Recommended Structure After Phase 1
No structural changes are required in Phase 1. The MENU_DATA array and component remain co-located in `Menu.tsx`. Extraction to `src/data/menuData.ts` is a future improvement (out of scope per REQUIREMENTS.md).

### Pattern 1: Type the MENU_DATA array

The existing interface is commented out at lines 21–36. Uncomment it, expand it, and add an explicit type annotation to the array.

**Current state (lines 21–36, commented out):**
```typescript
// interface Dish {
//   id: number;
//   name: string;
//   description: string;
//   image: string;
//   isVeg: boolean;
//   dayOfWeek: number;
//   nutrients: { ... };
// }
```

**Correct pattern:**
```typescript
// Source: TypeScript handbook — discriminated unions for constrained integers
type SpiceLevel = 1 | 2 | 3;

type AllergenType = 'gluten' | 'dairy' | 'nuts' | 'eggs' | 'soy' | 'shellfish';

interface Dish {
  id: number;
  name: string;
  week: string;
  description: string;
  image: string | StaticImageData;  // covers both static imports and string paths
  isVeg: boolean;
  dayOfWeek: number;
  spiceLevel: SpiceLevel;           // DATA-01
  allergens: AllergenType[];        // DATA-02
  nutrients: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    microNutrients: { name: string; amount: string; percentage: string }[];
  };
}

const MENU_DATA: Dish[] = [ ... ];
```

The `StaticImageData` type is the correct TypeScript type for statically imported images (used by ids 1–6). It is imported from `next/image`:
```typescript
import Image, { StaticImageData } from "next/image";
```

### Pattern 2: sizes attribute for the dish image

**Measured container dimensions from Menu.tsx line 1427:**
- Mobile (default, no `lg:` prefix): `w-35` = 140px, `h-[147px]`
- Desktop (`lg:` = 1024px breakpoint): `lg:w-[336px]`, `lg:h-[300px]`

**Tailwind `lg:` breakpoint:** 1024px (unchanged from Tailwind v3 to v4).

**Correct `sizes` value:**
```tsx
// Source: Next.js Image docs — sizes attribute tells browser rendered width at each breakpoint
<Image
  src={currentDish.image}
  alt={currentDish.name}
  fill
  sizes="(max-width: 1024px) 140px, 336px"
  className="object-cover rounded-2xl"
/>
```

**What this does:** Browsers use this hint to select from the auto-generated srcset. Without it, the browser assumes 100vw (full viewport width), and on a 390px iPhone it downloads a ~390px image instead of a 140px one — roughly 7x more data than needed.

### Pattern 3: Removing unoptimized

```typescript
// next.config.ts — before
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,   // DELETE THIS LINE
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

// next.config.ts — after
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};
```

The `remotePatterns` entry with `hostname: '**'` remains valid syntax — it is not what needs changing for Phase 1. Its security risk (overly permissive) is documented in CONCERNS.md but is not a Phase 1 concern.

### Pattern 4: Allergen and spice placeholder values

```typescript
// All 48 MENU_DATA entries get these two fields added:
// DATA-01: spice placeholder — 2 (medium) is visually neutral and correct TypeScript
spiceLevel: 2,

// DATA-02: allergen placeholder — empty array means "no known allergens listed"
// Valid value (not null/undefined), renders empty, easy to fill in
allergens: [],
```

**Why `allergens: []` rather than a pre-filled placeholder like `['gluten']`:**
An empty array is factually safe — it makes no false allergy claim. Pre-filled wrong values could mislead users about food safety. DATA-03 requires "placeholder values ready for future fill-in without schema changes" — an empty array satisfies this perfectly.

**Why `spiceLevel: 2` rather than `1`:**
Middle value avoids implying dishes are all mild. Functionally any value 1–3 works.

### Anti-Patterns to Avoid
- **Do not** use `spiceLevel: null` or `spiceLevel: undefined` — the type is `1 | 2 | 3`, which does not include null/undefined. TypeScript will error if the type is set correctly.
- **Do not** use `allergens: null` — use `[]`. Null requires null-checks everywhere; empty array works with `.map()`, `.length`, and `.includes()` without guards.
- **Do not** add `sizes` to the `<img>` tags used for SVG icons (VegIcon.svg, NonVeg.svg, lines 1296–1299 and 1337–1340) — those use `<img>` not `<Image>`, and are 16–20px decorative icons with no optimization benefit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebP/AVIF conversion | Custom sharp script or external CDN transform | `next/image` optimization (built-in) | Already integrated; handles format negotiation, caching, responsive srcset automatically |
| Responsive image sizing | Manual `<picture>` + `<source>` elements | `sizes` attribute on `<Image fill>` | Next.js generates the full srcset; `sizes` just tells the browser which size to pick |
| TypeScript enum for spice | `enum SpiceLevel { Mild=1, Medium=2, Hot=3 }` | `type SpiceLevel = 1 \| 2 \| 3` | Union of literal types is idiomatic modern TypeScript — no runtime enum object, cleaner type narrowing |

**Key insight:** Next.js image optimization is an existing, complete solution. Phase 1 is removing the flag that disabled it, not building anything new.

---

## Common Pitfalls

### Pitfall 1: Missing `sizes` with `fill` causes 100vw downloads
**What goes wrong:** `<Image fill>` without `sizes` defaults to `100vw`. On a 390px mobile screen the browser downloads a ~400px image for a container that is only 140px wide — 7–8x oversized.
**Why it happens:** `fill` + no `sizes` = Next.js generates a wide srcset but the browser picks the full-viewport-width entry.
**How to avoid:** Always set `sizes` when using `fill`. Use the measured container width: `sizes="(max-width: 1024px) 140px, 336px"`.
**Warning signs:** After enabling optimization, check DevTools Network tab on mobile viewport — if the image fetched is wider than 200px, `sizes` is wrong or missing.

### Pitfall 2: `next build` warning about Image without `sizes`
**What goes wrong:** Next.js 15 emits a build warning: "Image with src X has either width or height modified, but not the other" or "Consider adding a sizes prop" when `fill` is used without `sizes`.
**Why it happens:** This is a new lint warning added in Next.js 13+ enforced in 15.
**How to avoid:** Add `sizes` in the same commit as removing `unoptimized`.
**Warning signs:** Build output shows yellow warning lines mentioning the image src.

### Pitfall 3: TypeScript error — `image` field type mismatch
**What goes wrong:** ids 1–6 use `StaticImageData` (a static import), ids 7–48 use `string`. If the `Dish` interface declares `image: string`, TypeScript will error on the six static imports.
**Why it happens:** `import ChickenAfghani from '...png'` resolves to `StaticImageData`, not `string`.
**How to avoid:** Declare the field as `image: string | StaticImageData` and import `StaticImageData` from `next/image`.
**Warning signs:** TypeScript error "Type 'StaticImageData' is not assignable to type 'string'" on lines 48, 72, 96, 120, 144, 168.

### Pitfall 4: PNG files with transparency display correctly
**What goes wrong (myth):** Concern that enabling optimization will break transparent PNGs by converting them to JPEG (which has no alpha channel).
**Actual behavior:** Next.js serves WebP by default (all browsers that support modern image optimization support WebP). WebP supports alpha channels — transparency is fully preserved. AVIF also supports transparency.
**Verification:** CONCERNS.md already notes Week 1 non-veg images use `.png` files — these are the six static imports. They will be served as WebP with transparency intact.
**Warning signs:** If you see a white or black background where transparency was expected, check if `quality` was set too low or if a custom `loader` was accidentally configured.

### Pitfall 5: TypeScript `week` field is `string`, not a union
**What goes wrong:** The existing data uses `week: "week1"`, `week: "week2"` etc. If left as `string`, typos in future data won't be caught.
**Recommendation:** Use `type Week = 'week1' | 'week2' | 'week3' | 'week4'` in the interface. This is a free improvement while the interface is being updated anyway.
**How to avoid:** Add the `Week` type alongside `SpiceLevel` and `AllergenType`.

### Pitfall 6: Spaces and apostrophes in image filenames
**What goes wrong:** Several images have spaces or special characters in filenames: `"Butter chicken with peas and carrot rice.png"`, `"Dormer's_Kebab.jpg"`, `"penne pmodorp.png"`. These are string paths in MENU_DATA, not static imports.
**Actual behavior:** Next.js handles URL-encoding of static file paths automatically when serving from `/public`. No changes to filenames needed for PERF-01/PERF-02.
**Warning signs:** These filenames cannot be directly used as static imports (only string paths), which is already how they're used.

---

## Code Examples

### Complete updated next.config.ts
```typescript
// Source: next.config.ts (remove unoptimized line only)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
```

### Dish interface with new fields
```typescript
// Source: TypeScript handbook + Next.js StaticImageData type
import Image, { StaticImageData } from "next/image";

type SpiceLevel = 1 | 2 | 3;
type Week = 'week1' | 'week2' | 'week3' | 'week4';
type AllergenType = 'gluten' | 'dairy' | 'nuts' | 'eggs' | 'soy' | 'shellfish';

interface MicroNutrient {
  name: string;
  amount: string;
  percentage: string;
}

interface Dish {
  id: number;
  name: string;
  week: Week;
  description: string;
  image: string | StaticImageData;
  isVeg: boolean;
  dayOfWeek: number;
  spiceLevel: SpiceLevel;
  allergens: AllergenType[];
  nutrients: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    microNutrients: MicroNutrient[];
  };
}

const MENU_DATA: Dish[] = [ ... ];
```

### Correct Image tag with sizes
```tsx
// Source: Menu.tsx line 1428 — add sizes attribute
<div className="relative w-35 h-[147px] rounded-2xl overflow-hidden bg-[#EEE9DA] lg:h-[300px] lg:w-[336px] md:rounded-[33px]">
  <Image
    src={currentDish.image}
    alt={currentDish.name}
    fill
    sizes="(max-width: 1024px) 140px, 336px"
    className="object-cover rounded-2xl"
  />
</div>
```

### Placeholder entry example (one of 48)
```typescript
// Dishes ids 7–48 (string path images) — add these two fields
{
  id: 7,
  name: "Paneer Afghani w/ Yellow Rice",
  week: "week1",
  description: "...",
  image: "/images/Week1/Veg/Paneer_Afghani_w__Yellow_rice.jpg",
  isVeg: true,
  dayOfWeek: 0,
  spiceLevel: 2,    // DATA-01 placeholder
  allergens: [],    // DATA-02 placeholder
  nutrients: { ... },
},

// Dishes ids 1–6 (static imports) — same two fields
{
  id: 1,
  name: "Chicken Afghani w/ Yellow Rice",
  week: "week1",
  description: "...",
  image: ChickenAfghani,   // StaticImageData
  isVeg: false,
  dayOfWeek: 0,
  spiceLevel: 2,    // DATA-01 placeholder
  allergens: [],    // DATA-02 placeholder
  nutrients: { ... },
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `image.domains` (allowlist by hostname string) | `image.remotePatterns` (protocol + hostname + path pattern) | Next.js 13 | `domains` is deprecated; `remotePatterns` is what the codebase already uses |
| `layout="fill"` prop | `fill` boolean prop | Next.js 13 | This codebase already uses the modern `fill` form |
| `StaticRequire \| StaticImageData` union | `StaticImageData` directly | Next.js 13+ | `StaticImageData` is the correct type for static imports |
| `enum SpiceLevel` | `type SpiceLevel = 1 \| 2 \| 3` | TypeScript 2.0+ | Const unions are preferred over enums in modern TypeScript |

**Deprecated/outdated:**
- `image.domains` array: deprecated since Next.js 13, removed in 15. Do not add `domains`; the existing `remotePatterns` config is correct.
- `layout="fill"` prop: replaced by the `fill` boolean in Next.js 13. The codebase already uses the correct `fill` form.

---

## Environment Availability

This phase is purely code/config changes operating on local image files already committed to the repository. No external tools, services, or CLI utilities beyond Node.js and npm are required. All images exist in `/public/images/`. No database, CDN setup, or deployment steps are part of Phase 1.

Step 2.6: SKIPPED (no external dependencies beyond the existing Next.js dev environment)

---

## Open Questions

1. **Should `spiceLevel` have a "not set" / "unknown" value?**
   - What we know: The requirement says integer 1–3 with no undefined values (DATA-01). DATA-03 says placeholder values ready for future fill-in.
   - What's unclear: Whether `2` is acceptable as a universal placeholder, or whether a display layer needs to distinguish "medium spice" from "spice unknown".
   - Recommendation: Use `2` as the placeholder now. If the gallery card in Phase 2 needs to distinguish "real data" from "placeholder data", add an optional `spiceLevelConfirmed: boolean` field in Phase 2 — no schema break.

2. **`allergens` type: union literal vs plain string[]?**
   - What we know: REQUIREMENTS.md lists the allergen set as `['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'shellfish']`.
   - Recommendation: Use `AllergenType[]` (union of string literals). Reason: prevents typos in Phase 2 when real values are filled in. The type is forward-compatible — adding a new allergen means adding one string to the union type, not a schema migration.
   - Tradeoff: If allergens ever come from a CMS API (v2 requirement DATA-V2-03), the union type would need widening to `string[]`. This is a one-line type change, not a data migration.

---

## Sources

### Primary (HIGH confidence)
- Next.js official docs (https://nextjs.org/docs/app/api-reference/components/image) — sizes attribute, fill prop, formats, remotePatterns
- Direct code inspection — Menu.tsx, next.config.ts, public/images/ directory
- TypeScript handbook — union types vs enums
- Next.js official docs (https://nextjs.org/docs/app/getting-started/images) — image optimization formats

### Secondary (MEDIUM confidence)
- DebugBear Next.js image optimization guide (https://www.debugbear.com/blog/nextjs-image-optimization) — WebP/AVIF 25–70% size reduction, sizes attribute behavior
- WebSearch: Next.js 15 sizes attribute patterns for fixed-width containers

### Tertiary (LOW confidence — not relied upon for prescriptive guidance)
- Community blog posts on sizes attribute edge cases

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Next.js Image is the only tool; config is documented and simple
- Architecture: HIGH — container dimensions read directly from source code; `sizes` formula is deterministic
- Pitfalls: HIGH — PNG transparency, TypeScript image type, and missing `sizes` warning are all verified against source
- Data typing: HIGH — TypeScript union literals are idiomatic and well-established

**Research date:** 2026-04-02
**Valid until:** 2026-10-01 (stable Next.js Image API; valid until major version bump)
