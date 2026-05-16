// Phase 7 — Dorm Wars RNG
// Server-only. Uses node:crypto.randomInt for CSPRNG-quality outcomes.
// Do NOT replace with Math.random() — Pitfall #6 calls this out.
//
// crypto.randomInt is Node 14.10+, supported on Netlify (Node 18+).
// These functions MUST NOT run in edge runtime — keep callers on Node.

import { randomInt } from 'node:crypto'

/**
 * Mystery Drop value (Layer 2 milestone 3). Weighted to feel surprising:
 *   50% → 30..70   (common — small wins)
 *   35% → 71..120  (uncommon — solid wins)
 *   15% → 121..150 (rare — jackpot tier)
 */
export function mysteryDropValue(): number {
  const roll = randomInt(0, 100)   // 0..99 inclusive lower, exclusive upper
  if (roll < 50) return randomInt(30, 71)     // 30..70   (50%)
  if (roll < 85) return randomInt(71, 121)    // 71..120  (35%)
  return randomInt(121, 151)                  // 121..150 (15%)
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
