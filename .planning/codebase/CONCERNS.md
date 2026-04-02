# Codebase Concerns

**Analysis Date:** 2026-04-02

---

## CRITICAL: Hardcoded Live Stripe Secret Key

**Exposed Stripe Secret Key:**
- Issue: A live Stripe secret key (`sk_live_51NfgKW...`) is hardcoded directly in source code. It is NOT read from an environment variable — the `if (!stripeSecretKey)` guard directly below it will never trigger because the variable is always truthy.
- Files: `src/app/api/checkout/route.ts` line 5
- Impact: **CRITICAL security incident.** Anyone with read access to this repository (including any collaborators, fork holders, or CI log viewers) has full Stripe API access. This key can be used to create charges, issue refunds, create products, read all customer data, and more.
- Fix approach: Immediately rotate this key in the Stripe dashboard. Then replace the hardcoded string with `process.env.STRIPE_SECRET_KEY` and add `STRIPE_SECRET_KEY` to `.env.local` (which is already gitignored).

---

## Security Considerations

**PII Exposed in Success Page URL Query Params:**
- Risk: After Stripe payment, the API route at `src/app/api/checkout/route.ts` passes customer name, email, phone, location, meal type, duration, dietary restrictions, and start date as plaintext URL query parameters on the `success_url`. These are fully visible in browser history, server logs, and any analytics tools.
- Files: `src/app/api/checkout/route.ts` lines 45–54, `src/app/success/SuccessContent.tsx`
- Current mitigation: None.
- Recommendations: Pass only a session ID on the success URL and retrieve order metadata server-side via the Stripe session, or use a short-lived server-side token.

**WhatsApp Phone Number Hardcoded:**
- Risk: Business WhatsApp number (`+971585556707`) is hardcoded in two places: `src/app/success/SuccessContent.tsx` line 21 and `src/app/(main)/home/ChatWindow.tsx`.
- Impact: Requires code changes to update contact number; inconsistency risk.
- Fix approach: Extract to a constant or environment variable.

**Wildcard Remote Image Pattern:**
- Risk: `next.config.ts` allows image optimisation for `https://**` — any external hostname. This is an overly permissive allowlist that defeats Next.js's image domain security controls.
- Files: `next.config.ts` lines 7–10
- Fix approach: Restrict `remotePatterns` to the actual hostnames in use (Stripe CDN, etc.).

**Image Optimization Disabled Globally:**
- Risk: `images: { unoptimized: true }` in `next.config.ts` disables Next.js's built-in image optimization for the entire site, meaning no WebP conversion, no responsive sizes, and no CDN caching.
- Files: `next.config.ts` line 6
- Fix approach: Remove `unoptimized: true`. The comment says "optional" — it can be safely removed in most cases.

---

## Tech Debt

**`old-code-reference.tsx` in Project Root:**
- Issue: A 687-line file at the project root (`/old-code-reference.tsx`) contains a complete, fully-functional `HeroReveal` component (a theme-aware, Typewriter-animated hero with stats, CTAs, and animated blobs). It is not imported or used anywhere. It is a previous iteration of `src/app/components/HeroReveal.tsx`, retained as a reference during the rewrite. It has no practical purpose now and pollutes the project root.
- Impact: Confuses any developer reading the codebase. The root is not a normal place for React component files; tools and editors may index it unexpectedly.
- Fix approach: Delete `old-code-reference.tsx` immediately. The current `HeroReveal.tsx` supersedes it entirely.

**Commented-Out Navigation Code:**
- Issue: Large blocks of navigation code are commented out in `src/app/components/Navbar.tsx` (lines 107–253) including: the full desktop nav link list, the old theme toggle, the old CTA button, and the old mobile menu. These represent abandoned UI patterns.
- Impact: The file is 300 lines but only ~100 lines are active. Confusing for contributors.
- Fix approach: Delete commented-out code. Navigation history belongs in git, not in source.

**Commented-Out WhatsApp Submit Handler:**
- Issue: The original form submission handler in `src/app/components/OrderForm.tsx` (lines 100–119) — which sent data to WhatsApp — is fully commented out. The replacement Stripe payment path is active, but the old WhatsApp path remains as dead code.
- Impact: Unclear which was the intended flow; leftover `handleChange` comment (line 65–72) also preserved.
- Fix approach: Delete commented-out `handleSubmit` block.

**Deprecated `next export` Script:**
- Issue: `package.json` includes `"export": "next export"` as a script. `next export` was removed in Next.js 14+. This project uses Next.js 15. Running this command will throw an error.
- Files: `package.json` line 11
- Fix approach: Remove the `export` script. Static export is now configured via `output: 'export'` in `next.config.ts` if needed.

**Pre-release Lenis Version:**
- Issue: `lenis` is pinned to `^1.1.14-dev.5` — a development pre-release. Pre-release packages can have breaking changes without semver guarantees.
- Files: `package.json` line 22
- Impact: Lenis is not imported anywhere in the source (`grep` found zero usages), making it an unused pre-release dependency.
- Fix approach: Remove Lenis from `package.json` entirely since it is unused.

**`@typeform/embed` Installed But Never Used:**
- Issue: `@typeform/embed` is in `dependencies` but there are zero imports of it anywhere in `src/`.
- Files: `package.json` line 19
- Fix approach: Remove the dependency.

**Duplicate Image Assets:**
- Issue: The same dish images exist in both `public/images/Week1/Nonveg/` and `public/images/Week1/nonveg1/`. For example, `ChickenAfghani.jpg/png`, `DormersChicken.jpg/png`, `PeriPeri.jpg/png`, `MeatballsMashe.jpg/png`, `ChickenFried.jpg/png`, `ChickenBiryani.jpg/png` are duplicated across both folders. `Menu.tsx` imports from `nonveg1/`, but `Nonveg/` also has both JPEG and PNG versions of each image.
- Files: `public/images/Week1/Nonveg/`, `public/images/Week1/nonveg1/`
- Impact: Doubles storage for the same images; ambiguity about which set is canonical.
- Fix approach: Delete `public/images/Week1/Nonveg/` (uppercase), standardise on `nonveg1/`, then consolidate to a single format (JPEG) per image.

**`/payment` Page Is a Development Artefact:**
- Issue: `src/app/payment/page.tsx` is a raw test/prototype page that shows prices in Indian Rupees (₹199, ₹499, ₹999), uses minimal styling (`p-10`), and is completely disconnected from the real pricing or UI. It is accessible at the `/payment` route in production.
- Files: `src/app/payment/page.tsx`
- Fix approach: Delete this file or protect it behind an auth guard if it serves any internal purpose.

**`/app/page.tsx` Duplicates `/app/(main)/home/page.tsx`:**
- Issue: `src/app/page.tsx` and `src/app/(main)/home/page.tsx` contain near-identical welcome splash card components with nearly identical logic, animation variants, and JSX. The welcome card at `src/app/page.tsx` is the updated version with the refined "genie" exit animation; `src/app/(main)/home/page.tsx` has a slightly older version with a different genie implementation. Both are actively rendered (routes `/` and `/home` respectively).
- Files: `src/app/page.tsx`, `src/app/(main)/home/page.tsx`
- Impact: Any UI change to the splash card must be applied twice; they will drift out of sync.
- Fix approach: Extract the welcome card into a single shared component in `src/app/components/`.

**Dead CSS in `globals.css`:**
- Issue: `src/app/globals.css` contains a commented-out `.main_content` rule block (line 178+) and defines CSS custom properties (`--font-sans`, `--font-mono`) that reference `var(--font-geist-sans)` and `var(--font-geist-mono)` — neither of which is loaded anywhere (Geist fonts are not installed). The body `font-family` is set to `Arial, Helvetica, sans-serif` in globals but overridden by the Montserrat Google font class on `<body>`.
- Files: `src/app/globals.css`
- Fix approach: Remove the dead comment block and the Geist font variable references.

**Duplicate Font Loading:**
- Issue: Montserrat is loaded three ways simultaneously: (1) via `@font-face` in `src/app/globals.css` using local `.ttf` files in `public/fonts/`, (2) via `next/font/google` (Montserrat Black/900 weight only) in `src/app/layout.tsx`, and (3) via `cdnfonts.com` for Typo Round in `<head>` of `layout.tsx`. The Poppins font is loaded via `@font-face` in globals but never loaded via `next/font`. All font weights for Poppins and Montserrat are loaded as TTF files — not WOFF2 — except the Montserrat-Black pair which has both TTF and WOFF2.
- Files: `src/app/globals.css`, `src/app/layout.tsx`
- Impact: Multiple HTTP requests for font files; TTF downloads are ~2–3× larger than WOFF2.
- Fix approach: Pick one source — either `next/font/google` (preferred for Next.js, automatic WOFF2) or self-hosted WOFF2 — not both. Convert all TTF files in `public/fonts/` to WOFF2 or remove them in favour of Google Fonts.

**Eslint-disable Suppression:**
- Issue: `src/app/components/HeroReveal.tsx` line 360 suppresses the `react-hooks/exhaustive-deps` rule with `// eslint-disable-line react-hooks/exhaustive-deps`. The suppressed `useEffect` starts the typewriter animation with an empty dependency array `[]` and uses `CLOSE_D` from module scope, which is acceptable, but it masks the lint warning rather than handling it properly.
- Fix approach: Either add a comment explaining why the empty deps are intentional, or restructure the effect to avoid the warning.

---

## Code Quality Concerns

**`Menu.tsx` Is Massively Over-Large (1,662 lines):**
- Issue: `src/app/components/Menu.tsx` contains: all static menu data (12+ dishes, hardcoded), the week/day selection UI, the dish card component, a flip-card animation, a MUI Modal for nutritional info, and image imports — all in a single file.
- Impact: Extremely hard to maintain or modify. Adding a new week's menu requires editing this 1,662-line file. Nutritional data is duplicated with identical calorie/macro values across several dishes (all Week 1 non-veg items show `727.5 kcal / 54.6g protein / 84g carbs / 16.3g fat` — either a copy-paste error or intentionally identical).
- Fix approach: Extract menu data to `src/data/menuData.ts`. Extract the `DishCard` component. Extract the `NutrientModal` component.

**`HeroReveal.tsx` Contains Inline `<style>` Block:**
- Issue: `src/app/components/HeroReveal.tsx` injects a large block of CSS via a `<style>` tag rendered inside the component JSX (the `CSS` template literal, lines 49–282). This bypasses Next.js's CSS handling and is not purged by Tailwind.
- Files: `src/app/components/HeroReveal.tsx` lines 49–282
- Impact: The CSS is injected at runtime on every render, is not deduplicated, and cannot be statically extracted. Maintenance is harder as styles live inside a JS file.
- Fix approach: Move these styles to a CSS module (`HeroReveal.module.css`) or to `globals.css`.

**`QualifyForm.tsx` Is a Non-Functional Stub:**
- Issue: `src/app/(main)/home/QualifyForm.tsx` is an incomplete form component. The `handleSubmit` function only logs `formData` to the console (`console.log(formData)`) and does nothing else. There is no API call, no validation feedback, and no success state. The component exists in the file tree but is unclear whether it is wired to any UI.
- Files: `src/app/(main)/home/QualifyForm.tsx`
- Fix approach: Either complete the implementation or delete the file.

**`renderFaqCard.jsx` Has a Debug `console.log` with Developer Name:**
- Issue: `src/app/(main)/home/renderFaqCard.jsx` line 14 has `console.log(isTextDark , "adil nawaz")` — a personal debug statement left in production code. This executes on every FAQ card render.
- Files: `src/app/(main)/home/renderFaqCard.jsx` line 14
- Fix approach: Delete the `console.log` line.

**`renderFaqCard` Is a Render Function, Not a Component:**
- Issue: `src/app/(main)/home/renderFaqCard.jsx` exports a plain function (`renderFaqCard`) that returns JSX, rather than a proper React component. Render functions (functions that return JSX called inline) bypass React's reconciliation and can cause performance issues. The function accepts `theme` as a plain argument instead of using `useTheme()` internally.
- Fix approach: Convert to a proper `FaqCard` component using `export default function FaqCard(...)`.

**Debug `console.log` Statements in Production:**
- Issue: Multiple `console.log` calls remain in production code:
  - `src/app/components/OrderForm.tsx` lines 51, 55: "OrderForm opened/closed" logged on every modal open/close.
  - `src/app/components/Navbar.tsx` line 28: "Closing order form..." logged on close.
  - `src/app/(main)/home/QualifyForm.tsx` line 23: logs entire form data on submit.
  - `src/app/(main)/home/renderFaqCard.jsx` line 14: logs on every FAQ card render.
- Fix approach: Remove all `console.log` calls. `console.error` in `src/app/api/checkout/route.ts` is acceptable for server-side error logging.

**`CustomSelect.jsx` and `TestmonialsDesktop.jsx` Are Plain JSX (Not TypeScript):**
- Issue: Several components use `.jsx` extension without TypeScript: `src/app/components/CustomSelect.jsx`, `src/app/components/TestmonialsDesktop.jsx`, `src/app/components/CurtleAboutUs.jsx`, `src/app/(main)/home/renderFaqCard.jsx`, `src/components/customHook/useResize.jsx`. The project is otherwise TypeScript.
- Impact: No type checking for props or returns in these files. Mismatched prop types will not surface as compile errors.
- Fix approach: Rename to `.tsx`/`.ts` and add appropriate TypeScript types.

**`Navbar.tsx` Has an Unused State Variable:**
- Issue: `src/app/components/Navbar.tsx` line 11: `const [, setMounted] = useState(false)` — the state value is completely unused (destructured away). `setMounted(true)` is called in a `useEffect`, but `mounted` is never read.
- Fix approach: Remove the state entirely.

**`Navbar.tsx` Renders `<OrderForm>` That Is Never Opened:**
- Issue: `handleOrderFormOpen` in `src/app/components/Navbar.tsx` always calls `window.open("https://vip.dormers.ae/", "_blank")` and never sets `isOrderFormOpen` to `true`. The `<OrderForm isOpen={isOrderFormOpen}>` rendered at line 297 will therefore always receive `isOpen={false}` and never show.
- Files: `src/app/components/Navbar.tsx` lines 21–24, 297
- Impact: The `OrderForm` component and its 680 lines of code are mounted in the DOM but unreachable from the navbar. Dead UI.
- Fix approach: Either remove `<OrderForm>` from the navbar entirely, or restore the original `setIsOrderFormOpen(true)` call.

---

## Performance Concerns

**Unoptimized Full-Viewport Animations on Load:**
- Issue: `src/app/components/HeroReveal.tsx` triggers 10+ sequential Framer Motion animations for 11+ seconds (the final proof bar items animate at 11.85 s). All animations run immediately on mount with no lazy loading or reduced-motion handling.
- Files: `src/app/components/HeroReveal.tsx` lines 20–43
- Impact: On low-powered mobile devices, the ~12-second animation sequence may stutter. No `prefers-reduced-motion` media query check exists anywhere in the codebase.
- Fix approach: Add a `useReducedMotion()` check from Framer Motion and skip or shortcut the animation sequence if the user has reduced motion enabled.

**Infinite Framer Motion Animations on Welcome Page:**
- Issue: `src/app/page.tsx` has three simultaneous infinite animations: a pulsing bottom pill, a card bob (repeats every 3 s), and the entry animation. These run until the user dismisses the splash.
- Fix approach: Acceptable as-is given the short lifespan of the page, but should respect `prefers-reduced-motion`.

**`<style>` Tag Re-injected on Every Render (HeroReveal):**
- Issue: `src/app/components/HeroReveal.tsx` returns `<style>{CSS}</style>` inside the component. On every re-render (which can happen due to the typewriter state updates every 42 ms), the full CSS block is diffed and potentially re-applied.
- Files: `src/app/components/HeroReveal.tsx` line 364
- Fix approach: Move to a CSS module or `globals.css`.

**Duplicate .jpg/.png Image Files:**
- Issue: All non-veg Week 1 images exist as both `.jpg` and `.png` in `public/images/Week1/nonveg1/` (e.g., `ChickenBiryani.jpg` and `ChickenBiryani.png`). PNG files are typically 3–5× larger than equivalent JPEGs. Only the `.png` versions are imported in `Menu.tsx`.
- Impact: The `.jpg` duplicates occupy disk space but are never served. More importantly, the `.png` files being used are significantly heavier than they need to be.
- Fix approach: Delete the unused `.jpg` duplicates. Convert the `.png` images to WebP or JPEG and update imports.

**Multiple Unrelated Icon Libraries:**
- Issue: Three separate icon libraries are installed: `@heroicons/react` (used in Navbar for Sun/Moon icons), `lucide-react` (used in USPBento, ChatButton, and VipSuccess), and `react-icons` (used in Footer for FaInstagram, FaFacebook). Three icon libraries is unnecessary bundle weight.
- Files: `package.json` lines 16, 21, 29
- Fix approach: Consolidate to one library — lucide-react is already the most widely used in this codebase.

**External CDN Font Load for Typo Round:**
- Issue: `src/app/layout.tsx` loads Typo Round from `https://fonts.cdnfonts.com/css/typo-round` via a `<link>` in `<head>`. This is an external CDN with no SLA, potential downtime, and GDPR data-transfer concerns. The same font is also self-hosted in `public/fonts/` via `@font-face` rules in `globals.css`.
- Fix approach: Remove the CDNFonts link. The self-hosted `@font-face` rules in `globals.css` already cover Typo Round.

---

## Missing Features / Implied Gaps

**No Form Validation Feedback UI:**
- Issue: `src/app/components/OrderForm.tsx` validates each step client-side but shows no visual error messages. When a field is invalid, the "Next" button is simply unresponsive. Users have no indication of what is wrong.
- Fix approach: Display inline validation errors below each field.

**Chat Widget Opens WhatsApp, Not an In-App Chat:**
- Issue: `src/app/(main)/home/ChatWindow.tsx` collects name, email, and phone via a simulated chatbot flow, then redirects the user to WhatsApp. The component has emoji picker state and message list state that simulate a chat, but it is not a real chat — it's a lead-capture form dressed as a chat interface.
- Files: `src/app/(main)/home/ChatWindow.tsx`
- Impact: The component maintains unnecessary local state for a multi-step flow that ends with a `window.location.href` redirect. Any data entered is lost if the user navigates away.
- Note: This is a design/product decision, but developers should understand the component does not implement real-time messaging.

**No Webhook Handler for Stripe Payment Confirmation:**
- Issue: The checkout flow creates a Stripe session, redirects to Stripe, then on success redirects back to `/success`. The success page reads user data from URL params and links to WhatsApp. There is no server-side Stripe webhook handler (`/api/webhook`) to confirm payment, record it, or trigger fulfilment. Without a webhook, payments that succeed server-side but fail to redirect (network drop, browser close) are silently lost.
- Fix approach: Add a `POST /api/webhook` handler that verifies the `stripe-signature` header and processes `checkout.session.completed` events.

**Menu Data Is Hardcoded (Not CMS-Driven):**
- Issue: All menu items — dish names, descriptions, images, nutrients, day assignments — are hardcoded as a static array in `src/app/components/Menu.tsx`. The comment `// This would typically come from an API or database` (line 38) acknowledges this.
- Impact: Updating the menu for a new week requires a code deployment.
- Fix approach: Move menu data to a CMS (Sanity, Contentful) or at minimum to a JSON file at `src/data/menuData.json` that can be updated without touching component code.

**`src/components/MatrixText.tsx` and `src/components/customHook/useResize.jsx` Are Orphaned:**
- Issue: Both `src/components/MatrixText.tsx` and `src/components/customHook/useResize.jsx` exist in a `src/components/` directory (distinct from `src/app/components/`) but are not imported anywhere in the codebase. They appear to be early prototypes never wired up.
- Fix approach: Delete both files unless there is a concrete plan to use them.

---

## Test Coverage Gaps

**No Tests Exist:**
- What's not tested: The entire codebase. There are no test files (`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`), no test configuration (`jest.config.*`, `vitest.config.*`), and no testing framework in `package.json`.
- Files: All of `src/`
- Risk: Any regression — broken payment flow, navigation bugs, form submission errors — will only be caught in production.
- Priority: High — the Stripe checkout path especially should have integration coverage.

---

*Concerns audit: 2026-04-02*
