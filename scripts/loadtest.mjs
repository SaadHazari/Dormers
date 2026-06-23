#!/usr/bin/env node
/**
 * Release It! Phase 9 — load / soak harness (read-only).
 *
 * Drives a target at a fixed request rate for a duration and reports the
 * latency distribution (p50/p95/p99), error rate, and throughput — so you can
 * find where latency degrades and where the Supabase pool / function
 * concurrency becomes the bottleneck.
 *
 *   BASE_URL=http://localhost:3000 RPS=20 DURATION=60 \
 *     PATHS=/api/health,/,/privacy node scripts/loadtest.mjs
 *
 * ⚠️  NEVER point this at production. /api/health exercises the real DB read
 *     path; hammering prod loads your live database and can affect customers.
 *     Run it against `npm run dev`, a Netlify deploy-preview backed by a
 *     throwaway Supabase branch, or a staging stack.
 *
 * Defaults are conservative (localhost, 10 RPS, 30s, /api/health). For a real
 * capacity test, ramp RPS (e.g. 10 → 50 → 100) and watch where p95 crosses your
 * SLO and where errors begin — that ramp point is the capacity ceiling.
 *
 * Soak: set a long DURATION (e.g. 3600) at ~80% of the ceiling and watch for
 * creeping latency / memory / connection leaks over time.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const RPS = Number(process.env.RPS || 10)
const DURATION = Number(process.env.DURATION || 30)
const PATHS = (process.env.PATHS || '/api/health').split(',').map((p) => p.trim()).filter(Boolean)

if (/(\.dormers\.ae|dormers\.ae|\.netlify\.app)/.test(BASE_URL) && !process.env.I_KNOW_THIS_IS_NOT_PROD) {
  console.error(`Refusing to run against what looks like production (${BASE_URL}).`)
  console.error('If this is genuinely a safe staging target, set I_KNOW_THIS_IS_NOT_PROD=1.')
  process.exit(1)
}

const latencies = []
let ok = 0
let errors = 0
let inflight = 0
let maxInflight = 0

async function hit(path) {
  inflight++
  maxInflight = Math.max(maxInflight, inflight)
  const started = performance.now()
  try {
    const res = await fetch(BASE_URL + path, { headers: { 'user-agent': 'dormers-loadtest' } })
    const ms = performance.now() - started
    latencies.push(ms)
    if (res.ok) ok++
    else errors++
  } catch {
    errors++
    latencies.push(performance.now() - started)
  } finally {
    inflight--
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  console.log(`Load test → ${BASE_URL}  paths=${PATHS.join(',')}  rps=${RPS}  duration=${DURATION}s`)
  const intervalMs = 1000 / RPS
  const endAt = Date.now() + DURATION * 1000
  let i = 0
  const timers = []

  await new Promise((resolve) => {
    const tick = setInterval(() => {
      if (Date.now() >= endAt) {
        clearInterval(tick)
        resolve()
        return
      }
      const path = PATHS[i % PATHS.length]
      i++
      timers.push(hit(path))
    }, intervalMs)
  })

  await Promise.allSettled(timers)

  const sorted = latencies.slice().sort((a, b) => a - b)
  const total = ok + errors
  console.log('\n── Results ──────────────────────────────')
  console.log(`requests:    ${total}  (ok ${ok}, errors ${errors})`)
  console.log(`error rate:  ${total ? ((errors / total) * 100).toFixed(2) : '0'}%`)
  console.log(`throughput:  ${(total / DURATION).toFixed(1)} req/s`)
  console.log(`max inflight:${maxInflight}`)
  console.log(`latency p50: ${pct(sorted, 50).toFixed(0)}ms`)
  console.log(`latency p95: ${pct(sorted, 95).toFixed(0)}ms`)
  console.log(`latency p99: ${pct(sorted, 99).toFixed(0)}ms`)
  console.log(`latency max: ${(sorted[sorted.length - 1] || 0).toFixed(0)}ms`)
}

main()
