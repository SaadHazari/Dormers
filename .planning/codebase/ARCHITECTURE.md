# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Next.js 14+ App Router — marketing/e-commerce site for a student meal delivery service (Dubai). Single-purpose: showcase the offering, collect meal plan orders, and process Stripe payments.

**Key Characteristics:**
- App Router with route groups for layout sharing
- Nearly every component is a Client Component (`"use client"`) due to heavy Framer Motion animation and theme-aware rendering
- No server-side data fetching; all data is static/hardcoded in component files
- Single API route handles the full Stripe checkout session creation
- Theme system (dark/light) is deeply woven through all components via `next-themes`

## Layers

**Root Shell:**
- Purpose: HTML scaffold, global fonts, Google Ads script injection, `ThemeProvider`, and the always-visible `ChatButtonWrapper`
- Location: `src/app/layout.tsx`
- Contains: `RootLayout` — sets `Montserrat` via `next/font/google`, loads Google Tag Manager, wraps everything in `ThemeProvider` (default: dark)
- Depends on: `next-themes`, `next/script`, `next/font`
- Used by: Every route

**Main Route Group Layout (`(main)`):**
- Purpose: Shared chrome (Navbar + Footer + AboutUs) for the main site pages
- Location: `src/app/(main)/layout.tsx`
- Contains: `MainLayout` — a Client Component that manages scroll-aware navbar visibility, hero sequence event listeners, and conditional `AboutUs` rendering
- Depends on: `Navbar`, `Footer`, `AboutUs`, `next-themes`, `usePathname`
- Used by: `/home`, `/privacy`, `/terms`, `/vip-success`
- Note: Uses custom window events (`hero-ui-visible`, `hero-ui-hidden`) to coordinate Navbar visibility with the hero animation sequence

**Pages:**
- Purpose: Route-level entry points
- Location: See routing section below
- Contains: Thin wrappers that import feature components
- Depends on: Shared components in `src/app/components/`

**Components (shared):**
- Purpose: Reusable UI sections and interactive widgets
- Location: `src/app/components/`
- Contains: Section-level components (hero, menu, USP grid, testimonials, forms, navbar, footer)
- All are Client Components

**API Layer:**
- Purpose: Server-side Stripe session creation
- Location: `src/app/api/checkout/route.ts`
- Contains: Single `POST` handler — validates request body, creates a Stripe Checkout session, returns redirect URL
- Depends on: `stripe` npm package, `NEXT_PUBLIC_BASE_URL` env var

## Data Flow

**Order / Payment Flow:**

1. User opens `OrderForm` (modal triggered from `Navbar` "Join the club" button)
2. `OrderForm` collects: name, email, phone, location, meal type, duration, start date, dietary restrictions across 3 wizard steps
3. On submit, `OrderForm.handlePay()` POSTs to `/api/checkout` with all fields + calculated price in AED fils
4. `src/app/api/checkout/route.ts` creates a Stripe Checkout session with `success_url` pointing to `/success?<queryParams>` and `cancel_url` pointing to `/cancel`
5. Browser redirects to Stripe-hosted checkout page
6. On success, Stripe redirects to `/success` which reads order details from URL query params and presents a confirmation card with a WhatsApp deeplink to notify the team

**Welcome Splash → Main Site Flow:**

1. User lands on `/` (root `page.tsx`) — animated "MEALS THAT DON'T SUCK" welcome card
2. User swipes up or clicks — `exitGenie()` triggers Framer Motion collapse animation
3. `router.push("/home")` navigates to the main page
4. `not-found.tsx` stores the intended path in `sessionStorage("redirectPath")` and redirects to `/`; the splash page reads this on mount and redirects forward

**Hero Sequence → UI Reveal:**

1. `HeroReveal` component renders with a ~12-second choreographed animation
2. At `(DORM_D + 0.5) * 1000` ms (≈ 12.35 s), it fires `window.dispatchEvent(new CustomEvent("hero-ui-visible"))`
3. `MainLayout` and `ChatButtonWrapper` both listen for this event to show the Navbar and chat button respectively
4. On unmount, `HeroReveal` fires `hero-ui-hidden`

**State Management:**

- No global state management library (no Redux, Zustand, Context beyond `next-themes`)
- Component-local `useState` for all interactive state (form steps, modal open/close, flip state, theme)
- `sessionStorage` used for one cross-page redirect (not-found → splash → intended route)
- URL query params used to pass order details from Stripe success redirect to `/success` page
- Window custom events used for cross-component coordination (hero timing)

## Key Abstractions

**Route Group `(main)`:**
- Purpose: Groups pages that share Navbar/Footer chrome without affecting the URL path
- Examples: `src/app/(main)/home/page.tsx`, `src/app/(main)/privacy/page.tsx`, `src/app/(main)/terms/page.tsx`, `src/app/(main)/vip-success/page.tsx`
- Pattern: All pages inside inherit `src/app/(main)/layout.tsx`

**Section Components:**
- Purpose: Full-page sections assembled on `/home` — each is a large, self-contained Client Component
- Examples: `src/app/components/HeroReveal.tsx`, `src/app/components/USPBento.tsx`, `src/app/components/Menu.tsx`, `src/app/components/TestimonialsBubbles.tsx`
- Pattern: Each embeds its own scoped CSS string via `<style>{CSS}</style>` — no CSS modules

**Modal Form Pattern:**
- Purpose: Overlays that collect user input without navigating away
- Examples: `src/app/components/OrderForm.tsx` (3-step Stripe wizard), `src/app/components/FormModal.tsx`
- Pattern: `isOpen: boolean` + `onClose: () => void` props; `AnimatePresence` wraps the overlay

**`SuccessContent` / `Suspense` split:**
- Purpose: `/success/page.tsx` wraps `SuccessContent` in `<Suspense>` to allow `useSearchParams()` in the client component without blocking the server render
- Examples: `src/app/success/page.tsx`, `src/app/success/SuccessContent.tsx`

## Entry Points

**Root Splash (`/`):**
- Location: `src/app/page.tsx`
- Triggers: Direct navigation to site root
- Responsibilities: Animated welcome card, genie-dismiss animation, redirect to `/home`

**Home Page (`/home`):**
- Location: `src/app/(main)/home/page.tsx`
- Triggers: Navigated to from splash page
- Responsibilities: Renders the same animated welcome card (the `/home` route has its own copy of the welcome card; the actual content sections like `HeroReveal` are imported from `src/app/components/`)

**Checkout API (`POST /api/checkout`):**
- Location: `src/app/api/checkout/route.ts`
- Triggers: `fetch("/api/checkout", { method: "POST" })` from `OrderForm`
- Responsibilities: Validates amount, creates Stripe session, returns `{ url }`

## Error Handling

**Strategy:** Minimal — mostly `try/catch` in the API route and `alert()` in the client for payment errors.

**Patterns:**
- `src/app/api/checkout/route.ts`: `try/catch` around Stripe SDK call; returns JSON error with HTTP 400/500
- `src/app/components/OrderForm.tsx`: `catch` block on `fetch` call calls `alert("Something went wrong.")`
- `src/app/not-found.tsx`: Custom 404 handler redirects to `/` via `sessionStorage` rather than showing an error page

## Cross-Cutting Concerns

**Theming:**
- `next-themes` `ThemeProvider` at root; default `dark`, supports `light`
- `theme === "light"` conditional classes applied inline throughout every component
- Background palette: dark navy `#1E3A4F` / `#031624`; light cream `#EEE9DA`; accent orange `#FF7F00` / `#FF6B00`

**Animation:**
- Framer Motion used throughout for page transitions, section reveals, form transitions, and the hero sequence
- `useInView` from `react-intersection-observer` used in `USPBento` for scroll-triggered animation

**Fonts:**
- Montserrat: loaded via `next/font/google` (weight 900) at root, and via local `.ttf` files in `public/fonts/` for weights 400/500/700
- Typo Round (custom display font): local `.otf` files in `public/fonts/`, referenced via CSS `@font-face` in `globals.css`
- CDN fallback for Typo Round also loaded via `<link>` in root layout `<head>`

**Analytics:**
- Google Ads tag (`AW-17901506705`) injected via `next/script` with `strategy="afterInteractive"` in root layout

**WhatsApp Integration:**
- After successful payment: `SuccessContent` generates a pre-filled WhatsApp deeplink to `+971585556707`
- This is the team notification mechanism (no webhook or backend notification system)

---

*Architecture analysis: 2026-04-02*
