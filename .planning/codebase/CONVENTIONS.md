# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- React components: PascalCase — `Navbar.tsx`, `USPBento.tsx`, `HowItWorks.tsx`
- Page files follow Next.js App Router conventions: `page.tsx`, `layout.tsx`, `route.ts`
- Mixed extensions exist: most components are `.tsx`, but some are `.jsx` — `CurtleAboutUs.jsx`, `TestmonialsDesktop.jsx`, `renderFaqCard.jsx`, `CustomSelect.jsx`
- Custom hooks use camelCase with a `use` prefix: `useResize.jsx`
- CSS module files are kebab-case adjunct files: `AboutUs.css`, `globals.css`

**Functions/Components:**
- All exported components use PascalCase default exports: `export default function Navbar()`, `export default function USPBento()`
- Handler functions use `handle` prefix in camelCase: `handleOrderFormOpen`, `handleOrderFormClose`, `handleNavClick`
- Boolean state variables use `is` prefix: `isMenuOpen`, `isOrderFormOpen`, `isChatOpen`
- Non-component render helpers can be plain functions exported from `.jsx`: `renderFaqCard` in `src/app/(main)/home/renderFaqCard.jsx`

**Variables:**
- camelCase throughout — `navLinks`, `deliveryLocations`, `quickLinks`, `flippedId`
- Constants defined outside components use SCREAMING_SNAKE_CASE: `FLIP_CSS`, `CARDS`, `MENU_DATA`, `COL_TIMING`, `E`, `CSS`
- Framer Motion variant objects use camelCase: `cardVariants`, `containerVariants`, `itemVariants`

**Types/Interfaces:**
- PascalCase interfaces with `interface` keyword: `OrderFormProps`, `CardData`, `CardDef`
- Inline destructured type annotations on function parameters are common in API routes
- TypeScript strict mode is enabled (`"strict": true` in `tsconfig.json`)

## TypeScript Usage

**Strictness:** `strict: true` in `tsconfig.json`, `noEmit: true`, `isolatedModules: true`, target `ES2017`.

**Patterns:**
- `React.CSSProperties` typed inline style objects: `const cardStyle: React.CSSProperties = { ... }`
- Explicit event types on handlers: `e: React.MouseEvent<HTMLAnchorElement>`
- Generic `unknown` catch type with cast for error handling: `catch (error: unknown) { const err = error as { message?: string }; }`
- `as const` on tuple arrays for Framer ease curves: `const E = [0.25, 0.46, 0.45, 0.94] as const`
- Interfaces defined adjacent to the component that consumes them (not in a separate `types/` file)
- Some files use `.jsx` extension without TypeScript, indicating incremental TS adoption — not all code is typed

**Path Aliases:**
- `@/*` maps to `./src/*` — use `@/app/components/Foo` not relative paths when crossing directories
- Example usage: `import OrderForm from "@/app/components/OrderForm"`, `import "@/style/AboutUs.css"`

## Component Structure

**All interactive components start with `"use client"` directive** — this is the dominant pattern. No Server Components are used for UI rendering outside of `layout.tsx` and `not-found.tsx`.

**Standard component shape:**
```tsx
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

interface FooProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Foo({ isOpen, onClose }: FooProps) {
  const { theme } = useTheme();
  // state, effects, handlers
  return ( /* JSX */ );
}
```

**Data defined outside components:** Static data arrays (nav links, menu items, card data) are defined as `const` outside the component body:
```tsx
const navLinks = [
  { name: "Home", href: "/home#hero" },
  ...
];
```

**Framer Motion variants** are also defined as module-level constants outside the component:
```tsx
const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: (i: number) => ({ ... }),
};
```

## Styling Approach

**Primary: Tailwind CSS v4** with inline `style` props as a frequent supplement.

**Tailwind:**
- Used for layout, spacing, responsive breakpoints, and simple color utilities
- Responsive prefix pattern: `md:`, `lg:`, `hidden md:block` etc.
- Dark/light theming via conditional class strings, NOT Tailwind's `dark:` modifier:
  ```tsx
  className={`${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}
  ```
- Arbitrary values are frequent: `text-[10px]`, `bg-[#031624]`, `px-[15px]`, `rounded-[12px]`
- Custom animation defined in `tailwind.config.js`: `animate-scroll` with a `scroll` keyframe

**Inline `style` props:** Used extensively for typography properties where font families, exact weights, and pixel sizes are specified:
```tsx
style={{
  fontFamily: "Montserrat, sans-serif",
  fontWeight: 700,
  lineHeight: "100%",
  letterSpacing: "0",
}}
```

**Injected CSS strings:** Some complex components inject a raw CSS string via `<style>{CSS}</style>` inside the component's JSX. This pattern is used in `HowItWorks.tsx` and `USPBento.tsx` for flip animations and scoped layout rules that are hard to express in Tailwind.

**Plain CSS files:** `src/app/globals.css` holds global styles, custom utility classes (`.Join_the_club`, `.socialmediaiconbox`, `.badge-label`), keyframe animations, and font-face declarations. `src/style/AboutUs.css` holds component-specific styles imported via `import "@/style/AboutUs.css"`.

**CSS Custom Properties:**
```css
:root {
  --radius-card: 16px;
  --radius-button: 12px;
  --radius-small: 8px;
}
```

## Typography System

Three fonts are used throughout, loaded via local `@font-face` declarations in `globals.css` and supplemented by Google Fonts (Montserrat 900 weight only via `next/font/google` in `layout.tsx`):

- **Montserrat** — headings, labels, navigation, buttons. Weights: 400, 500, 700, 900.
- **Typo Round Bold Demo** — display text, section titles, card text. Referenced as `"'Typo Round Bold Demo', sans-serif"` or `"Typo Round Bold Demo"`.
- **Poppins** — body copy, captions, supporting text. Weights: 300, 400, 500, 600, 700.

Font families are always set via inline `style` props, not Tailwind utility classes.

## Color Palette (Hardcoded)

| Token | Hex | Usage |
|---|---|---|
| Navy Dark | `#031624` | Navbar, footer background |
| Navy Medium | `#1E3A4F` | Primary dark surface |
| Deep Navy | `#091825` / `#0C1E2C` | Section backgrounds |
| Cream | `#EEE9DA` | Light surface, cream cards |
| Orange | `#FF7F00` / `#FF8C00` | CTA, accent, highlights |
| White | `#ffffff` | Text on dark |

Colors are hardcoded hex values inline — no design token abstraction layer exists.

## Import Organization

Imports are not enforced by a linter rule into a strict order. Observed grouping pattern:
1. React/Next.js built-ins: `"react"`, `"next/link"`, `"next/image"`, `"next/navigation"`, `"next/font/google"`
2. Third-party libraries: `"framer-motion"`, `"next-themes"`, `"@heroicons/react"`, `"lucide-react"`, `"react-icons/fa"`
3. Local components via alias: `"@/app/components/OrderForm"`
4. Local CSS: `"@/style/AboutUs.css"`
5. Static assets (images): direct imports from `../../../public/images/...`

**No barrel files** (`index.ts`) are used — all imports reference the component file directly.

## Error Handling

**API Routes:** Try/catch with typed error cast and `NextResponse.json` error responses:
```ts
} catch (error: unknown) {
  const err = error as { message?: string };
  console.error('Stripe error:', err?.message || error);
  return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
}
```

**Client Components:** No structured error boundary pattern — errors surface to the default Next.js error UI.

## Logging

`console.log` and `console.error` are used directly. Several `console.log` calls are commented out (e.g., in `Navbar.tsx` and `OrderForm.tsx`). No structured logging library is used.

**Examples found:**
- `console.log("Opening order form...")`  — commented out in `Navbar.tsx`
- `console.log("OrderForm opened")` — active in `OrderForm.tsx`
- `console.error("Stripe error:", ...)` — active in `src/app/api/checkout/route.ts`
- Debug log with identifier: `console.log(isTextDark, "adil nawaz")` — active in `renderFaqCard.jsx`

## Comments

**Inline comments** are used to document animation timing sequences and layout decisions:
```tsx
// Sequential checklist
const PP1_D = 3.95; // Item 1
```

**Large commented-out code blocks** are common — old implementations left in place rather than deleted. Examples: multiple navigation and theme toggle approaches in `Navbar.tsx`, layout CSS in `globals.css`.

**JSDoc/TSDoc:** Not used.

## Prop Patterns

**Props are typed with `interface`** defined immediately above or near the component:
```tsx
interface OrderFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderForm({ isOpen, onClose }: OrderFormProps) { ... }
```

**Children prop:** `children: React.ReactNode` used in `layout.tsx` root layout.

**No default props** pattern — optional props are handled with conditional logic inside the component.

## Function Design

- Event handlers are defined as named `const` arrow functions inside the component body
- Long async handlers use `async/await` pattern
- Utility functions used only within one component are defined inside the component or as a helper in the same file
- No barrel re-exports or utility modules — each helper lives with its consumer

## ESLint Configuration

`eslint.config.mjs` extends only `next/core-web-vitals` and `next/typescript`. No additional custom rules or plugins are configured. Formatting (Prettier) is not configured.

---

*Convention analysis: 2026-04-02*
