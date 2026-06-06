'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import {
  Gift, Users, Send, Flame, Lock, Check, CheckCircle2, X, ArrowRight,
  Star, Trophy, Percent, Shirt,
  Calendar, Coins, KeyRound, Zap, Upload, ExternalLink,
  Activity, MessageSquareText, Sparkles,
  User, Award, Crown, Clock, ShieldAlert,
  Info,
} from 'lucide-react'
import { whatsAppHref, referralUrl } from '@/shared/contacts'
import type { ReferralData, InviteRow, CrossDormRecentSub } from '@/infra/supabase/referrals-repo'
import type { RewardEvent, StreakChestState, StreakChestBucket } from '@/infra/supabase/dorm-wars-repo'
import type { Subscription } from '../../_shared/types'
import { useWeeklyDraftActive } from '../../_shared/draft-hooks'
import type { MealPriceContext } from '@/contexts/dorm-wars/domain/meal-pricing'
import { freeWeekValue, freeMonthValue } from '@/contexts/dorm-wars/domain/meal-pricing'
import { LAYER1_CASH_LADDER, cashForLifetimeConversion } from '@/contexts/dorm-wars/domain/constants'
import type { Layer4Row, Layer4Kind } from '@/contexts/dorm-wars/domain/layer4'
import { LAYER4_VALUE_AED } from '@/contexts/dorm-wars/domain/layer4'
import {
  BASE_REWARD_AED, LATE_REWARD_AED,
  type WeeklyReviewState, type PendingItem, type LateItem, type CompletedReviewItem,
} from '@/contexts/subscriptions/domain/weekly-review'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED, wrapVocabFor, type MonthlyReviewWindow, type WrapPlanTier } from '@/contexts/subscriptions/domain/monthly-review'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DormWarsTour } from './DormWarsTour'

// ════════════════════════════════════════════════════════════════════════════
//  PALETTE — Dormers brand translation (2026-05-18)
//
//  Ground = marketing hero navy (#091825 → #1e3a4f). Action = burnt orange
//  (#f57f20). Text = cream (#ede8da). Tier accents kept differentiated for
//  hierarchy but ALL warmed: cyan → teal, neon green → forest, neon purple
//  → mulberry, neon pink → coral. The hub now lives in the same late-night
//  dorm world as the rest of the site, just with its own gamified rhythm.
// ════════════════════════════════════════════════════════════════════════════

// Ground — pulled verbatim from the marketing hero gradient stops so the
// page sits in the same atmosphere as the site's "you didn't leave home"
// landing. BG_DEEP is the navy floor, BG_MID is the teal-navy upper third.
const BG_DEEP = '#091825'
const BG_MID = '#1e3a4f'
const BG_GLOW = '#162f40'  // gradient endpoint for the radial wash

// Action — burnt orange is the brand heartbeat. GOLD here means the warm
// orange family the marketing CTAs use, not the yellow-gold of the prior
// neon palette. GOLD_LITE is the brand's gradient secondary (#ffaa00).
const GOLD = '#f57f20'   // primary action — matches Navbar CTA / hero stress
const GOLD_LITE = '#ffaa00'   // gradient partner — matches the Navbar gradient end
const ORANGE = '#f57f20'
const ORANGE_LITE = '#ffaa00'

// Tier accents — kept differentiated for hierarchy but every value pulled
// toward warmer hues so the hub feels like one continuous mood, not a
// rainbow of neon. Saturations reduced ~15-20% from the original gamer set.
const CYAN = '#5cb4c9'   // teal — closer to BG_MID; was #22d3ee
const GREEN = '#5fb479'   // forest green; was #22c55e
const PURPLE = '#b58af0'   // soft mulberry; was #c084fc
const VIOLET = '#a878dc'   // similar but darker; was #a855f7
const PINK = '#e57b9a'   // coral pink; was #ec4899
const RED = '#e0716e'   // brick red; was #f87171

const CREAM = '#ede8da'
const MIST = 'rgba(237,232,218,0.55)'
const MIST_DIM = 'rgba(237,232,218,0.30)'
const MIST_FAINT = 'rgba(237,232,218,0.12)'

const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
const DISPLAY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

// ════════════════════════════════════════════════════════════════════════════
//  REWARD LAYER DATA — the 4 layers preserved exactly as designed
// ════════════════════════════════════════════════════════════════════════════

// Tier labels — neutral, no military theme
const TIERS = [
  { num: 1, threshold: 10, perk: '5% off forever', color: CYAN },
  { num: 2, threshold: 25, perk: '10% off + Early Access', color: GREEN },
  { num: 3, threshold: 50, perk: 'Jacket + Merch drops', color: PURPLE },
  { num: 4, threshold: 100, perk: '100 Free Meals + Hall Wall', color: GOLD },
]

// Progression titles — the customer's identity on the hub flows from
// these. Each tier has its own glyph + name + tagline; the TopChrome
// avatar swaps to the appropriate icon, and the title pill replaces the
// old "Tier N" badge. Tier 0 is the "you just signed up" baseline so
// every customer has a real title from day one. Tapping the avatar opens
// the Progression modal that lays the full ladder out.
type ProgressionIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
interface ProgressionTitle {
  tier: 0 | 1 | 2 | 3 | 4
  threshold: number
  title: string
  tagline: string
  Icon: ProgressionIcon
  color: string
}
// Phase 8P — tier names rebuilt for the actual avatar (Gen Z international
// students in Academic City dorms). Old names ('Newcomer → Elite Dormer')
// were corporate-loyalty vocabulary that didn't match how the avatar
// actually talks. New ladder uses gamer/internet/Gen Z finance-bro
// vernacular — the words their friends would literally use about them.
// Scored against Octalysis + STEPPS (see PR for ladder rationale).
//   Solo            — pre-recruits, eating alone (motivational floor)
//   The Clutch (10) — came through for the crew
//   The Capitalist  — stacking AED, ironic Gen Z money flex
//   The OG          — established, been doing this since first sem
//   The GOAT        — peak Gen Z praise; legacy tier
const PROGRESSION_TITLES: ProgressionTitle[] = [
  { tier: 0, threshold: 0,   title: 'Solo',           tagline: 'Eating alone, scrolling tiktok',     Icon: User,  color: CREAM },
  { tier: 1, threshold: 10,  title: 'The Clutch',     tagline: '5% off forever · earned',            Icon: Zap,   color: CYAN  },
  { tier: 2, threshold: 25,  title: 'The Capitalist', tagline: '10% off + Early Access',             Icon: Coins, color: GREEN },
  { tier: 3, threshold: 50,  title: 'The OG',         tagline: 'Jacket + merch drops',               Icon: Award, color: PURPLE},
  { tier: 4, threshold: 100, title: 'The GOAT',       tagline: '100 free meals + Hall of Fame',      Icon: Crown, color: GOLD  },
]
function progressionFor(recruits: number): ProgressionTitle {
  // Iterate top-down so a 100+ recruit user gets GOAT, not Solo.
  for (let i = PROGRESSION_TITLES.length - 1; i >= 0; i--) {
    if (recruits >= PROGRESSION_TITLES[i].threshold) return PROGRESSION_TITLES[i]
  }
  return PROGRESSION_TITLES[0]
}

// Phase 8P — tier-aware WhatsApp invite copy. Each tier's pre-fill matches
// the avatar's voice at that rank in their journey:
//   Solo:           pitch the product (no title to flex yet)
//   The Clutch:     pitch yourself as the food hookup
//   The Capitalist: pitch the ironic money flex (you're earning)
//   The OG:         pitch your tenure (been on this since first sem)
//   The GOAT:       pitch endorsement (the app is the GOAT, not you)
// The progression mirrors the share-impulse curve — early tiers lean on
// practical value, mid tiers on social currency, late tiers on stories.
function whatsappInviteCopy(recruits: number, customerCid: string): string {
  const link = referralUrl(customerCid)
  const tier = progressionFor(recruits).tier
  switch (tier) {
    case 1: return `got u a clutch food hookup at the dorm — first one's free ${link}`
    case 2: return `ngl been stacking aed off this app, try it — first meal's free ${link}`
    case 3: return `been on this since first sem, first meal on me ${link}`
    case 4: return `putting u onto the goat for dorm food — first one on me ${link}`
    case 0:
    default: return `yo try this, first meal's free — saved my whole food budget tbh ${link}`
  }
}

// Bar helpers — milestone stops sit at *equal visual spacing* (1/N, 2/N,
// ..., N/N) rather than at their literal threshold percentage. Linear
// positioning produced the "100 trophy floating alone on the right" gap
// from the previous design audit. Equal spacing reads as a clean cadence
// regardless of threshold spread; the fill bar interpolates between
// stops so the user's actual progress is still honest.

// Layer 1 — per-conversion cash ladder (lifetime scaling). The ladder + its
// AED amounts live in the dorm-wars domain (LAYER1_CASH_LADDER) so this
// display stays in lockstep with what creditInviterOnConversion actually
// deposits — see src/contexts/dorm-wars/domain/constants.ts.

// Layer 2 — per-cycle milestones. Phase 8D: Free Week / Free Month values
// are computed at render-time from the customer's mealPriceContext so the
// hub shows the actual AED they'll get (Veg Premium = AED 108, NonVeg Max
// = AED 258, etc.) instead of the old hardcoded ~132 / ~528.
interface CycleMilestone {
  at: number; label: string; value: string; color: string; Emblem: typeof Gift; rare?: boolean
  /** Plain-English "what you have to do" — surfaces on the flip-card back. */
  requirement: string
  /** Plain-English "how the reward lands" — surfaces on the flip-card back. */
  howItWorks: string
}
function buildCycleMilestones(ctx: MealPriceContext): CycleMilestone[] {
  return [
    {
      at: 3, label: 'Mystery Cash Drop', value: 'AED 30–90', color: PURPLE, Emblem: Gift,
      requirement: 'Get 3 friends to subscribe to Dormers this cycle.',
      howItWorks: 'A random AED 30–90 lands in your wallet as soon as your third recruit subscribes. Auto-applies at your next renewal.',
    },
    {
      at: 6, label: 'Free Week', value: `~AED ${freeWeekValue(ctx)}`, color: CYAN, Emblem: Calendar,
      requirement: 'Get 6 friends to subscribe this cycle.',
      howItWorks: `A week's worth of meals (~AED ${freeWeekValue(ctx)} on your plan) gets credited to your wallet at cycle close.`,
    },
    {
      at: 10, label: 'Free Month', value: `~AED ${freeMonthValue(ctx)}`, color: GOLD, Emblem: Trophy,
      requirement: 'Get 10 friends to subscribe this cycle.',
      howItWorks: `A full month of meals (~AED ${freeMonthValue(ctx)} on your plan) is credited at cycle close.`,
    },
    {
      at: 15, label: '500 cr + 5 Skips', value: '500 cr', color: PINK, Emblem: Coins, rare: true,
      requirement: 'Get 15 friends to subscribe this cycle.',
      howItWorks: '500 credits + 5 skip-meal tokens drop into your account at cycle close. Skips never expire.',
    },
    {
      at: 20, label: 'Dorm Weekend', value: 'For all', color: RED, Emblem: Users, rare: true,
      requirement: 'Get 20 friends to subscribe this cycle.',
      howItWorks: 'We host a weekend dinner event for your whole dorm. Our team coordinates with you within a week.',
    },
  ]
}

// Layer 3 — lifetime tier rewards (matches TIERS above; redundant but explicit)
interface LifetimeTier {
  at: number; label: string; color: string; Emblem: typeof Percent
  /** Plain-English "what you have to do" — surfaces on the flip-card back. */
  requirement: string
  /** Plain-English "how the reward lands" — surfaces on the flip-card back. */
  howItWorks: string
}
const LIFETIME_TIERS: LifetimeTier[] = [
  {
    at: 10, label: '5% off forever', color: CYAN, Emblem: Percent,
    requirement: 'Recruit 10 friends across your lifetime (counts never reset).',
    howItWorks: 'A permanent 5% discount applies to every renewal for as long as you stay subscribed.',
  },
  {
    at: 25, label: '10% off + Early Access', color: GREEN, Emblem: Percent,
    requirement: 'Recruit 25 friends across your lifetime.',
    howItWorks: 'Discount jumps to 10% on every renewal, and your account is flagged for Early Access — first in line for new perks as we roll them out.',
  },
  {
    at: 50, label: 'Jacket + Merch', color: PURPLE, Emblem: Shirt,
    requirement: 'Recruit 50 friends across your lifetime.',
    howItWorks: 'A custom Dormers jacket + merch pack ships to your dorm. Our team reaches out for sizing.',
  },
  {
    at: 100, label: '100 Free Meals', color: GOLD, Emblem: Trophy,
    requirement: 'Recruit 100 friends across your lifetime.',
    howItWorks: '100 meals get credited to your account, redeemable across any plan. The most senior tier — apex perk.',
  },
]

// Layer 4 — side quests (footer ribbon). "Weekly Streak Reward" surfaces the
// Streak Chest (server: streaks + claim_streak_chest) as a streak-week payoff
// so it pairs visually with the flame language elsewhere on the hub. It is
// NOT the renew_invite_combo Layer4Kind — that kind is still product-pending.
const SIDE_REWARDS = [
  { label: 'Google review',        value: '+AED 10',          color: GREEN,  Emblem: Star },
  { label: '4 weekly reviews',     value: 'up to AED 20',     color: CYAN,   Emblem: MessageSquareText },
  { label: 'Monthly wrap',         value: '+AED 5',           color: VIOLET, Emblem: Calendar },
  { label: 'Weekly Streak Reward', value: 'Every 7 days',     color: ORANGE, Emblem: Flame },
]

// Scout types — 4-stage mapping from current 2-state invite data
// (Phase 2 backend work will extend to 5 stages with a real 'sent' state)
//
// 'already_subscribed' is an off-ladder state — fired when the invitee
// turned out to already have a live Dormers subscription. It deliberately
// sits OUTSIDE the STAGES progression ladder so the pip row doesn't render
// it as "past subscribed" (which would lie about the customer's journey).
// Renderers that need a label/colour for this stage use stageMeta() below.
type ScoutStage = 'sent' | 'scheduled' | 'delivered' | 'decided' | 'subscribed' | 'already_subscribed'
interface Scout { id: string; name: string; stage: ScoutStage; daysAgo: number }
const STAGES: Array<{ key: Exclude<ScoutStage, 'already_subscribed'>; label: string; color: string }> = [
  { key: 'sent', label: 'Link sent', color: ORANGE_LITE },
  { key: 'scheduled', label: 'Meal scheduled', color: CYAN },
  { key: 'delivered', label: 'Meal delivered', color: VIOLET },
  { key: 'decided', label: 'Trial decision', color: RED },
  { key: 'subscribed', label: 'Subscribed', color: GREEN },
]
function stageIndex(stage: Exclude<ScoutStage, 'already_subscribed'>): number {
  return STAGES.findIndex(s => s.key === stage)
}
// Single source of truth for label + colour across all scout stages,
// including the off-ladder 'already_subscribed' state that STAGES omits.
function stageMeta(stage: ScoutStage): { label: string; color: string } {
  if (stage === 'already_subscribed') return { label: 'Already with us', color: PINK }
  return STAGES[stageIndex(stage)]
}

type SubScreen = null | 'ladder' | 'quests' | 'chest' | 'squad' | 'google-review' | 'wallet' | 'progression' | 'weekly-reviews' | 'monthly-wrap'
type SendStep = 'closed' | 'naming' | 'sent'

// ════════════════════════════════════════════════════════════════════════════
//  MAIN HUB — clean 5-section layout, single viewport
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  customerCid: string
  customerName: string
  customerDorm?: string
  referralData: ReferralData
  invites: InviteRow[]
  activeSubscription: Subscription | null
  // Phase 7-05 — server-canonical streak count (SSR seed).
  initialStreak: number
  // Phase 8E — Streak Chest replaces Daily Drop. Carries count + cooldown
  // (last_chest_day) + most recent claim payload so the hub can render
  // "chest ready" / "you just opened…" / "next chest in N days".
  initialChestState: StreakChestState
  // Phase 7-06 — server-canonical cycle recruits. Comes from getCycleRecruits
  // (the same SQL the Layer 2 awarder reads) — see RESEARCH Pitfall #3. The
  // unlocked Layer 3 perks reach the hub via the earlyAccess / hallWall flags
  // below + the checkout discount, so the raw tier number isn't passed.
  cycleRecruits: number
  // Phase 7 audit FIX 15 — surface the tier-2 / tier-4 side-effect flags
  // so the hub can render the perks the awarder promised. Without these
  // the flags flip in the DB but the user sees nothing change.
  earlyAccess: boolean
  hallWall: boolean
  // Recent reward events (referral conversions, milestones, tier unlocks)
  // power the celebratory banner at the top. The hub compares the newest
  // event's id against a localStorage marker so the celebration only fires
  // once per event — re-renders + page-revisits stay quiet.
  recentRewards: RewardEvent[]
  // Phase 8B — Premium+ gate. Only Monthly Premium and Monthly Max can
  // earn. When false, the hub renders blurred underneath a full-screen
  // upsell overlay. The hub still SSRs so the user can see the perks
  // they'd unlock by upgrading. `currentPlanId` powers the overlay copy
  // (different framing for "no sub yet" vs "Weekly Flex" vs "Trial").
  dormWarsEligible: boolean
  currentPlanId: 'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial' | 'welcome-gift' | null
  // Phase 8C — Happening Now feed is cross-dorm now. Each item carries
  // firstName + dormName + isElite (hall_wall flag) so the feed can tag
  // GOATs (tier-4 customers) inline as rare social proof.
  crossDormRecent: CrossDormRecentSub[]
  // Phase 8D — meal-pricing context for Free Week / Free Month display
  // values. SAME shape the awarder reads at fire-time, so the displayed
  // "~AED N" matches what eventually lands in the wallet.
  mealPriceContext: MealPriceContext
  // Phase 8G — Layer 4 side-rewards ledger (anniversary, google_review,
  // and once spec lands: weekly_survey + renew_invite_combo). Drives the
  // per-kind status chip in SideRewardsColumn (Earned / Pending / Locked).
  layer4Rewards: Layer4Row[]
  // Phase 8K wiring — review-system state used by SideRewardsColumn to
  // render real progress for the weekly + monthly wrap rows instead of
  // "Coming soon" placeholders. The submit actions deposit credits
  // directly (source: layer4_weekly_review / layer4_monthly_review) so
  // we don't need to round-trip through layer4_rewards for these.
  weeklyReviewState: WeeklyReviewState
  monthlyReviewWindow: MonthlyReviewWindow
  // First-visit tour flag — when false, the 4-step spotlight tour auto-opens
  // ~600ms after mount (only if the hub isn't behind the Premium gate).
  // Reads from customers.dorm_wars_tour_completed_at; a non-null timestamp
  // means the user opted out via the consent dialog.
  dormWarsTourCompleted: boolean
}

// Phase 8M — bucket label helper. The previous CHEST_BUCKET_COLOR map
// (per-bucket hue) was retired with the calendar redesign — the result
// chip now uses semantic colors (GREEN for cash, GOLD_LITE for doubler)
// instead of one-hue-per-rarity.
function chestBucketLabel(b: StreakChestBucket): string {
  if (b === 'doubler') return 'Week-long Doubler'
  return 'Cash chest'
}

// Phase 8F — humanize the doubler remaining-time. Days for >24h, hours for
// <24h. Banner is intentionally imprecise — minutes would feel anxious.
function formatDoublerRemaining(msRemaining: number): string {
  const hours = Math.floor(msRemaining / 3_600_000)
  if (hours >= 24) {
    const days = Math.ceil(hours / 24)
    return `${days}d`
  }
  return `${Math.max(1, hours)}h`
}

// Map InviteRow (status = 'gift_claimed' | 'converted' |
// 'ineligible_existing_customer') to one of the visible scout stages. The
// pre-claim 'sent' state (link sent, not yet clicked through) requires a
// backend change to expose pre-claim invite rows — flagged for Phase 2.
function deriveScoutStage(row: InviteRow): ScoutStage {
  if (row.status === 'ineligible_existing_customer') return 'already_subscribed'
  if (row.status === 'converted') return 'subscribed'
  // gift_claimed — drive the stage off the friend's ACTUAL Welcome Meal
  // delivery state when we have it (joined in getRecentInvites). Falls back
  // to the claim-age heuristic only for legacy rows with no linked welcome
  // sub (e.g. invitee_user_id never set).
  const delivered = row.welcomeDeliveredMeals
  if (delivered != null) {
    if (delivered < 1) return 'scheduled'            // meal not delivered yet
    const windowPassed = row.welcomeEndDate
      ? new Date(row.welcomeEndDate).getTime() < Date.now()
      : false
    return windowPassed ? 'decided' : 'delivered'    // got the meal; trial live or passed
  }
  const claimedAt = row.claimedAt ? new Date(row.claimedAt) : null
  if (!claimedAt) return 'sent'
  const ageDays = (Date.now() - claimedAt.getTime()) / 86_400_000
  if (ageDays < 3) return 'scheduled'
  if (ageDays < 10) return 'delivered'
  return 'decided'
}
function daysAgoFromISO(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// Streak is now server-canonical (Phase 7-05). The count is seeded by the
// `initialStreak` prop from page.tsx (SSR via `getStreak()`), then a fire-and-
// forget POST to /api/dorm-wars/streak/tick on mount updates the in-memory
// value with the post-tick count. localStorage is no longer involved.

export default function HubClient({
  customerCid, customerName, customerDorm,
  referralData, invites, activeSubscription,
  initialStreak, initialChestState,
  cycleRecruits: serverCycleRecruits,
  earlyAccess, hallWall,
  recentRewards,
  dormWarsEligible, currentPlanId,
  crossDormRecent,
  mealPriceContext,
  layer4Rewards,
  weeklyReviewState,
  monthlyReviewWindow,
  dormWarsTourCompleted,
}: Props) {
  void customerDorm   // reserved for future dorm-specific copy

  // ── REAL DATA from Supabase ─────────────────────────────────────────────
  const recruits = referralData.converted              // lifetime paid conversions
  // Exact per-recruit cash at the user's current lifetime rung (AED 20→35).
  // Surfaced verbatim in the hero + send-flow copy so members see the real
  // figure their NEXT conversion pays, not a generic range.
  const cashPerRecruit = cashForLifetimeConversion(recruits)
  const wallet = Math.round(referralData.creditBalance)
  // Phase 8K Model C — pending review credits live separately from the
  // spendable wallet. Shown alongside the wallet pill when > 0 so the
  // all-or-nothing rule reads in the user's main mental model.
  const walletPending = Math.round(referralData.creditPending)

  // Cycle window — derived from active subscription dates.
  // Audit P1-13: a Scheduled (not-yet-started) sub used to read as
  // "30 days left in cycle" because cycleEndTime - now wasn't sub-second
  // away from cycleStartTime. We now also surface cycleStartsInDays so the
  // CycleColumn can swap copy to "Starts in N days" when the cycle hasn't
  // begun yet, instead of pretending it's already counting down.
  const hasActiveSub = activeSubscription !== null
  const cycleStartTime = hasActiveSub ? new Date(activeSubscription!.start_date).getTime() : 0
  const cycleEndTime = hasActiveSub ? new Date(activeSubscription!.end_date).getTime() : 0
  const cycleTotalDays = hasActiveSub
    ? Math.max(1, Math.ceil((cycleEndTime - cycleStartTime) / 86_400_000))
    : 30
  const cycleDaysLeft = hasActiveSub
    ? Math.max(0, Math.ceil((cycleEndTime - Date.now()) / 86_400_000))
    : 0
  const cycleStartsInDays = hasActiveSub
    ? Math.max(0, Math.ceil((cycleStartTime - Date.now()) / 86_400_000))
    : 0

  // Cycle recruits — server-canonical (Phase 7-06). The page.tsx fetches this
  // via getCycleRecruits — the same SQL the Layer 2 awarder reads — so the
  // hub UI and the awarder cannot drift (RESEARCH Pitfall #3).
  //
  // The page is server-rendered on every navigation and there is no realtime
  // channel for invites, so we do NOT also derive from the invites array.
  // If realtime ever ships, re-introduce a Math.max(serverCycleRecruits,
  // clientComputed) fallback here.
  const cycleRecruits = serverCycleRecruits

  // Scouts — map real invites to visible journey stages, most recent first
  const initialScouts: Scout[] = useMemo(() => invites.map(row => ({
    id: row.id,
    name: row.firstName,
    stage: deriveScoutStage(row),
    daysAgo: daysAgoFromISO(
      row.status === 'converted' && row.convertedAt ? row.convertedAt : row.claimedAt
    ),
  })), [invites])

  // Phase 8C — Pulse feed is now cross-dorm. Each item carries structured
  // data (firstName + dormName + isElite) so the ActivityFeed can render
  // a GOAT tag inline next to Tier-4 customers. Empty-array fallback
  // renders a single placeholder line below.
  const pulseItems = crossDormRecent

  // Phase 8D — meal-aware milestone display. The Free Week / Free Month
  // values shown in the hub now match what the awarder will actually
  // deposit. Recomputed only when the priceContext shape changes.
  const cycleMilestones = useMemo(
    () => buildCycleMilestones(mealPriceContext),
    [mealPriceContext],
  )

  // ── DERIVED ─────────────────────────────────────────────────────────────
  // Current tier from lifetime recruits
  const currentTier = TIERS.slice().reverse().find(t => recruits >= t.threshold) ?? null
  const nextTier = TIERS.find(t => recruits < t.threshold) ?? null

  // Streak — server-canonical (Phase 7-05). Seeded from SSR prop, then
  // ticked on mount; the post-tick count overrides the seed if it changed.
  // Phase 8E: tick_streak also reset last_chest_day on streak break, so we
  // refresh chest state (count + lastChestDay) in the same effect when the
  // count changes.
  const [streak, setStreak] = useState(initialStreak)
  const [chestState, setChestState] = useState<StreakChestState>(initialChestState)
  const [streakTickEvent, setStreakTickEvent] = useState<StreakTickEvent | null>(null)

  useEffect(() => {
    if (!dormWarsEligible) return
    let cancelled = false
    fetch('/api/dorm-wars/streak/tick', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data && typeof data.count === 'number') {
          const newCount = data.count as number
          const event = deriveStreakTickEvent(
            initialStreak, newCount, initialChestState.lastChestDay,
          )
          setStreak(newCount)
          setChestState(prev => {
            const newLastChestDay = newCount < prev.count ? 0 : prev.lastChestDay
            const gap = Math.max(0, newCount - newLastChestDay)
            return {
              ...prev,
              count: newCount,
              lastChestDay: newLastChestDay,
              chestReady: gap >= 7,
              daysUntilNext: gap >= 7 ? 0 : Math.max(0, 7 - gap),
            }
          })
          if (event) setStreakTickEvent(event)
        }
      })
      .catch(() => { /* silent — keep the SSR-seeded value */ })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Full-bleed shell marker (mobile) ──────────────────────────────────────
  // The hub runs edge-to-edge as its own dark world on phones (see the
  // .dash-page:has(.hub-root) rules in layout.tsx). Those rules are scoped with
  // :has(), which iOS WebKit can transiently drop when the mobile drawer mutates
  // the DOM — which would revert the bleed and snap the hub back inside the
  // shell gutter mid-session. Tag <html> with a plain class on mount as a STABLE
  // twin (mirrors ActiveDashboard's html.dash-home) so the bleed can't be lost.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('dash-dormwars')
    return () => root.classList.remove('dash-dormwars')
  }, [])

  // ── STATE ────────────────────────────────────────────────────────────────
  const router = useRouter()
  const [open, setOpen] = useState<SubScreen>(null)
  // First-visit guided tour. Auto-opens once a few hundred ms after mount
  // so the page paints first; suppressed when behind the Premium gate
  // (data-tour targets render blurred and the tour would feel haunted).
  const [showTour, setShowTour] = useState(false)
  useEffect(() => {
    if (dormWarsTourCompleted || !dormWarsEligible) return
    const t = setTimeout(() => setShowTour(true), 600)
    return () => clearTimeout(t)
  }, [dormWarsTourCompleted, dormWarsEligible])
  // Phase 8K — side-quest info modal. Opens when the user taps a passive
  // row (Done, Locked, Soon, Closed) so they get an explanation instead
  // of a dead end. Actionable rows still go directly to their action;
  // only passive rows route through this info screen.
  const [infoKind, setInfoKind] = useState<SideQuestInfoKind | null>(null)
  // Focused milestone — set when the user clicks a specific dot in the
  // This Month / Lifetime Path columns. Drives a 5-second pulsing halo
  // on the matching row inside the opened modal so the user can tell
  // their click landed on the right milestone. Auto-clears after 5s or
  // on any further dot click; closing the modal also clears it.
  const [focusedMilestone, setFocusedMilestone] = useState<
    { kind: 'cycle' | 'lifetime'; at: number } | null
  >(null)
  useEffect(() => {
    if (!focusedMilestone) return
    const t = setTimeout(() => setFocusedMilestone(null), 5000)
    return () => clearTimeout(t)
  }, [focusedMilestone])
  const focusMilestone = (kind: 'cycle' | 'lifetime', at: number) => {
    setFocusedMilestone({ kind, at })
    setOpen(kind === 'cycle' ? 'quests' : 'ladder')
  }
  const [scouts, setScouts] = useState<Scout[]>(initialScouts)
  // Resync scouts when real invites prop changes (e.g., live updates / re-fetch)
  useEffect(() => { setScouts(initialScouts) }, [initialScouts])
  const [viewingScout, setViewingScout] = useState<Scout | null>(null)
  const [sendStep, setSendStep] = useState<SendStep>('closed')
  const [scoutName, setScoutName] = useState('')

  // Rotating pulse text — audit P2: only run the interval when there's
  // actually more than one item to rotate through. Single-item case (e.g.
  // the "No recent activity in your dorm yet" fallback) was re-rendering
  // a fade-in animation every 4.5s with no content change — pure noise.
  const [pulseIdx, setPulseIdx] = useState(0)
  useEffect(() => {
    if (pulseItems.length <= 1) return
    const id = setInterval(() => setPulseIdx(i => (i + 1) % pulseItems.length), 4500)
    return () => clearInterval(id)
  }, [pulseItems.length])

  function startSendFlow() {
    setScoutName('')
    setSendStep('naming')
  }
  function sendLink() {
    const trimmed = scoutName.trim()
    if (!trimmed) return
    const text = whatsappInviteCopy(recruits, customerCid)
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    // Audit P1-11: do NOT optimistically add a phantom scout to the local
    // list — if the user closes WhatsApp without sending, the phantom would
    // sit in the squad as a lie until page reload. Real scouts only appear
    // in `invites` (via the server-side referrals table) when the friend
    // actually claims the gift on /r/[cid]. The user gets confirmation
    // from the sent-step modal, not a fake list entry.
    setSendStep('sent')
  }
  function closeSendFlow() {
    setSendStep('closed')
    setScoutName('')
  }
  function nudgeOnWhatsApp(name: string) {
    const text = `hey ${name}, did you check out that free meal link i sent? would love to know what you think!`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ── Celebration banner — fires on the freshest unseen reward event ────────
  // Compares the newest event id from the server against a localStorage marker
  // so the banner only shows ONCE per event. Dismissing or auto-timing out
  // updates the marker. Without the marker the banner would reappear on every
  // page load until the next reward came in.
  const REWARD_SEEN_KEY = 'dw-hub:reward-event-seen'
  // Phase 8K — exclude weekly_review credits from the celebration trigger.
  // When the 4th submission flips 4 pending rows to approved, getRecentRewardEvents
  // returns 4 events with near-identical timestamps; firing a banner on each
  // would spam the user. The takeover's own thank-you screen handles the
  // lump-sum celebration via lumpSumApprovedAed from the action. Weekly review
  // events still appear in the wallet history modal — just not the celebration.
  const newestReward = recentRewards.find(
    r => !r.source.startsWith('layer4_weekly_review'),
  ) ?? null
  const [celebration, setCelebration] = useState<RewardEvent | null>(null)
  useEffect(() => {
    if (!newestReward) return
    if (typeof window === 'undefined') return
    try {
      const lastSeen = localStorage.getItem(REWARD_SEEN_KEY)
      if (lastSeen !== newestReward.id) setCelebration(newestReward)
    } catch { /* private mode — fall through and just show it */ }
  }, [newestReward])
  function dismissCelebration() {
    if (!celebration) return
    try { localStorage.setItem(REWARD_SEEN_KEY, celebration.id) } catch { }
    setCelebration(null)
  }
  // Auto-dismiss after 14s so the banner doesn't camp on the hub forever.
  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(dismissCelebration, 14_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration?.id])

  // Build celebration copy from the source string. Each branch has its own
  // headline + sub so the banner reads like an event, not a credit row.
  // Phase 8F: '_2x' suffix on source = doubler was active; surface that in
  // copy so the user sees their chest paying off in real time.
  function celebrationCopy(ev: RewardEvent): { headline: string; sub: string; accent: string } {
    const doubled = ev.source.endsWith('_2x')
    const baseSrc = doubled ? ev.source.slice(0, -3) : ev.source
    const doublerTag = doubled ? ' · 2× doubler' : ''

    if (baseSrc === 'referral_conversion') {
      return {
        headline: `🎉 ${ev.invitee_name ?? 'A friend'} joined Dormers!`,
        sub: `+AED ${ev.amount_aed} credit landed in your wallet${doublerTag}`,
        accent: GREEN,
      }
    }
    if (baseSrc.startsWith('cycle_milestone_')) {
      const at = baseSrc.replace('cycle_milestone_', '')
      return {
        headline: `🎯 Cycle milestone ${at} unlocked`,
        sub: `+AED ${ev.amount_aed} credit deposited${doublerTag}`,
        accent: GOLD,
      }
    }
    if (baseSrc === 'tier_4_meals') {
      return {
        headline: '🏆 TIER 4 UNLOCKED — The GOAT',
        sub: `+AED ${ev.amount_aed} jackpot credit deposited`,
        accent: GOLD_LITE,
      }
    }
    // Phase 8I — tier 3 jacket. Synthesized celebration (no credit row;
    // jacket is physical merch). All sizing + delivery details over
    // WhatsApp per user spec — no in-app capture flow.
    if (baseSrc === 'tier_3_jacket') {
      return {
        headline: "🧥 TIER 3 UNLOCKED — Your jacket's on its way",
        sub: "We'll WhatsApp you to confirm size + delivery details",
        accent: PURPLE,
      }
    }
    if (baseSrc === 'layer4_anniversary') {
      return {
        headline: '🎂 1-YEAR ANNIVERSARY',
        sub: `+AED ${ev.amount_aed} credit deposited — thanks for sticking with us`,
        accent: PURPLE,
      }
    }
    if (baseSrc === 'layer4_weekly_review') {
      return {
        headline: '🧑‍🍳 Weekly review locked in',
        sub: `+AED ${ev.amount_aed} credit deposited — the kitchen reads every one`,
        accent: CYAN,
      }
    }
    if (baseSrc === 'layer4_monthly_review') {
      return {
        headline: '📓 Monthly wrap complete',
        sub: `+AED ${ev.amount_aed} credit deposited — see you next cycle`,
        accent: VIOLET,
      }
    }
    return {
      headline: '🎁 New reward unlocked',
      sub: `+AED ${ev.amount_aed} credit deposited${doublerTag}`,
      accent: CYAN,
    }
  }

  return (
    <div
      className="hub-root"
      style={{
        backgroundColor: BG_DEEP,
        // Three-layer ground:
        //   1. Soft orange top-glow — picks up the brand heartbeat without
        //      shouting it (the same warm tone that haloes the marketing CTA)
        //   2. Marketing hero vertical gradient — navy → teal-navy → deeper navy,
        //      so the hub sits in the same late-night world as the landing page
        //   3. Backed by the BG_DEEP solid for any uncovered corners
        backgroundImage: `
          radial-gradient(ellipse at 50% -15%, rgba(245,127,32,0.14) 0%, transparent 55%),
          linear-gradient(180deg, ${BG_DEEP} 0%, ${BG_MID} 55%, ${BG_GLOW} 100%)
        `,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(16px, 2vw, 24px) clamp(20px, 3vw, 32px)',
        gap: 16,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <HubStyles />
      {/* Marketing-grade SVG grain — same recipe the hero uses (turbulence
          filter at 0.05 opacity) so the hub picks up the brand's tactile
          film-grain warmth instead of feeling like flat digital glass.
          The .hub-root CSS rule (in HubStyles) bumps every direct child to
          z-index 1 so the grain sits underneath everything cleanly. */}
      <svg
        aria-hidden="true"
        className="hub-grain"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
          opacity: 0.05,
          mixBlendMode: 'overlay',
        }}
      >
        <filter id="hub-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="3" />
          <feColorMatrix values="0 0 0 0 1   0 0 0 0 0.65   0 0 0 0 0.30   0 0 0 0.8 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hub-grain)" />
      </svg>

      {/* CELEBRATION BANNER — fires when a fresh reward landed since last
          page open. Slides down from the top with a gradient bar, dismissable
          (X) + auto-dismiss after 14s. The localStorage marker key on the
          newest event id means the same banner never shows twice. */}
      {/* Banner tray — on desktop renders inline in the flex column.
          On mobile, becomes a zero-height overlay so banners float above the
          hero CTA without pushing TopChrome down. */}
      {(celebration || chestState.activeDoubler) && (
        <div className="hub-banner-tray">
          <div className="hub-banner-inner" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {celebration && (() => {
              const copy = celebrationCopy(celebration)
              return (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    flexShrink: 0,
                    padding: '14px 20px',
                    borderRadius: 14,
                    backgroundImage: `linear-gradient(90deg, ${copy.accent}24 0%, ${copy.accent}10 60%, transparent 100%)`,
                    border: `1px solid ${copy.accent}55`,
                    boxShadow: `0 8px 24px ${copy.accent}1f, inset 0 1px 0 ${copy.accent}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 14,
                    animation: 'hub-rise 600ms cubic-bezier(0.16,1,0.3,1) both',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{
                      fontFamily: DISPLAY, fontSize: 16, fontWeight: 900, color: CREAM,
                      letterSpacing: '-0.01em',
                    }}>
                      {copy.headline}
                    </span>
                    <span style={{
                      fontFamily: BODY, fontSize: 12, fontWeight: 700, color: MIST,
                      letterSpacing: '0.02em',
                    }}>
                      {copy.sub}
                      {celebration.amount_aed > 0 && (
                        <> · Wallet now <span style={{ color: copy.accent, fontWeight: 900 }}>AED {wallet}</span></>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={dismissCelebration}
                    aria-label="Dismiss"
                    style={{
                      flexShrink: 0,
                      width: 32, height: 32, borderRadius: '50%',
                      border: `1px solid ${copy.accent}55`,
                      backgroundColor: `${copy.accent}1a`,
                      color: CREAM,
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background-color 220ms ease',
                    }}
                  >
                    <X size={14} strokeWidth={2.6} />
                  </button>
                </div>
              )
            })()}

            {chestState.activeDoubler && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  borderRadius: 12,
                  backgroundImage: `linear-gradient(90deg, ${GOLD}28 0%, ${GOLD_LITE}10 60%, transparent 100%)`,
                  border: `1px solid ${GOLD}66`,
                  boxShadow: `0 6px 18px ${GOLD}1f, inset 0 1px 0 ${GOLD_LITE}33`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <Zap size={16} strokeWidth={2.6} color={GOLD_LITE} />
                <span style={{
                  fontFamily: BODY, fontSize: 12, fontWeight: 900, color: CREAM,
                  letterSpacing: '0.04em',
                }}>
                  2× rewards active
                </span>
                <span style={{
                  fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
                  letterSpacing: '0.02em',
                }}>
                  · Cash for invites + cycle milestones doubled for{' '}
                  <span style={{ color: GOLD_LITE, fontWeight: 900 }}>
                    {formatDoublerRemaining(chestState.activeDoubler.msRemaining)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. TOP CHROME — progression block (clickable) + wallet (clickable)
          + streak chest strip (clickable). The identity initials and
          currentTier props were dropped; the progression block derives
          everything it needs from `recruits` via progressionFor(). */}
      <TopChrome
        recruits={recruits}
        wallet={wallet}
        walletPending={walletPending}
        streak={streak}
        chestState={chestState}
        onChestClick={() => setOpen('chest')}
        onWalletClick={() => setOpen('wallet')}
        onProgressionClick={() => setOpen('progression')}
        earlyAccess={earlyAccess}
        hallWall={hallWall}
      />

      {/* 2. HERO CTA — one massive button, the focal point */}
      <HeroCTA
        onClick={startSendFlow}
        nextCycleMilestone={cycleMilestones.find(m => cycleRecruits < m.at)}
        cycleRecruits={cycleRecruits}
        cashPerRecruit={cashPerRecruit}
      />

      {/* 3. THREE-COLUMN PROGRESS — Cycle, Lifetime, Side Rewards (Layer 4)
          Phase 8E.1: the old Daily Drop / Streak Chest column moved into the
          TopChrome strip (chest progress visualised as 8 flame icons + chest
          icon). The third column slot now hosts the Layer 4 side-rewards
          list so users see all four "more ways to earn" surfaces at parity
          with Cycle + Lifetime instead of buried in a footer ribbon. */}
      <div className="hub-progress-grid" style={{ flex: '0 0 auto' }}>
        <div data-tour="cycle-rewards" style={{ display: 'contents' }}>
          <CycleColumn
            cycleRecruits={cycleRecruits}
            cycleDaysLeft={cycleDaysLeft}
            cycleTotalDays={cycleTotalDays}
            cycleStartsInDays={cycleStartsInDays}
            onOpen={() => setOpen('quests')}
            onMilestoneClick={(at) => focusMilestone('cycle', at)}
            milestones={cycleMilestones}
          />
        </div>
        <div data-tour="lifetime-rewards" style={{ display: 'contents' }}>
          <LifetimeColumn
            recruits={recruits}
            currentTier={currentTier}
            nextTier={nextTier}
            onOpen={() => setOpen('ladder')}
            onMilestoneClick={(at) => focusMilestone('lifetime', at)}
          />
        </div>
        <div data-tour="side-quests" style={{ display: 'contents' }}>
          <SideRewardsColumn
            layer4Rewards={layer4Rewards}
            activeSubscriptionId={activeSubscription?.id ?? null}
            onOpenGoogleReview={() => setOpen('google-review')}
            weeklyReviewState={weeklyReviewState}
            monthlyReviewWindow={monthlyReviewWindow}
            chestState={chestState}
            onOpenChest={() => setOpen('chest')}
            onOpenWeeklyReviews={() => setOpen('weekly-reviews')}
            onOpenMonthlyWrap={() => setOpen('monthly-wrap')}
            onShowInfo={(kind) => setInfoKind(kind)}
          />
        </div>
      </div>

      {/* 4. ACTIVITY + SCOUTS — two-column lower row
          Same responsive treatment via .hub-activity-grid — stacks under
          720px so Activity feed and Scouts each get full width on phones. */}
      <div className="hub-activity-grid" style={{ flex: '1 1 auto', minHeight: 0 }}>
        <ActivityFeed pulseItem={pulseItems[pulseIdx]} pulseItems={pulseItems} />
        <ScoutsStrip
          scouts={scouts}
          onScoutTap={setViewingScout}
          onSendNew={startSendFlow}
          onViewAll={() => setOpen('squad')}
        />
      </div>

      {/* ── MODALS ── */}
      <SendScoutModal
        step={sendStep}
        scoutName={scoutName}
        cashPerRecruit={cashPerRecruit}
        onNameChange={setScoutName}
        onSend={sendLink}
        onClose={closeSendFlow}
        // "Track journey" used to open a phantom scout's journey screen,
        // but we no longer optimistically add a phantom (P1-11 fix). The
        // CTA now just closes the modal — the real scout will appear in
        // the strip once the friend claims the gift on /r/[cid].
        onTrackJourney={closeSendFlow}
      />

      <Modal open={viewingScout !== null} onClose={() => setViewingScout(null)}
        title={viewingScout ? `${viewingScout.name}'s Journey` : ''}
        accent={viewingScout ? stageMeta(viewingScout.stage).color : ORANGE}
      >
        {viewingScout && <JourneyScreen
          scout={viewingScout}
          onNudge={() => nudgeOnWhatsApp(viewingScout.name)}
          onSendAnother={() => { setViewingScout(null); startSendFlow() }}
        />}
      </Modal>

      <Modal open={open === 'quests'} onClose={() => { setOpen(null); setFocusedMilestone(null) }} title="This Month's Rewards" accent={GOLD}>
        <QuestsScreen
          recruitsCycle={cycleRecruits}
          milestones={cycleMilestones}
          focusedAt={focusedMilestone?.kind === 'cycle' ? focusedMilestone.at : null}
        />
      </Modal>
      <Modal open={open === 'ladder'} onClose={() => { setOpen(null); setFocusedMilestone(null) }} title="Lifetime Path" accent={CYAN}>
        <TrophyLadderScreen
          recruits={recruits}
          focusedAt={focusedMilestone?.kind === 'lifetime' ? focusedMilestone.at : null}
        />
      </Modal>
      <Modal open={open === 'chest'} onClose={() => setOpen(null)} title="Streak Chest" accent={GOLD}>
        <StreakChestScreen
          state={chestState}
          onClaimed={(next) => setChestState(next)}
        />
      </Modal>
      <Modal open={open === 'squad'} onClose={() => setOpen(null)} title="Your Squad" accent={PINK}>
        <SquadScreen scouts={scouts} onScoutTap={(s) => { setOpen(null); setViewingScout(s) }} />
      </Modal>
      <Modal open={open === 'google-review'} onClose={() => setOpen(null)} title="Google Review · AED 10" accent={GREEN}>
        <GoogleReviewScreen onClose={() => setOpen(null)} />
      </Modal>
      <Modal open={open === 'wallet'} onClose={() => setOpen(null)} title="Wallet" accent={GOLD}>
        <WalletHistoryModal
          wallet={wallet}
          walletPending={walletPending}
          events={recentRewards}
          weeklyReviewState={weeklyReviewState}
          monthlyWindow={monthlyReviewWindow}
          onClose={() => setOpen(null)}
        />
      </Modal>
      <Modal open={open === 'progression'} onClose={() => setOpen(null)} title="Titles & Progression" accent={progressionFor(recruits).color}>
        <ProgressionScreen recruits={recruits} name={customerName || 'You'} />
      </Modal>
      <Modal
        open={open === 'weekly-reviews'}
        onClose={() => setOpen(null)}
        title="Weekly Reviews"
        accent={CYAN}
      >
        <WeeklyReviewsChooserModal
          weeklyReviewState={weeklyReviewState}
          onClose={() => setOpen(null)}
        />
      </Modal>
      <Modal
        open={open === 'monthly-wrap'}
        onClose={() => setOpen(null)}
        title="Monthly Wrap"
        accent={VIOLET}
      >
        <MonthlyWrapChooserModal
          monthlyReviewWindow={monthlyReviewWindow}
          onStart={() => {
            setOpen(null)
            router.push('/dashboard/menu/review/monthly?from=dorm-wars')
          }}
        />
      </Modal>
      {/* Phase 8K — side-quest info modal. Opens when user taps a passive
          (Done / Locked / Soon / Closed) row in Side Quests. Title +
          accent vary by kind so each quest has its own visual identity. */}
      <Modal
        open={infoKind !== null}
        onClose={() => setInfoKind(null)}
        title={infoKind ? questInfoMeta(infoKind, monthlyReviewWindow.planTier).title : ''}
        accent={infoKind ? questInfoMeta(infoKind, monthlyReviewWindow.planTier).accent : GREEN}
      >
        {infoKind && (
          <QuestInfoScreen
            kind={infoKind}
            weeklyReviewState={weeklyReviewState}
            monthlyReviewWindow={monthlyReviewWindow}
            chestState={chestState}
            googleReviewRow={
              activeSubscription
                ? layer4Rewards.find(r => r.kind === 'google_review' && r.period_key === activeSubscription.id)
                : undefined
            }
            onClose={() => setInfoKind(null)}
            onPrimaryAction={(action) => {
              setInfoKind(null)
              if (action === 'open_google_review_modal') setOpen('google-review')
              else if (action === 'open_chest_modal')    setOpen('chest')
              else if (action === 'open_weekly_review') {
                const w = weeklyReviewState.current?.week ?? weeklyReviewState.late[0]?.week
                if (w) router.push(`/dashboard/menu/review/${w}?from=dorm-wars`)
              }
              else if (action === 'go_to_menu')          router.push('/dashboard/menu')
            }}
          />
        )}
      </Modal>

      {/* Phase 8B — Premium+ gate. Renders on top of the entire hub when
          the user isn't on Monthly Premium / Monthly Max. Hub still SSRs
          underneath (blurred) so the user can see the perks they'd unlock. */}
      {streakTickEvent && (
        <StreakTickOverlay
          event={streakTickEvent}
          onDone={() => setStreakTickEvent(null)}
        />
      )}

      {!dormWarsEligible && <PremiumGateOverlay currentPlanId={currentPlanId} />}

      {showTour && <DormWarsTour onComplete={() => setShowTour(false)} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TIER 4 BADGE — apex perk visual (renamed from "Elite Dormer" to "GOAT"
//  per Phase 8P rank rebrand, but the component name stays so existing
//  imports keep working).
//  Custom-shaped (not a pill) so it reads as the rarest possible status:
//  thin gold border + warm glow + crown emblem + tracked SCREAMING-CAPS
//  label. Two sizes: `sm` for TopChrome inline, `md` for activity feed tags.
// ════════════════════════════════════════════════════════════════════════════

function EliteDormerBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const isSm = size === 'sm'
  const padY = isSm ? 3 : 5
  const padX = isSm ? 8 : 11
  const font = isSm ? 9 : 10
  const iconSize = isSm ? 9 : 11

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: `${padY}px ${padX}px`,
        // Subtle clip-path: chevron tail on the right edge — gives the
        // tag a "stamped insignia" silhouette instead of a pill.
        clipPath: 'polygon(0 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 0 100%)',
        paddingRight: padX + 5,
        backgroundImage: `linear-gradient(135deg, ${GOLD}38 0%, ${GOLD_LITE}20 100%)`,
        border: `1px solid ${GOLD}aa`,
        borderRight: 'none',
        fontFamily: BODY,
        fontSize: font, fontWeight: 900, color: GOLD,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        boxShadow: `0 0 14px ${GOLD}55, inset 0 1px 0 ${GOLD_LITE}33`,
      }}
    >
      <Trophy size={iconSize} strokeWidth={2.6} color={GOLD_LITE} />
      GOAT
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  PREMIUM+ GATE OVERLAY — Phase 8B
//  Renders on top of the entire hub when the user isn't on Monthly Premium
//  or Monthly Max. backdrop-filter: blur(12px) blurs the hub content beneath
//  (which still SSRs so the perk tease is visually backed by the real UI).
//  The card sells the upgrade with a perk teaser list + an upgrade CTA that
//  routes to /dashboard/plan (where the customer can change plan).
// ════════════════════════════════════════════════════════════════════════════

function PremiumGateOverlay({
  currentPlanId,
}: {
  currentPlanId: 'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial' | 'welcome-gift' | null
}) {
  // Copy adapts to the current plan so the upsell lands honestly.
  const sub =
    currentPlanId === 'trial' ? "You're on a trial — upgrade to a Monthly Premium plan to start earning."
      : currentPlanId === 'weekly-flex' ? "Weekly Flex doesn't include Dorm Wars. Upgrade to Monthly Premium to start earning."
        : "Start a Monthly Premium plan to unlock cash for inviting friends, monthly milestones, and lifetime perks."

  const ctaLabel =
    currentPlanId === 'trial' || currentPlanId === 'weekly-flex'
      ? 'Upgrade my plan'
      : 'Pick a plan'
  const ctaHref =
    currentPlanId === 'trial' || currentPlanId === 'weekly-flex'
      ? '/dashboard/plan'
      : '/dashboard/explore-plans'

  const perks: { icon: typeof Gift; label: string; sub: string; color: string }[] = [
    { icon: Coins, label: 'Cash for every friend', sub: 'AED 20–35 per conversion', color: GREEN },
    { icon: Gift, label: 'Monthly milestones', sub: 'Mystery Cash Drops up to AED 90', color: PURPLE },
    { icon: Percent, label: 'Lifetime % off', sub: '5–10% off your plan forever', color: CYAN },
    { icon: Shirt, label: 'Dormers jacket', sub: 'Tier 3 — yours to keep', color: GOLD },
    { icon: Trophy, label: 'GOAT status', sub: '100 invites = 100 free meals', color: GOLD_LITE },
    { icon: Flame, label: 'Streak Chests', sub: 'Open every 7 days for AED + jackpots', color: ORANGE },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-gate-title"
      style={{
        position: 'fixed', inset: 0,
        zIndex: 9000,
        // Backdrop blur: this blurs whatever SSRs underneath, so the user
        // sees the real hub through frosted glass. Layered dark wash on top
        // keeps text legible regardless of underlying contrast.
        backdropFilter: 'blur(14px) saturate(120%)',
        WebkitBackdropFilter: 'blur(14px) saturate(120%)',
        backgroundColor: 'rgba(9,24,37,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 460,
          backgroundColor: 'rgba(22,47,64,0.92)',
          border: `1px solid ${GOLD}55`,
          borderRadius: 18,
          padding: '28px 24px 26px',
          boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 32px ${GOLD}22, inset 0 1px 0 ${GOLD_LITE}22`,
          textAlign: 'center',
        }}
      >
        {/* Eyebrow lock */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px 4px 8px', borderRadius: 999,
          backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}55`,
          marginBottom: 14,
        }}>
          <Lock size={11} strokeWidth={2.6} color={GOLD} />
          <span style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: GOLD,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            Premium perk
          </span>
        </div>

        <h2
          id="premium-gate-title"
          style={{
            fontFamily: DISPLAY, fontSize: 24, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.015em', lineHeight: 1.15,
            margin: '0 0 10px',
          }}
        >
          Dorm Wars is a Premium reward.
        </h2>
        <p style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
          lineHeight: 1.55, margin: '0 0 20px',
        }}>
          {sub}
        </p>

        {/* Perk teaser grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
          marginBottom: 22,
          textAlign: 'left',
        }}>
          {perks.map(p => {
            const Icon = p.icon
            return (
              <div key={p.label} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 10px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
              }}>
                <div style={{
                  flexShrink: 0,
                  width: 24, height: 24, borderRadius: 6,
                  backgroundColor: `${p.color}1f`,
                  border: `1px solid ${p.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 1,
                }}>
                  <Icon size={12} strokeWidth={2.4} color={p.color} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: BODY, fontSize: 11, fontWeight: 800, color: CREAM,
                    lineHeight: 1.25, marginBottom: 2,
                  }}>
                    {p.label}
                  </div>
                  <div style={{
                    fontFamily: BODY, fontSize: 10, fontWeight: 500, color: MIST,
                    lineHeight: 1.35,
                  }}>
                    {p.sub}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA */}
        <a
          href={ctaHref}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '13px 28px', borderRadius: 999,
            backgroundColor: GOLD, color: BG_DEEP,
            fontFamily: BODY, fontSize: 13, fontWeight: 900,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            textDecoration: 'none',
            boxShadow: `0 10px 28px ${GOLD}55`,
          }}
        >
          {ctaLabel}
          <ArrowRight size={14} strokeWidth={2.6} />
        </a>

        <p style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
          letterSpacing: '0.04em', margin: '14px 0 0',
        }}>
          Available on Monthly Premium + Monthly Max
        </p>

        {/* Coda — ineligible users get a way out without breaking the upsell.
            A quiet text link (not a button) so it never competes with the
            gold CTA above. Routes to the dashboard home, not back into
            /dashboard/dorm-wars (which would just re-trigger this overlay). */}
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
            marginTop: 14,
            fontFamily: BODY, fontSize: 12, fontWeight: 600,
            color: MIST,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Not now — back to dashboard
        </a>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  STREAK TICK OVERLAY — full-screen celebration on each new daily visit.
//
//  State machine:
//    first-visit   — count was 0, now 1 (brand new streak)
//    continued     — count incremented by 1, not a chest boundary
//    chest-unlock  — count just crossed a 7-day chest boundary
//    streak-broken — count reset to 1 (missed a day, old progress gone)
//    cycle-reset   — day 28→1 transition (new 4-week cycle begins)
//    same-day      — count unchanged (no overlay)
//    ineligible    — user has no active plan (no overlay)
// ════════════════════════════════════════════════════════════════════════════

type StreakTickEvent =
  | { kind: 'first-visit'; count: 1 }
  | { kind: 'continued'; count: number; daysToChest: number }
  | { kind: 'chest-unlock'; count: number; chestNum: number }
  | { kind: 'streak-broken'; count: 1; oldCount: number }
  | { kind: 'cycle-reset'; count: number; cycleNum: number }

function deriveStreakTickEvent(
  prevCount: number,
  newCount: number,
  lastChestDay: number,
): StreakTickEvent | null {
  if (newCount === prevCount) return null
  if (newCount === 1 && prevCount === 0) return { kind: 'first-visit', count: 1 }
  if (newCount === 1 && prevCount > 1) return { kind: 'streak-broken', count: 1, oldCount: prevCount }

  const prevCycle = prevCount === 0 ? 1 : Math.floor((prevCount - 1) / 28) + 1
  const newCycle = Math.floor((newCount - 1) / 28) + 1
  if (newCycle > prevCycle && newCount > 28) {
    return { kind: 'cycle-reset', count: newCount, cycleNum: newCycle }
  }

  const newLastChestDay = newCount < prevCount ? 0 : lastChestDay
  const gap = newCount - newLastChestDay
  if (gap >= 7 && gap < 14 && (prevCount - newLastChestDay) < 7) {
    const cycleStart = (newCycle - 1) * 28
    const chestInCycle = Math.max(1, Math.min(4, Math.floor((newCount - cycleStart) / 7)))
    return { kind: 'chest-unlock', count: newCount, chestNum: chestInCycle }
  }

  const daysToChest = 7 - (gap % 7 || 7)
  return { kind: 'continued', count: newCount, daysToChest: daysToChest === 0 ? 7 : daysToChest }
}

function StreakTickOverlay({
  event, onDone,
}: {
  event: StreakTickEvent
  onDone: () => void
}) {
  const tier = flameTierForOverlay(event.count)

  useEffect(() => {
    const t = setTimeout(onDone, event.kind === 'chest-unlock' ? 3500 : 2800)
    return () => clearTimeout(t)
  }, [event, onDone])

  let emoji: string
  let headline: string
  let subline: string
  let accentColor = tier.color

  switch (event.kind) {
    case 'first-visit':
      emoji = '🔥'
      headline = 'Day 1'
      subline = 'Your streak begins — visit daily to unlock chests'
      break
    case 'continued':
      emoji = '🔥'
      headline = `Day ${event.count}`
      subline = event.daysToChest === 1
        ? 'One more day until your next chest!'
        : `${event.daysToChest} days to next chest`
      break
    case 'chest-unlock':
      emoji = '🎁'
      headline = `Chest #${event.chestNum} unlocked!`
      subline = 'Tap the streak chip to open it'
      accentColor = GOLD_LITE
      break
    case 'streak-broken':
      emoji = '💨'
      headline = 'Streak reset'
      subline = `${event.oldCount}-day streak ended — Day 1 starts fresh`
      accentColor = MIST_DIM
      break
    case 'cycle-reset':
      emoji = '🔄'
      headline = `Cycle ${event.cycleNum} begins`
      subline = 'New 4-week track — 4 fresh chests to earn'
      break
  }

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(9,24,37,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'hub-streak-overlay-in 400ms cubic-bezier(0.16,1,0.3,1) both',
        cursor: 'pointer',
        padding: 32,
      }}
    >
      <div style={{
        fontSize: 56, lineHeight: 1,
        animation: 'hub-streak-emoji-pop 500ms cubic-bezier(0.16,1,0.3,1) both',
        marginBottom: 16,
      }}>
        {emoji}
      </div>
      <div style={{
        fontFamily: DISPLAY, fontSize: 36, fontWeight: 900,
        color: accentColor, letterSpacing: '-0.02em',
        textAlign: 'center', lineHeight: 1.1,
        animation: 'hub-streak-text-up 500ms cubic-bezier(0.16,1,0.3,1) 120ms both',
        textShadow: `0 0 24px ${accentColor}66`,
      }}>
        {headline}
      </div>
      <div style={{
        fontFamily: BODY, fontSize: 14, fontWeight: 600,
        color: CREAM, opacity: 0.75,
        marginTop: 8, textAlign: 'center', lineHeight: 1.4,
        animation: 'hub-streak-text-up 500ms cubic-bezier(0.16,1,0.3,1) 220ms both',
        maxWidth: 280,
      }}>
        {subline}
      </div>
      <div style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 600,
        color: MIST_DIM, marginTop: 24,
        animation: 'hub-streak-text-up 500ms cubic-bezier(0.16,1,0.3,1) 400ms both',
      }}>
        Tap anywhere to continue
      </div>
    </div>
  )
}

// Overlay needs flameTier but the function is defined below — thin wrapper
// avoids a forward-reference issue. The real flameTier is used once it's defined.
function flameTierForOverlay(count: number): { color: string } {
  if (count < 8) return { color: '#ff9466' }
  if (count < 15) return { color: '#f57f20' }
  if (count < 22) return { color: '#f57f20' }
  if (count < 29) return { color: GOLD_LITE }
  if (count < 40) return { color: GOLD_LITE }
  if (count < 50) return { color: PURPLE }
  if (count < 60) return { color: '#4fa9d6' }
  if (count < 70) return { color: CYAN }
  if (count < 80) return { color: GREEN }
  if (count < 90) return { color: PINK }
  return { color: GOLD }
}

// ════════════════════════════════════════════════════════════════════════════
//  STREAK FLAME — Phase 8E intensity tiers
//
//  Days 1-7    : pale orange (warming up)
//  Days 8-14   : solid orange + glow (chest 1 earned)
//  Days 15-21  : bright orange + stronger glow
//  Days 22-28  : peak orange + animated flame (cap for one plan cycle)
//  Days 29-39  : peak orange (sustaining beyond cap — needs new plan)
//  Days 40-49  : purple flame (epic tier 1)
//  Days 50-59  : blue flame (epic tier 2)
//  Days 60-69  : cyan flame (epic tier 3)
//  Days 70-79  : forest green flame (epic tier 4)
//  Days 80-89  : pink flame (epic tier 5)
//  Days 90+    : gold supernova (epic tier 6, uncapped)
//
//  Each post-28 tier adds intensity (deeper glow + pulsing). Day-28 is the
//  intentional "peak for a single plan cycle" — to push higher the user must
//  renew/extend their plan and continue visiting daily.
// ════════════════════════════════════════════════════════════════════════════

interface FlameTier {
  color: string
  glow: string   // box-shadow color value
  glowSize: number   // px
  animated: boolean  // true for peak + epic tiers
}

function flameTier(count: number): FlameTier {
  // Pre-cap ladder
  if (count < 8) return { color: '#ff9466', glow: '#ff946622', glowSize: 0, animated: false } // pale
  if (count < 15) return { color: '#f57f20', glow: `${GOLD}44`, glowSize: 6, animated: false } // chest-1
  if (count < 22) return { color: '#f57f20', glow: `${GOLD}77`, glowSize: 10, animated: false } // brighter
  if (count < 29) return { color: GOLD_LITE, glow: `${GOLD}bb`, glowSize: 14, animated: true } // peak (cap)
  // Post-28 epic tiers — every 10 days a new color
  if (count < 40) return { color: GOLD_LITE, glow: `${GOLD}bb`, glowSize: 14, animated: true } // sustain peak
  if (count < 50) return { color: PURPLE, glow: `${PURPLE}bb`, glowSize: 16, animated: true } // purple
  if (count < 60) return { color: '#4fa9d6', glow: '#4fa9d6bb', glowSize: 16, animated: true } // blue
  if (count < 70) return { color: CYAN, glow: `${CYAN}bb`, glowSize: 18, animated: true } // cyan
  if (count < 80) return { color: GREEN, glow: `${GREEN}bb`, glowSize: 18, animated: true } // forest
  if (count < 90) return { color: PINK, glow: `${PINK}bb`, glowSize: 20, animated: true } // pink
  return { color: GOLD, glow: `${GOLD}ee`, glowSize: 24, animated: true } // supernova
}

// Phase 8E (revised) — StreakChestStrip replaces the simple flame chip.
// Shows the chest-progress visually: 8 flame icons that light up one at a
// time as the user walks toward their next chest, followed by a chest icon
// at the end. Each lit flame is brighter + more animated than the previous,
// crescendoing toward the chest. When all 8 are lit, the chest pulses gold
// and clicking it opens the claim modal. Streak break = back to 0 flames lit.
//
// The flame BASE color follows the epic-tier ladder (orange → purple → blue
// → cyan → forest → pink → supernova-gold) so a day-50 user's strip is blue
// instead of orange even when chest progress resets.
// Phase 8M — the streak chip collapses to a single Flame + day count +
// Gift icon. Whole pill is clickable; opens the expanded streak calendar
// modal. Sized to match the wallet pill (8/10/8/16 padding, stacked label
// + number) so they read as a pair of equally-weighted status modules.
function StreakChestStrip({
  count, chestReady, onChestClick,
}: {
  count: number   // total streak days (drives flame color tier)
  chestReady: boolean
  onChestClick: () => void
}) {
  const tier = flameTier(count)

  return (
    <button
      type="button"
      onClick={onChestClick}
      aria-label={
        chestReady
          ? `Streak chest ready — ${count}-day streak, open calendar`
          : `${count}-day streak — open calendar`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 16px 8px 10px', borderRadius: 999,
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.32) 100%)`,
        border: `1.5px solid ${tier.color}88`,
        boxShadow: tier.glowSize > 0
          ? `0 4px 14px rgba(0,0,0,0.5), 0 0 ${Math.max(10, tier.glowSize - 2)}px ${tier.glow}`
          : `0 4px 14px rgba(0,0,0,0.5)`,
        color: 'inherit', cursor: 'pointer',
        transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 220ms ease',
      }}
      className="hub-chip-tap"
    >
      {/* Single flame icon — tier-colored, gently flickers on long streaks
          to convey "this is alive" without the previous 8-flame parade. */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        filter: tier.glowSize > 0 ? `drop-shadow(0 0 6px ${tier.color})` : 'none',
        animation: tier.animated ? 'hub-flame-flicker 2.4s ease-in-out infinite' : undefined,
      }}>
        <Flame size={22} strokeWidth={2.4} color={tier.color} />
      </span>

      {/* Stacked label + count — mirrors the wallet pill's layout exactly
          so the two chips align visually as a matched pair. */}
      <div style={{ textAlign: 'left' }}>
        <div className="hub-chip-eyebrow" style={{
          fontFamily: BODY, fontSize: 8, fontWeight: 900, color: tier.color,
          letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
        }}>
          Streak
        </div>
        <div className="hub-chip-value" style={{
          fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
          letterSpacing: '-0.02em', lineHeight: 1.1, fontFeatureSettings: '"tnum"',
          marginTop: 2,
        }}>
          {count}d
        </div>
      </div>

      {/* Gift box — always visible. Dim/muted when no chest is ready,
          pulsing gold with a halo ring when a chest is claimable. The
          gift sits inside the same chip so the affordance "click to see
          your reward calendar" is one tap target, not two. */}
      <span style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%',
        backgroundColor: chestReady ? `${GOLD}22` : 'rgba(0,0,0,0.35)',
        border: `1px solid ${chestReady ? `${GOLD}88` : `${GOLD_LITE}55`}`,
        boxShadow: chestReady ? `0 0 12px ${GOLD}88, inset 0 0 6px ${GOLD}44` : `inset 0 0 4px ${GOLD_LITE}22`,
        flexShrink: 0,
        marginLeft: 2,
        transition: 'background-color 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
      }}>
        <Gift
          size={14}
          strokeWidth={2.6}
          color={GOLD_LITE}
          style={{
            animation: chestReady ? 'hub-cta-pulse 2.2s ease-in-out infinite' : undefined,
          }}
        />
        {chestReady && (
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            '--pr-color': `${GOLD}88`,
            animation: 'hub-pulse-ring 2.2s ease-out infinite',
            pointerEvents: 'none',
          } as React.CSSProperties} />
        )}
      </span>
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TOP CHROME — single horizontal row with identity + wallet + streak + sound
// ════════════════════════════════════════════════════════════════════════════

function TopChrome({
  recruits, wallet, walletPending, streak, chestState, onChestClick, onWalletClick, onProgressionClick,
  earlyAccess, hallWall,
}: {
  recruits: number
  wallet: number
  /** Phase 8K Model C — AED locked in pending review credits (not spendable yet). */
  walletPending: number
  streak: number
  chestState: StreakChestState
  onChestClick: () => void
  onWalletClick: () => void
  onProgressionClick: () => void
  earlyAccess: boolean
  hallWall: boolean
}) {
  const progression = progressionFor(recruits)
  const NextProgression = PROGRESSION_TITLES.find(p => p.threshold > recruits) ?? null
  const toNext = NextProgression ? NextProgression.threshold - recruits : 0

  // Phase 8P — progress ring around the avatar. Replaces the old
  // "X to NextTier" text fragment. Ring fill = recruits earned between
  // the current tier's threshold and the next one. At apex (no next
  // tier), ring shows full so the avatar reads as "complete" rather
  // than "still working on something".
  const ringPct = NextProgression
    ? Math.max(0, Math.min(1, (recruits - progression.threshold) / (NextProgression.threshold - progression.threshold)))
    : 1
  const isApex = !NextProgression
  // SVG ring math — single circle stroke, dasharray = full circumference,
  // dashoffset shrinks as ringPct grows. r=21 gives a 2px gap around the
  // 36px avatar inside a 46px svg viewport.
  const RING_R = 21
  const RING_CIRC = 2 * Math.PI * RING_R
  return (
    <header className="hub-topchrome" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {/* Identity — clickable progression block. The avatar is the tier
          glyph (Crown for Elite, Award for Captain, etc.) instead of the
          old name initials. Title pill + tagline live under the name.
          Tapping anywhere on the block opens the Progression modal with
          the full ladder. */}
      <button
        type="button"
        onClick={onProgressionClick}
        aria-label={`${progression.title} · view progression`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0,
          width: 'fit-content',
          padding: '6px 14px 6px 6px', borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.45)',
          border: `1px solid ${progression.color}77`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          color: 'inherit', cursor: 'pointer',
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease',
        }}
        className="hub-chip-tap"
      >
        {/* Tier glyph avatar wrapped in a progress ring. The ring fills
            with progress toward the next tier — visual replacement for
            the old "X to NextTier" text fragment. At apex, the ring is
            full and uses the tier color directly so the avatar reads as
            "you've arrived" rather than "still working on it".
            ringColor target = next tier's color so the ring previews
            what the user is climbing toward (motivational). */}
        <span style={{
          position: 'relative',
          width: 46, height: 46,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg
            width={46} height={46} viewBox="0 0 46 46"
            style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            {/* Background ring — full circle in dim color so the unfilled
                portion still has presence (rather than disappearing). */}
            <circle
              cx={23} cy={23} r={RING_R}
              fill="none"
              stroke={isApex ? `${progression.color}55` : `${(NextProgression?.color ?? progression.color)}22`}
              strokeWidth={2}
            />
            {/* Progress ring — drawn on top, shows current fill. */}
            <circle
              cx={23} cy={23} r={RING_R}
              fill="none"
              stroke={isApex ? progression.color : (NextProgression?.color ?? progression.color)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={RING_CIRC * (1 - ringPct)}
              style={{
                transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)',
                filter: isApex ? `drop-shadow(0 0 4px ${progression.color}aa)` : undefined,
              }}
            />
          </svg>
          {/* Avatar disc — sits inside the ring with a 2px gap. */}
          <span style={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundImage: `radial-gradient(circle at 30% 30%, ${progression.color}66 0%, ${BG_MID} 70%, ${BG_DEEP} 100%)`,
            border: `1.5px solid ${progression.color}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
            position: 'relative',
          }}>
            <progression.Icon size={18} strokeWidth={2.4} color={progression.color} />
          </span>
        </span>
        <div className="hub-identity-text" style={{ minWidth: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Eyebrow — matches the wallet/streak chip rhythm. At apex,
              the eyebrow reads "APEX TIER" instead of "TIER" so the
              chip telegraphs the user's terminal status without needing
              a third row. */}
          <div style={{
            fontFamily: BODY, fontSize: 8, fontWeight: 900, color: progression.color,
            letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
          }}>
            {isApex ? 'Apex Tier' : NextProgression ? `${toNext} to ${NextProgression.title}` : 'Tier'}
          </div>
          {/* Value — the title at chrome scale (18px display) so it
              reads as the primary identity, not a label. */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            lineHeight: 1.1, marginTop: 2,
          }}>
            <span style={{
              fontFamily: DISPLAY, fontSize: 18, fontWeight: 900,
              color: progression.color, letterSpacing: '-0.02em',
            }}>
              {progression.title}
            </span>
            {/* Perk badges — early access + elite. Tier-adjacent perks
                that hang off the title without competing for primary
                position. */}
            {earlyAccess && (
              <span style={{
                padding: '2px 7px', borderRadius: 999,
                backgroundColor: `${GREEN}1f`,
                border: `1px solid ${GREEN}66`,
                fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GREEN,
                letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1,
              }}>
                Early Access
              </span>
            )}
            {hallWall && <EliteDormerBadge size="sm" />}
          </div>
        </div>
      </button>

      {/* Wallet + Streak — paired chips, matched height + padding so they
          read as a single status row. Both clickable; wallet opens the
          history of credits, streak opens the calendar of reward boxes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Wallet button — the most important value. Clicking opens the
            wallet history modal showing every credit that has landed. */}
        <button
          type="button"
          onClick={onWalletClick}
          title="See where every AED came from"
          aria-label={`Wallet AED ${wallet} — view history`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 16px 8px 10px', borderRadius: 999,
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.32) 100%)`,
            border: `1.5px solid ${GOLD}66`,
            boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 18px ${GOLD}33`,
            color: 'inherit', cursor: 'pointer',
            transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 220ms ease, border-color 220ms ease',
          }}
          className="hub-chip-tap"
        >
          <CoinIcon size={26} />
          <div style={{ textAlign: 'left' }}>
            <div className="hub-chip-eyebrow" style={{
              fontFamily: BODY, fontSize: 8, fontWeight: 900, color: GOLD,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Wallet
            </div>
            {/* Phase 8K Model C — pending qualifier sits inline beside the
                AED value. Tight horizontal coupling reinforces "this is
                metadata about the wallet figure"; tnum keeps the +N
                numerals aligned. Word "pending" lives in the wallet modal
                so the pill doesn't stretch wider than the streak chip. */}
            <div style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              marginTop: 2, lineHeight: 1.1,
            }}>
              <span className="hub-chip-value" style={{
                fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
                letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"',
                whiteSpace: 'nowrap',
              }}>
                <span className="hub-chip-unit">AED </span>{wallet}
              </span>
              {walletPending > 0 && (
                <span className="hub-chip-pending" style={{
                  fontFamily: BODY, fontSize: 10, fontWeight: 800, color: GOLD_LITE,
                  letterSpacing: '0.02em', fontFeatureSettings: '"tnum"',
                }}>
                  +{walletPending}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Phase 8M — collapsed streak chip (flame + day count + gift).
            Whole pill opens the expanded streak-calendar modal where the
            user sees the 4-week reward layout and can claim ready chests. */}
        <div data-tour="streak-chest" style={{ display: 'contents' }}>
          <StreakChestStrip
            count={streak}
            chestReady={chestState.chestReady}
            onChestClick={onChestClick}
          />
        </div>

      </div>
    </header>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  HERO CTA — the focal point. Massive button, one line of copy, breathing.
// ════════════════════════════════════════════════════════════════════════════

function HeroCTA({
  onClick, nextCycleMilestone, cycleRecruits, cashPerRecruit,
}: {
  onClick: () => void
  nextCycleMilestone?: CycleMilestone
  cycleRecruits: number
  /** Exact AED the user's current rung pays per recruit — shown verbatim. */
  cashPerRecruit: number
}) {
  const recruitsLeft = nextCycleMilestone ? nextCycleMilestone.at - cycleRecruits : 0
  return (
    <section style={{
      flex: '0 0 auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 14,
      padding: 'clamp(16px, 2vw, 28px) 0',
      textAlign: 'center',
    }}>
      {/* Tagline */}
      <div style={{
        fontFamily: BODY, fontSize: 'clamp(15px, 1.4vw, 18px)', fontWeight: 500,
        color: MIST,
        letterSpacing: '0.01em',
        maxWidth: 620, lineHeight: 1.4,
      }}>
        Earn <span style={{ color: GOLD_LITE, fontWeight: 800 }}>AED {cashPerRecruit}</span> every time a friend joins Dormers.
      </div>

      {/* THE button — restrained sizing per top-design audit. Previous scale
          dominated the viewport without delivering more action affordance. */}
      <button
        type="button"
        onClick={onClick}
        className="hub-cta"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 12,
          padding: 'clamp(13px, 1.6vw, 18px) clamp(26px, 3.6vw, 40px)',
          borderRadius: 999,
          backgroundImage: `linear-gradient(135deg, ${ORANGE} 0%, ${GOLD} 50%, ${ORANGE_LITE} 100%)`,
          border: '2px solid rgba(255,225,140,0.95)',
          color: BG_DEEP,
          fontFamily: BODY, fontSize: 'clamp(14px, 1.5vw, 17px)', fontWeight: 900,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          cursor: 'pointer',
          animation: 'hub-cta-pulse 2.6s ease-in-out infinite, hub-cta-bob 4s ease-in-out infinite',
          minWidth: 240,
          boxShadow: `0 12px 32px ${ORANGE}55, 0 0 0 1px rgba(0,0,0,0.2)`,
        }}
      >
        <Send size={18} strokeWidth={2.8} />
        Send a Free Meal
        <ArrowRight size={18} strokeWidth={2.8} />
      </button>

      {/* Helper text — sets up what happens */}
      <div style={{
        fontFamily: BODY, fontSize: 12, fontWeight: 500,
        color: MIST_DIM, letterSpacing: '0.03em',
        maxWidth: 540,
      }}>
        Opens WhatsApp · they eat their first meal free · you earn when they subscribe
      </div>

      {/* If there's a near-term milestone, hint it directly under the CTA.
          Explicit RECRUITS unit + Users icon so the number reads as a
          quantity of people, not an abstract counter. */}
      {nextCycleMilestone && (
        <div style={{
          marginTop: 4,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 999,
          backgroundColor: `${nextCycleMilestone.color}14`,
          border: `1px solid ${nextCycleMilestone.color}55`,
          fontFamily: BODY, fontSize: 11, fontWeight: 800,
          color: CREAM,
          letterSpacing: '0.04em',
        }}>
          <Users size={12} strokeWidth={2.6} color={nextCycleMilestone.color} />
          <span>
            <span style={{ color: nextCycleMilestone.color, fontWeight: 900, fontFeatureSettings: '"tnum"' }}>{recruitsLeft}</span>
            {' '}more {recruitsLeft === 1 ? 'recruit' : 'recruits'} {recruitsLeft === 1 ? 'unlocks' : 'unlock'}{' '}
            <span style={{ color: nextCycleMilestone.color, fontWeight: 900 }}>{nextCycleMilestone.label}</span>
          </span>
        </div>
      )}
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  COLUMN SHELL — shared styling for the 3 progress columns
// ════════════════════════════════════════════════════════════════════════════

function Column({
  eyebrow, title, accent, icon: Icon, onOpen, children,
}: {
  eyebrow: string
  title: string
  accent: string
  icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  onOpen?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        padding: 18,
        borderRadius: 16,
        // Tinted-glass surface — separates each card from the navy backdrop
        // with a hairline accent wash + brighter top edge + ambient shadow.
        // Single biggest readability fix per top-design audit.
        backgroundColor: `${accent}10`,
        backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)`,
        border: `1px solid ${accent}55`,
        boxShadow: `0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        gap: 10,
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, background-color 220ms ease',
      }}
      className={onOpen ? 'hub-column-tap' : undefined}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        {/* Eyebrow + icon — small accent-tinted icon tile sits beside the
            eyebrow label so each card has its own recognisable glyph at
            a glance, not just a typographic label. */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {Icon && (
            <span style={{
              width: 22, height: 22, borderRadius: 6,
              backgroundColor: `${accent}22`,
              border: `1px solid ${accent}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon size={12} strokeWidth={2.4} color={accent} />
            </span>
          )}
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900,
            color: accent, letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>
            {eyebrow}
          </div>
        </div>
        {onOpen && (
          // Brighter pill rather than near-invisible dim text — the affordance
          // was getting lost in the card chrome. Accent-tinted bg + clear border.
          <span style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 800,
            color: accent, letterSpacing: '0.10em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999,
            backgroundColor: `${accent}1f`,
            border: `1px solid ${accent}55`,
            transition: 'background-color 220ms ease',
          }}>
            Details <ArrowRight size={10} strokeWidth={2.6} />
          </span>
        )}
      </div>
      {/* Title block reserves two lines of height (line-height 1.15 ×
          2 ≈ 2.3em) so cards with 1-line vs 2-line titles still align
          their bodies at the same Y position. Without this, the progress
          bars in This Month + Lifetime Path land on different horizontal
          rows. Empty titles skip the slot entirely so the activity-row
          cards (Happening Now, Your Squad) don't pay the height cost. */}
      {title && (
        <div style={{
          fontFamily: DISPLAY, fontSize: 'clamp(16px, 1.5vw, 19px)', fontWeight: 900,
          color: CREAM, letterSpacing: '-0.01em', lineHeight: 1.15,
          minHeight: '2.3em',
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  CYCLE COLUMN — Layer 2 cycle milestones progress
// ════════════════════════════════════════════════════════════════════════════

function CycleColumn({
  cycleRecruits, cycleDaysLeft, cycleTotalDays, cycleStartsInDays, onOpen, onMilestoneClick, milestones,
}: {
  cycleRecruits: number
  cycleDaysLeft: number
  cycleTotalDays: number
  cycleStartsInDays: number
  onOpen: () => void
  /** Click handler for individual milestone dots — focuses the matching
   *  row in the opened This Month modal so the user sees their click
   *  land on the right milestone instead of a generic modal. */
  onMilestoneClick: (at: number) => void
  milestones: CycleMilestone[]
}) {
  void cycleTotalDays
  // cycleStartsInDays > 0 means the user's sub hasn't started yet (Scheduled
  // status, queued after a current sub). Show "Starts in N days" instead of
  // "N days left in cycle" — the cycle is not counting down yet.
  const notYetStarted = cycleStartsInDays > 0
  const cycleMax = milestones[milestones.length - 1].at
  const fillPct = Math.min(100, (cycleRecruits / cycleMax) * 100)
  const nextIdx = milestones.findIndex(m => cycleRecruits < m.at)

  return (
    <Column eyebrow="This Month" title="Burst goals for big bonuses" accent={GOLD} icon={Calendar} onOpen={onOpen}>
      <div style={{ position: 'relative', height: 44, marginTop: 6 }}>
        {/* Inner container inset 16px each side — prevents the last milestone
            dot (max 32px wide) from overflowing the card's right padding */}
        <div style={{ position: 'absolute', left: 16, right: 16, top: 0, bottom: 0 }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            height: 4, transform: 'translateY(-50%)',
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 2,
          }} />
          <div style={{
            position: 'absolute', left: 0, top: '50%',
            width: `${fillPct}%`, height: 4, transform: 'translateY(-50%)',
            backgroundImage: `linear-gradient(90deg, ${GREEN} 0%, ${GOLD} 100%)`,
            borderRadius: 2,
            boxShadow: `0 0 8px ${GOLD}88`,
            transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
          }} />
          {fillPct > 0 && fillPct < 100 && (
            <div style={{
              position: 'absolute', left: `${fillPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: CREAM,
              border: '2px solid rgba(255,255,255,0.95)',
              zIndex: 3,
              animation: 'hub-head-pulse 1.8s ease-in-out infinite',
            }} />
          )}
          {milestones.map((m, i) => {
            const leftPct = (m.at / cycleMax) * 100
            const earned = cycleRecruits >= m.at
            const isNext = i === nextIdx
            const Emblem = m.Emblem
            const dotSize = isNext ? 32 : 26
            return (
              <button
                type="button"
                key={m.at}
                className="hub-milestone-dot"
                aria-label={`Reveal ${m.label} milestone — ${m.value}`}
                onClick={() => onMilestoneClick(m.at)}
                style={{
                  position: 'absolute', left: `${leftPct}%`, top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: dotSize, height: dotSize, borderRadius: '50%',
                  backgroundColor: earned ? m.color : 'rgba(0,0,0,0.85)',
                  border: earned
                    ? `2px solid ${m.color}`
                    : isNext ? `2.5px solid ${m.color}`
                      : `1.5px solid ${m.color}77`,
                  boxShadow: earned
                    ? `0 0 10px ${m.color}aa`
                    : isNext ? `0 0 14px ${m.color}aa`
                      : `0 0 4px ${m.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: isNext ? 3 : 2,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <Emblem size={isNext ? 16 : 13} strokeWidth={2.6} color={earned ? BG_DEEP : m.color} />
                <span className="hub-dot-tip">Click to reveal</span>
                {isNext && (
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    '--mh-color': `${m.color}99`,
                    animation: 'hub-milestone-halo 2.4s ease-out infinite',
                    pointerEvents: 'none',
                  } as React.CSSProperties} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
        <div style={{ position: 'absolute', left: 16, right: 16, top: 0, bottom: 0 }}>
          {milestones.map((m) => {
            const reached = cycleRecruits >= m.at
            return (
              <span key={m.at} style={{
                position: 'absolute',
                left: `${(m.at / cycleMax) * 100}%`,
                transform: 'translateX(-50%)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: BODY, fontSize: 11, fontWeight: 900,
                color: reached ? m.color : 'rgba(237,232,218,0.85)',
                fontFeatureSettings: '"tnum"',
                textShadow: reached ? `0 0 6px ${m.color}66` : 'none',
              }}>
                <Users size={10} strokeWidth={2.8} />
                {m.at}
              </span>
            )
          })}
        </div>
      </div>

      {/* Status block — explicit RECRUITS unit + Users icon so the number
          reads as a quantity of people, not an abstract counter. */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {/* PRIMARY line — the immediate next goal. Display weight, mixed
            cream + milestone color. If the user has cleared every
            milestone this cycle, the line celebrates that instead.
            SECONDARY line — quiet metadata (count + cycle timing) in
            mist, so the eye lands on the next-step phrase, not the
            three-equal-rank stack the old design produced. */}
        {(() => {
          const nextMilestone = milestones[nextIdx >= 0 ? nextIdx : milestones.length - 1]
          const allDone = nextIdx === -1
          const max = milestones[milestones.length - 1].at
          const remaining = allDone ? 0 : nextMilestone.at - cycleRecruits
          return (
            <>
              <div style={{
                fontFamily: BODY, fontSize: 14, fontWeight: 800, color: CREAM,
                lineHeight: 1.25, letterSpacing: '-0.01em',
              }}>
                {allDone ? (
                  <>All <span style={{ color: GOLD_LITE, fontWeight: 900 }}>{milestones.length}</span> milestones cleared this cycle</>
                ) : (
                  <>
                    <span style={{ color: nextMilestone.color, fontWeight: 900, fontFeatureSettings: '"tnum"' }}>
                      {remaining}
                    </span>{' '}
                    more {remaining === 1 ? 'recruit' : 'recruits'} to{' '}
                    <span className="hub-shimmer" style={{ color: nextMilestone.color, fontWeight: 900 }}>{nextMilestone.label}</span>
                  </>
                )}
              </div>
              <div style={{
                marginTop: 4,
                fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
                fontFeatureSettings: '"tnum"',
              }}>
                {cycleRecruits} of {max} this cycle
                {' · '}
                {notYetStarted
                  ? <>starts in {cycleStartsInDays}d</>
                  : <>{cycleDaysLeft}d left</>}
              </div>
            </>
          )
        })()}
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  LIFETIME COLUMN — Layer 1 (cash tier) + Layer 3 (perk tier) combined
// ════════════════════════════════════════════════════════════════════════════

function LifetimeColumn({
  recruits, currentTier, nextTier, onOpen, onMilestoneClick,
}: {
  recruits: number
  currentTier: (typeof TIERS)[number] | null
  nextTier: (typeof TIERS)[number] | null
  onOpen: () => void
  /** Click handler for individual tier dots — focuses the matching row
   *  in the opened Lifetime Path modal, same pattern as CycleColumn. */
  onMilestoneClick: (at: number) => void
}) {
  const lifeMax = LIFETIME_TIERS[LIFETIME_TIERS.length - 1].at
  const fillPct = Math.min(100, (recruits / lifeMax) * 100)
  const nextIdx = LIFETIME_TIERS.findIndex(t => recruits < t.at)

  // Layer 1 cash for current tier — used in the body line. Resolved straight
  // from the ladder function so it can't drift from the label parsing.
  const currentCash = cashForLifetimeConversion(recruits)

  return (
    <Column eyebrow="Lifetime Path" title="Permanent perks unlock as you climb" accent={CYAN} icon={Trophy} onOpen={onOpen}>
      <div style={{ position: 'relative', height: 44, marginTop: 6 }}>
        <div style={{ position: 'absolute', left: 16, right: 16, top: 0, bottom: 0 }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            height: 4, transform: 'translateY(-50%)',
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 2,
          }} />
          <div style={{
            position: 'absolute', left: 0, top: '50%',
            width: `${fillPct}%`, height: 4, transform: 'translateY(-50%)',
            backgroundImage: `linear-gradient(90deg, ${CYAN} 0%, ${GOLD} 100%)`,
            borderRadius: 2,
            boxShadow: `0 0 8px ${CYAN}88`,
            transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
          }} />
          {fillPct > 0 && fillPct < 100 && (
            <div style={{
              position: 'absolute', left: `${fillPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: CREAM,
              border: '2px solid rgba(255,255,255,0.95)',
              zIndex: 3,
              animation: 'hub-head-pulse 1.8s ease-in-out infinite',
            }} />
          )}
          {LIFETIME_TIERS.map((t, i) => {
            const leftPct = (t.at / lifeMax) * 100
            const earned = recruits >= t.at
            const isNext = i === nextIdx
            const Emblem = t.Emblem
            const dotSize = isNext ? 32 : 26
            return (
              <button
                type="button"
                key={t.at}
                className="hub-milestone-dot"
                aria-label={`Reveal ${t.label} tier`}
                onClick={() => onMilestoneClick(t.at)}
                style={{
                  position: 'absolute', left: `${leftPct}%`, top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: dotSize, height: dotSize, borderRadius: '50%',
                  backgroundColor: earned ? t.color : 'rgba(0,0,0,0.85)',
                  border: earned
                    ? `2px solid ${t.color}`
                    : isNext ? `2.5px solid ${t.color}`
                      : `1.5px solid ${t.color}77`,
                  boxShadow: earned
                    ? `0 0 10px ${t.color}aa`
                    : isNext ? `0 0 14px ${t.color}aa`
                      : `0 0 4px ${t.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: isNext ? 3 : 2,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <Emblem size={isNext ? 16 : 13} strokeWidth={2.6} color={earned ? BG_DEEP : t.color} />
                <span className="hub-dot-tip">Click to reveal</span>
                {isNext && (
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    '--mh-color': `${t.color}99`,
                    animation: 'hub-milestone-halo 2.4s ease-out infinite',
                    pointerEvents: 'none',
                  } as React.CSSProperties} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
        <div style={{ position: 'absolute', left: 16, right: 16, top: 0, bottom: 0 }}>
          {LIFETIME_TIERS.map((t) => {
            const reached = recruits >= t.at
            return (
              <span key={t.at} style={{
                position: 'absolute',
                left: `${(t.at / lifeMax) * 100}%`,
                transform: 'translateX(-50%)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: BODY, fontSize: 11, fontWeight: 900,
                color: reached ? t.color : 'rgba(237,232,218,0.85)',
                fontFeatureSettings: '"tnum"',
                textShadow: reached ? `0 0 6px ${t.color}66` : 'none',
              }}>
                <Users size={10} strokeWidth={2.8} />
                {t.at}
              </span>
            )
          })}
        </div>
      </div>

      {/* Two-tier body. PRIMARY tells the user the next tier and what it
          unlocks (the live action). SECONDARY shows lifetime count + cash
          rate as quiet supporting context. The old three-stacked-lines
          equal-weight pattern is gone — the eye now lands on one phrase. */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {nextTier ? (
          <div style={{
            fontFamily: BODY, fontSize: 14, fontWeight: 800, color: CREAM,
            lineHeight: 1.25, letterSpacing: '-0.01em',
          }}>
            <span style={{ color: nextTier.color, fontWeight: 900, fontFeatureSettings: '"tnum"' }}>
              {nextTier.threshold - recruits}
            </span>{' '}
            more {nextTier.threshold - recruits === 1 ? 'recruit' : 'recruits'} to{' '}
            <span className="hub-shimmer" style={{ color: nextTier.color, fontWeight: 900 }}>{nextTier.perk}</span>
          </div>
        ) : (
          <div style={{
            fontFamily: BODY, fontSize: 14, fontWeight: 800, color: CREAM,
            lineHeight: 1.25, letterSpacing: '-0.01em',
          }}>
            <span style={{ color: GOLD_LITE, fontWeight: 900 }}>Apex tier</span> — every perk unlocked
          </div>
        )}
        <div style={{
          marginTop: 4,
          fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
          fontFeatureSettings: '"tnum"',
        }}>
          {recruits} lifetime · earning AED {currentCash}/recruit
          {currentTier && <> · {currentTier.perk}</>}
        </div>
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SIDE REWARDS COLUMN — Phase 8G (Layer 4 wired)
//
//  Per-kind status:
//    • anniversary        — auto-fired on hub load; row exists when earned
//    • google_review      — self-attest button → pending review queue
//    • weekly_survey      — Coming soon (product spec pending)
//    • renew_invite_combo — Coming soon (product spec pending)
//
//  Status chip variants:
//    • Earned (status='auto_approved' or 'approved')
//    • Pending (status='pending', awaiting ops review)
//    • Tap to claim (no row yet, can be self-attested)
//    • Coming soon (no spec yet)
// ════════════════════════════════════════════════════════════════════════════

// Map the SIDE_REWARDS display rows to canonical Layer4 kinds for status
// lookup. Only google_review uses the layer4_rewards table now — review
// rows read state from weeklyReviewState + monthlyReviewWindow props,
// and the Weekly Streak Reward row mirrors the existing streak chest
// (state from chestState, click opens the chest modal).
const LAYER4_KIND_BY_LABEL: Record<string, Layer4Kind> = {
  'Google review': 'google_review',
}

// Phase 8K — Side-quest info modal kinds. Used by passive rows that have
// no immediate action (Done, Locked, Soon, Closed) — tapping shows an
// info modal explaining the system + when the next opportunity opens.
type SideQuestInfoKind = 'google_review' | 'weekly_reviews' | 'monthly_wrap' | 'streak_chest'

// Phase 8K — Side Quests use DYNAMIC priority sort. Actionable items rise,
// completed sink. Refactoring-UI: "not everything can be important" — the
// first row gets the most visual weight, so reserve it for what's claimable
// right now. Five buckets, lower number = higher in column:
//   P1  Tap-to-earn now    (chest ready / wrap open / review pending / Google unclaimed)
//   P2  Pending / at risk  (Google review under manual review)
//   P3  Active progression (streak ticking; weekly reviews mid-cycle)
//   P4  Locked / not yet   (monthly wrap mid-cycle; 0-streak start)
//   P5  Done / closed      (already earned this cycle, expired window)
// Within each bucket: ties broken by aedSignal desc (bigger payoff first),
// then by TIEBREAK_INDEX (mental-frequency order — streak daily anchor
// first, Google occasional last).
const TIEBREAK_INDEX: Record<string, number> = {
  'Weekly Streak Reward': 0,
  '4 weekly reviews':     1,
  'Monthly wrap':         2,
  'Google review':        3,
}

function computeSideRewardPriority(
  label: string,
  weeklyReviewState: WeeklyReviewState,
  monthlyReviewWindow: MonthlyReviewWindow,
  chestState: StreakChestState,
  googleReviewRow: Layer4Row | undefined,
): { priority: number; aedSignal: number } {
  if (label === 'Google review') {
    const row = googleReviewRow
    if (row && (row.status === 'approved' || row.status === 'auto_approved')) {
      return { priority: 5, aedSignal: 10 } // Done this sub → sink
    }
    if (row && row.status === 'pending') {
      return { priority: 2, aedSignal: 10 } // Under manual review
    }
    return { priority: 1, aedSignal: 10 } // Unclaimed → top tier
  }
  if (label === '4 weekly reviews') {
    const { rewards, current, late } = weeklyReviewState
    const allIn = rewards.submitted >= rewards.total && rewards.total > 0
    const pendingNow = current !== null || late.length > 0
    if (allIn)      return { priority: 5, aedSignal: rewards.aedEarned } // Cycle done
    if (pendingNow) return { priority: 1, aedSignal: rewards.aedPending } // Active claim window
    return { priority: 3, aedSignal: rewards.aedPending || 20 } // Mid-week, in progress
  }
  if (label === 'Monthly wrap') {
    const w = monthlyReviewWindow
    if (w.submitted) return { priority: 5, aedSignal: 5 }              // Done
    if (w.expired)   return { priority: 5, aedSignal: 0 }              // Closed window
    if (w.eligible)  return { priority: 1, aedSignal: w.daysLeftForFullReward > 0 ? 5 : 2 } // Open or late
    return { priority: 4, aedSignal: 5 }                                 // Mid-cycle, locked
  }
  if (label === 'Weekly Streak Reward') {
    const { count, chestReady } = chestState
    if (chestReady) return { priority: 1, aedSignal: 12 } // Tap to open
    if (count > 0)  return { priority: 3, aedSignal: 12 } // Streak active, no chest yet
    return { priority: 4, aedSignal: 12 }                  // 0 streak — get started
  }
  return { priority: 5, aedSignal: 0 } // Unknown label → sink to bottom
}

// ════════════════════════════════════════════════════════════════════════════
//  QUEST INFO MODAL — Phase 8K Layer 4 reinforcement
//
//  Tap any side-quest row that isn't immediately actionable (Done, Locked,
//  Soon, Closed) and you get a small explainer instead of a dead end:
//   • What this quest is, in one line
//   • Reward + how to earn it, tightly
//   • The catch (all-or-nothing, late penalty, etc.) — only when relevant
//   • Your current status, computed live
//   • A primary action when one exists (Open Google review / Open chest /
//     Go to /menu) — otherwise just a "Got it" dismiss.
// ════════════════════════════════════════════════════════════════════════════

type QuestPrimaryAction =
  | 'open_google_review_modal'
  | 'open_chest_modal'
  | 'open_weekly_review'
  | 'go_to_menu'
  | 'none'

// 1st, 2nd, 3rd, 4th — used in the weekly-reviews info modal so the "When
// the Nth lands" line agrees with English ordinal rules.
function ordinal(n: number): string {
  const abs = Math.abs(Math.floor(n))
  const tens = abs % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (abs % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function questInfoMeta(kind: SideQuestInfoKind, planTier?: WrapPlanTier): { title: string; accent: string } {
  switch (kind) {
    case 'google_review':  return { title: 'Google review · AED 10',          accent: GREEN  }
    case 'weekly_reviews': return { title: 'Weekly reviews · up to AED 20',   accent: CYAN   }
    case 'monthly_wrap': {
      const vocab = wrapVocabFor(planTier ?? 'monthly')
      return { title: `${capitalize(vocab.qualifier)} wrap · AED 5`, accent: VIOLET }
    }
    case 'streak_chest':   return { title: 'Streak chest · every 7 days',     accent: ORANGE }
  }
}

function QuestInfoScreen({
  kind,
  weeklyReviewState,
  monthlyReviewWindow,
  chestState,
  googleReviewRow,
  onClose,
  onPrimaryAction,
}: {
  kind: SideQuestInfoKind
  weeklyReviewState: WeeklyReviewState
  monthlyReviewWindow: MonthlyReviewWindow
  chestState: StreakChestState
  googleReviewRow: Layer4Row | undefined
  onClose: () => void
  onPrimaryAction: (action: QuestPrimaryAction) => void
}) {
  // Each kind owns its own copy generator. Returns the content blocks the
  // shared shell renders — keeps the surrounding layout consistent and
  // makes per-kind content edits localised.
  const content = (() => {
    if (kind === 'google_review') {
      const earned = googleReviewRow && (googleReviewRow.status === 'approved' || googleReviewRow.status === 'auto_approved')
      const pending = googleReviewRow && googleReviewRow.status === 'pending'
      return {
        reward: 'AED 10 once per monthly subscription',
        how: [
          'Tap the row to open the Dormers Google business page',
          'Leave your review (it takes ~30 seconds)',
          'Upload a screenshot — AI verifies in seconds',
        ],
        catch: '"Dormers" or "dormer" must be visible in the screenshot (header or review text).',
        status: earned
          ? 'Already claimed this subscription.'
          : pending
            ? "In manual review — we'll credit your wallet within 24h."
            : 'Unclaimed this subscription.',
        next: earned
          ? 'Next claim opens with your next monthly subscription.'
          : 'Available right now.',
        action: earned ? 'none' as QuestPrimaryAction : 'open_google_review_modal' as QuestPrimaryAction,
        actionLabel: pending ? 'Upload a better shot' : 'Open Google review',
      }
    }
    if (kind === 'weekly_reviews') {
      const { rewards, current, late } = weeklyReviewState
      const total = rewards.total
      const submitted = rewards.submitted
      const allIn = submitted >= total && total > 0
      // Split the pending pool the same way the sidebar tray and wallet
      // do so the three surfaces speak with one voice. `ready` = AED
      // already submitted, parked until cycle lock. `toClaim` = AED
      // still earnable from unsubmitted weeks.
      const aedToClaim = (current ? BASE_REWARD_AED : 0) + late.length * LATE_REWARD_AED
      const aedReady = Math.max(0, rewards.aedPending - aedToClaim)
      // Pick the most pressing pending week so the CTA can route directly
      // into the takeover instead of dumping the user on /menu (where
      // weekly reviews no longer live — they surface in the Now tray).
      const targetWeek = current?.week ?? late[0]?.week ?? null
      return {
        reward: `Up to AED ${total * 5} per cycle (AED 5 per review, all ${total} required)`,
        how: [
          `Submit ${total} weekly reviews — one per week, after each week ends`,
          'Each one takes ~60 seconds (rate + favorites + misses + ops)',
          `When the ${ordinal(total)} lands, the whole pool unlocks to your wallet`,
        ],
        catch: 'All-or-nothing. Miss any one and the cycle\'s credit is forfeit. Late reviews still count toward the total but earn AED 2 instead of AED 5.',
        status: allIn
          ? `All ${total} in · AED ${rewards.aedEarned} earned this cycle.`
          : submitted > 0
            ? aedToClaim > 0
              ? `${submitted} of ${total} in · AED ${aedReady} ready · +AED ${aedToClaim} to claim.`
              : `${submitted} of ${total} in · AED ${aedReady} ready for cycle close.`
            : `0 of ${total} · earn AED ${total * 5} max this cycle.`,
        next: allIn
          ? 'Next pool opens with your next monthly subscription.'
          : targetWeek !== null
            ? 'Tap below to start — it lives in the sidebar Now tray once a week ends.'
            : 'Reviews appear in the sidebar Now tray when a week ends.',
        action: (allIn || targetWeek === null)
          ? 'none' as QuestPrimaryAction
          : 'open_weekly_review' as QuestPrimaryAction,
        actionLabel: targetWeek === null
          ? ''
          : current
            ? `Start week ${current.week} review`
            : `Catch up on week ${targetWeek}`,
      }
    }
    if (kind === 'monthly_wrap') {
      const w = monthlyReviewWindow
      const open = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward > 0
      const late = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward <= 0
      return {
        reward: 'AED 5 once per monthly subscription',
        how: [
          'Submit at the end of your monthly subscription cycle',
          'Quick reflection survey — what worked, what didn\'t',
          'Earn the full reward inside the 7-day window after your cycle ends',
        ],
        catch: 'AED 5 if submitted within 7 days of cycle end · AED 2 if late · expires 30 days after cycle end.',
        status: w.submitted
          ? 'Submitted for this cycle.'
          : w.expired
            ? 'Window closed for this cycle.'
            : open
              ? `Window open · ${w.daysLeftForFullReward}d left for the full AED 5.`
              : late
                ? `Late · earn AED 2 before the 30-day expiry.`
                : `Opens at the end of your cycle (${Math.max(0, -w.daysSinceCycleEnd)}d to go).`,
        next: w.submitted
          ? 'Next wrap opens at the end of your next subscription.'
          : open || late
            ? 'Tap "Wrap up the cycle" to start now.'
            : 'Wait until your subscription cycle ends.',
        action: (open || late) ? 'go_to_menu' as QuestPrimaryAction : 'none' as QuestPrimaryAction,
        actionLabel: 'Wrap up the cycle',
      }
    }
    // streak_chest
    const { count, chestReady, daysUntilNext } = chestState
    return {
      reward: 'Mystery cash · AED 5–12, with a rare 7-day 2× doubler on later chests',
      how: [
        'Visit the dashboard at least once a day to keep your streak alive',
        'Every 7 unbroken days = chest unlock',
        'Tap the chest in the top-right strip — instant RNG roll',
      ],
      catch: 'Streak breaks if you miss a day. Chest progress resets to 0 — re-earn 7 days to unlock again.',
      status: chestReady
        ? `Chest ready · ${count}-day streak.`
        : count > 0
          ? `${count}-day streak · ${daysUntilNext} ${daysUntilNext === 1 ? 'day' : 'days'} to next chest.`
          : 'No active streak yet.',
      next: chestReady
        ? 'Tap "Open chest" below.'
        : count > 0
          ? `Visit daily — next chest in ${daysUntilNext} ${daysUntilNext === 1 ? 'day' : 'days'}.`
          : 'Visit the dashboard tomorrow to start your streak.',
      action: (chestReady || count > 0) ? 'open_chest_modal' as QuestPrimaryAction : 'none' as QuestPrimaryAction,
      actionLabel: chestReady ? 'Open chest' : 'View streak chest',
    }
  })()

  const accentColor = questInfoMeta(kind, monthlyReviewWindow.planTier).accent

  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 900, color: accentColor,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        margin: '0 0 6px',
      }}>
        Reward
      </p>
      <p style={{
        fontFamily: BODY, fontSize: 14, fontWeight: 700, color: CREAM,
        lineHeight: 1.45, margin: '0 0 18px',
      }}>
        {content.reward}
      </p>

      <p style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 900, color: accentColor,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        margin: '0 0 6px',
      }}>
        How it works
      </p>
      <ol style={{
        margin: '0 0 18px',
        paddingLeft: 20,
        fontFamily: BODY, fontSize: 12.5, fontWeight: 500, color: MIST,
        lineHeight: 1.6,
      }}>
        {content.how.map((step, i) => (
          <li key={i} style={{ marginBottom: 4 }}>{step}</li>
        ))}
      </ol>

      {/* Catch — only when there's a non-obvious rule */}
      {content.catch && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          backgroundColor: `${GOLD}10`,
          border: `1px solid ${GOLD}33`,
          fontFamily: BODY, fontSize: 11.5, fontWeight: 500, color: MIST,
          lineHeight: 1.55,
          marginBottom: 18,
        }}>
          <span style={{
            fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GOLD_LITE,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            display: 'block', marginBottom: 4,
          }}>
            Worth knowing
          </span>
          {content.catch}
        </div>
      )}

      {/* Your status block */}
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.32)',
        border: `1px solid ${MIST_FAINT}`,
        marginBottom: 18,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: 9, fontWeight: 900, color: accentColor,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          lineHeight: 1, marginBottom: 6,
        }}>
          Your status
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 700, color: CREAM,
          lineHeight: 1.4, marginBottom: 4,
        }}>
          {content.status}
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 11, fontWeight: 500, color: MIST,
          lineHeight: 1.45,
        }}>
          {content.next}
        </div>
      </div>

      {/* Action row — primary CTA when one exists, else just dismiss. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '10px 18px', borderRadius: 999,
            backgroundColor: 'transparent', color: MIST,
            fontFamily: BODY, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: `1px solid ${MIST_FAINT}`, cursor: 'pointer',
          }}
        >
          Got it
        </button>
        {content.action !== 'none' && (
          <button
            type="button"
            onClick={() => onPrimaryAction(content.action)}
            style={{
              padding: '10px 22px', borderRadius: 999,
              backgroundColor: accentColor, color: BG_DEEP,
              fontFamily: BODY, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              border: 'none', cursor: 'pointer',
              boxShadow: `0 8px 22px ${accentColor}55`,
            }}
          >
            {content.actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// Tiny SVG progress ring — used in the side-quest weekly-review row to
// replace the "N of M" text prefix with a visual count. Frees horizontal
// space in the sub-line for the "AED X ready · +AED Y to claim" copy
// without truncation. Aria-label keeps the count screen-reader legible.
function ProgressRing({
  value, total, color, size = 11,
}: {
  value: number
  total: number
  color: string
  size?: number
}) {
  const cx = size / 2
  const r = (size - 1.5) / 2
  const circumference = 2 * Math.PI * r
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0
  const offset = circumference * (1 - pct)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${value} of ${total}`}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={`${color}33`} strokeWidth={1.5} />
      <circle
        cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={1.5}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  )
}

function SideRewardsColumn({
  layer4Rewards, activeSubscriptionId, onOpenGoogleReview,
  weeklyReviewState, monthlyReviewWindow,
  chestState, onOpenChest,
  onOpenWeeklyReviews,
  onOpenMonthlyWrap,
  onShowInfo,
}: {
  layer4Rewards: Layer4Row[]
  activeSubscriptionId: string | null
  onOpenGoogleReview: () => void
  weeklyReviewState: WeeklyReviewState
  monthlyReviewWindow: MonthlyReviewWindow
  /** Phase 8K — Weekly Streak Reward row mirrors the existing chest state. */
  chestState: StreakChestState
  /** Click handler — opens the chest modal already wired in HubClient. */
  onOpenChest: () => void
  /** Opens the weekly-reviews chooser modal — shows every week in the
   *  active cycle (pending + completed) so the user picks which one to
   *  submit instead of being routed silently to the first pending week. */
  onOpenWeeklyReviews: () => void
  /** Opens the monthly-wrap chooser modal — previews what the wrap is and
   *  the AED on the line before deep-linking the user into the form.
   *  Replaces the old direct router.push('/dashboard/menu') which landed
   *  the user on the menu home instead of the wrap form itself. */
  onOpenMonthlyWrap: () => void
  /** Phase 8K — passive rows route through the info modal on click. */
  onShowInfo: (kind: SideQuestInfoKind) => void
}) {

  // Phase 8K — Google review is per-monthly-subscription, not lifetime.
  // The "is this claimable" check needs the active sub's id matched
  // against the row's period_key. If the user has a row from a previous
  // sub, that doesn't block claiming again in the current sub.
  const googleReviewForCurrentSub = useMemo(() => {
    if (!activeSubscriptionId) return undefined
    return layer4Rewards.find(
      r => r.kind === 'google_review' && r.period_key === activeSubscriptionId,
    )
  }, [layer4Rewards, activeSubscriptionId])

  // Phase 8K — sort the SIDE_REWARDS array by computed priority on each
  // render. Actionable rows rise; completed rows sink. Memoised on the
  // state inputs so the sort only recomputes when the underlying data
  // changes — not on every parent re-render.
  const sortedSideRewards = useMemo(() => {
    return [...SIDE_REWARDS]
      .map(r => ({
        r,
        ...computeSideRewardPriority(
          r.label,
          weeklyReviewState,
          monthlyReviewWindow,
          chestState,
          googleReviewForCurrentSub,
        ),
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        if (a.aedSignal !== b.aedSignal) return b.aedSignal - a.aedSignal
        return (TIEBREAK_INDEX[a.r.label] ?? 99) - (TIEBREAK_INDEX[b.r.label] ?? 99)
      })
      .map(x => x.r)
  }, [weeklyReviewState, monthlyReviewWindow, chestState, googleReviewForCurrentSub])

  return (
    <Column eyebrow="Side Quests" title="More ways to earn AED" accent={GREEN} icon={Sparkles}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        flex: '1 1 auto',
        marginTop: 4,
      }}>
        {sortedSideRewards.map(r => {
          const Emblem = r.Emblem
          const kind = LAYER4_KIND_BY_LABEL[r.label]

          // Determine status chip + interactivity per kind.
          let chipLabel = 'Coming soon'
          let chipColor = MIST_DIM
          let chipBg = 'transparent'
          let chipBorder = MIST_FAINT
          let clickable = false
          let onClick: (() => void) | undefined = undefined

          // Secondary line under the label. Defaults to the AED value;
          // overridden per kind/state below to give the row a useful
          // status sentence instead of just the chip in the corner.
          let subLine: string = r.value
          let subColor: string = r.color
          // Optional visual badge that renders BEFORE the subLine text —
          // currently used by the weekly_reviews row to replace the
          // "N of M" text count with a small progress ring. Frees
          // horizontal space for richer copy on the right.
          let subBadge: React.ReactNode = null

          if (kind === 'google_review') {
            const row = googleReviewForCurrentSub
            if (row && (row.status === 'approved' || row.status === 'auto_approved')) {
              chipLabel = 'Earned'
              chipColor = GREEN
              chipBg = `${GREEN}14`
              chipBorder = `${GREEN}55`
              subLine = 'Claim again next monthly subscription'
              subColor = GREEN
              clickable = true
              onClick = () => onShowInfo('google_review')
            } else if (row && row.status === 'pending') {
              chipLabel = 'Pending'
              chipColor = GOLD_LITE
              chipBg = `${GOLD}14`
              chipBorder = `${GOLD}55`
              subLine = 'In manual review · tap to upload a better shot'
              subColor = GOLD_LITE
              clickable = true
              onClick = onOpenGoogleReview // let user upload a better screenshot
            } else {
              chipLabel = 'Tap to claim'
              chipColor = r.color
              chipBg = `${r.color}14`
              chipBorder = `${r.color}55`
              subLine = '+AED 10 in seconds · tap to start'
              subColor = r.color
              clickable = true
              onClick = onOpenGoogleReview
            }
          } else if (r.label === '4 weekly reviews') {
            // Phase 8K Model C — all-or-nothing rule. Sub-line MUST make
            // the linked-fate nature legible without needing the modal:
            // "AED X pending" reads as at-risk; "AED X earned" reads as
            // locked-in. The trigger lives on /menu, so clicks route there.
            //
            // Note: getWeeklyReviewState already implements the all-in
            // check — `rewards.aedEarned` is only non-zero once submitted
            // hits total; otherwise the AED sits in `rewards.aedPending`.
            const { rewards, current, late } = weeklyReviewState
            const submitted = rewards.submitted
            const total = rewards.total
            const aedEarned = rewards.aedEarned
            const aedPending = rewards.aedPending
            const pendingNow = current !== null || late.length > 0
            const allIn = submitted >= total && total > 0

            if (allIn) {
              chipLabel = 'Locked'
              chipColor = GREEN
              chipBg = `${GREEN}14`
              chipBorder = `${GREEN}55`
              subLine = `AED ${aedEarned} earned this cycle`
              subColor = GREEN
              subBadge = <ProgressRing value={submitted} total={total} color={GREEN} />
              clickable = true
              onClick = () => onShowInfo('weekly_reviews')
            } else if (pendingNow) {
              chipLabel = 'Tap to review'
              chipColor = r.color
              chipBg = `${r.color}14`
              chipBorder = `${r.color}55`
              // Same ready/to-claim split as the sidebar tray and wallet:
              // the user reads "AED 7 ready · +AED 2 to claim" instead
              // of a single conflated "AED 9 on the line" that hides
              // what's already banked vs what's still earnable.
              const aedToClaim = (current ? BASE_REWARD_AED : 0) + late.length * LATE_REWARD_AED
              const aedReady = Math.max(0, aedPending - aedToClaim)
              subLine = submitted === 0
                ? `All ${total} needed for AED ${total * BASE_REWARD_AED}`
                : `AED ${aedReady} ready · +AED ${aedToClaim} to claim`
              subColor = r.color
              subBadge = <ProgressRing value={submitted} total={total} color={r.color} />
              clickable = true
              // Open the chooser modal so the user sees every week in the
              // cycle (pending + completed) and picks which one to submit.
              // Previously this dumped them straight onto the first
              // pending week's review page — fine for a single pending
              // week, opaque for users with a current + late backlog who
              // couldn't see what was already banked.
              onClick = onOpenWeeklyReviews
            } else {
              // Mid-week — nothing pending right now. Show progress honestly,
              // emphasize the all-or-nothing pool either way.
              chipLabel = submitted > 0 ? 'In progress' : 'Soon'
              chipColor = submitted > 0 ? CYAN : MIST_DIM
              chipBg = submitted > 0 ? `${CYAN}14` : 'transparent'
              chipBorder = submitted > 0 ? `${CYAN}55` : MIST_FAINT
              // Mid-week → current is null and late is empty → aedToClaim
              // is 0 by construction, so the whole pool is "ready" (banked
              // from earlier submissions, awaiting cycle lock).
              subLine = submitted > 0
                ? `AED ${aedPending} ready for cycle close`
                : `All ${total} needed for AED ${total * BASE_REWARD_AED} · miss one = forfeit`
              subColor = submitted > 0 ? CYAN : MIST
              // Skip the ring at 0/N — it conveys nothing and pushes the
              // sub-line right of the other quest rows' captions, breaking
              // the row's left-edge alignment.
              if (submitted > 0) {
                subBadge = <ProgressRing value={submitted} total={total} color={CYAN} />
              }
              clickable = true
              onClick = () => onShowInfo('weekly_reviews')
            }
          } else if (r.label === 'Monthly wrap') {
            // Once-per-cycle review that opens at cycle-end. State machine:
            //   submitted              → done (cycle done — see you next one)
            //   eligible + open        → tap to wrap (full AED 5)
            //   eligible + late        → tap to wrap (half — AED 2, before expiry)
            //   expired                → grey "closed" — nothing to do
            //   ineligible (mid-cycle) → "Opens at cycle end"
            const w = monthlyReviewWindow
            const open = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward > 0
            const late = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward <= 0
            if (w.submitted) {
              chipLabel = 'Done'
              chipColor = GREEN
              chipBg = `${GREEN}14`
              chipBorder = `${GREEN}55`
              subLine = `${capitalize(wrapVocabFor(w.planTier).qualifier)} wrap submitted · next one at the end of your cycle`
              subColor = GREEN
              clickable = true
              onClick = () => onShowInfo('monthly_wrap')
            } else if (open) {
              chipLabel = 'Tap to wrap'
              chipColor = r.color
              chipBg = `${r.color}14`
              chipBorder = `${r.color}55`
              const dLeft = w.daysLeftForFullReward
              subLine = dLeft === 1
                ? '1 day left for the full AED 5'
                : `${dLeft} days left for the full AED 5`
              subColor = r.color
              clickable = true
              onClick = onOpenMonthlyWrap
            } else if (late) {
              chipLabel = 'Tap to wrap'
              chipColor = GOLD_LITE
              chipBg = `${GOLD}14`
              chipBorder = `${GOLD}55`
              subLine = 'Late · earn AED 2 before the window closes'
              subColor = GOLD_LITE
              clickable = true
              onClick = onOpenMonthlyWrap
            } else if (w.expired) {
              chipLabel = 'Closed'
              chipColor = MIST_DIM
              chipBg = 'transparent'
              chipBorder = MIST_FAINT
              subLine = 'Window for this cycle has closed'
              subColor = MIST_DIM
              clickable = true
              onClick = () => onShowInfo('monthly_wrap')
            } else {
              // Mid-cycle — wrap not yet eligible.
              chipLabel = 'Soon'
              chipColor = MIST_DIM
              chipBg = 'transparent'
              chipBorder = MIST_FAINT
              subLine = 'Opens at the end of this cycle'
              subColor = MIST
              clickable = true
              onClick = () => onShowInfo('monthly_wrap')
            }
          } else if (r.label === 'Weekly Streak Reward') {
            // Mirrors the existing streak chest state. Same data as the
            // TopChrome chest strip — just surfaced in the Side Quests
            // column too so the user sees it in both mental models.
            // Click opens the same chest modal the TopChrome chest opens.
            const { count, chestReady, daysUntilNext } = chestState
            if (chestReady) {
              chipLabel = 'Tap to open'
              chipColor = r.color
              chipBg = `${r.color}14`
              chipBorder = `${r.color}55`
              subLine = `${count}-day streak · chest ready to open`
              subColor = r.color
              clickable = true
              onClick = onOpenChest
            } else if (count === 0) {
              chipLabel = 'Soon'
              chipColor = MIST_DIM
              chipBg = 'transparent'
              chipBorder = MIST_FAINT
              subLine = 'Visit daily · chest unlocks at day 8'
              subColor = MIST
              clickable = true
              onClick = () => onShowInfo('streak_chest')
            } else {
              chipLabel = 'In progress'
              chipColor = r.color
              chipBg = `${r.color}14`
              chipBorder = `${r.color}55`
              const dayWord = daysUntilNext === 1 ? 'day' : 'days'
              subLine = `${count}-day streak · ${daysUntilNext} ${dayWord} to next chest`
              subColor = r.color
              clickable = true
              onClick = onOpenChest // let user peek even mid-cycle
            }
          }

          // Visual content shared by both the interactive (button) and the
          // static (div) variants of the row. Extracted so we don't have to
          // duplicate the JSX across two branches.
          const rowInner = (
            <>
              {/* Icon tile */}
              <span style={{
                flexShrink: 0,
                width: 28, height: 28, borderRadius: 7,
                backgroundColor: `${r.color}22`,
                border: `1px solid ${r.color}55`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Emblem size={13} strokeWidth={2.4} color={r.color} />
              </span>

              {/* Label + state-aware sub-line */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
                  lineHeight: 1.2,
                }}>
                  {r.label}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: BODY, fontSize: 10, fontWeight: 700,
                  color: subColor, marginTop: 2, fontFeatureSettings: '"tnum"',
                  minWidth: 0,
                }}>
                  {subBadge}
                  <span style={{
                    flex: 1, minWidth: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {subLine}
                  </span>
                </div>
              </div>

              {/* Status chip — rendered as <span> always; the wrapping
                  button/div carries the click + hover lift. Avoids nested
                  interactive elements. */}
              <span style={{
                flexShrink: 0,
                fontFamily: BODY, fontSize: 10, fontWeight: 900, color: chipColor,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 999,
                backgroundColor: chipBg,
                border: `1px solid ${chipBorder}`,
              }}>
                {chipLabel}
              </span>
            </>
          )

          const rowStyle: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: `1px solid ${r.color}33`,
            width: '100%',
            font: 'inherit',
            color: 'inherit',
          }

          // Interactive variant: <button> wraps the row, gets hover lift via
          // .hub-side-rewards-row, all keyboard + screen-reader behavior for free.
          if (clickable) {
            return (
              <button
                key={r.label}
                type="button"
                onClick={onClick}
                className="hub-side-rewards-row"
                style={rowStyle}
              >
                {rowInner}
              </button>
            )
          }
          // Static variant: <div>, no hover, no cursor pointer.
          return (
            <div key={r.label} style={rowStyle}>
              {rowInner}
            </div>
          )
        })}
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTIVITY FEED — left side of lower row; live pulse + recent items
// ════════════════════════════════════════════════════════════════════════════

// Compact inline variant of the tier-4 (GOAT) badge — sized for activity-feed
// rows where space is tight. Just the crown + tracked label, no chevron tail.
function EliteTag() {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '1px 6px', borderRadius: 4,
        backgroundColor: `${GOLD}22`,
        border: `1px solid ${GOLD}66`,
        fontFamily: BODY, fontSize: 8, fontWeight: 900, color: GOLD,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        boxShadow: `0 0 6px ${GOLD}44`,
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      <Trophy size={7} strokeWidth={2.6} color={GOLD_LITE} />
      Elite
    </span>
  )
}

function ActivityFeed({
  pulseItem, pulseItems,
}: {
  pulseItem: CrossDormRecentSub | undefined
  pulseItems: CrossDormRecentSub[]
}) {
  // Recent list: skip the currently-highlighted pulse item so it doesn't
  // appear twice (once highlighted at the top, once muted below).
  const recent = useMemo(() => {
    if (!pulseItem) return pulseItems.slice(0, 3)
    return pulseItems.filter(p => p.createdAt !== pulseItem.createdAt || p.firstName !== pulseItem.firstName).slice(0, 3)
  }, [pulseItems, pulseItem])

  // Empty-state fallback. Cross-dorm + no live subs = brand-new database;
  // very unlikely in production but the UI shouldn't render blank.
  if (!pulseItem) {
    return (
      <Column eyebrow="Happening Now" title="" accent={GREEN} icon={Activity}>
        <div style={{
          flex: '1 1 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BODY, fontSize: 12, fontWeight: 600, color: MIST,
          letterSpacing: '0.02em',
        }}>
          Quiet across the dorms right now.
        </div>
      </Column>
    )
  }

  return (
    <Column eyebrow="Happening Now" title="" accent={GREEN} icon={Activity}>
      <div style={{
        flex: '1 1 auto',
        display: 'flex', flexDirection: 'column', gap: 6,
        marginTop: -6,
      }}>
        {/* Live pulse — the highlighted "just happened" line */}
        <div
          key={`${pulseItem.firstName}-${pulseItem.createdAt}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8,
            backgroundColor: `${GREEN}14`,
            border: `1px solid ${GREEN}44`,
            animation: 'hub-pulse-fade-in 600ms ease-out',
            flexWrap: 'wrap',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: GREEN, boxShadow: `0 0 8px ${GREEN}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: BODY, fontSize: 12, fontWeight: 700, color: CREAM,
            letterSpacing: '0.02em',
          }}>
            <strong style={{ fontWeight: 900 }}>{pulseItem.firstName}</strong>
            {' joined '}
            <span style={{ color: CREAM, opacity: 0.85 }}>{pulseItem.dormName}</span>
          </span>
          {pulseItem.isElite && <EliteTag />}
        </div>

        {/* Recent items list (static, muted) */}
        {recent.map((item, i) => (
          <div key={`${item.firstName}-${item.createdAt}-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px',
            fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
            letterSpacing: '0.02em',
            flexWrap: 'wrap',
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: '50%',
              backgroundColor: MIST_DIM, flexShrink: 0,
            }} />
            <span>
              <strong style={{ fontWeight: 800, color: CREAM }}>{item.firstName}</strong>
              {' · '}
              <span style={{ opacity: 0.85 }}>{item.dormName}</span>
            </span>
            {item.isElite && <EliteTag />}
          </div>
        ))}
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SCOUTS STRIP — right side of lower row; in-flight referrals
// ════════════════════════════════════════════════════════════════════════════

function ScoutsStrip({
  scouts, onScoutTap, onSendNew, onViewAll,
}: {
  scouts: Scout[]
  onScoutTap: (s: Scout) => void
  onSendNew: () => void
  onViewAll: () => void
}) {
  return (
    <Column eyebrow={`Your Squad · ${scouts.length}`} title="" accent={PINK} icon={Users} onOpen={onViewAll}>
      <div style={{
        flex: '1 1 auto',
        display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
        scrollbarWidth: 'none',
        paddingBottom: 4,
        marginTop: -6,
      }} className="hub-scouts-scroll">
        {scouts.map(s => {
          const stage = stageMeta(s.stage)
          const isWin = s.stage === 'subscribed'
          const isOffLadder = s.stage === 'already_subscribed'
          return (
            <button
              key={s.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onScoutTap(s) }}
              style={{
                minWidth: 64, padding: '8px 6px',
                borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.45)',
                border: `1.5px solid ${stage.color}66`,
                color: CREAM,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                flexShrink: 0, cursor: 'pointer',
                boxShadow: isWin ? `0 0 12px ${GREEN}55` : `0 4px 8px rgba(0,0,0,0.4)`,
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: '50%',
                backgroundColor: `${stage.color}28`,
                border: `1.5px solid ${stage.color}`,
                color: stage.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: BODY, fontSize: 12, fontWeight: 900,
              }}>
                {s.name.charAt(0).toUpperCase()}
              </span>
              <div style={{
                fontFamily: BODY, fontSize: 10, fontWeight: 800, color: CREAM,
              }}>
                {s.name}
              </div>
              {isOffLadder ? (
                // Off-ladder: progression pips would imply this scout is
                // somewhere on the journey ladder. They aren't — they're a
                // regular already. Show a single label instead.
                <div style={{
                  fontFamily: BODY, fontSize: 8, fontWeight: 900,
                  color: stage.color, letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                }}>
                  Already here
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 2 }}>
                  {STAGES.map((_, idx) => (
                    <span key={idx} style={{
                      width: 4, height: 4, borderRadius: '50%',
                      backgroundColor: idx <= stageIndex(s.stage as Exclude<ScoutStage, 'already_subscribed'>) ? stage.color : 'rgba(255,255,255,0.10)',
                    }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
        {/* Send another tile */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSendNew() }}
          style={{
            minWidth: 56, padding: '8px 6px',
            borderRadius: 10,
            backgroundColor: 'rgba(0,0,0,0.2)',
            border: `1.5px dashed ${GOLD}55`,
            color: GOLD_LITE,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          <span style={{
            width: 30, height: 30, borderRadius: '50%',
            backgroundColor: `${GOLD}18`,
            border: `1.5px dashed ${GOLD}aa`,
            color: GOLD_LITE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Send size={12} strokeWidth={2.4} />
          </span>
          <div style={{
            fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GOLD_LITE,
            textAlign: 'center', lineHeight: 1.2,
          }}>
            Send<br />new
          </div>
        </button>
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  STYLES — minimal keyframes (no decoration animations)
// ════════════════════════════════════════════════════════════════════════════

function HubStyles() {
  return (
    <style>{`
      ::selection { background: rgba(245,127,32,0.32); }

      /* The grain layer is absolutely positioned and would render ABOVE
         non-positioned siblings. Make every direct child of .hub-root sit
         in its own stacking layer at z-index 1 so the grain stays under. */
      .hub-root > * { position: relative; z-index: 1; }
      .hub-root > .hub-grain { z-index: 0; }

      /* Retuned to brand burnt orange (#f57f20) — the prior #f59e0b was
         the yellow-gold of the prior neon palette; this matches the
         marketing-site CTA glow recipe (0 8px 32px rgba(255,127,0,0.5)). */
      @keyframes hub-cta-pulse {
        0%, 100% { box-shadow: 0 0 22px rgba(245,127,32,0.45), 0 0 48px rgba(245,127,32,0.18), inset 0 0 0 1.5px rgba(255,200,140,0.85); }
        50%      { box-shadow: 0 0 38px rgba(245,127,32,0.7),  0 0 80px rgba(245,127,32,0.34), inset 0 0 0 1.5px rgba(255,200,140,1); }
      }
      @keyframes hub-cta-bob {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-3px); }
      }
      .hub-cta {
        transition: transform 220ms ease, filter 220ms ease;
      }
      .hub-cta:hover  { transform: translateY(-4px) scale(1.02); filter: brightness(1.08); }
      .hub-cta:active { transform: scale(0.97); }

      /* Shimmer sweep — white-light glint wipes left→right over individual
         letter shapes. Uses background-clip:text so the sweep is masked to
         the actual glyph outlines (not the whole block). currentColor picks
         up the span's inline color prop so no custom property is needed.
         Sweep takes ~1.2s (0→20%), then the bright band holds off-screen
         for ~4.8s before repeating — reads as a rare glint, not a strobe. */
      .hub-shimmer {
        background-image: linear-gradient(
          110deg,
          currentColor 0%,
          currentColor 35%,
          rgba(255,210,60,0.85) 50%,
          currentColor 65%,
          currentColor 100%
        );
        background-size: 400% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: hub-shimmer-sweep 2.5s ease-in-out infinite;
      }
      @keyframes hub-shimmer-sweep {
        0%   { background-position: 140% center; }
        100%  { background-position: -40% center; }
        100% { background-position: -40% center; }
      }

      .hub-milestone-dot { cursor: pointer; }
      .hub-milestone-dot .hub-dot-tip {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1a3e4f 0%, #091825 100%);
        box-shadow: 0 4px 16px rgba(0,0,0,0.45);
        color: rgba(237,232,218,0.95);
        font-size: 11px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: 7px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s cubic-bezier(0.16,1,0.3,1);
        z-index: 20;
      }
      .hub-milestone-dot:hover .hub-dot-tip { opacity: 1; }
      .hub-milestone-dot .hub-dot-tip::after {
        content: '';
        position: absolute;
        top: 100%; left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: #091825;
      }

      @keyframes hub-streak-overlay-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes hub-streak-emoji-pop {
        0%   { transform: scale(0.3); opacity: 0; }
        60%  { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1);    opacity: 1; }
      }
      @keyframes hub-streak-text-up {
        from { opacity: 0; transform: translateY(14px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes hub-pulse-ring {
        0%   { box-shadow: 0 0 0 0 var(--pr-color, rgba(255,200,50,0.6)); }
        70%  { box-shadow: 0 0 0 8px transparent; }
        100% { box-shadow: 0 0 0 8px transparent; }
      }
      @keyframes hub-pulse-fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* Halo for the nearest-milestone marker on cycle + lifetime progress
         bars. Outward ring at 2.6× scale drives the eye to the goal in
         play. Uses a centred ::after via inline style on the wrapper. */
      @keyframes hub-milestone-halo {
        0%   { box-shadow: 0 0 0 0 var(--mh-color, rgba(255,200,50,0.55)); }
        70%  { box-shadow: 0 0 0 12px transparent; }
        100% { box-shadow: 0 0 0 12px transparent; }
      }
      /* Focused-milestone pulse — fires on the OUTER wrapper of a flip card
         inside the This Month / Lifetime Path modals when the user clicks
         a specific dot from the column. The CSS variable --mfp-color is
         set per-instance via inline style so each milestone pulses in its
         own colour. Three iterations × 1.6s ≈ 4.8s — paired with the 5s
         state timer in HubInner so the animation never visibly cuts off
         mid-cycle. Saffer rule: feedback scales to the significance of the
         event — a tap on a specific milestone deserves a focused response,
         not a generic modal open. */
      @keyframes hub-milestone-focus-pulse {
        0%   { box-shadow: 0 0 0 0   var(--mfp-color, rgba(255,255,255,0.6)), 0 0 0  0  transparent; }
        40%  { box-shadow: 0 0 0 4px var(--mfp-color, rgba(255,255,255,0.6)), 0 0 28px var(--mfp-color, rgba(255,255,255,0.6)); }
        100% { box-shadow: 0 0 0 0   transparent, 0 0 0 0 transparent; }
      }
      /* Wrapper class — keeps the box-shadow rendering above sibling cards
         so the ring isn't clipped by adjacent flip cards in the modal list. */
      .hub-milestone-focus { position: relative; z-index: 2; }
      /* "You are here" head marker — sits on top of the fill at the user's
         current position, distinct from milestone stops. Pulses in scale to
         signal "live cursor", not a static marker. */
      @keyframes hub-head-pulse {
        0%, 100% { box-shadow: 0 0 0 0    rgba(255,255,255,0.45), 0 0 10px rgba(255,255,255,0.55); }
        50%      { box-shadow: 0 0 0 4px  rgba(255,255,255,0.10), 0 0 14px rgba(255,255,255,0.75); }
      }
      /* Phase 8E — streak flame flicker for peak (day 22+) and epic
         (day 40+) tiers. Subtle scale + opacity pulse so the chip feels
         alive without being distracting. */
      @keyframes hub-flame-flicker {
        0%, 100% { transform: scale(1)    rotate(-1deg); opacity: 1;   }
        25%      { transform: scale(1.08) rotate(1deg);  opacity: 0.92; }
        50%      { transform: scale(0.96) rotate(-2deg); opacity: 1;   }
        75%      { transform: scale(1.05) rotate(1.5deg); opacity: 0.95; }
      }

      /* Phase 8K — Google review CELEBRATION OVERLAY signature moment.
         Six staggered animations compose the moment:
         (a) hub-celebration-fade-in: backdrop wash fades in
         (b) hub-celebration-pop: card scales up from 0.92 with a tiny overshoot
         (c) hub-check-circle-draw: SVG circle traces around the tick
         (d) hub-check-tick-draw: the checkmark itself draws in
         (e) hub-celebration-text-rise: headline/sub/body/button cascade up
         (f) hub-confetti-fall: 24 squares rain past with rotation + drift
      */
      @keyframes hub-celebration-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes hub-celebration-pop {
        0%   { transform: scale(0.92); opacity: 0; }
        60%  { transform: scale(1.03); opacity: 1; }
        100% { transform: scale(1);    opacity: 1; }
      }
      @keyframes hub-check-circle-draw {
        to { stroke-dashoffset: 0; }
      }
      @keyframes hub-check-tick-draw {
        to { stroke-dashoffset: 0; }
      }
      @keyframes hub-celebration-text-rise {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0);   }
      }
      @keyframes hub-confetti-fall {
        0%   { transform: translate(0, 0)                              rotate(0deg);   opacity: 0;   }
        10%  { opacity: 0.92; }
        100% { transform: translate(var(--confetti-drift, 0), 110vh)   rotate(720deg); opacity: 0;   }
      }
      /* Respect reduced-motion. Strip animations to fades only — keep the
         function (overlay + content), drop the motion. */
      @media (prefers-reduced-motion: reduce) {
        .hub-celebration-overlay * {
          animation-duration: 1ms !important;
          animation-delay: 0ms !important;
        }
      }

      /* Phase 8K — Google review modal microinteractions.
         (a) hub-step-row: hover-lift on the two-step CTA rows (open review + upload)
         (b) hub-cta-claim: hover-lift + press-state on the primary CTA
         (c) hub-preview-rise: gentle scale+fade on the picked-screenshot preview
         (d) hub-error-shake: light shake on invalid file / network error
         (e) hub-spinner: indeterminate spinner inside the CTA while submitting
      */
      .hub-step-row {
        transform: translateY(0);
      }
      .hub-step-row:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(0,0,0,0.30);
        border-color: rgba(245,127,32,0.55);
      }
      .hub-step-row:active {
        transform: translateY(0);
      }
      .hub-cta-claim:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 36px rgba(245,127,32,0.55);
      }
      .hub-cta-claim:not(:disabled):active {
        transform: translateY(0);
      }
      @keyframes hub-preview-rise {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1);    }
      }
      @keyframes hub-error-shake {
        0%, 100% { transform: translateX(0); }
        15%, 45%, 75% { transform: translateX(-4px); }
        30%, 60%, 90% { transform: translateX(4px); }
      }
      @keyframes hub-spinner {
        to { transform: rotate(360deg); }
      }
      /* Phase 8K — clickable side-rewards row (Google review). */
      .hub-side-rewards-row {
        cursor: pointer;
        transition: transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 180ms ease, background-color 180ms ease;
        text-align: left;
      }
      .hub-side-rewards-row:hover {
        transform: translateY(-1px);
        border-color: rgba(245,127,32,0.55) !important;
        background-color: rgba(255,255,255,0.05) !important;
      }
      .hub-side-rewards-row:active {
        transform: translateY(0);
      }

      .hub-column-tap {
        cursor: pointer;
      }
      .hub-column-tap:hover {
        transform: translateY(-2px);
        border-color: rgba(245,127,32,0.55);
      }

      /* Wallet + Streak chip hover/press — subtle lift that confirms
         clickability without competing with the larger column hover. */
      .hub-chip-tap:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0,0,0,0.55), 0 0 22px rgba(245,127,32,0.45) !important;
      }
      .hub-chip-tap:active {
        transform: translateY(0);
      }

      /* Wallet "Finish to unlock" row — confirms clickability with a
         subtle lift + brighter border on hover. Matches the chip-tap
         press-back so the modal feels consistent under the finger.
         Brand-orange tinted so the row reads as a to-do, distinct from
         the dashed-muted "Submitted · waiting" rows below it. */
      .hub-wallet-actionable:hover {
        background-color: rgba(245,127,32,0.18) !important;
        border-color: rgba(245,127,32,0.66) !important;
        transform: translateY(-1px);
      }
      .hub-wallet-actionable-urgent:hover {
        background-color: rgba(245,127,32,0.28) !important;
        border-color: rgba(245,127,32,1) !important;
      }
      .hub-wallet-actionable:active {
        transform: translateY(0);
      }

      /* Responsive grids — audit P1-9. Fixed repeat(3, 1fr) made each
         progress column ~110px wide at 375px, colliding milestone dots
         with their numeric labels. Collapse to two columns at <1024px,
         single column at <768px so phones get readable, scrollable cards. */
      .hub-progress-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .hub-activity-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      }
      @media (max-width: 1024px) {
        .hub-progress-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 768px) {
        /* minmax(0,1fr) — NOT plain 1fr. A 1fr track is minmax(auto,1fr), and
           that 'auto' floor won't shrink below the widest item's min-content
           (the Scouts strip + Side-Rewards rows push it to ~430px), dragging
           every stacked card that wide and clipping them under .hub-root's
           overflow:hidden. minmax(0,…) lets the track shrink so cards fit. */
        .hub-progress-grid,
        .hub-activity-grid  { grid-template-columns: minmax(0, 1fr); }
        /* Belt-and-suspenders: the progress-grid items are display:contents
           wrappers, so the real grid items are the columns one level down —
           let them shrink too. */
        .hub-activity-grid > *,
        .hub-progress-grid > * > * { min-width: 0; }

        /* Full-bleed mobile shell — the hub owns all its own insets now that
           the dashboard gutter is zeroed for this page (layout.tsx). Side
           padding drops to the 16px mobile rhythm; the bottom inset respects
           the home-indicator safe area. The top inset now only clears the
           notch (+14px) because the TopChrome row sits BESIDE the fixed
           hamburger rather than below it (see below). The inline clamp()
           padding on .hub-root is desktop-tuned, so override it here. */
        .hub-root {
          padding: calc(env(safe-area-inset-top) + 14px) 16px
                   max(env(safe-area-inset-bottom), 28px) 16px !important;
          gap: 14px !important;
        }

        /* Top chrome — on a phone, the identity avatar + wallet + streak ride
           a SINGLE row tucked in beside the fixed hamburger (DashboardShell
           renders it at top:16/left:16, 44×44). padding-left clears the burger
           (44 + 8 gap from the 16px root inset). The identity collapses to an
           avatar-only tap target (its tier name + perk badges live in the
           Progression modal it opens), and the wallet/streak chips drop their
           eyebrow→value stack to a compact icon + value so all three fit one
           line without wrapping. (The streak button sits under a
           display:contents [data-tour] wrapper, so target it explicitly.) */
        .hub-topchrome {
          order: -1 !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          padding-left: 52px !important;
          min-height: 44px;
        }
        /* Banner tray — sits AFTER TopChrome (order 0 vs -1) and compacts
           to a single tight line so it takes minimal vertical space. */
        .hub-banner-tray { order: 0 !important; }
        .hub-banner-inner { gap: 6px !important; }
        .hub-banner-inner > div[role="status"] {
          padding: 8px 12px !important;
          border-radius: 10px !important;
          gap: 8px !important;
          font-size: 11px !important;
        }
        .hub-banner-inner > div[role="status"] button {
          width: 26px !important; height: 26px !important;
        }
        /* Identity → avatar-only circle: hide the tier-name text block and
           tighten the pill so it reads as a round avatar button.
           order:99 sends it to the far right of the row. */
        .hub-topchrome > button { flex: 0 0 auto !important; padding: 4px !important; order: 99 !important; margin-left: auto !important; }
        .hub-identity-text { display: none !important; }
        /* Wallet + streak size to content — no force-grow, so neither chip
           has dead space when optional elements (pending AED) are absent. */
        .hub-topchrome > div { display: flex !important; gap: 8px !important; flex: 0 1 auto !important; min-width: 0 !important; }
        .hub-topchrome > div > button,
        .hub-topchrome > div > [data-tour="streak-chest"] > button {
          flex: 0 1 auto !important; min-width: 0 !important;
          gap: 7px !important; padding: 6px 10px !important;
          overflow: hidden !important;
        }
        /* Collapse each chip to a single icon + value line: the eyebrow label
           (WALLET/STREAK) is redundant beside its icon at this size, and the
           "AED" unit is carried by the coin glyph — dropping both lets the
           value stay on one line in the narrowed chip. */
        .hub-topchrome .hub-chip-eyebrow,
        .hub-topchrome .hub-chip-unit { display: none !important; }
        .hub-topchrome .hub-chip-value { font-size: 17px !important; }

        /* Modals stay CENTERED on mobile (NOT bottom-docked). A bottom-flush
           sheet puts its lower edge at the layout-viewport bottom, which on a
           real phone sits BEHIND the browser's bottom toolbar — hiding the
           sheet's footer / last rows. Centered + capped to the SMALL viewport
           (svh accounts for visible browser chrome) keeps the whole modal on
           screen, top and bottom. The header is pinned so the close X stays
           put while a tall modal scrolls its body. */
        .hub-modal-dialog { max-height: 86svh !important; }
        .hub-modal-header {
          position: sticky; top: 0; z-index: 3;
          background-color: ${BG_MID} !important;
        }
        .hub-modal-body {
          padding: 18px 18px max(env(safe-area-inset-bottom), 20px) !important;
        }
        /* Wallet summary — Available + Pending stack instead of squeezing two
           24px AED figures side-by-side on a phone. */
        .hub-wallet-summary-grid { grid-template-columns: 1fr !important; }

        /* Streak Chest calendar — on a phone the per-week row was sized for the
           desktop modal (6× 28px flames + 52px chest + label + arrow) and
           overflowed, pushing the chest off-screen behind a horizontal scroll.
           The flames now flex-shrink (above); here we also trim the chest, the
           inter-cell gaps and the week label so the flames keep a comfortable
           size all the way down to 320px. */
        .hub-streak-row { gap: 8px !important; padding: 8px 10px !important; }
        .hub-streak-row > span:first-child { min-width: 28px !important; }
        .hub-streak-flames { gap: 4px !important; }
        .hub-streak-chest { width: 46px !important; height: 46px !important; }
      }

      /* Ultra-narrow phones (≤345px, e.g. iPhone SE 1st-gen): drop the wallet's
         "+pending" qualifier from the TopChrome row so the three chips keep
         breathing room. The figure still lives in the wallet history modal. */
      @media (max-width: 345px) {
        .hub-topchrome .hub-chip-pending { display: none !important; }
      }

      .hub-scouts-scroll::-webkit-scrollbar { display: none; }
      [role="dialog"]::-webkit-scrollbar { display: none; }

      @keyframes hub-modal-in {
        from { opacity: 0; transform: scale(0.96) translateY(12px); }
        to   { opacity: 1; transform: scale(1)    translateY(0); }
      }
      @keyframes hub-rise {
        from { opacity: 0; transform: translateY(18px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes hub-pulse-dot {
        0%   { transform: scale(1);   opacity: 0.85; }
        70%  { transform: scale(2.2); opacity: 0;    }
        100% { transform: scale(2.2); opacity: 0;    }
      }
      @keyframes hub-reveal {
        0%   { transform: scale(0.94); opacity: 0; }
        50%  { transform: scale(1.04); opacity: 1; }
        100% { transform: scale(1);    opacity: 1; }
      }
      ${Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30) * (Math.PI / 180)
      const dx = (Math.cos(angle) * 80).toFixed(2)
      const dy = (Math.sin(angle) * 80).toFixed(2)
      return `@keyframes hub-confetti-${i} {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4); }
        }`
    }).join('\n')}

      @media (max-width: 1024px) {
        .hub-column-tap { padding: 12px !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        .hub-cta, * { animation: none !important; transition: none !important; }
      }
    `}</style>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  MODAL — full-screen overlay sub-screen
// ════════════════════════════════════════════════════════════════════════════

function Modal({
  open, onClose, title, accent, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  accent: string
  children: React.ReactNode
}) {
  // Audit P1-7: a11y wiring — Escape key dismiss, focus moves into the
  // dialog on open + returns to the trigger on close, role/aria attrs so
  // screen readers announce it as a modal. Without this, the modal looked
  // like a div to assistive tech and trapped keyboard users.
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`hub-modal-title-${Math.random().toString(36).slice(2, 8)}`).current
  useEffect(() => {
    if (!open) return
    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const t = setTimeout(() => dialogRef.current?.focus(), 60)
    // Lock body scroll while modal is open — prevents iOS Safari from
    // scrolling the background page when the user drags inside the modal.
    const body = document.body
    const prev = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      body.style.overflow = prev
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      className="hub-modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: `color-mix(in srgb, ${accent} 14%, rgba(0,0,0,0.78))`,
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        touchAction: 'none',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="hub-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640, width: '100%', maxHeight: '88vh', overflow: 'auto',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          backgroundImage: `linear-gradient(180deg, ${BG_MID} 0%, ${BG_DEEP} 100%)`,
          border: `1.5px solid ${accent}55`,
          borderRadius: 18,
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${accent}28`,
          animation: 'hub-modal-in 280ms cubic-bezier(0.16,1,0.3,1) both',
          outline: 'none',
        }}
      >
        <div className="hub-modal-header" style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${accent}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundImage: `linear-gradient(180deg, ${accent}14 0%, transparent 100%)`,
        }}>
          <div
            id={titleId}
            style={{
              fontFamily: DISPLAY, fontSize: 18, fontWeight: 900,
              color: CREAM, letterSpacing: '-0.01em',
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.35)',
              border: `1px solid ${MIST_FAINT}`,
              color: MIST,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
        <div className="hub-modal-body" style={{ padding: 22 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SUB-SCREENS — Trophy Ladder, Quests, Daily Drop, Squad
// ════════════════════════════════════════════════════════════════════════════

// Row used by both QuestsScreen (This Month) and TrophyLadderScreen
// (Lifetime Path). Collapsed by default, expanding inline when the user
// taps the (ⓘ) icon to reveal a plain-English "What you do" / "What you
// get" pair. Front layout stays compact when collapsed — the expanded
// height is paid only when requested. `focused` drives both the 5-second
// pulse halo AND an auto-expand so a click on a specific milestone dot in
// the column opens the modal AND reveals the explainer for that one.
function MilestoneInfoRow({
  title, value, color, Emblem, rare, requirement, howItWorks,
  current, threshold, earned, isNext, focused,
}: {
  title: string
  value?: string
  color: string
  Emblem: typeof Gift
  rare?: boolean
  requirement: string
  howItWorks: string
  current: number
  threshold: number
  earned: boolean
  isNext: boolean
  focused: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentId = useRef(`mir-${Math.random().toString(36).slice(2, 8)}`).current

  // Auto-expand on focus so the user sees the explainer for the milestone
  // they clicked. Leaves expanded=true after the 5s focus window closes so
  // they can keep reading — manual collapse via the icon is always available.
  useEffect(() => {
    if (focused) setExpanded(true)
  }, [focused])

  // Scroll into view on focus so the pulse halo isn't off-screen inside
  // the modal's scroll area.
  useEffect(() => {
    if (!focused) return
    wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const rowBg = earned ? `${GREEN}10` : isNext ? `${color}12` : 'rgba(255,255,255,0.03)'
  const rowBorder = earned ? `${GREEN}44` : isNext ? `${color}55` : MIST_FAINT

  return (
    <div
      ref={wrapperRef}
      // Focus halo lives on the outer wrapper. The CSS var carries the
      // milestone color into the keyframe so the halo matches the card.
      // 3 iterations × 1.6s ≈ 4.8s — paired with the 5s state timer in
      // HubInner so the animation never visibly cuts off mid-cycle.
      className={focused ? 'hub-milestone-focus' : ''}
      style={{
        ...(focused
          ? {
            position: 'relative',
            borderRadius: 12,
            ['--mfp-color' as string]: `${color}cc`,
            animation: 'hub-milestone-focus-pulse 1.6s ease-out 3',
          }
          : {}),
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={expanded ? `Hide details for ${title}` : `Show details for ${title}`}
        style={{
          display: 'flex', flexDirection: 'column',
          width: '100%',
          padding: '14px 16px', borderRadius: 12,
          backgroundColor: rowBg,
          border: `1px solid ${rowBorder}`,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          color: 'inherit',
          transition: 'background-color 160ms ease, border-color 160ms ease',
        }}
      >
      {/* Top row — icon tile + title cluster + (ⓘ) state hint + status
          icon. The (ⓘ) is a visual signifier only — it rotates with
          `expanded` to confirm the row-wide tap registered. The whole
          row is the actual clickable surface so users don't have to
          aim for the small icon. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 7,
          backgroundColor: `${color}22`,
          border: `1px solid ${color}55`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Emblem size={13} strokeWidth={2.6} color={color} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontFamily: BODY, fontSize: 13, fontWeight: 900,
              color: earned || isNext ? CREAM : MIST,
            }}>
              {title}
            </span>
            {rare && (
              <span style={{
                fontFamily: BODY, fontSize: 8, fontWeight: 900,
                color, letterSpacing: '0.16em', textTransform: 'uppercase',
                padding: '1px 5px', borderRadius: 4,
                backgroundColor: `${color}18`,
                border: `1px solid ${color}44`,
              }}>
                Rare
              </span>
            )}
          </div>
          {value && (
            <div style={{
              fontFamily: BODY, fontSize: 11, fontWeight: 700,
              color: earned ? GREEN : isNext ? color : MIST_DIM,
            }}>
              {value}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 22, height: 22, borderRadius: '50%',
              backgroundColor: expanded ? `${color}26` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${expanded ? `${color}77` : MIST_FAINT}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background-color 160ms ease, border-color 160ms ease, transform 160ms ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <Info size={12} strokeWidth={2.6} color={expanded ? color : MIST} />
          </span>
          {earned
            ? <Check size={16} strokeWidth={3} color={GREEN} />
            : isNext
              ? <Zap size={14} strokeWidth={2.6} color={color} />
              : <Lock size={12} strokeWidth={2.4} color={MIST_DIM} />}
        </div>
      </div>

      {/* Progress bar — shows recruits earned vs threshold visually
          so the gap to unlock is felt, not just read. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, (current / threshold) * 100)}%`,
            backgroundColor: earned ? GREEN : isNext ? color : `${MIST_DIM}88`,
            transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
          }} />
        </div>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: BODY, fontSize: 11, fontWeight: 700,
          color: earned ? GREEN : isNext ? color : MIST_DIM,
          whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"',
        }}>
          <Users size={11} strokeWidth={2.6} />
          {current} / {threshold}
        </span>
      </div>

      {/* Accordion — collapses to 0 height when closed using the
          grid-template-rows trick (smoother than max-height, and
          accommodates content that wraps). The inner overflow:hidden
          clips during the transition so the user doesn't see the
          content slide up and out — it just fades in cleanly. */}
      <div
        id={contentId}
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 280ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8,
            backgroundColor: `${color}10`,
            border: `1px solid ${color}33`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div>
              <div style={{
                fontFamily: BODY, fontSize: 9, fontWeight: 800, color: MIST_DIM,
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2,
              }}>
                What you do
              </div>
              <div style={{
                fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
                lineHeight: 1.45,
              }}>
                {requirement}
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: BODY, fontSize: 9, fontWeight: 800, color: MIST_DIM,
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2,
              }}>
                What you get
              </div>
              <div style={{
                fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
                lineHeight: 1.45,
              }}>
                {howItWorks}
              </div>
            </div>
          </div>
        </div>
      </div>
      </button>
    </div>
  )
}

function TrophyLadderScreen({ recruits, focusedAt }: { recruits: number; focusedAt: number | null }) {
  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 18px',
      }}>
        Each recruit earns you cash <strong style={{ color: CREAM }}>and</strong> climbs you toward permanent perks. Both happen lifetime — never reset.
      </p>

      {/* Layer 1 — cash per conversion ladder */}
      <div style={{
        marginBottom: 18, padding: 14, borderRadius: 12,
        backgroundColor: 'rgba(245,158,11,0.06)',
        border: `1px solid ${GOLD}44`,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: 11, fontWeight: 900,
          color: GOLD, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10,
        }}>
          Cash per recruit (scales lifetime)
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LAYER1_CASH_LADDER.map(l => {
            // Range strings are "1–2", "3–5", "6–9", "10+". Parse the
            // bounds so we can compute both "tier reached" (low <=
            // recruits) and "tier IS the current bucket" (recruits falls
            // within low..high, or low..∞ for the 10+ tier).
            const parts = l.range.split('–')
            const low = parseInt(parts[0].replace('+', ''), 10)
            const isOpenEnded = l.range.endsWith('+') || parts.length === 1
            const high = isOpenEnded ? Infinity : parseInt(parts[1] ?? parts[0], 10)
            const earned = recruits >= low
            const isCurrent = recruits >= low && recruits <= high
            // Visual hierarchy: current bucket = brand orange (the rate
            // you're earning right now), earned-but-past = green (cleared),
            // future = quiet.
            const bg = isCurrent ? `${GOLD}22` : earned ? `${GREEN}14` : 'rgba(255,255,255,0.03)'
            const border = isCurrent ? GOLD : earned ? `${GREEN}44` : MIST_FAINT
            const numFg = isCurrent ? GOLD_LITE : earned ? GREEN : CREAM
            return (
              <div key={l.range} style={{
                position: 'relative',
                flex: '1 1 0', minWidth: 100,
                padding: '10px 12px', borderRadius: 8,
                backgroundColor: bg,
                border: `${isCurrent ? '1.5px' : '1px'} solid ${border}`,
                boxShadow: isCurrent ? `0 0 12px ${GOLD}55, inset 0 0 8px ${GOLD}22` : 'none',
              }}>
                {isCurrent && (
                  <span style={{
                    position: 'absolute', top: -7, right: 8,
                    padding: '1px 6px', borderRadius: 6,
                    backgroundColor: GOLD,
                    color: BG_DEEP,
                    fontFamily: BODY, fontSize: 8, fontWeight: 900,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    boxShadow: `0 2px 6px rgba(0,0,0,0.5)`,
                  }}>
                    You · now
                  </span>
                )}
                <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 700, color: isCurrent ? CREAM : MIST_DIM, fontFeatureSettings: '"tnum"' }}>
                  Recruits {l.range}
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: numFg, marginTop: 2 }}>
                  AED {l.cash}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Layer 3 — tier perks */}
      <div style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 900,
        color: CYAN, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        Lifetime tier perks (forever — while subscribed)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LIFETIME_TIERS.map((t, i) => {
          const earned = recruits >= t.at
          const isNext = !earned && t.at === LIFETIME_TIERS.find(x => recruits < x.at)?.at
          return (
            <MilestoneInfoRow
              key={t.at}
              title={`Tier ${i + 1} · ${t.label}`}
              color={t.color}
              Emblem={t.Emblem}
              requirement={t.requirement}
              howItWorks={t.howItWorks}
              current={recruits}
              threshold={t.at}
              earned={earned}
              isNext={!!isNext}
              focused={focusedAt === t.at}
            />
          )
        })}
      </div>

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
      }}>
        Credits auto-apply to your next Dormers renewal · not cashable
      </p>
    </div>
  )
}

function QuestsScreen({
  recruitsCycle, milestones, focusedAt,
}: {
  recruitsCycle: number
  milestones: CycleMilestone[]
  focusedAt: number | null
}) {
  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 12px',
      }}>
        Hit these recruit counts <strong style={{ color: CREAM }}>this month</strong> for big bonuses. Resets when your subscription renews.
      </p>
      <div style={{
        marginBottom: 18,
        fontFamily: BODY, fontSize: 11, fontWeight: 800, color: RED,
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <span style={{ fontFeatureSettings: '"tnum"' }}>{recruitsCycle}</span> recruits this month
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {milestones.map(m => {
          const earned = recruitsCycle >= m.at
          const isNext = !earned && m.at === milestones.find(x => recruitsCycle < x.at)?.at
          return (
            <MilestoneInfoRow
              key={m.at}
              title={m.label}
              value={m.value}
              color={m.color}
              Emblem={m.Emblem}
              rare={m.rare}
              requirement={m.requirement}
              howItWorks={m.howItWorks}
              current={recruitsCycle}
              threshold={m.at}
              earned={earned}
              isNext={!!isNext}
              focused={focusedAt === m.at}
            />
          )
        })}
      </div>
      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '14px 0 0', textAlign: 'center',
      }}>
        Credits auto-apply to your next renewal · not cashable
      </p>
    </div>
  )
}

// Phase 8E — Streak Chest claim screen. POST /api/dorm-wars/streak-chest
// returns the RNG outcome. The doubler outcome is intentionally NOT teased
// pre-open ("Credits · or something epic") so the rare 5% hit is a genuine
// surprise instead of a let-down most of the time.
// Phase 8M — Streak Calendar layout constants. The user-facing cycle is
// 4 weeks = 28 days with one reward box at the end of each week. Doubler
// outcomes (the rare 2× boost) can only roll out of chests 3 and 4 — the
// last two boxes of the cycle — so the early chests stay reliable cash
// and the late-cycle chests carry the "something epic might land" payoff.
const STREAK_CYCLE_DAYS = 28
const STREAK_CHEST_INTERVAL = 7

function StreakChestScreen({
  state, onClaimed,
}: {
  state: StreakChestState
  onClaimed: (next: StreakChestState) => void
}) {
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<{
    rng_bucket: StreakChestBucket
    value_aed: number | null
    doubler_expires_at: string | null
    streak_day: number
  } | null>(null)

  // ── Cycle math — translate absolute streak day into "position within
  // the current 4-week cycle." Everything in the calendar is rendered off
  // these derived values so the math lives in one place. ───────────────
  const count = state.count
  const cycleNum = count === 0 ? 1 : Math.floor((count - 1) / STREAK_CYCLE_DAYS) + 1
  const cycleStart = (cycleNum - 1) * STREAK_CYCLE_DAYS                  // 0, 28, 56...
  const cyclePos = count - cycleStart                                  // 0..28
  const lastChestInCycle = Math.max(0, state.lastChestDay - cycleStart)    // 0..28
  const chestsClaimedInCyc = Math.floor(lastChestInCycle / STREAK_CHEST_INTERVAL) // 0..4

  // Tier flame color for the streak header (same source as the chip)
  const tier = flameTier(count)

  // Active claim result — either the just-clicked outcome, or the most
  // recent stored claim if it matches lastChestDay (page-load case).
  const showResult = justClaimed ?? (
    state.recentChest && state.recentChest.streak_day === state.lastChestDay
      ? state.recentChest
      : null
  )

  async function handleClaim() {
    if (!state.chestReady || claiming) return
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch('/api/dorm-wars/streak-chest', { method: 'POST' })
      const data = await res.json().catch(() => null) as {
        claimed?: boolean
        reason?: string
        rng_bucket?: StreakChestBucket
        value_aed?: number | null
        doubler_expires_at?: string | null
        streak_day?: number
        error?: string
      } | null
      if (!res.ok) {
        if (res.status === 401) {
          setError('Your session expired. Refresh the page and try again.')
        } else if (res.status === 409) {
          setError('This chest is already opened — your streak needs to grow before the next one.')
        } else if (data?.error === 'credit_deposit_failed') {
          setError('Chest opened but credit deposit hit a snag. We\'ll reconcile within the hour.')
        } else {
          setError('Could not open the chest right now. Please try again in a moment.')
        }
        return
      }
      if (data?.rng_bucket && typeof data.streak_day === 'number') {
        const claim = {
          rng_bucket: data.rng_bucket,
          value_aed: data.value_aed ?? null,
          doubler_expires_at: data.doubler_expires_at ?? null,
          streak_day: data.streak_day,
        }
        setJustClaimed(claim)
        onClaimed({
          ...state,
          lastChestDay: data.streak_day,
          chestReady: false,
          daysUntilNext: STREAK_CHEST_INTERVAL,
          recentChest: {
            ...claim,
            claimed_at: new Date().toISOString(),
          },
        })
      }
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setClaiming(false)
    }
  }

  // Next chest box number (1..4) in this cycle — the one that's currently
  // either ready to claim or counting down to ready.
  const nextChestNum = Math.min(4, chestsClaimedInCyc + 1)

  return (
    <div>
      {/* ── HEADER — streak day count + flame + cycle status ────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 12,
        backgroundImage: `linear-gradient(135deg, ${tier.color}22 0%, ${tier.color}06 100%)`,
        border: `1px solid ${tier.color}55`,
        marginBottom: 18,
      }}>
        <span style={{
          width: 48, height: 48, borderRadius: 12,
          backgroundColor: `${tier.color}1a`,
          border: `1.5px solid ${tier.color}88`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          filter: tier.glowSize > 0 ? `drop-shadow(0 0 8px ${tier.color})` : 'none',
        }}>
          <Flame size={26} strokeWidth={2.4} color={tier.color} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: DISPLAY, fontSize: 28, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.02em', lineHeight: 1, fontFeatureSettings: '"tnum"',
          }}>
            {count}<span style={{ fontSize: 16, color: tier.color, marginLeft: 4 }}>
              {count === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
            marginTop: 4, letterSpacing: '0.04em',
          }}>
            {state.chestReady
              ? <><span style={{ color: GOLD_LITE, fontWeight: 900 }}>Chest #{nextChestNum} ready</span> · open below</>
              : count === 0
                ? 'Start your first day — chest #1 unlocks at day 7'
                : <>Chest #{nextChestNum} unlocks in <span style={{ color: tier.color, fontWeight: 900 }}>{state.daysUntilNext} {state.daysUntilNext === 1 ? 'day' : 'days'}</span></>}
          </div>
        </div>
      </div>

      {/* ── 4-WEEK TRACK ──────────────────────────────────────────────
          Per-week row: tiny "Wk N" label · 6 small flame circles for the
          weekday slots · one CLEARLY DISTINCT reward chest at the end.
          Flames are 24px circles, chest is a 52×52 rounded square — the
          shape difference alone signals "this is the reward, not just
          another day." Past flames glow tier-color, today wears a strong
          ring + in-cell TODAY tag, future cells are quiet but visible.
          Doubler-eligible chests (3 & 4) wear a "2×" corner badge. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {[1, 2, 3, 4].map(weekNum => {
          const weekStartDay = (weekNum - 1) * 7 + 1   // 1, 8, 15, 22
          const weekEndDay = weekNum * 7              // 7, 14, 21, 28
          const isCurrentWeek = cyclePos >= weekStartDay && cyclePos <= weekEndDay
          const chestNum = weekNum
          const chestClaimed = chestNum <= chestsClaimedInCyc
          const chestReady = chestNum === chestsClaimedInCyc + 1 && state.chestReady
          // Chest visual state — distinct colors per status
          const chestBg = chestReady ? `${GOLD}26`
            : chestClaimed ? `${GREEN}1a`
              : 'rgba(0,0,0,0.35)'
          const chestBorder = chestReady ? GOLD
            : chestClaimed ? `${GREEN}88`
              : `${GOLD_LITE}55`
          const chestIconColor = chestReady ? GOLD_LITE
            : chestClaimed ? GREEN
              : GOLD_LITE
          return (
            <div key={weekNum} className="hub-streak-row" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 12,
              backgroundColor: isCurrentWeek ? `${tier.color}10` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isCurrentWeek ? `${tier.color}55` : MIST_FAINT}`,
              transition: 'background-color 220ms ease, border-color 220ms ease',
            }}>
              {/* Week label — quiet anchor on the left so the user can
                  orient ("I'm on week 1") without counting cells. */}
              <span style={{
                fontFamily: BODY, fontSize: 11, fontWeight: 900,
                color: isCurrentWeek ? tier.color : MIST,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                minWidth: 36, lineHeight: 1, flexShrink: 0,
              }}>
                Wk {weekNum}
              </span>

              {/* Flame days — 6 small circles that flex to fill the row and
                  SHRINK on narrow phones (min-width:0) so the row never
                  overflows past the chest. */}
              <div className="hub-streak-flames" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
                {[1, 2, 3, 4, 5, 6].map(d => {
                  const dayNum = weekStartDay + d - 1
                  const isPast = dayNum < cyclePos
                  const isToday = dayNum === cyclePos
                  return (
                    <div key={d} style={{
                      position: 'relative',
                      flex: '0 1 28px', minWidth: 0, aspectRatio: 1, borderRadius: '50%',
                      backgroundColor: isToday ? `${tier.color}33`
                        : isPast ? `${tier.color}1a`
                          : 'rgba(0,0,0,0.3)',
                      border: `1.5px solid ${isToday ? tier.color
                        : isPast ? `${tier.color}99`
                          : `${tier.color}22`}`,
                      boxShadow: isToday ? `0 0 12px ${tier.color}99, inset 0 0 6px ${tier.color}44` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Flame
                        size={13} strokeWidth={isPast || isToday ? 2.6 : 2}
                        color={isPast || isToday ? tier.color : `${tier.color}55`}
                        style={{
                          animation: isToday && tier.animated ? 'hub-flame-flicker 2.4s ease-in-out infinite' : undefined,
                          filter: isPast || isToday ? `drop-shadow(0 0 4px ${tier.color}99)` : 'none',
                        }}
                      />
                      {isToday && (
                        <span style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          '--pr-color': `${tier.color}99`,
                          animation: 'hub-pulse-ring 2.2s ease-out infinite',
                          pointerEvents: 'none',
                        } as React.CSSProperties} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Arrow separator → chest. Small chevron cues the eye:
                  "the flames feed into the chest." */}
              <ArrowRight size={12} strokeWidth={2.6}
                color={chestReady ? GOLD : isCurrentWeek ? `${tier.color}99` : MIST_DIM}
                style={{ flexShrink: 0 }}
              />

              {/* Chest — visually different shape (rounded square, not
                  circle) and bigger than flames so it reads as "the
                  reward at the end of the week." */}
              <div className="hub-streak-chest" style={{
                position: 'relative',
                width: 52, height: 52, borderRadius: 12,
                backgroundColor: chestBg,
                border: `1.5px solid ${chestBorder}`,
                boxShadow: chestReady
                  ? `0 0 16px ${GOLD}aa, inset 0 0 8px ${GOLD}33`
                  : chestClaimed
                    ? `inset 0 0 8px ${GREEN}33`
                    : `inset 0 0 6px ${GOLD_LITE}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                transform: 'translateZ(0)',
              }}>
                <Gift
                  size={26} strokeWidth={2.4} color={chestIconColor}
                  style={{
                    display: 'block',
                    animation: chestReady ? 'hub-cta-pulse 2.2s ease-in-out infinite' : undefined,
                  }}
                />
                {chestClaimed && (
                  <span style={{
                    position: 'absolute', bottom: 3, right: 3,
                    width: 16, height: 16, borderRadius: '50%',
                    backgroundColor: GREEN,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={10} strokeWidth={3.4} color={BG_DEEP} />
                  </span>
                )}
                {chestReady && (
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    '--pr-color': `${GOLD}99`,
                    animation: 'hub-pulse-ring 2.2s ease-out infinite',
                    pointerEvents: 'none',
                  } as React.CSSProperties} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── CLAIM / RESULT ────────────────────────────────────────────
          If the user has a freshly-claimed chest (or one waiting on the
          server from a previous session), show the outcome. If a chest is
          ready, render a prominent claim button. Otherwise the calendar
          alone tells the story. */}
      {showResult && !state.chestReady ? (
        <div style={{
          padding: '14px 16px',
          borderRadius: 12,
          backgroundImage: `linear-gradient(135deg, ${GREEN}22 0%, ${GOLD}10 100%)`,
          border: `1.5px solid ${GREEN}66`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{
            width: 40, height: 40, borderRadius: 10,
            backgroundColor: showResult.rng_bucket === 'doubler' ? GOLD_LITE : GREEN,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {showResult.rng_bucket === 'doubler'
              ? <Zap size={22} strokeWidth={2.6} color={BG_DEEP} />
              : <Check size={22} strokeWidth={3} color={BG_DEEP} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: DISPLAY, fontSize: 16, fontWeight: 900, color: CREAM,
              letterSpacing: '-0.01em',
            }}>
              {showResult.rng_bucket === 'doubler'
                ? '2× rewards · active for 7 days'
                : <>+AED {showResult.value_aed} landed</>}
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
              marginTop: 2,
            }}>
              {chestBucketLabel(showResult.rng_bucket)} · day {showResult.streak_day}
            </div>
          </div>
        </div>
      ) : state.chestReady ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming}
          className="hub-cta-claim"
          style={{
            width: '100%',
            padding: '14px 22px', borderRadius: 999,
            backgroundImage: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LITE} 100%)`,
            border: '2px solid rgba(255,225,140,0.85)',
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 13, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: claiming ? 'default' : 'pointer',
            boxShadow: `0 12px 30px ${GOLD}55`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            opacity: claiming ? 0.85 : 1,
            transition: 'opacity 200ms ease',
          }}
        >
          {claiming ? 'Opening…' : <>Open chest #{nextChestNum} <Gift size={16} strokeWidth={2.6} /></>}
        </button>
      ) : null}

      {error && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: `${RED}18`,
          border: `1px solid ${RED}55`,
          fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
        }}>
          {error}
        </div>
      )}

      <div style={{
        marginTop: 18, padding: '12px 14px', borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: `1px solid ${MIST_FAINT}`,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 800, color: MIST,
          letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
        }}>
          How it works
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST_DIM,
          lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span>Visit this page once a day — each visit adds <span style={{ color: tier.color, fontWeight: 800 }}>+1</span> to your streak.</span>
          <span>Every <span style={{ color: GOLD_LITE, fontWeight: 800 }}>7 unbroken days</span> unlocks a mystery chest (AED 5–12).</span>
          <span>Miss a day and your streak resets to 0 — chest progress starts over.</span>
          <span style={{ color: MIST, fontWeight: 700, marginTop: 2 }}>Chests #3 & #4 can roll a rare 2× doubler that boosts all rewards for 7 days.</span>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  GOOGLE REVIEW SCREEN — Phase 8K (screenshot upload + Gemini verification)
//
//  Two-step user flow inside the modal:
//   1. "Open Google review" button — opens the business page in a new tab.
//   2. File picker — accept="image/*" triggers the OS native picker on
//      mobile (Take Photo / Photo Library / Browse) and a file dialog on
//      desktop. After pick: preview thumbnail + Submit button.
//   3. Submit → POST multipart to /api/dorm-wars/layer4/google-review.
//      Server decides auto_approve / auto_reject / manual_review and the
//      result is rendered inline.
// ════════════════════════════════════════════════════════════════════════════

const GOOGLE_REVIEW_URL = 'https://maps.app.goo.gl/sBTUwJeYXqzbm1Ut7'

type ReviewSubmitResult =
  | { decision: 'auto_approved'; reason: string; valueAed: number }
  | { decision: 'manual_review'; reason: string }
  | { decision: 'auto_rejected'; reason: string }
  | { decision: 'already_credited'; valueAed: number }
  // Duplicate path — Gemini extracted text that matches a prior approved
  // claim (by hash or reviewer name). Server still queues for manual
  // review; the user sees an honest message and can contact support.
  | { decision: 'duplicate'; reason: string }

// ── CELEBRATION OVERLAY ─────────────────────────────────────────────────────
// Signature moment for the auto-approved verdict. Full-page frosted-glass
// wash + animated checkmark (SVG stroke-draw) + falling confetti in the
// brand palette + headline showing the credit landed. Auto-dismisses after
// 6s OR on backdrop click. Per /microinteractions Saffer: this is a
// signature moment — restraint matters; we only fire on auto_approve (not
// manual_review or already_credited which use the calmer in-modal screen).

const CONFETTI_COLORS = [GOLD, GOLD_LITE, GREEN, CYAN, PURPLE, PINK, CREAM]

function CelebrationOverlay({ valueAed, onDismiss }: { valueAed: number; onDismiss: () => void }) {
  // Auto-dismiss after 6s (long enough to read; short enough not to nag).
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  // Allow Escape to dismiss (accessibility).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div
      className="hub-celebration-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        backgroundColor: 'rgba(9,24,37,0.84)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        cursor: 'pointer',
        animation: 'hub-celebration-fade-in 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Confetti — 24 small colored squares falling with slight rotation. */}
      {Array.from({ length: 24 }).map((_, i) => {
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const leftPct = (i * 4.3) % 100
        const delay = (i % 6) * 0.12
        const drift = ((i % 5) - 2) * 8  // -16..+16px horizontal drift
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: '-20px',
              left: `${leftPct}%`,
              width: 8, height: 12,
              backgroundColor: color,
              opacity: 0.92,
              borderRadius: 1.5,
              transform: `rotate(${i * 27}deg)`,
              animation: `hub-confetti-fall 2.6s ${delay}s cubic-bezier(0.33, 1, 0.68, 1) forwards`,
              ['--confetti-drift' as string]: `${drift}px`,
              pointerEvents: 'none',
            } as React.CSSProperties}
          />
        )
      })}

      {/* Centered card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 380,
          padding: '32px 28px 26px',
          borderRadius: 22,
          backgroundColor: 'rgba(22,47,64,0.96)',
          border: `1.5px solid ${GREEN}66`,
          boxShadow: `0 32px 80px rgba(0,0,0,0.6), 0 0 48px ${GREEN}33, inset 0 1px 0 ${GREEN}44`,
          textAlign: 'center',
          cursor: 'default',
          animation: 'hub-celebration-pop 520ms cubic-bezier(0.16, 1, 0.3, 1) 80ms backwards',
        }}
      >
        {/* Animated checkmark — SVG with stroke-dasharray draw-in */}
        <div style={{ marginBottom: 18 }}>
          <svg
            width={84} height={84} viewBox="0 0 84 84"
            style={{ filter: `drop-shadow(0 0 12px ${GREEN}88)` }}
          >
            <circle
              cx="42" cy="42" r="38"
              fill="none"
              stroke={GREEN}
              strokeWidth="3"
              style={{
                strokeDasharray: 240,
                strokeDashoffset: 240,
                animation: 'hub-check-circle-draw 600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards',
              }}
            />
            <path
              d="M 25 43 L 37 55 L 60 30"
              fill="none"
              stroke={GREEN}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 60,
                strokeDashoffset: 60,
                animation: 'hub-check-tick-draw 420ms cubic-bezier(0.5, 0, 0.5, 1) 700ms forwards',
              }}
            />
          </svg>
        </div>

        {/* Headline */}
        <h2
          id="celebration-title"
          style={{
            fontFamily: DISPLAY, fontSize: 28, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.02em', lineHeight: 1.1,
            margin: '0 0 4px',
            animation: 'hub-celebration-text-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) 350ms backwards',
          }}
        >
          You earned{' '}
          <span style={{
            color: GOLD_LITE,
            textShadow: `0 0 18px ${GOLD}77`,
            fontFeatureSettings: '"tnum"',
          }}>
            AED {valueAed}
          </span>
        </h2>

        <p style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 800, color: GREEN,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          margin: '0 0 18px',
          animation: 'hub-celebration-text-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) 420ms backwards',
        }}>
          Added to your wallet
        </p>

        {/* Body copy */}
        <p style={{
          fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
          lineHeight: 1.6, margin: '0 0 22px',
          animation: 'hub-celebration-text-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) 500ms backwards',
        }}>
          Thanks for the review — it really helps other students find Dormers.
          You can claim another <strong style={{ color: CREAM, fontWeight: 800 }}>AED 10</strong> on your next monthly subscription.
        </p>

        {/* Done button */}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: '12px 36px', borderRadius: 999,
            backgroundColor: GREEN,
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            border: 'none', cursor: 'pointer',
            boxShadow: `0 10px 28px ${GREEN}55`,
            animation: 'hub-celebration-text-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) 580ms backwards',
          }}
        >
          Sweet
        </button>
      </div>
    </div>
  )
}

function GoogleReviewScreen({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ReviewSubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Page-wide celebration overlay fires only on auto_approved. Lives at
  // hub level (via portal-like fixed position) so it overlays everything
  // including this modal.
  const [showCelebration, setShowCelebration] = useState<{ valueAed: number } | null>(null)

  // Clean up object URLs to avoid memory leaks on file swap / unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      setError('Screenshot is over 5 MB — try a smaller one.')
      return
    }
    setError(null)
    setResult(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  async function handleSubmit() {
    if (!file || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('screenshot', file)
      const res = await fetch('/api/dorm-wars/layer4/google-review', {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => null) as {
        decision?: ReviewSubmitResult['decision']
        reason?: string
        row?: { value_aed: number }
        duplicateOf?: string | null
        error?: string
      } | null

      if (!res.ok) {
        if (res.status === 413) setError('Screenshot is too large (max 5 MB).')
        else if (res.status === 415) setError('Use a JPEG, PNG, WebP, or HEIC screenshot.')
        else if (res.status === 403) setError('Google review reward is for Monthly Premium plans and up.')
        else if (res.status === 401) setError('Your session expired. Refresh the page and try again.')
        else setError(data?.error ?? 'Something went wrong. Please try again.')
        return
      }

      const valueAed = data?.row?.value_aed ?? LAYER4_VALUE_AED.google_review
      if (data?.decision === 'auto_approved') {
        setResult({ decision: 'auto_approved', reason: data.reason ?? '', valueAed })
        // Fire the signature-moment overlay. The in-modal screen STILL
        // renders behind it (so when the overlay dismisses, the user lands
        // on the calm "verified · come back next month" view).
        setShowCelebration({ valueAed })
      } else if (data?.decision === 'already_credited') {
        setResult({ decision: 'already_credited', valueAed })
      } else if (data?.decision === 'auto_rejected') {
        setResult({ decision: 'auto_rejected', reason: data.reason ?? "We couldn't tell this was a Google review of Dormers." })
      } else if (data?.duplicateOf) {
        // Server queued for manual review but flagged a collision. Honest
        // copy beats a vague "queued" message — protects legit users from
        // silent fraud-pile-on and gives them a clean support path.
        setResult({
          decision: 'duplicate',
          reason:   "This review looks like one we've already credited. If that doesn't sound right, message us on WhatsApp and we'll sort it.",
        })
      } else {
        setResult({ decision: 'manual_review', reason: data?.reason ?? "We'll verify within 24h." })
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleTryAgain() {
    setResult(null)
    setFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    fileInputRef.current?.click()
  }

  // Result screens take over the modal body when we have a verdict.
  if (result) {
    if (result.decision === 'auto_approved' || result.decision === 'already_credited') {
      return (
        <>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              margin: '0 auto 16px', width: 64, height: 64, borderRadius: '50%',
              backgroundColor: `${GREEN}22`, border: `2px solid ${GREEN}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px ${GREEN}55`,
            }}>
              <Check size={32} strokeWidth={3} color={GREEN} />
            </div>
            <h3 style={{
              fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: CREAM,
              margin: '0 0 6px',
            }}>
              {result.decision === 'auto_approved' ? 'Verified!' : 'Already credited'}
            </h3>
            <p style={{
              fontFamily: BODY, fontSize: 14, fontWeight: 700, color: GREEN,
              margin: '0 0 16px',
            }}>
              +AED {result.valueAed} in your wallet
            </p>
            <p style={{
              fontFamily: BODY, fontSize: 12, fontWeight: 500, color: MIST,
              lineHeight: 1.55, margin: '0 0 18px',
            }}>
              Thanks for the review — it really helps other students discover Dormers. You can claim again next monthly subscription.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 22px', borderRadius: 999,
                backgroundColor: 'transparent',
                color: CREAM,
                fontFamily: BODY, fontSize: 11, fontWeight: 800,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                border: `1px solid ${MIST_FAINT}`, cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
          {showCelebration && (
            <CelebrationOverlay
              valueAed={showCelebration.valueAed}
              onDismiss={() => setShowCelebration(null)}
            />
          )}
        </>
      )
    }
    if (result.decision === 'auto_rejected') {
      return (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            margin: '0 auto 16px', width: 64, height: 64, borderRadius: '50%',
            backgroundColor: `${RED}22`, border: `2px solid ${RED}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={32} strokeWidth={3} color={RED} />
          </div>
          <h3 style={{
            fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
            margin: '0 0 8px',
          }}>
            We couldn&rsquo;t verify this one
          </h3>
          <p style={{
            fontFamily: BODY, fontSize: 12, fontWeight: 500, color: MIST,
            lineHeight: 1.55, margin: '0 0 18px',
          }}>
            {result.reason} Make sure the screenshot clearly shows your Google review of <strong style={{ color: CREAM }}>Dormers</strong> with the star rating visible.
          </p>
          <button
            type="button"
            onClick={handleTryAgain}
            style={{
              padding: '11px 22px', borderRadius: 999,
              backgroundColor: GOLD, color: BG_DEEP,
              fontFamily: BODY, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              border: 'none', cursor: 'pointer',
              boxShadow: `0 8px 22px ${GOLD}44`,
            }}
          >
            Try another screenshot
          </button>
        </div>
      )
    }
    if (result.decision === 'duplicate') {
      return (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{
            margin: '0 auto 16px', width: 64, height: 64, borderRadius: '50%',
            backgroundColor: `${GOLD}22`, border: `2px solid ${GOLD}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldAlert size={28} strokeWidth={2.6} color={GOLD_LITE} />
          </div>
          <h3 style={{
            fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
            margin: '0 0 8px',
          }}>
            We&rsquo;ve seen this review before
          </h3>
          <p style={{
            fontFamily: BODY, fontSize: 12, fontWeight: 500, color: MIST,
            lineHeight: 1.55, margin: '0 0 18px',
          }}>
            {result.reason}
          </p>
          <a
            href={whatsAppHref("Hi! My Google review claim was flagged as a duplicate but it's mine.")}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '11px 22px', borderRadius: 999,
              backgroundColor: GOLD, color: BG_DEEP,
              fontFamily: BODY, fontSize: 12, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              textDecoration: 'none',
              boxShadow: `0 8px 22px ${GOLD}44`,
            }}
          >
            Message us
          </a>
        </div>
      )
    }
    // manual_review
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{
          margin: '0 auto 16px', width: 64, height: 64, borderRadius: '50%',
          backgroundColor: `${GOLD}22`, border: `2px solid ${GOLD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <KeyRound size={28} strokeWidth={2.6} color={GOLD_LITE} />
        </div>
        <h3 style={{
          fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
          margin: '0 0 8px',
        }}>
          Submitted for review
        </h3>
        <p style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 500, color: MIST,
          lineHeight: 1.55, margin: 0,
        }}>
          We&rsquo;ll double-check this manually and credit your wallet within 24h.
        </p>
      </div>
    )
  }

  // ─── DEFAULT: pick + submit UI ─────────────────────────────────────────
  // State-aware CTA copy:
  //   no file       → "Add screenshot to continue" (disabled)
  //   file picked   → "Verify & claim AED 10"  (primary action, gold)
  //   submitting    → "Verifying your review…"  (locked, spinner-style)
  const ctaCopy = submitting
    ? 'Verifying your review…'
    : file
      ? 'Verify & claim AED 10'
      : 'Add a screenshot to continue'

  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 14px',
      }}>
        Leave us a Google review, screenshot it, upload it here — we&rsquo;ll
        verify and drop <strong style={{ color: CREAM, fontWeight: 800 }}>AED 10</strong> into
        your wallet. One per monthly subscription.
      </p>

      {/* ── BEST PRACTICES — fastest-approval tips ─────────────────────
          Per /microinteractions Saffer: rules should be transparent.
          Showing the AI's checklist up-front prevents the user from
          guessing what passes — turns "manual review" into a rare miss
          rather than the default outcome. */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          backgroundColor: `${GOLD}10`,
          border: `1px solid ${GOLD}33`,
          marginBottom: 14,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 8,
        }}>
          <Zap size={12} strokeWidth={2.6} color={GOLD_LITE} />
          <span style={{
            fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GOLD,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            For instant approval
          </span>
        </div>
        <ul style={{
          margin: 0, paddingLeft: 18,
          fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
          lineHeight: 1.6,
        }}>
          <li>
            <strong style={{ color: CREAM, fontWeight: 800 }}>&ldquo;Dormers&rdquo;</strong> visible in the shot (header, business card, or in your review text)
          </li>
          <li>Star rating in frame (1-5 stars)</li>
          <li>Sharp screenshot — not blurry or cropped</li>
        </ul>
      </div>

      {/* ── STEP 1 — open Google review ──────────────────────────────── */}
      <a
        href={GOOGLE_REVIEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hub-step-row"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 12,
          backgroundImage: `linear-gradient(135deg, ${GREEN}28 0%, ${GREEN}10 100%)`,
          border: `1.5px solid ${GREEN}66`,
          color: CREAM, textDecoration: 'none',
          marginBottom: 10,
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms ease, border-color 180ms ease',
        }}
      >
        <span style={{
          flexShrink: 0,
          width: 36, height: 36, borderRadius: 9,
          backgroundColor: GREEN,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Star size={18} strokeWidth={2.6} color={BG_DEEP} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 900, color: CREAM, lineHeight: 1.2 }}>
            1 · Leave a Google review
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST, marginTop: 2 }}>
            Opens the Dormers business page
          </div>
        </div>
        <ExternalLink size={16} strokeWidth={2.4} color={GREEN} />
      </a>

      {/* ── STEP 2 — file picker ───────────────────────────────────────
          Hidden native <input type="file"> + visible styled button. On
          mobile the native picker shows "Take Photo / Photo Library /
          Browse" — no dropdown of our own needed. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        onChange={handlePick}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="hub-step-row"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 12,
          backgroundImage: file
            ? `linear-gradient(135deg, ${GOLD}28 0%, ${GOLD}10 100%)`
            : `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
          border: `1.5px solid ${file ? `${GOLD}66` : MIST_FAINT}`,
          color: CREAM, cursor: 'pointer',
          marginBottom: 12,
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms ease, border-color 180ms ease, background-image 220ms ease',
        }}
      >
        <span style={{
          flexShrink: 0,
          width: 36, height: 36, borderRadius: 9,
          backgroundColor: file ? GOLD : 'rgba(255,255,255,0.06)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background-color 220ms ease',
        }}>
          {file
            ? <Check size={18} strokeWidth={2.8} color={BG_DEEP} />
            : <Upload size={18} strokeWidth={2.6} color={MIST} />}
        </span>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 900, color: CREAM, lineHeight: 1.2 }}>
            {file ? `2 · ${file.name.slice(0, 28)}${file.name.length > 28 ? '…' : ''}` : '2 · Upload screenshot'}
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST, marginTop: 2 }}>
            {file ? `${(file.size / 1024).toFixed(0)} KB — tap to swap` : 'From your gallery, camera, or files'}
          </div>
        </div>
      </button>

      {/* Preview thumb when a file is picked — fades + scales in. Per
          /microinteractions Saffer: feedback should be immediate; the
          preview confirms the pick registered without a separate toast. */}
      {previewUrl && (
        <div
          key={previewUrl}
          style={{
            marginBottom: 14,
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${MIST_FAINT}`,
            maxHeight: 220,
            display: 'flex', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.35)',
            animation: 'hub-preview-rise 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          { /* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Review screenshot preview"
            style={{
              maxWidth: '100%', maxHeight: 220,
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: `${RED}18`,
            border: `1px solid ${RED}55`,
            fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
            marginBottom: 12,
            animation: 'hub-error-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || submitting}
        aria-live="polite"
        className="hub-cta-claim"
        style={{
          width: '100%',
          padding: '14px 22px', borderRadius: 999,
          backgroundImage: !file || submitting
            ? 'none'
            : `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LITE} 100%)`,
          backgroundColor: !file || submitting ? 'rgba(255,255,255,0.06)' : undefined,
          color: !file || submitting ? MIST_DIM : BG_DEEP,
          fontFamily: BODY, fontSize: 13, fontWeight: 900,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          border: 'none',
          cursor: !file || submitting ? 'default' : 'pointer',
          boxShadow: !file || submitting ? 'none' : `0 12px 30px ${GOLD}66`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms ease, background-color 180ms ease',
        }}
      >
        {submitting && (
          <span
            aria-hidden="true"
            style={{
              width: 14, height: 14, borderRadius: '50%',
              border: `2px solid ${MIST_FAINT}`,
              borderTopColor: CREAM,
              animation: 'hub-spinner 720ms linear infinite',
              display: 'inline-block',
            }}
          />
        )}
        {ctaCopy}
      </button>

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '14px 0 0', textAlign: 'center',
      }}>
        Auto-verified by AI in seconds · queued for manual review if anything looks off
      </p>
    </div>
  )
}

function SquadScreen({ scouts, onScoutTap }: { scouts: Scout[]; onScoutTap: (s: Scout) => void }) {
  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 16px',
      }}>
        {scouts.length} scout{scouts.length === 1 ? '' : 's'} dispatched. Tap any to track their journey.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scouts.map((s) => {
          const stage = stageMeta(s.stage)
          const isWin = s.stage === 'subscribed'
          const isOffLadder = s.stage === 'already_subscribed'
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onScoutTap(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px solid ${stage.color}55`,
                color: CREAM, textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 36, height: 36, borderRadius: '50%',
                backgroundColor: `${stage.color}28`,
                border: `1.5px solid ${stage.color}88`,
                color: stage.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: BODY, fontSize: 13, fontWeight: 900,
                boxShadow: isWin ? `0 0 12px ${GREEN}66` : 'none',
                flexShrink: 0,
              }}>
                {s.name.charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 800, color: CREAM, marginBottom: 4 }}>
                  {s.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isOffLadder ? (
                    // Off-ladder: skip pips entirely — this scout isn't on
                    // the journey. Just the stage label, which already reads
                    // "Already with us".
                    <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 800, color: stage.color, letterSpacing: '0.10em' }}>
                      {stage.label}
                    </span>
                  ) : (
                    <>
                      {STAGES.map((stg, i) => (
                        <span key={stg.key} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          backgroundColor: i <= stageIndex(s.stage as Exclude<ScoutStage, 'already_subscribed'>) ? stage.color : 'rgba(255,255,255,0.08)',
                        }} />
                      ))}
                      <span style={{ marginLeft: 8, fontFamily: BODY, fontSize: 10, fontWeight: 800, color: stage.color, letterSpacing: '0.10em' }}>
                        {stage.label}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 700, color: MIST_DIM, fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                {s.daysAgo === 0 ? 'just now' : `${s.daysAgo}d ago`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  PROGRESSION MODAL — opened from the identity block in TopChrome.
//  Shows the full ladder of progression titles (Solo → The GOAT),
//  marking the user's current title and the next milestone to climb to.
// ════════════════════════════════════════════════════════════════════════════

function ProgressionScreen({ recruits, name }: { recruits: number; name: string }) {
  const current = progressionFor(recruits)
  const nextIdx = PROGRESSION_TITLES.findIndex(p => p.threshold > recruits)
  const next = nextIdx >= 0 ? PROGRESSION_TITLES[nextIdx] : null
  const toNext = next ? next.threshold - recruits : 0
  // Progress fraction toward the next title (0..1)
  const fillPct = next
    ? Math.min(100, Math.max(0, ((recruits - current.threshold) / (next.threshold - current.threshold)) * 100))
    : 100

  return (
    <div>
      {/* Header card — current title with glyph, name, and progress to next */}
      <div style={{
        padding: '18px 16px',
        borderRadius: 12,
        backgroundImage: `linear-gradient(135deg, ${current.color}28 0%, ${current.color}08 100%)`,
        border: `1px solid ${current.color}66`,
        marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{
          width: 54, height: 54, borderRadius: '50%',
          backgroundImage: `radial-gradient(circle at 30% 30%, ${current.color}55 0%, ${BG_MID} 75%)`,
          border: `2px solid ${current.color}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 0 18px ${current.color}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
        }}>
          <current.Icon size={28} strokeWidth={2.4} color={current.color} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900,
            color: current.color, letterSpacing: '0.20em', textTransform: 'uppercase', lineHeight: 1,
          }}>
            {current.title}
          </div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.01em', lineHeight: 1.15, marginTop: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
            marginTop: 4, fontFeatureSettings: '"tnum"',
          }}>
            {recruits} lifetime {recruits === 1 ? 'recruit' : 'recruits'}
            {next
              ? <> · <span style={{ color: next.color, fontWeight: 900 }}>{toNext} more to {next.title}</span></>
              : <> · <span style={{ color: GOLD_LITE, fontWeight: 900 }}>Apex tier — there is no higher</span></>}
          </div>
        </div>
      </div>

      {/* Progress bar to next title */}
      {next && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            position: 'relative', height: 6, borderRadius: 3,
            backgroundColor: 'rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${fillPct}%`,
              backgroundImage: `linear-gradient(90deg, ${current.color} 0%, ${next.color} 100%)`,
              boxShadow: `0 0 8px ${next.color}66`,
              transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6,
            fontFamily: BODY, fontSize: 9, fontWeight: 800, color: MIST_DIM,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <span><Users size={9} strokeWidth={2.6} style={{ verticalAlign: 'middle', marginRight: 3 }} />{current.threshold}</span>
            <span><Users size={9} strokeWidth={2.6} style={{ verticalAlign: 'middle', marginRight: 3 }} />{next.threshold}</span>
          </div>
        </div>
      )}

      {/* Title ladder — all 5 titles, marking earned / current / locked */}
      <div style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 900,
        color: GOLD, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10,
      }}>
        Title ladder
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PROGRESSION_TITLES.map(p => {
          const earned = recruits >= p.threshold
          const isCurrent = p.tier === current.tier
          const accent = isCurrent ? GOLD : earned ? GREEN : p.color
          return (
            <div key={p.tier} style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12,
              backgroundColor: isCurrent ? `${GOLD}18`
                : earned ? `${GREEN}10`
                  : `${p.color}08`,
              border: `${isCurrent ? '1.5px' : '1px'} solid ${isCurrent ? GOLD
                : earned ? `${GREEN}44`
                  : `${p.color}55`
                }`,
              boxShadow: isCurrent ? `0 0 14px ${GOLD}44, inset 0 0 8px ${GOLD}22` : 'none',
            }}>
              {isCurrent && (
                <span style={{
                  position: 'absolute', top: -7, right: 10,
                  padding: '1px 6px', borderRadius: 6,
                  backgroundColor: GOLD,
                  color: BG_DEEP,
                  fontFamily: BODY, fontSize: 8, fontWeight: 900,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  boxShadow: `0 2px 6px rgba(0,0,0,0.5)`,
                }}>
                  You · now
                </span>
              )}
              {/* Title icon — same glyph used in TopChrome avatar */}
              <span style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundImage: earned || isCurrent
                  ? `radial-gradient(circle at 30% 30%, ${p.color}55 0%, ${BG_MID} 75%)`
                  : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${earned || isCurrent ? p.color : `${p.color}55`}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: isCurrent ? `0 0 12px ${p.color}88` : 'none',
              }}>
                <p.Icon size={20} strokeWidth={2.4} color={earned || isCurrent ? p.color : MIST_DIM} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: BODY, fontSize: 10, fontWeight: 900,
                  color: accent, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1,
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontFamily: BODY, fontSize: 13, fontWeight: 700, color: earned || isCurrent ? CREAM : MIST,
                  marginTop: 4, lineHeight: 1.25,
                }}>
                  {p.tagline}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: BODY, fontSize: 10, fontWeight: 800,
                  color: earned ? GREEN : isCurrent ? GOLD_LITE : MIST_DIM,
                  marginTop: 4, fontFeatureSettings: '"tnum"',
                }}>
                  <Users size={9} strokeWidth={2.6} />
                  {p.threshold === 0 ? 'Starting tier' : `${p.threshold} recruits`}
                  {earned && !isCurrent && <> · <Check size={10} strokeWidth={3} /> Unlocked</>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
      }}>
        Titles unlock automatically as your lifetime recruits climb · never expire
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  WALLET HISTORY MODAL — opened from the wallet pill in TopChrome.
//  Lists every recent credit event with an icon, source-aware label, AED
//  amount, and relative time. SSR feeds it 20 events from
//  getRecentRewardEvents; the cell-level rendering decides how to label
//  each row from its `source` string.
// ════════════════════════════════════════════════════════════════════════════

function walletEventMeta(ev: RewardEvent): {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  label: string
  accent: string
  doubled: boolean
} {
  const doubled = ev.source.endsWith('_2x')
  const base = doubled ? ev.source.slice(0, -3) : ev.source
  if (base === 'referral_conversion') {
    return { Icon: Users, label: ev.invitee_name ? `${ev.invitee_name} joined` : 'Friend joined', accent: GREEN, doubled }
  }
  if (base.startsWith('cycle_milestone_')) {
    const at = base.replace('cycle_milestone_', '')
    return { Icon: Trophy, label: `Cycle milestone · ${at} recruits`, accent: GOLD, doubled }
  }
  if (base === 'tier_4_meals') return { Icon: Trophy, label: 'Tier 4 jackpot', accent: GOLD_LITE, doubled }
  if (base === 'tier_3_jacket') return { Icon: Shirt, label: "Tier 3 — jacket on its way", accent: PURPLE, doubled }
  if (base === 'layer4_anniversary') return { Icon: Calendar, label: '1-year anniversary', accent: PURPLE, doubled }
  if (base === 'layer4_google_review') return { Icon: Star, label: 'Google review', accent: GREEN, doubled }
  // Phase 8K — sources written by the weekly/monthly review submit actions.
  // 'layer4_weekly_survey' below is the legacy source name from earlier code
  // and stays as a fallback for any historical rows.
  if (base === 'layer4_weekly_review') return { Icon: MessageSquareText, label: 'Weekly review', accent: CYAN, doubled }
  if (base === 'layer4_monthly_review') return { Icon: Calendar, label: 'Plan wrap', accent: VIOLET, doubled }
  if (base === 'layer4_weekly_survey') return { Icon: MessageSquareText, label: 'Weekly survey', accent: CYAN, doubled }
  if (base === 'layer4_renew_invite_combo') return { Icon: Zap, label: 'Renew + invite combo', accent: ORANGE, doubled }
  // Phase 8E — streak chest credit
  if (base.startsWith('streak_chest')) return { Icon: Gift, label: 'Streak chest', accent: GOLD_LITE, doubled }
  return { Icon: Gift, label: 'Reward', accent: GOLD, doubled }
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// Actionable row in the wallet's "Finish to unlock" section. Reads as a
// to-do item: brand orange surface (always — not just when urgent), a
// solid Start pill on the right edge replacing the bare arrow, and the
// AED amount stacked above as "you'll earn this." Distinct enough from
// the WalletWaitingRow below that the user can tell at a glance which
// rows are "do this" vs which are "already done, waiting."
function WalletActionableRow({
  href, title, sub, chip, reward, urgent, monthly, onClick,
  cta = 'Start',
}: {
  href: string
  title: string
  sub: string
  chip: string
  reward: number
  urgent: boolean
  monthly?: boolean
  onClick: () => void
  /** CTA pill text. Defaults to "Start"; the weekly-reviews chooser passes
   *  "Resume" when a draft exists for that week so the user knows the
   *  form will rehydrate where they left off. */
  cta?: string
}) {
  const Icon = monthly ? Calendar : MessageSquareText
  const iconAccent = monthly ? VIOLET : CYAN
  return (
    <Link
      href={href}
      onClick={onClick}
      className={urgent ? 'hub-wallet-actionable hub-wallet-actionable-urgent' : 'hub-wallet-actionable'}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 12px 12px 14px', borderRadius: 10,
        backgroundColor: urgent ? `${ORANGE}1f` : `${ORANGE}10`,
        border: `1px solid ${urgent ? `${ORANGE}88` : `${ORANGE}44`}`,
        textDecoration: 'none',
        transition: 'background-color 150ms, border-color 150ms, transform 120ms',
      }}
    >
      <span aria-hidden="true" style={{
        flexShrink: 0,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: `${iconAccent}22`,
        border: `1px solid ${iconAccent}55`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} strokeWidth={2.4} color={iconAccent} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: BODY, fontSize: 13, fontWeight: 800, color: CREAM,
          lineHeight: 1.2, flexWrap: 'wrap',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {title}
          </span>
          <span style={{
            padding: '1px 7px', borderRadius: 4,
            backgroundColor: `${ORANGE}33`,
            border: `1px solid ${ORANGE}77`,
            fontFamily: BODY, fontSize: 8, fontWeight: 900,
            color: ORANGE_LITE,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            {chip}
          </span>
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST,
          marginTop: 2, fontFeatureSettings: '"tnum"',
        }}>
          {sub}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{
          fontFamily: DISPLAY, fontSize: 15, fontWeight: 900, color: GOLD_LITE,
          letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"', lineHeight: 1,
        }}>
          +AED {reward}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 999,
          backgroundColor: urgent ? ORANGE : 'transparent',
          border: `1px solid ${urgent ? ORANGE : `${ORANGE}99`}`,
          fontFamily: BODY, fontSize: 9, fontWeight: 900,
          color: urgent ? '#fff' : ORANGE_LITE,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          lineHeight: 1,
        }}>
          {cta} <ArrowRight size={10} strokeWidth={3} />
        </span>
      </div>
    </Link>
  )
}

// Passive informational row for reviews that are SUBMITTED but waiting
// on the cycle's all-or-nothing lock to flip them into the wallet.
// Distinct from WalletActionableRow on every axis: check-mark icon
// instead of message-square, dashed muted border instead of brand
// orange, no chip-pill button, AED rendered without "+" so it doesn't
// read as "new opportunity." The user should be able to glance and
// know "I did this — nothing to do, just waiting."
function WalletWaitingRow({
  amount,
  createdAt,
  late,
}: {
  amount: number
  createdAt: string
  late: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.02)',
      border: `1px dashed ${MIST_FAINT}`,
    }}>
      <span aria-hidden="true" style={{
        flexShrink: 0,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: `${CYAN}14`,
        border: `1px solid ${CYAN}33`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle2 size={15} strokeWidth={2.4} color={CYAN} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: BODY, fontSize: 13, fontWeight: 700, color: MIST,
          lineHeight: 1.2, flexWrap: 'wrap',
        }}>
          <span>Weekly review</span>
          <span style={{
            padding: '1px 7px', borderRadius: 4,
            backgroundColor: 'rgba(237,232,218,0.06)',
            border: `1px solid ${MIST_FAINT}`,
            fontFamily: BODY, fontSize: 8, fontWeight: 900,
            color: MIST,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            {late ? 'Submitted late' : 'Submitted on-time'}
          </span>
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
          marginTop: 2, fontFeatureSettings: '"tnum"',
        }}>
          {formatRelativeTime(createdAt)} · locks when cycle completes
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        fontFamily: DISPLAY, fontSize: 15, fontWeight: 800,
        color: MIST,
        letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"',
      }}>
        AED {amount}
      </div>
    </div>
  )
}

// Per-row wrapper that detects whether the user has a saved draft for
// this week and swaps the CTA between "Start" and "Resume" accordingly.
// Drafts are written by WeeklyReviewTakeover as the user scrolls through
// the form; the chooser modal just reads them so the user can pick up
// where they left off without leaving the chooser.
function PendingReviewChooserRow({
  item, kind, onClose,
}: {
  item: PendingItem | LateItem
  kind: 'current' | 'late'
  onClose: () => void
}) {
  const draftActive = useWeeklyDraftActive(item.week)
  const isCurrent = kind === 'current'
  const isLast = isCurrent && (item as PendingItem).daysLeft === 0
  const chip = isCurrent
    ? (isLast ? 'Last day' : `${(item as PendingItem).daysLeft}d left`)
    : `${(item as LateItem).daysLate}d late`
  const reward = isCurrent ? BASE_REWARD_AED : LATE_REWARD_AED
  const urgent = isCurrent
    ? (item as PendingItem).daysLeft <= 1
    : (item as LateItem).daysLate >= 23
  return (
    <WalletActionableRow
      href={`/dashboard/menu/review/${item.week}?from=dorm-wars`}
      title={`Week ${item.week}`}
      sub={item.range}
      chip={chip}
      reward={reward}
      urgent={urgent}
      onClick={onClose}
      cta={draftActive ? 'Resume' : 'Start'}
    />
  )
}

// Informational row for reviews already submitted in this cycle. Shape
// echoes WalletWaitingRow (dashed muted border + check icon) so the
// "already done" semantic reads consistently across the chooser modal
// and the wallet. AED amount uses no "+" prefix and a muted color so
// it doesn't compete with the pending rows' bright gold-lite reward.
function CompletedReviewRow({ item }: { item: CompletedReviewItem }) {
  const onTime = item.rewardPct === 100
  const aed = onTime ? BASE_REWARD_AED : LATE_REWARD_AED
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.02)',
      border: `1px dashed ${MIST_FAINT}`,
    }}>
      <span aria-hidden="true" style={{
        flexShrink: 0,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: `${CYAN}14`,
        border: `1px solid ${CYAN}33`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle2 size={15} strokeWidth={2.4} color={CYAN} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: BODY, fontSize: 13, fontWeight: 700, color: MIST,
          lineHeight: 1.2, flexWrap: 'wrap',
        }}>
          <span>Week {item.week}</span>
          <span style={{
            padding: '1px 7px', borderRadius: 4,
            backgroundColor: 'rgba(237,232,218,0.06)',
            border: `1px solid ${MIST_FAINT}`,
            fontFamily: BODY, fontSize: 8, fontWeight: 900,
            color: MIST,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            {onTime ? 'On-time' : 'Late'}
          </span>
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
          marginTop: 2, fontFeatureSettings: '"tnum"',
        }}>
          {item.range}
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        fontFamily: DISPLAY, fontSize: 15, fontWeight: 800,
        color: MIST,
        letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"',
      }}>
        AED {aed}
      </div>
    </div>
  )
}

// Chooser modal opened from the side-quest weekly-review row. Replaces
// the previous "click → router.push the first pending week" behaviour,
// which was opaque to users with multiple pending weeks and lost the
// "you've already done these" context. Now the user sees the whole
// cycle in one view: every week they still need to submit (Resume or
// Start), every week they've already submitted (informational), and
// the AED breakdown across both groups.
function WeeklyReviewsChooserModal({
  weeklyReviewState, onClose,
}: {
  weeklyReviewState: WeeklyReviewState
  onClose: () => void
}) {
  const { current, late, completed, rewards } = weeklyReviewState
  const aedToClaim = (current ? BASE_REWARD_AED : 0) + late.length * LATE_REWARD_AED
  const aedReady = Math.max(0, rewards.aedPending - aedToClaim)
  const hasPending = !!current || late.length > 0
  const hasCompleted = completed.length > 0
  const allIn = rewards.submitted >= rewards.total && rewards.total > 0
  return (
    <div>
      {/* Header strip — total progress + AED breakdown. Stays at top
          regardless of section visibility so the user always anchors
          on "where am I in this cycle." */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 12,
        backgroundColor: `${CYAN}10`,
        border: `1px solid ${CYAN}33`,
        marginBottom: 18,
      }}>
        <ProgressRing
          value={rewards.submitted}
          total={rewards.total}
          color={allIn ? GREEN : CYAN}
          size={28}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: CYAN,
            letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
          }}>
            {rewards.cycle}
          </div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 16, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.01em', marginTop: 4, fontFeatureSettings: '"tnum"',
            lineHeight: 1.2,
          }}>
            {rewards.submitted} of {rewards.total} submitted
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
            marginTop: 2, fontFeatureSettings: '"tnum"',
          }}>
            {allIn
              ? `AED ${rewards.aedEarned} earned · cycle locked`
              : aedToClaim > 0
                ? `AED ${aedReady} ready · +AED ${aedToClaim} still to claim`
                : `AED ${aedReady} ready for cycle close`}
          </div>
        </div>
      </div>

      {/* Pending section — current week first (the urgent one), then
          late catch-ups. Each row carries its own draft state so the
          CTA reads honestly. */}
      {hasPending && (
        <div style={{ marginBottom: hasCompleted ? 18 : 0 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: BODY, fontSize: 10, fontWeight: 900, color: ORANGE_LITE,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Pending submission
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 9, fontWeight: 700, color: MIST_DIM,
              letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Pick one to submit
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {current && (
              <PendingReviewChooserRow item={current} kind="current" onClose={onClose} />
            )}
            {late.map(item => (
              <PendingReviewChooserRow key={`late-${item.week}`} item={item} kind="late" onClose={onClose} />
            ))}
          </div>
        </div>
      )}

      {/* Completed section — informational only. Tells the user what's
          already banked toward the all-or-nothing pool. */}
      {hasCompleted && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: BODY, fontSize: 10, fontWeight: 900, color: MIST,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Completed
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 9, fontWeight: 700, color: MIST_DIM,
              letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              {completed.length} submitted
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completed.map(item => (
              <CompletedReviewRow key={`done-${item.week}`} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Empty-state fallback — surfaces when total > 0 but neither
          pending nor completed has anything (e.g., brand-new cycle,
          all weeks still upcoming). Rare but worth catching so the
          modal never opens to a blank surface. */}
      {!hasPending && !hasCompleted && (
        <div style={{
          padding: '32px 16px', borderRadius: 12,
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: `1px dashed ${MIST_FAINT}`,
          textAlign: 'center',
          fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
          lineHeight: 1.55,
        }}>
          Your first review opens after week 1 ends.
        </div>
      )}

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
      }}>
        All {rewards.total} required · miss one and the cycle&apos;s AED is forfeit
      </p>
    </div>
  )
}

// Chooser modal opened from the side-quest Monthly Wrap row. Previously the
// chip routed straight to /dashboard/menu, which is the menu home, not the
// wrap form itself — the chip's promise ("Tap to wrap") didn't match where
// the user landed. This modal previews the wrap (AED on the line, deadline,
// what the wrap actually is) and routes correctly to the wrap form on
// commit. Mirrors WeeklyReviewsChooserModal's shape so the two side-quest
// modals feel like a matched pair.
function MonthlyWrapChooserModal({
  monthlyReviewWindow, onStart,
}: {
  monthlyReviewWindow: MonthlyReviewWindow
  onStart: () => void
}) {
  const w = monthlyReviewWindow
  const isOpen = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward > 0
  const isLate = w.eligible && !w.submitted && !w.expired && w.daysLeftForFullReward <= 0
  const canSubmit = isOpen || isLate
  const aedOnTheLine = isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED
  const accentColor = isLate ? GOLD_LITE : VIOLET

  // Header sub-line — adapts to state so the user reads the actual stake
  // before deciding to commit. Closed/Done/Soon states get informational
  // copy and no CTA at the bottom.
  const headerLine = (() => {
    if (w.submitted) return 'Wrap submitted · next one opens at the end of your cycle'
    if (isOpen) {
      const d = w.daysLeftForFullReward
      return d === 1 ? '1 day left for the full AED 5' : `${d} days left for the full AED 5`
    }
    if (isLate) return 'Window is late — earn AED 2 before the 30-day expiry'
    if (w.expired) return 'Window for this cycle has closed'
    return 'Opens at the end of this cycle'
  })()

  return (
    <div>
      {/* Header strip — cycle label + AED on the line. Same shape as the
          WeeklyReviewsChooserModal header so the two modals read as a pair. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 12,
        backgroundColor: `${accentColor}10`,
        border: `1px solid ${accentColor}33`,
        marginBottom: 18,
      }}>
        <span style={{
          flexShrink: 0,
          width: 36, height: 36, borderRadius: 9,
          backgroundColor: `${accentColor}22`,
          border: `1px solid ${accentColor}55`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Calendar size={16} strokeWidth={2.6} color={accentColor} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: accentColor,
            letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
          }}>
            {w.cycleLabel ?? 'This cycle'}
          </div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 16, fontWeight: 900, color: CREAM,
            letterSpacing: '-0.01em', marginTop: 4, lineHeight: 1.2,
          }}>
            {w.submitted
              ? 'Wrap complete'
              : canSubmit
                ? `AED ${aedOnTheLine} on the line`
                : 'Not eligible yet'}
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
            marginTop: 2,
          }}>
            {headerLine}
          </div>
        </div>
      </div>

      {/* Explainer — three short lines describing the wrap. The point of
          this modal is to make the user understand what they're tapping
          into BEFORE they navigate, so the wrap form doesn't feel like a
          surprise quiz. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        marginBottom: canSubmit ? 18 : 0,
      }}>
        <ExplainerRow
          color={accentColor}
          icon={<MessageSquareText size={13} strokeWidth={2.6} color={accentColor} />}
          title="What it is"
          body="A short, once-per-cycle reflection on the meals you got this month — favourites, what missed, what to bring back."
        />
        <ExplainerRow
          color={accentColor}
          icon={<Coins size={13} strokeWidth={2.6} color={accentColor} />}
          title="What you earn"
          body={
            isLate
              ? `AED ${MONTHLY_LATE_REWARD_AED} credited to your wallet (half rate — the full window has passed).`
              : `AED ${MONTHLY_REWARD_AED} credited to your wallet on submit. Auto-applies at your next renewal.`
          }
        />
        <ExplainerRow
          color={accentColor}
          icon={<Clock size={13} strokeWidth={2.6} color={accentColor} />}
          title="When the window closes"
          body={
            w.expired
              ? 'The 30-day window for this cycle has fully closed — see you next cycle.'
              : isLate
                ? 'You have until day 30 from cycle-end to earn AED 2. After that it expires.'
                : 'Submit within 7 days of cycle-end for the full AED 5. After that it drops to AED 2 until day 30.'
          }
        />
      </div>

      {/* Primary CTA — only renders for actionable states. Done / Closed
          / Soon states close the explainer at the body and let the user
          dismiss with the modal X. */}
      {canSubmit && (
        <button
          type="button"
          onClick={onStart}
          style={{
            display: 'block', width: '100%',
            padding: '14px 16px', borderRadius: 12,
            backgroundImage: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)`,
            border: `1px solid ${accentColor}`,
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 14, fontWeight: 900,
            letterSpacing: '-0.01em',
            cursor: 'pointer',
            boxShadow: `0 6px 24px ${accentColor}44`,
          }}
        >
          {isLate ? `Start your wrap · AED ${MONTHLY_LATE_REWARD_AED}` : `Start your wrap · AED ${MONTHLY_REWARD_AED}`}
        </button>
      )}

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '14px 0 0', textAlign: 'center',
      }}>
        Wrap credits auto-apply to your next renewal · not cashable
      </p>
    </div>
  )
}

// Small two-line row used inside the MonthlyWrapChooserModal explainer.
// Pulled out as a helper so the three rows stay visually identical and
// the modal body reads as a tight list, not three different blocks.
function ExplainerRow({
  color, icon, title, body,
}: {
  color: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}22`,
    }}>
      <span style={{
        flexShrink: 0,
        width: 24, height: 24, borderRadius: 6,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}44`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: BODY, fontSize: 9, fontWeight: 900, color,
          letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
          lineHeight: 1.45, marginTop: 3,
        }}>
          {body}
        </div>
      </div>
    </div>
  )
}

function WalletHistoryModal({
  wallet, walletPending, events,
  weeklyReviewState, monthlyWindow, onClose,
}: {
  wallet: number
  walletPending: number
  events: RewardEvent[]
  weeklyReviewState: WeeklyReviewState
  monthlyWindow: MonthlyReviewWindow
  onClose: () => void
}) {
  // Outstanding reviews — the unsubmitted weeks (current + late) plus the
  // monthly wrap when its window is open. These are the actions that
  // unlock walletPending. Surfacing them here as clickable rows turns
  // "AED X pending · finish your reviews" from an instruction into a
  // one-tap path.
  const monthlyOutstanding =
    monthlyWindow.eligible && !monthlyWindow.submitted && !monthlyWindow.expired
  const hasOutstanding =
    !!weeklyReviewState.current
    || weeklyReviewState.late.length > 0
    || monthlyOutstanding
  // Filter out tier-3 jacket pseudo-events (amount_aed = 0; physical merch,
  // not a wallet credit) and any other zero-AED rows. The wallet view is
  // specifically about cash that landed (or is on its way).
  const cashEvents = events.filter(e => e.amount_aed > 0)

  // Pending weekly_review events get their own "Submitted · waiting"
  // section so they read as informational ("I did this, locks at cycle
  // end") and not as another to-do row competing with "Finish to unlock"
  // above. Everything else — approved credits, non-review pending (e.g.,
  // referral_conversion stuck in fraud review) — stays in the History
  // list, where the "Pending" pill keeps its original meaning of
  // "waiting on verification."
  const submittedWaitingReviews = cashEvents.filter(
    e => e.status === 'pending' && e.source.startsWith('layer4_weekly_review'),
  )
  const historyEvents = cashEvents.filter(
    e => !(e.status === 'pending' && e.source.startsWith('layer4_weekly_review')),
  )

  // Pending copy is source-aware. The pending container's sub-line used
  // to assume all pending = review credits, which misled users whose
  // pending pool included a referral_conversion stuck in fraud review.
  // Now we look at the actual pending events and pick copy that
  // describes the real unlock condition.
  const pendingByKind = (() => {
    let review = false
    let referral = false
    let other = false
    for (const ev of cashEvents) {
      if (ev.status !== 'pending') continue
      if (ev.source.startsWith('layer4_weekly_review')) review = true
      else if (ev.source.startsWith('referral_conversion')) referral = true
      else other = true
    }
    return { review, referral, other }
  })()
  const pendingSubLine = (() => {
    const { review, referral, other } = pendingByKind
    if (review && !referral && !other) return 'Locks in when you finish this cycle’s reviews'
    if (referral && !review && !other) return 'Locks in when your referral clears review'
    return 'Locks in once verified — see history below'
  })()

  return (
    <div>
      {/* ── Header: TWO containers side-by-side ─────────────────────
          Available (left) = spendable now. Pending (right) = locked
          until the all-or-nothing threshold is met. Per refactoring-ui
          hierarchy: same shape + spacing, color carries the meaning —
          gold for spendable, muted gold for at-risk. */}
      <div className="hub-wallet-summary-grid" style={{
        display: 'grid',
        gridTemplateColumns: walletPending > 0 ? '1fr 1fr' : '1fr',
        gap: 10,
        marginBottom: 18,
      }}>
        {/* Available */}
        <div style={{
          padding: '14px 14px 16px',
          borderRadius: 12,
          backgroundImage: `linear-gradient(135deg, ${GOLD}22 0%, ${GOLD_LITE}08 100%)`,
          border: `1px solid ${GOLD}55`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <CoinIcon size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GOLD,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Available
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 24, fontWeight: 900, color: CREAM,
              letterSpacing: '-0.02em', lineHeight: 1.1, fontFeatureSettings: '"tnum"',
              marginTop: 4,
            }}>
              AED {wallet}
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST,
              marginTop: 4, lineHeight: 1.4,
            }}>
              Auto-applies at your next renewal
            </div>
          </div>
        </div>

        {/* Pending — only renders when > 0 so the modal stays clean
            for users with no review credits in-flight. */}
        {walletPending > 0 && (
          <div style={{
            padding: '14px 14px 16px',
            borderRadius: 12,
            backgroundImage: `linear-gradient(135deg, rgba(255,170,0,0.16) 0%, rgba(255,170,0,0.04) 100%)`,
            border: `1px solid ${GOLD_LITE}55`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <span aria-hidden="true" style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: 8,
              backgroundColor: `${GOLD_LITE}22`,
              border: `1px solid ${GOLD_LITE}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Clock size={16} strokeWidth={2.4} color={GOLD_LITE} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: BODY, fontSize: 9, fontWeight: 900, color: GOLD_LITE,
                letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
              }}>
                Pending
              </div>
              <div style={{
                fontFamily: DISPLAY, fontSize: 24, fontWeight: 900, color: CREAM,
                letterSpacing: '-0.02em', lineHeight: 1.1, fontFeatureSettings: '"tnum"',
                marginTop: 4,
              }}>
                AED {walletPending}
              </div>
              <div style={{
                fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST,
                marginTop: 4, lineHeight: 1.4,
              }}>
                {pendingSubLine}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Outstanding to submit ──────────────────────────────────
          Unsubmitted reviews that, once finished, release the pending
          pool. Lives BETWEEN the header tiles and history so the user
          reads: "AED X pending" → "tap these to unlock it" → past
          events. Each row deep-links to its review page and closes the
          modal so the navigation lands cleanly. */}
      {hasOutstanding && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: BODY, fontSize: 10, fontWeight: 900, color: GOLD_LITE,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Finish to unlock
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 9, fontWeight: 700, color: MIST_DIM,
              letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Tap to start
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weeklyReviewState.current && (
              <WalletActionableRow
                href={`/dashboard/menu/review/${weeklyReviewState.current.week}?from=dorm-wars`}
                title={`Week ${weeklyReviewState.current.week}`}
                sub={weeklyReviewState.current.range}
                chip={weeklyReviewState.current.daysLeft === 0 ? 'Last day' : `${weeklyReviewState.current.daysLeft}d left`}
                reward={BASE_REWARD_AED}
                urgent={weeklyReviewState.current.daysLeft <= 1}
                onClick={onClose}
              />
            )}
            {weeklyReviewState.late.map(item => (
              <WalletActionableRow
                key={`late-${item.week}`}
                href={`/dashboard/menu/review/${item.week}?from=dorm-wars`}
                title={`Week ${item.week}`}
                sub={item.range}
                chip={`${item.daysLate}d late`}
                reward={LATE_REWARD_AED}
                urgent={item.daysLate >= 23}
                onClick={onClose}
              />
            ))}
            {monthlyOutstanding && (() => {
              const isLate = monthlyWindow.daysLeftForFullReward <= 0
              const chip = isLate
                ? `${monthlyWindow.daysSinceCycleEnd}d late`
                : monthlyWindow.daysLeftForFullReward === 0
                  ? 'Last day'
                  : `${monthlyWindow.daysLeftForFullReward}d left`
              return (
                <WalletActionableRow
                  href="/dashboard/menu/review/monthly?from=dorm-wars"
                  title="Monthly wrap"
                  sub={monthlyWindow.cycleLabel ?? 'Cycle'}
                  chip={chip}
                  reward={isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED}
                  urgent={monthlyWindow.preCron || (!isLate && monthlyWindow.daysLeftForFullReward === 0)}
                  monthly
                  onClick={onClose}
                />
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Submitted · waiting on cycle ───────────────────────────
          Reviews the user has already submitted; the AED is parked in
          pending until the cycle's all-or-nothing rule lets the pool
          flip to approved. These rows are NOT actionable — they're
          informational ("I did this") — so the visual signature is
          deliberately calmer: dashed muted border, check icon, no
          chip-button, AED rendered without "+". This is the section
          that absorbs the rows that used to live in History with a
          generic "Pending" pill, where they bled into the "Finish to
          unlock" rows above. */}
      {submittedWaitingReviews.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: BODY, fontSize: 10, fontWeight: 900, color: MIST,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Submitted · waiting on cycle
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 9, fontWeight: 700, color: MIST_DIM,
              letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Nothing to do
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {submittedWaitingReviews.map(ev => (
              <WalletWaitingRow
                key={ev.id}
                amount={ev.amount_aed}
                createdAt={ev.created_at}
                late={ev.amount_aed === LATE_REWARD_AED}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── History ─────────────────────────────────────────────────
          Settled credits (approved + applied) and any non-review
          pending rows (e.g., a referral_conversion held for fraud
          review). The "Pending" pill stays meaningful here because
          it always means "waiting on verification," not "waiting on
          a cycle to close." Empty state when no events yet. */}
      {historyEvents.length > 0 && (
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 900, color: GOLD_LITE,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: 8, lineHeight: 1,
        }}>
          History
        </div>
      )}
      {historyEvents.length === 0 && submittedWaitingReviews.length === 0 ? (
        <div style={{
          padding: '32px 16px', borderRadius: 12,
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: `1px dashed ${MIST_FAINT}`,
          textAlign: 'center',
          fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
          lineHeight: 1.55,
        }}>
          No credits yet. Send a friend a link — when they subscribe, your
          first <strong style={{ color: CREAM }}>AED 20</strong> lands here.
        </div>
      ) : historyEvents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historyEvents.map(ev => {
            const meta = walletEventMeta(ev)
            const Icon = meta.Icon
            const isPending = ev.status === 'pending'
            return (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 10,
                backgroundColor: isPending ? 'rgba(255,170,0,0.05)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isPending ? `${GOLD_LITE}33` : `${meta.accent}33`}`,
              }}>
                {/* Source icon tile */}
                <span style={{
                  flexShrink: 0,
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: `${meta.accent}22`,
                  border: `1px solid ${meta.accent}55`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  opacity: isPending ? 0.75 : 1,
                }}>
                  <Icon size={15} strokeWidth={2.4} color={meta.accent} />
                </span>
                {/* Label + status pill + time */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: BODY, fontSize: 13, fontWeight: 800,
                    color: isPending ? MIST : CREAM,
                    lineHeight: 1.2,
                    flexWrap: 'wrap',
                  }}>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                    }}>{meta.label}</span>
                    {meta.doubled && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 4,
                        backgroundColor: `${GOLD_LITE}22`,
                        border: `1px solid ${GOLD_LITE}66`,
                        fontFamily: BODY, fontSize: 8, fontWeight: 900,
                        color: GOLD_LITE, letterSpacing: '0.12em', textTransform: 'uppercase',
                      }}>
                        2×
                      </span>
                    )}
                    {isPending && (
                      <span style={{
                        padding: '1px 7px', borderRadius: 4,
                        backgroundColor: `${GOLD_LITE}1f`,
                        border: `1px solid ${GOLD_LITE}55`,
                        fontFamily: BODY, fontSize: 8, fontWeight: 900,
                        color: GOLD_LITE, letterSpacing: '0.14em', textTransform: 'uppercase',
                      }}>
                        Pending
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
                    marginTop: 2, fontFeatureSettings: '"tnum"',
                  }}>
                    {formatRelativeTime(ev.created_at)}
                  </div>
                </div>
                {/* AED amount — dimmed for pending so it doesn't read as "money you have" */}
                <div style={{
                  flexShrink: 0,
                  fontFamily: DISPLAY, fontSize: 15, fontWeight: 900,
                  color: isPending ? MIST : GOLD_LITE,
                  letterSpacing: '-0.01em', fontFeatureSettings: '"tnum"',
                }}>
                  +AED {ev.amount_aed}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
      }}>
        Credits auto-apply to your next Dormers renewal · not cashable
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SEND SCOUT MODAL + JOURNEY — referral flow + per-recruit journey detail
// ════════════════════════════════════════════════════════════════════════════

function SendScoutModal({
  step, scoutName, cashPerRecruit, onNameChange, onSend, onClose, onTrackJourney,
}: {
  step: SendStep
  scoutName: string
  /** Exact AED the user's current rung pays per recruit — shown verbatim. */
  cashPerRecruit: number
  onNameChange: (s: string) => void
  onSend: () => void
  onClose: () => void
  onTrackJourney: () => void
}) {
  // a11y parity with Modal (audit P1-7) — Escape dismiss + focus management.
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = 'hub-send-modal-title'
  // Stash onClose in a ref so the focus-management effect doesn't tear down
  // every parent re-render. Without this, each keystroke in the name input
  // re-fires the cleanup + the 60ms dialog-focus setTimeout, which yanks
  // focus off the <input> and forces the user to click it again per char.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (step === 'closed') return
    const prev = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handleKey)
    const t = setTimeout(() => dialogRef.current?.focus(), 60)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      prev?.focus?.()
    }
  }, [step])

  if (step === 'closed') return null
  const trimmed = scoutName.trim()
  const canSend = trimmed.length > 0

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      backgroundColor: 'rgba(8,5,31,0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440, width: '100%',
          backgroundImage: `linear-gradient(180deg, ${BG_MID} 0%, ${BG_DEEP} 100%)`,
          border: `1.5px solid ${ORANGE}55`,
          borderRadius: 18,
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${ORANGE}28`,
          animation: 'hub-modal-in 280ms cubic-bezier(0.16,1,0.3,1) both',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${ORANGE}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundImage: `linear-gradient(180deg, ${ORANGE}14 0%, transparent 100%)`,
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Send size={14} strokeWidth={2.4} color={GOLD_LITE} />
            <span
              id={titleId}
              style={{
                fontFamily: BODY, fontSize: 11, fontWeight: 900, color: GOLD_LITE,
                letterSpacing: '0.20em', textTransform: 'uppercase',
              }}
            >
              Send a link
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            width: 28, height: 28, borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.35)',
            border: `1px solid ${MIST_FAINT}`,
            color: MIST,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <X size={12} strokeWidth={2.4} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {step === 'naming' && (
            <>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, color: CREAM, letterSpacing: '-0.02em', marginBottom: 8 }}>
                Who&apos;s the friend?
              </div>
              <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 400, color: MIST, lineHeight: 1.55, marginBottom: 20 }}>
                We&apos;ll track their journey from the moment they claim their meal.
              </div>
              <input
                type="text" autoFocus value={scoutName}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSend) onSend() }}
                placeholder="e.g. Omar" maxLength={32}
                style={{
                  width: '100%', padding: '14px 18px', borderRadius: 12,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  border: `1.5px solid ${canSend ? `${GOLD}66` : MIST_FAINT}`,
                  color: CREAM, fontFamily: BODY, fontSize: 16, fontWeight: 700,
                  outline: 'none', marginBottom: 18,
                  transition: 'border-color 220ms ease',
                }}
              />
              <button
                type="button" disabled={!canSend} onClick={onSend}
                className="hub-cta"
                style={{
                  width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 22px', borderRadius: 999,
                  backgroundImage: canSend
                    ? `linear-gradient(135deg, ${ORANGE} 0%, ${GOLD} 100%)`
                    : 'linear-gradient(135deg, #2a2256 0%, #1a1140 100%)',
                  border: canSend ? '2px solid rgba(255,220,120,0.85)' : `1.5px solid ${MIST_FAINT}`,
                  color: canSend ? BG_DEEP : MIST_DIM,
                  fontFamily: BODY, fontSize: 13, fontWeight: 900,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                }}
              >
                {canSend ? <>Send to {trimmed} <ArrowRight size={14} strokeWidth={2.6} /></> : 'Enter a name'}
              </button>
              <p style={{
                fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
                lineHeight: 1.5, margin: '14px 0 0', textAlign: 'center',
              }}>
                Opens WhatsApp · they eat free · you earn AED {cashPerRecruit} when they subscribe
              </p>
            </>
          )}

          {step === 'sent' && (
            <SentConfirmation name={trimmed || 'Friend'} onClose={onClose} onTrackJourney={onTrackJourney} />
          )}
        </div>
      </div>
    </div>
  )
}

function SentConfirmation({ name, onClose, onTrackJourney }: { name: string; onClose: () => void; onTrackJourney: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const colors = [GOLD, ORANGE, GREEN, CYAN, PURPLE, PINK]
          return (
            <span key={i} style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: colors[i % colors.length],
              animation: `hub-confetti-${i} 900ms ease-out both`,
            }} />
          )
        })}
      </div>
      <div style={{ textAlign: 'center', animation: 'hub-rise 500ms cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          backgroundColor: `${GREEN}22`,
          border: `2px solid ${GREEN}88`,
          margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 24px ${GREEN}66`,
        }}>
          <Check size={32} strokeWidth={3} color={GREEN} />
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, color: CREAM, marginBottom: 8 }}>
          Off to <span style={{ color: GOLD_LITE }}>{name}</span>
        </div>
        {/* Copy reflects the no-phantom-scout reality (P1-11) — there's
            nothing in your squad yet; their entry appears the moment they
            claim the gift on /r/[cid]. */}
        <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 400, color: MIST, lineHeight: 1.55, marginBottom: 22 }}>
          Once {name} claims the free meal, they&rsquo;ll appear in your squad — and you&rsquo;ll get notified the moment they subscribe.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={onTrackJourney} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 18px', borderRadius: 999,
            backgroundImage: `linear-gradient(135deg, ${ORANGE} 0%, ${GOLD} 100%)`,
            border: '2px solid rgba(255,220,120,0.7)',
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 12, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            Got it <ArrowRight size={13} strokeWidth={2.6} />
          </button>
          <button type="button" onClick={onClose} style={{
            padding: '11px 18px', borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: `1px solid ${MIST_FAINT}`,
            color: MIST,
            fontFamily: BODY, fontSize: 12, fontWeight: 800,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            Send another
          </button>
        </div>
      </div>
    </div>
  )
}

function JourneyScreen({
  scout, onNudge, onSendAnother,
}: {
  scout: Scout; onNudge: () => void; onSendAnother: () => void
}) {
  // Off-ladder scouts (existing-customer redemptions) get a flat info panel
  // — no progression ladder (they aren't on the journey), no nudge button
  // (messaging an existing subscriber "did you see the link?" is awkward).
  // The forward path is to scout someone new, which is the only real next
  // action available to the inviter from this state.
  if (scout.stage === 'already_subscribed') {
    const meta = stageMeta(scout.stage)
    return (
      <div>
        <div style={{
          padding: 14, borderRadius: 12,
          backgroundColor: `${meta.color}14`,
          border: `1px solid ${meta.color}55`,
          marginBottom: 18,
        }}>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900,
            color: meta.color, letterSpacing: '0.20em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            {meta.label}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM }}>
            {stageDescription(scout)}
          </div>
        </div>
        <ActionPrompt
          intent="helpful"
          headline={`Your code didn't apply to ${scout.name}`}
          body={`The free welcome meal is for friends who haven't tried Dormers yet. Scout someone new and you'll both get a reward when they sign up.`}
          primary={{ label: 'Scout someone new', onClick: onSendAnother, color: PINK }}
        />
        <p style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
          lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
        }}>
          This share doesn&rsquo;t count toward your milestones · pure heads-up
        </p>
      </div>
    )
  }

  const curIdx = stageIndex(scout.stage)
  const isWin = scout.stage === 'subscribed'
  const isStalled = scout.stage === 'sent' && scout.daysAgo >= 2

  return (
    <div>
      <div style={{
        padding: 14, borderRadius: 12,
        backgroundColor: `${STAGES[curIdx].color}14`,
        border: `1px solid ${STAGES[curIdx].color}55`,
        marginBottom: 18,
      }}>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 900,
          color: STAGES[curIdx].color, letterSpacing: '0.20em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          Currently
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM }}>
          {stageDescription(scout)}
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 22, padding: '8px 4px' }}>
        <div style={{
          position: 'absolute', top: 17, left: '8%', right: '8%',
          height: 2,
          backgroundImage: `linear-gradient(90deg, ${GREEN} 0%, ${GREEN} ${(curIdx / (STAGES.length - 1)) * 100}%, ${MIST_FAINT} ${(curIdx / (STAGES.length - 1)) * 100}%, ${MIST_FAINT} 100%)`,
          zIndex: 0,
        }} />
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 4,
          position: 'relative', zIndex: 1,
        }}>
          {STAGES.map((stg, i) => {
            const done = i < curIdx
            const current = i === curIdx
            return (
              <div key={stg.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                <span style={{
                  position: 'relative',
                  width: 34, height: 34, borderRadius: '50%',
                  backgroundColor: done || current ? stg.color : 'rgba(0,0,0,0.5)',
                  border: done || current ? 'none' : `1.5px dashed ${MIST_FAINT}`,
                  color: done || current ? BG_DEEP : MIST_DIM,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: current ? `0 0 14px ${stg.color}88` : 'none',
                }}>
                  {current && (
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      '--pr-color': `${stg.color}88`,
                      animation: 'hub-pulse-ring 1.8s ease-out infinite',
                      pointerEvents: 'none',
                    } as React.CSSProperties} />
                  )}
                  {done ? <Check size={14} strokeWidth={3} /> : current ? <Zap size={14} strokeWidth={2.6} /> : <Lock size={11} strokeWidth={2.4} />}
                </span>
                <div style={{
                  fontFamily: BODY, fontSize: 9, fontWeight: 800,
                  color: done ? GREEN : current ? stg.color : MIST_DIM,
                  letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.2,
                }}>
                  {stg.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {scout.stage === 'sent' && (
        <ActionPrompt
          intent={isStalled ? 'urgent' : 'helpful'}
          headline={isStalled ? `Has ${scout.name} seen the link?` : `Waiting for ${scout.name} to claim`}
          body={isStalled ? `It's been ${scout.daysAgo} days. A quick nudge usually does it.` : `The free meal is waiting. They'll get a meal scheduled once they tap the link.`}
          primary={{ label: `Nudge ${scout.name} on WhatsApp`, onClick: onNudge, color: ORANGE }}
        />
      )}
      {scout.stage === 'scheduled' && (
        <ActionPrompt intent="positive" headline={`${scout.name}'s meal is scheduled`} body="Their meal is on the way to their dorm. Nothing for you to do — sit back and watch." color={CYAN} />
      )}
      {scout.stage === 'delivered' && (
        <ActionPrompt intent="positive" headline={`${scout.name} got their meal`} body="Their trial is live. Many users subscribe within 3-5 days of their first meal." primary={{ label: `Ask ${scout.name} how it was`, onClick: onNudge, color: VIOLET }} />
      )}
      {scout.stage === 'decided' && (
        <ActionPrompt intent="urgent" headline={`${scout.name} hasn't subscribed yet`} body="The trial window passed without a purchase. You can nudge them, or move on to your next scout." primary={{ label: `Send ${scout.name} a friendly nudge`, onClick: onNudge, color: RED }} secondary={{ label: 'Scout someone new', onClick: onSendAnother }} />
      )}
      {isWin && (
        <div style={{
          padding: 18, borderRadius: 14,
          backgroundImage: `linear-gradient(135deg, ${GREEN}22 0%, ${GOLD}14 100%)`,
          border: `1.5px solid ${GREEN}66`,
          textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <Trophy size={36} strokeWidth={2.2} color={GOLD} style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, color: CREAM, marginBottom: 6 }}>
            {scout.name} subscribed!
          </div>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{
              padding: '5px 10px', borderRadius: 999,
              backgroundColor: `${GOLD}28`,
              fontFamily: BODY, fontSize: 12, fontWeight: 900, color: GOLD_LITE,
            }}>
              <CoinIcon size={12} /> +20 credits
            </span>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST }}>
            Earned {scout.daysAgo} days after the link was sent.
          </div>
        </div>
      )}
      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '18px 0 0', textAlign: 'center',
      }}>
        Credits auto-apply to your next Dormers renewal · not cashable
      </p>
    </div>
  )
}

function stageDescription(scout: Scout): string {
  switch (scout.stage) {
    case 'sent': return scout.daysAgo === 0 ? `Link just sent to ${scout.name}` : `${scout.name} hasn't claimed yet — ${scout.daysAgo}d ago`
    case 'scheduled': return `${scout.name}'s meal scheduled`
    case 'delivered': return `${scout.name} got their first meal`
    case 'decided': return `${scout.name}'s trial window passed`
    case 'subscribed': return `${scout.name} is a paid subscriber`
    case 'already_subscribed': return `${scout.name} is already a Dormers regular`
  }
}

function ActionPrompt({
  intent, headline, body, primary, secondary, color,
}: {
  intent: 'helpful' | 'urgent' | 'positive'
  headline: string
  body: string
  primary?: { label: string; onClick: () => void; color?: string }
  secondary?: { label: string; onClick: () => void }
  color?: string
}) {
  const accent = color ?? (intent === 'urgent' ? RED : intent === 'positive' ? GREEN : ORANGE)
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent}44`,
    }}>
      <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 900, color: CREAM, marginBottom: 4 }}>
        {headline}
      </div>
      <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 500, color: MIST, lineHeight: 1.55, marginBottom: primary || secondary ? 12 : 0 }}>
        {body}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {primary && (
          <button type="button" onClick={primary.onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 999,
            backgroundColor: primary.color ?? accent,
            border: 'none',
            color: BG_DEEP,
            fontFamily: BODY, fontSize: 11, fontWeight: 900,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            {primary.label} <ArrowRight size={12} strokeWidth={2.6} />
          </button>
        )}
        {secondary && (
          <button type="button" onClick={secondary.onClick} style={{
            padding: '10px 16px', borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: `1px solid ${MIST_FAINT}`,
            color: MIST,
            fontFamily: BODY, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.10em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  ICONS
// ════════════════════════════════════════════════════════════════════════════

let _iconId = 0
function nextIconId(): string { _iconId += 1; return `i${_iconId}` }

function CoinIcon({ size = 20 }: { size?: number }) {
  const id = useMemo(nextIconId, [])
  return (
    <svg width={size} height={size} viewBox="0 0 32 32"
      style={{
        display: 'inline-block', verticalAlign: 'middle',
        filter: 'drop-shadow(0 2px 5px rgba(120,55,0,0.55)) drop-shadow(0 0 8px rgba(245,158,11,0.35))',
        overflow: 'visible',
      }}
    >
      <defs>
        <radialGradient id={`${id}-rim`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="92%" stopColor="transparent" />
          <stop offset="100%" stopColor="#6b3500" />
        </radialGradient>
        <radialGradient id={`${id}-face`} cx="32%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="20%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#a16207" />
        </radialGradient>
        <linearGradient id={`${id}-shineArc`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15.2" fill="#7a3d00" />
      <circle cx="16" cy="16" r="14.6" fill="#3d1900" />
      <circle cx="16" cy="16" r="14" fill={`url(#${id}-face)`} />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="rgba(120,55,0,0.55)" strokeWidth="0.6" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="rgba(255,235,160,0.55)" strokeWidth="0.5" strokeDasharray="2.2 2.2" />
      <text x="16" y="21" textAnchor="middle"
        fontFamily={BODY} fontSize="13" fontWeight={900} fill="#5c2a00"
        style={{ paintOrder: 'stroke', stroke: 'rgba(255,235,170,0.55)', strokeWidth: 0.7 }}
      >D</text>
      <ellipse cx="11" cy="9" rx="4" ry="2.2" fill="rgba(255,255,255,0.55)" transform="rotate(-25 11 9)" />
      <ellipse cx="9.5" cy="8" rx="1.2" ry="0.7" fill="rgba(255,255,255,0.95)" transform="rotate(-25 9.5 8)" />
      <circle cx="16" cy="16" r="14" fill={`url(#${id}-rim)`} />
      <path d="M 5 13 A 14 14 0 0 1 27 13" fill={`url(#${id}-shineArc)`} opacity="0.5" />
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════════════════

