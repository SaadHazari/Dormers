// Keep-warm ping — scheduled every 5 minutes (see netlify.toml).
//
// The Next.js server runs as one big Lambda; a cold instance pays the full
// module-init cost before it can stream a byte. This ping keeps at least
// one instance warm so the common case (a single student opening the
// dashboard after a quiet stretch) never lands on a cold boot. It does NOT
// prevent cold instances under concurrency spikes — the init-cost budget in
// src/sentry.server.config.ts is the real protection there.
//
// /api/health is the target because it exercises the same server function,
// is cheap (SELECT 1 + env presence), and is the canonical uptime probe.
export default async () => {
  const base = process.env.URL ?? 'https://dormers.ae'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40_000)
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      headers: { 'user-agent': 'dormers-keep-warm' },
    })
    console.log(`keep-warm: ${base}/api/health -> ${res.status}`)
  } catch (err) {
    // A failed ping is not an incident by itself — the uptime monitor owns
    // alerting. Log and move on.
    console.error('keep-warm: ping failed:', err?.message ?? err)
  } finally {
    clearTimeout(timer)
  }
}
