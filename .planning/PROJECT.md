# Dormer's — Ops Interfaces & Delivery Chain of Custody

## What This Is

Dormer's is a UAE-based meal plan delivery service. The platform includes a Next.js 15 marketing site, customer dashboard, admin panel, and now operational interfaces for the kitchen team and delivery riders. This milestone adds two ungated PWA pages that replace manual Make.com/WhatsApp workflows with a verified delivery chain of custody — kitchen sees what to cook, rider verifies each handoff with photos, and customers get auto-notified when their meal arrives.

## Core Value

Meals delivered correctly, provably, every time — with the kitchen and rider workflows as frictionless as opening WhatsApp.

## Current Milestone: v2.0 Ops Interfaces — Kitchen Display + Delivery Chain of Custody

**Goal:** Build two ungated, mobile-first PWA pages for kitchen staff and delivery riders, replacing manual workflows with a verified chain-of-custody system that auto-notifies customers.

**Target features:**
- Kitchen display page with recipes, photos, and 2PM-gated meal counts
- Delivery rider page with dorm-shaped pickup/drop-off verification
- Gemini-powered box count verification (triple match)
- Automatic WhatsApp customer notifications on verified delivery
- 8 PM failsafe cron for unconfirmed dorms
- WhatsApp inbound trigger (rider texts dorm name)
- iOS Shortcuts for owner quick-send
- 48+ recipes seeded from cookbook PDF

## Requirements

### Validated

- ✓ WhatsApp notification dispatcher pipeline (pg_cron + customer_notifications table) — existing
- ✓ Menu catalog DB-first (dishes, menu_weeks, week_meal_slots) — existing
- ✓ 4-week rotating menu with veg/non-veg resolution — existing
- ✓ Dorm shapes in label pipeline (circle/square/triangle/hexagon/star/plus) — existing
- ✓ Active subscription queries with skip/pause filtering — existing
- ✓ Admin deliveries page with dorm grouping — existing

### Active

(See REQUIREMENTS.md for full scoped requirements with REQ-IDs)

### Out of Scope

- Customer-side pickup confirmation (QR/PIN on bag) — adds friction to every meal, not needed if dorm-side delivery is provable
- Full delivery route optimization — rider determines their own route
- Real-time GPS tracking of rider — privacy concerns, overkill for current scale
- Kitchen inventory/procurement management — separate concern
- Modifying the existing admin labels pipeline — kitchen can link to it, not replace it

## Context

- **Stack:** Next.js 15, React 19, Tailwind CSS v4, Supabase (Ohio), Stripe, Meta WhatsApp Cloud API, Google Gemini API
- **Existing infra:** WhatsApp dispatcher (pg_cron every 5 min), customer_notifications queue table, menu-catalog.ts, subscriptions-repo.ts, dorm-shapes.ts, label PDF pipeline
- **Kitchen team:** Non-technical, needs zero-friction access — no login, no app install, just a URL
- **Delivery rider:** Android phone, WhatsApp-native, may change frequently — onboarding must be one sentence
- **Cookbook:** 60-page PDF (Dormers_cook_book_Golden.pdf) with 48+ structured recipes including ingredient sections, methods, and allergen notes. Each dish has a code (CRNC01, RCVV01, etc.)
- **Count cutoff:** 2 PM UAE is the customer skip/pause deadline — kitchen counts must not show before this
- **Dorm mapping:** Myriad=circle, KSK=square, Yugo=triangle, DSOA=hexagon, Study World=star, Other=plus

## Constraints

- **No login:** Both ops pages must be ungated — secret token in URL, no auth flow
- **Mobile-first:** Primary use is on phones (kitchen propped up, rider in hand) — must work at 375px
- **WhatsApp dependency:** Customer notifications use existing Meta template system — template must be registered in Business Manager before dispatch
- **Gemini API:** Box counting requires vision API access — needs API key in environment
- **2 PM cutoff:** Meal counts must not display before 2 PM UAE — customers can still skip/pause until then

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Secret-token URL over login | Kitchen/rider need zero-friction access; data isn't sensitive (dish names + counts) | — Pending |
| Triple-match verification (expected + rider + Gemini) | Double verification catches both photo fraud and miscounts | — Pending |
| Photo unclear → retake once → escalate | Balances rider convenience (90% succeed) with preventing bad photos slipping through | — Pending |
| Customer WhatsApp only on verified delivery | Prevents false notifications; rider can't skip verification | — Pending |
| Dorm name text (not numbers) for WhatsApp trigger | Numbers are arbitrary and break when routes change; names are self-documenting | — Pending |
| Counts hidden until 2 PM UAE | Customers can skip/pause until 2 PM; showing earlier counts would cause kitchen to prep wrong amounts | — Pending |
| Recipes as JSONB column on dishes table | 1:1 with dishes, no separate table needed; structured for rendering | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 — Milestone v2.0 started: Ops Interfaces — Kitchen Display + Delivery Chain of Custody*
