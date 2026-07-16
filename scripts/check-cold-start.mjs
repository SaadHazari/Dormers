// Cold-start budget check — run after any deploy that touches server init
// (sentry.server.config.ts, instrumentation.ts, logger, new top-level deps):
//
//   npm run check:cold-start            (targets https://dormers.ae)
//   node scripts/check-cold-start.mjs https://<branch-preview>.netlify.app
//
// Why this exists: in July 2026 Sentry's nodeProfilingIntegration +
// includeLocalVariables pushed Lambda cold init to ~20s. Combined with
// render time that crossed Netlify's streaming cutoff, so every customer
// who landed on a cold instance got a truncated RSC stream and the
// dashboard "Try again" dialog. Warm instances masked it in casual testing.
//
// Method: fire a burst of concurrent requests. Netlify spins up a fresh
// (cold) instance per concurrent request beyond the warm pool, so the slow
// tail of the burst IS the cold-start time. Budget: every response under
// BUDGET_MS and no truncated bodies.
//
// Note: this deliberately creates cold instances on the target site. Run it
// after deploys, not against production during peak dinner hours.

const TARGET = process.argv[2] ?? 'https://dormers.ae'
const BURST = 12
const BUDGET_MS = 12_000
const PATH = '/login' // full server-rendered page, no auth needed

const results = await Promise.all(
  Array.from({ length: BURST }, async (_, i) => {
    const t0 = Date.now()
    try {
      const res = await fetch(TARGET + PATH, {
        headers: { 'user-agent': 'dormers-cold-start-check' },
      })
      const body = await res.text()
      const truncated = !body.includes('</html>')
      return { i, ms: Date.now() - t0, status: res.status, bytes: body.length, truncated }
    } catch (err) {
      return { i, ms: Date.now() - t0, status: 0, bytes: 0, truncated: true, err: String(err?.cause?.message ?? err) }
    }
  }),
)

results.sort((a, b) => a.ms - b.ms)
for (const r of results) {
  console.log(
    `#${String(r.i).padStart(2)} ${String(r.ms).padStart(6)}ms  status=${r.status}  ${r.bytes}b${r.truncated ? '  TRUNCATED' : ''}${r.err ? '  ' + r.err : ''}`,
  )
}

const worst = results[results.length - 1]
const failures = results.filter((r) => r.status !== 200 || r.truncated || r.ms > BUDGET_MS)

console.log(`\ntarget=${TARGET}${PATH}  burst=${BURST}  budget=${BUDGET_MS}ms  worst=${worst.ms}ms`)
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}/${BURST} responses over budget, non-200, or truncated.`)
  console.error('Cold-start cost has regressed — check what was added to server init')
  console.error('(src/sentry.server.config.ts, src/instrumentation.ts, heavy top-level imports).')
  process.exit(1)
}
console.log('PASS: all responses complete and under budget.')
