# Someday / Maybe

Ideas scoped but deliberately parked. Pull this file up when starting the native app build or when one of these gets prioritized.

---

## Rider tracking in the rider panel

Scoped 2026-07-19. Decision: parked until the app build.

### What already exists (do not rebuild)

The rider PWA at `src/app/ops/[token]` already captures the full shape of a delivery run:

- Pickup photo unlocks the day (`ops_day_events`, `event_type = 'rider_pickup'`)
- Every dorm drop writes a `delivery_events` row with `confirmed_at`, `verified`, `rider_count`
- The RSC (`page.tsx`) rehydrates day state on reload, so "which dorms are done" is server truth

So run *progress* is already in the DB. Only live *location* is missing.

### Version A: progress timeline (~1 day, no GPS)

Admin read-only view over `delivery_events` + `ops_day_events`: pickup at 1:42, Dorm A verified 2:10, Dorm B 2:31, three left. No new permissions, no battery cost, works with the PWA as-is. 80% of the "how is the run going" value. Build this first.

### Version B: live GPS map (~1 week)

1. **Capture** — rider page uses `navigator.geolocation.watchPosition`, pings (lat, lng, accuracy, ts) every 15–30s to a new API route that validates the ops token (same pattern as `src/app/api/ops/confirm-pickup/route.ts`). Start on pickup unlock, stop after last dorm.
2. **Storage** — new `rider_locations` table (ops_token_id, delivery_date, lat, lng, accuracy, recorded_at). RLS-locked, inserts via server route only (anon/authenticated inherit full default DML in this DB — RLS is the protection). Nightly prune like the 31-day ops-photo archive.
3. **Dorm coordinates** — `dorm_locations` has no lat/lng. Add two columns, geocode the dorms once by hand (~20 min).
4. **Map** — admin page with Leaflet + OpenStreetMap tiles (free, no API key). Rider dot + dorm markers colored by delivered status. Poll every ~15s (or Supabase Realtime).

### The hard constraint (why this is parked for the app)

iOS gives web apps NO background geolocation. The installed PWA stops pinging the moment the rider locks the phone or switches to WhatsApp. A wake lock (screen stays on during the run) softens it, but true always-on tracking like Careem/Talabat requires a **native app**. Web version yields a dotted trail with gaps, good for "roughly where is he," not block-by-block.

### Decisions already made

- **Admin/owner view only.** Customer countdown is deliberately imprecise ("~2h", "Arriving soon") — never show customers a live map.
- Leaflet + OSM over Google Maps (no billing, no key).
- Build Version A regardless; Version B properly belongs in the native app where background location exists.
