# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript ~5.x - All core app code (`src/app/**/*.ts`, `src/app/**/*.tsx`)
- TSX (React JSX) - All component files

**Secondary:**
- JavaScript / JSX - A small number of files that were not migrated to TS:
  - `src/app/(main)/home/renderFaqCard.jsx`
  - `src/app/components/CurtleAboutUs.jsx`
  - `src/app/components/CustomSelect.jsx`
  - `src/app/components/TestmonialsDesktop.jsx`
  - `src/components/customHook/useResize.jsx`
- CSS - `src/style/AboutUs.css`, `src/app/globals.css`

## Runtime

**Environment:**
- Node.js (version not pinned — no `.nvmrc` or `.node-version` present)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js `^15.5.14` - Full-stack React framework; App Router; used with Turbopack in dev
  - Config: `next.config.ts`
  - Images: `unoptimized: true` — no built-in Next.js image optimization; wildcard remote patterns allowed
  - React Strict Mode: enabled

**UI / React:**
- React `^19.0.0` - Core UI library
- React DOM `^19.0.0`

**Styling:**
- Tailwind CSS `^4` - Utility-first CSS; config in `tailwind.config.js`
  - PostCSS plugin: `@tailwindcss/postcss` `^4`; config in `postcss.config.mjs`
  - Custom Tailwind `scroll` keyframe animation defined in `tailwind.config.js`
- Global CSS: `src/app/globals.css` — imports Tailwind layers + defines `@font-face` rules for Montserrat and Typo Round fonts served from `public/fonts/`

**Animation:**
- Framer Motion `^12.5.0` - Component animations, page transitions, gesture handling (`motion`, `AnimatePresence`, `useAnimation`)
  - Heavily used in: `src/app/components/HeroReveal.tsx`, `src/app/components/OrderForm.tsx`, `src/app/(main)/home/page.tsx`

**Theming:**
- next-themes `^0.4.6` - Dark/light mode; `ThemeProvider` wraps the app in `src/app/layout.tsx`
  - Default theme: `dark`; system preference disabled; two themes: `dark`, `light`

**Component Libraries:**
- MUI (Material UI) `@mui/material` `^7.2.0` - Used narrowly; `Box` and `Modal` imported in `src/app/components/Menu.tsx`
  - Peer dependencies: `@emotion/react` `^11.14.0`, `@emotion/styled` `^11.14.1`

**Testing:**
- Not configured — no test runner, no test files, no testing-related dependencies detected

**Build/Dev:**
- Turbopack - Dev server bundler (enabled via `next dev --turbopack` in `package.json`)
- Next.js build system - Production builds via `next build`

## Key Dependencies

**Critical:**
- `stripe` `^18.3.0` - Server-side Stripe SDK; used in `src/app/api/checkout/route.ts` to create Checkout Sessions
- `@stripe/stripe-js` `^7.4.0` - Client-side Stripe JS (imported in package.json; not yet wired into a component directly — server redirect pattern used instead)
- `framer-motion` `^12.5.0` - Core animation engine; pervasive across UI components
- `next-themes` `^0.4.6` - Theme switching infrastructure

**UI Utilities:**
- `lucide-react` `^0.525.0` - Icon set; `MessageCircle` icon used in `src/app/components/ChatButton.tsx`
- `react-icons` `^5.5.0` - Additional icon set; `FaInstagram`, `FaFacebook` used in `src/app/components/Footer.tsx`
- `@heroicons/react` `^2.2.0` - Listed in dependencies; no active usage found in source
- `lenis` `^1.1.14-dev.5` - Smooth scroll library (pre-release/dev version); listed in dependencies but no active usage found in source

**Form / Interaction:**
- `react-intersection-observer` `^9.16.0` - Intersection Observer hook; listed in dependencies
- `react-swipeable` `^7.0.2` - Swipe gesture hook; listed in dependencies
- `@typeform/embed` `^5.3.1` - Typeform embed SDK; listed in dependencies but no active usage found in source

**Static Export:**
- `serve` - Listed in scripts (`npm run serve` serves the `out` directory); likely installed globally or expected in the environment

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: `ES2017`; strict mode enabled; `noEmit: true` (type-check only — Next.js handles compilation)
- Module resolution: `bundler`
- Path alias: `@/*` → `./src/*`
- Notable: `tsconfig.json` `include` array manually lists specific files (`src/app/success/page.tsx`, `src/app/api/checkout/route.ts`, `src/app/(main)/home/renderFaqCard.jsx`) — this is non-standard and may cause files to be missed by the type checker unless the glob patterns also cover them

**ESLint:**
- Config: `eslint.config.mjs` (flat config format)
- Extends: `next/core-web-vitals`, `next/typescript`
- Run: `npm run lint`

**Build:**
- `next build` → `.next/` output
- `next export` script present (for static HTML export to `out/`)

**Environment:**
- No `.env` files committed; env vars referenced in code:
  - `NEXT_PUBLIC_BASE_URL` — used in `src/app/api/checkout/route.ts` for Stripe redirect URLs

## Platform Requirements

**Development:**
- Node.js (version unspecified)
- npm
- Run: `npm run dev` (Next.js dev server with Turbopack)

**Production:**
- Deployment target not explicitly configured (no Vercel config, no Dockerfile)
- `next start` command present — supports Node.js server deployment
- `next export` command present — supports static site export
- Currency in checkout: AED (UAE Dirhams); business context is Dubai, UAE

---

*Stack analysis: 2026-04-02*
