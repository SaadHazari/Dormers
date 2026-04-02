# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
Dormers-Production/
├── src/
│   ├── app/
│   │   ├── (main)/                  # Route group — shared Navbar/Footer layout
│   │   │   ├── layout.tsx           # MainLayout: Navbar + Footer + AboutUs chrome
│   │   │   ├── home/
│   │   │   │   ├── page.tsx         # /home — animated welcome card (desktop variant)
│   │   │   │   ├── ChatWindow.tsx   # Inline chatbot UI (co-located, not shared)
│   │   │   │   ├── QualifyForm.tsx  # Lead-capture modal (co-located, unused in prod)
│   │   │   │   └── renderFaqCard.jsx # FAQ card render helper (.jsx)
│   │   │   ├── privacy/
│   │   │   │   └── page.tsx         # /privacy — Privacy Policy page
│   │   │   ├── terms/
│   │   │   │   └── page.tsx         # /terms — Terms & Conditions page
│   │   │   └── vip-success/
│   │   │       └── page.tsx         # /vip-success — VIP waitlist confirmation
│   │   ├── api/
│   │   │   └── checkout/
│   │   │       └── route.ts         # POST /api/checkout — Stripe session creation
│   │   ├── cancel/
│   │   │   └── page.tsx             # /cancel — Stripe payment cancelled screen
│   │   ├── components/              # Shared section/feature components
│   │   │   ├── AboutUs.tsx          # About section (rendered in MainLayout footer area)
│   │   │   ├── ChatButton.tsx       # Floating WhatsApp-style chat trigger button
│   │   │   ├── ChatButtonWrapper.tsx # Hides ChatButton on splash/before hero ready
│   │   │   ├── CurtleAboutUs.jsx    # Alternative About variant (.jsx)
│   │   │   ├── CustomSelect.jsx     # Styled select dropdown component (.jsx)
│   │   │   ├── Footer.tsx           # Site footer (mobile + desktop layouts)
│   │   │   ├── FormModal.tsx        # Generic modal wrapper
│   │   │   ├── HeroReveal.tsx       # Animated hero section for /home
│   │   │   ├── HowItWorks.tsx       # How It Works section
│   │   │   ├── Menu.tsx             # Weekly menu browser with MUI Modal
│   │   │   ├── Navbar.tsx           # Fixed top navigation bar
│   │   │   ├── OrderForm.tsx        # 3-step Stripe checkout wizard modal
│   │   │   ├── TestimonialsBubbles.tsx  # Testimonials section
│   │   │   ├── TestmonialsDesktop.jsx   # Desktop testimonials variant (.jsx)
│   │   │   └── USPBento.tsx         # 14-card bento grid of USP features
│   │   ├── payment/
│   │   │   └── page.tsx             # /payment — legacy test page (INR amounts, unused)
│   │   ├── success/
│   │   │   ├── page.tsx             # /success — Stripe success landing (Suspense wrapper)
│   │   │   └── SuccessContent.tsx   # Client component reading URL params post-payment
│   │   ├── globals.css              # Tailwind directives + @font-face declarations
│   │   ├── layout.tsx               # RootLayout: html/body, ThemeProvider, Google Ads
│   │   ├── not-found.tsx            # Custom 404: stores path in sessionStorage, redirects to /
│   │   ├── page.tsx                 # / (root) — animated splash/welcome card
│   │   ├── icon.png                 # Favicon
│   │   └── Main_Logo_1.png          # Logo asset (co-located in app/, not public/)
│   ├── components/                  # Global utility components (separate from app/components/)
│   │   ├── MatrixText.tsx           # Canvas-based matrix rain text effect
│   │   └── customHook/
│   │       └── useResize.jsx        # useResize() hook — tracks window.innerWidth
│   └── style/
│       └── AboutUs.css              # Scoped CSS for AboutUs component
├── public/
│   ├── fonts/                       # Local font files (Montserrat .ttf, Typo Round .otf)
│   ├── images/
│   │   ├── Week1/ → Week4/          # Weekly menu food photography
│   │   │   ├── Veg/                 # Vegetarian dish images
│   │   │   └── NonVeg/              # Non-vegetarian dish images
│   │   └── [various SVGs/PNGs]      # Icons: whatsappicon.svg, main_page_icon.svg, etc.
│   └── testimonials/                # Customer testimonial photos
├── next.config.ts                   # Next.js config: reactStrictMode, unoptimized images
├── tailwind.config.js               # Tailwind config
├── tsconfig.json                    # TypeScript config (paths alias: @/* → src/*)
├── postcss.config.mjs
├── eslint.config.mjs
├── .eslintrc.js
├── package.json
└── old-code-reference.tsx           # Archive file — DO NOT import from this
```

## Directory Purposes

**`src/app/(main)/`:**
- Purpose: Pages that use the shared site chrome (Navbar, Footer, AboutUs)
- Contains: Route group with its own `layout.tsx`; `home`, `privacy`, `terms`, `vip-success` routes
- Key files: `src/app/(main)/layout.tsx` (MainLayout)
- Note: The `(main)` group name does not appear in the URL

**`src/app/components/`:**
- Purpose: Shared section and feature components consumed by pages inside `(main)`
- Contains: All major page sections (hero, menu, USPs, testimonials, forms) and layout chrome (Navbar, Footer)
- All are Client Components (`"use client"`)

**`src/components/`:**
- Purpose: Utility/display components not tied to a specific page section
- Contains: `MatrixText.tsx` (canvas animation), `useResize.jsx` custom hook
- Note: Different from `src/app/components/` — this is a lighter utility layer

**`src/app/api/`:**
- Purpose: Next.js Route Handlers (API endpoints)
- Contains: `checkout/route.ts` — the only API endpoint; handles Stripe session creation
- Follows Next.js App Router `route.ts` convention

**`src/app/success/` and `src/app/cancel/`:**
- Purpose: Stripe post-payment redirect destinations
- These routes are outside the `(main)` group — they render WITHOUT Navbar/Footer
- `success/` uses a `Suspense`/client-component split to safely use `useSearchParams()`

**`src/style/`:**
- Purpose: Traditional CSS files for components that use `import "@/style/X.css"` instead of inline styles or Tailwind
- Contains: `AboutUs.css` only

**`public/fonts/`:**
- Purpose: Self-hosted font files referenced in `globals.css` `@font-face` rules
- Contains: Montserrat (400/500/700 weights), Typo Round (Regular/Bold/Thin/Italic variants)

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Root splash page (`/`) — first thing users see
- `src/app/(main)/home/page.tsx`: Main home page (`/home`)
- `src/app/layout.tsx`: HTML root with providers and analytics

**Configuration:**
- `next.config.ts`: Next.js config (image optimization disabled, wildcard remote patterns)
- `tailwind.config.js`: Tailwind configuration
- `tsconfig.json`: TypeScript paths — `@/*` maps to `src/*`
- `src/app/globals.css`: Tailwind base + all `@font-face` declarations

**Core Business Logic:**
- `src/app/api/checkout/route.ts`: Only server-side code — Stripe payment session
- `src/app/components/OrderForm.tsx`: Multi-step order form with pricing logic and checkout trigger
- `src/app/success/SuccessContent.tsx`: Post-payment confirmation with WhatsApp handoff

**Layout/Chrome:**
- `src/app/(main)/layout.tsx`: Shared Navbar + Footer wrapper
- `src/app/components/Navbar.tsx`: Fixed navigation bar
- `src/app/components/Footer.tsx`: Site footer (separate mobile/desktop renders)
- `src/app/components/ChatButtonWrapper.tsx`: Conditional floating chat button

**Animation-Heavy Components:**
- `src/app/components/HeroReveal.tsx`: ~12-second orchestrated hero sequence; fires `hero-ui-visible` event
- `src/app/components/USPBento.tsx`: 14-card bento grid with CSS 3D flip on hover/tap
- `src/app/page.tsx`: Genie-dismiss animation (Framer Motion) on splash screen

## Naming Conventions

**Files:**
- PascalCase for all React components: `HeroReveal.tsx`, `OrderForm.tsx`, `USPBento.tsx`
- camelCase for hooks: `useResize.jsx`
- lowercase with hyphens for route directories: `vip-success/`, `not-found.tsx`
- Route Handlers follow Next.js convention: `route.ts`

**Directories:**
- Route groups in parentheses: `(main)/`
- Feature directories lowercase: `home/`, `checkout/`, `customHook/`
- Component directories PascalCase is NOT used — all lowercase: `components/`

**File Extensions:**
- `.tsx` for typed React components (majority)
- `.jsx` for a subset of older/utility components: `renderFaqCard.jsx`, `CurtleAboutUs.jsx`, `CustomSelect.jsx`, `TestmonialsDesktop.jsx`, `useResize.jsx`
- `.ts` for non-JSX TypeScript: `route.ts`, `next.config.ts`

## Where to Add New Code

**New page under main site chrome (Navbar/Footer):**
- Create directory: `src/app/(main)/[route-name]/`
- Add file: `src/app/(main)/[route-name]/page.tsx`
- The page automatically inherits `MainLayout`

**New standalone page (no Navbar/Footer, e.g. payment flows):**
- Create directory: `src/app/[route-name]/`
- Add file: `src/app/[route-name]/page.tsx`
- Place outside the `(main)` group

**New shared section component:**
- Add to: `src/app/components/[ComponentName].tsx`
- Mark `"use client"` at top (all current components require it)
- Import in the relevant page

**New utility component (no page dependency):**
- Add to: `src/components/[ComponentName].tsx`

**New custom hook:**
- Add to: `src/components/customHook/use[Name].tsx`

**New API endpoint:**
- Add to: `src/app/api/[endpoint-name]/route.ts`
- Export named functions matching HTTP methods: `export async function POST(req: Request)`

**New page-specific component (not shared):**
- Co-locate with its page: `src/app/(main)/[route]/[ComponentName].tsx`
- Example pattern: `src/app/(main)/home/ChatWindow.tsx`

**New styles:**
- Prefer Tailwind utility classes or inline `style={}` props (existing pattern)
- If CSS file is needed: add to `src/style/[ComponentName].css` and import with `import "@/style/[ComponentName].css"`
- Scoped CSS strings inside components: `const CSS = \`...\`` injected via `<style>{CSS}</style>`

## Special Directories

**`.next/`:**
- Purpose: Build output and cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning documents (this directory)
- Generated: By planning tooling
- Committed: Yes

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

**`public/images/Week1/` through `public/images/Week4/`:**
- Purpose: Menu food photography organized by week and diet type
- Generated: No (manually maintained)
- Committed: Yes
- Note: Images are imported directly into `Menu.tsx` as static imports (not via `src` strings), which means adding new weeks requires updating the component

---

*Structure analysis: 2026-04-02*
