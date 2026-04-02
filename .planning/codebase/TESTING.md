# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:** None configured.

No test runner (Jest, Vitest, Playwright, Cypress, or any other) is installed or configured in this project.

**Assertion Library:** None.

**Test Configuration Files:** None detected. No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*` exist in the project root.

**Run Commands:**

No test scripts are defined in `package.json`. The scripts section contains only:

```bash
npm run dev      # next dev --turbopack
npm run build    # next build
npm run start    # next start
npm run lint     # next lint
npm run serve    # serve out
npm run export   # next export
```

There is no `test`, `test:watch`, or `test:coverage` script.

## Test File Organization

**No test files exist.** A recursive search across the entire `src/` directory finds zero files matching `*.test.*`, `*.spec.*`, or `__tests__` directories.

## Test Types

| Type | Status |
|---|---|
| Unit tests | Not present |
| Integration tests | Not present |
| End-to-end tests | Not present |
| Snapshot tests | Not present |
| Component tests | Not present |

## Coverage

**Requirements:** None enforced. No coverage tooling is installed.

## Linting as a Quality Gate

The only automated quality check that exists is ESLint, run via:

```bash
npm run lint
```

This uses the Next.js default ESLint preset (`next/core-web-vitals` + `next/typescript`) configured in `eslint.config.mjs`. TypeScript compilation errors surface via `next build` since `noEmit: true` is set in `tsconfig.json`.

## Implications for Adding Tests

If tests are added to this project, the following setup decisions need to be made:

**Recommended stack for a Next.js 15 / React 19 project:**
- **Unit/Component:** Vitest + `@testing-library/react` — compatible with Turbopack dev workflow
- **E2E:** Playwright — preferred for Next.js App Router projects

**Where to place test files:**
- Co-located pattern: `src/app/components/Navbar.test.tsx` next to `Navbar.tsx`
- OR centralized: `src/__tests__/components/Navbar.test.tsx`

**Key mocking needs when tests are written:**
- `next-themes` (`useTheme`) — needs mock in all component tests
- `next/navigation` (`useRouter`, `usePathname`) — needs mock
- `framer-motion` — animation library that needs SSR/test environment handling
- `react-intersection-observer` (`useInView`) — needs mock for viewport-triggered tests
- Stripe API calls in `src/app/api/checkout/route.ts` — needs Stripe SDK mock

**Critical areas lacking test coverage:**
- `src/app/api/checkout/route.ts` — Stripe checkout session creation; contains a hardcoded live API key (high-priority security concern alongside testing gap)
- `src/app/components/OrderForm.tsx` — multi-step form logic with payment redirect
- `src/app/components/Navbar.tsx` — scroll navigation, hash routing, theme toggle
- `src/components/customHook/useResize.jsx` — SSR guard logic, resize event listener cleanup

---

*Testing analysis: 2026-04-02*
