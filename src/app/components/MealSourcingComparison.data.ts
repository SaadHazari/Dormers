/**
 * Single source of truth for the marketing "meal-sourcing comparison"
 * section (#compare). Lets a prospective student feel Dormers' value
 * WITHOUT ever showing a Dormers price (prices are gated behind login).
 *
 * Scores are DIRECTIONAL (0-100), traced to the Avatar Problem List
 * (Avatar_1_Problem_List.pdf). The #n references in comments are problem IDs.
 *
 * Two kinds of lever:
 *  - 'cost' (money, time): the bar is the amount SPENT, so lower = better.
 *    Dormers lands where it really lands: mid on money (cheaper than the pricey
 *    options, dearer than noodles), and near-zero on time (delivered, no prep).
 *  - 'benefit' (health, taste): higher = better, Dormers sits near the top.
 *
 * HARD RULES:
 *  - No absolute Dormers price anywhere (relative only).
 *  - No internal COGS figures. Confidential.
 *  - Alternative cost figures shown are independent "avg Dubai student price"
 *    ranges, not quotes (see METHODOLOGY note).
 */

export type LeverKey = 'money' | 'time' | 'health' | 'taste'

export interface LeverScores {
  money: number
  time: number
  health: number
  taste: number
}

export interface Lever {
  key: LeverKey
  label: string
  /** 'cost' = bar is amount spent (lower better); 'benefit' = higher better. */
  kind: 'cost' | 'benefit'
  /** What a good score means (tooltip + aria). */
  highMeans: string
}

export interface SourcingMode {
  id: string
  /** Chip label inside the selector (kept short so 5 fit the pill). */
  label: string
  /** Compact chip label (mobile). */
  shortLabel: string
  /** Descriptive title shown above the jab copy ("Cooking daily", etc.). */
  title: string
  scores: LeverScores
  /** The per-mode jab: names the catch in one line. Alt figures only. */
  win: string
}

export const LEVERS: Lever[] = [
  { key: 'money', label: 'Money', kind: 'cost', highMeans: 'Less money out of pocket. Lower is better.' },
  { key: 'time', label: 'Time', kind: 'cost', highMeans: 'Less time spent shopping, cooking, waiting, cleaning. Lower is better.' },
  { key: 'health', label: 'Health', kind: 'benefit', highMeans: 'More balanced, keeps you sharp in class' },
  { key: 'taste', label: 'Taste', kind: 'benefit', highMeans: 'Tastier, more variety, tastes like home' },
]

export const MODES: SourcingMode[] = [
  {
    id: 'cook',
    label: 'Cook',
    shortLabel: 'Cook',
    title: 'Cooking daily',
    // money(spend): groceries + taxi #06 + spoilage #07 ~ Dormers; time(spend): cook #16 + cleanup #20 + shopping (most);
    // health: "don't know what balanced is" #46; taste: generic, no home spices #05
    scores: { money: 44, time: 90, health: 50, taste: 40 },
    win: 'Cheap, until you add the taxi to the store and the food that spoils.',
  },
  {
    id: 'delivery',
    label: 'Delivery',
    shortLabel: 'Delivery',
    title: 'Delivery apps',
    // money(spend): 35-50/order #25; time(spend): 30-45 min wait #28; health: oily #26; taste: not like photo #24
    scores: { money: 72, time: 50, health: 30, taste: 55 },
    win: 'AED 35 to 50 a day. Oily, and never like the photo.',
  },
  {
    id: 'eatout',
    label: 'Eat out',
    shortLabel: 'Eat out',
    title: 'Eating out',
    // money(spend): 40-70/meal #31 (highest); time(spend): 60-90 min round trip #33; health: #36; taste: limited #35
    scores: { money: 92, time: 80, health: 45, taste: 65 },
    win: 'AED 40 to 70 a meal, and 90 minutes of your night gone.',
  },
  {
    id: 'plans',
    label: 'Meal plans',
    shortLabel: 'Plans',
    title: 'Other meal plans',
    // money(spend): 800-1500/mo #37; time(spend): delivered, low but fixed windows #41; health: #38; taste: hospital food #38,#42
    scores: { money: 78, time: 22, health: 60, taste: 35 },
    win: 'AED 800 to 1500 a month, and it still tastes like a hospital tray.',
  },
  {
    id: 'skip',
    label: 'Noodles',
    shortLabel: 'Noodles',
    title: 'Skipping meals',
    // money(spend): cheapest; time(spend): quick to make; health: wrecks focus #53, weight #44; taste: hollow #52
    scores: { money: 14, time: 15, health: 10, taste: 15 },
    win: 'Fast and cheap, until you can’t focus and you’re starving by noon.',
  },
]

/**
 * Dormers' ever-present benchmark. SCORES ONLY, never a price.
 * Money: middle spend. Time: near-zero (delivered, no prep) so the marker sits
 * all the way back. Health/taste: near the top.
 */
export const DORMERS_BENCHMARK: LeverScores = { money: 48, time: 5, health: 88, taste: 88 }

/** Re-exported so this data module keeps its single import surface; the value
 *  itself lives in shared/auth-routes.ts alongside every other marketing CTA. */
export { SIGNUP_HREF } from '@/shared/auth-routes'

export const COPY = {
  trigger: 'Compare us to how you eat now',
  benchmarkLabel: 'Dormers',
  ctaLabel: 'See your student rate',
  ctaMicrocopy: '30 seconds. Students get a discount.',
  methodology: 'Ballpark Dubai prices, not exact quotes.',
}
