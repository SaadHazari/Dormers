// Phase 7 — Dorm Wars RNG
// Server-only. Uses node:crypto.randomInt for CSPRNG-quality outcomes.
// Do NOT replace with Math.random() — Pitfall #6 calls this out.
//
// crypto.randomInt is Node 14.10+, supported on Netlify (Node 18+).
// These functions MUST NOT run in edge runtime — keep callers on Node.

import { randomInt } from 'node:crypto'

/**
 * Mystery Cash Drop value (Layer 2 milestone 3). Phase 8 rebalance:
 * range narrowed (no AED 30-only "is that it?" rolls) and a real jackpot
 * tier added. Every drop is now at least dinner money.
 *   50% → 30..50  (common — solid)
 *   30% → 50..70  (uncommon — strong)
 *   15% → 70..80  (rare — premium)
 *    5% → 80..90  (jackpot)
 */
export function mysteryDropValue(): number {
  const roll = randomInt(0, 100)   // 0..99 inclusive lower, exclusive upper
  if (roll < 50) return randomInt(30, 51)     // 30..50  (50%)
  if (roll < 80) return randomInt(50, 71)     // 50..70  (30%)
  if (roll < 95) return randomInt(70, 81)     // 70..80  (15%)
  return randomInt(80, 91)                    // 80..90  (5%)
}

/**
 * Daily Drop value (Layer 4 / 07-05). Heavily weighted toward small wins to
 * keep the engagement loop honest — most days you get pocket change, rare
 * days you hit something memorable.
 *   60% → 1..10    (common)
 *   30% → 11..50   (uncommon)
 *   10% → 51..200  (rare)
 */
export function dailyDropValue(): number {
  const roll = randomInt(0, 100)
  if (roll < 60) return randomInt(1, 11)      // 1..10    (60%)
  if (roll < 90) return randomInt(11, 51)     // 11..50   (30%)
  return randomInt(51, 201)                   // 51..200  (10%)
}
