'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Gift, Users, Send, Flame, Lock, Check, X, ArrowRight,
  Volume2, VolumeX, Star, Trophy, Percent, Shirt,
  Calendar, Coins, KeyRound, Zap,
} from 'lucide-react'
import type { ReferralData, InviteRow, RewardEvent, CrossDormRecentSub, StreakChestState, StreakChestBucket } from '@/utils/supabase/queries'
import type { Subscription } from '../../_shared/types'
import type { MealPriceContext } from '@/lib/dorm-wars/meal-pricing'
import { freeWeekValue, freeMonthValue } from '@/lib/dorm-wars/meal-pricing'

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
const BG_DEEP    = '#091825'
const BG_MID     = '#1e3a4f'
const BG_GLOW    = '#162f40'  // gradient endpoint for the radial wash

// Action — burnt orange is the brand heartbeat. GOLD here means the warm
// orange family the marketing CTAs use, not the yellow-gold of the prior
// neon palette. GOLD_LITE is the brand's gradient secondary (#ffaa00).
const GOLD       = '#f57f20'   // primary action — matches Navbar CTA / hero stress
const GOLD_LITE  = '#ffaa00'   // gradient partner — matches the Navbar gradient end
const ORANGE     = '#f57f20'
const ORANGE_LITE = '#ffaa00'

// Tier accents — kept differentiated for hierarchy but every value pulled
// toward warmer hues so the hub feels like one continuous mood, not a
// rainbow of neon. Saturations reduced ~15-20% from the original gamer set.
const CYAN       = '#5cb4c9'   // teal — closer to BG_MID; was #22d3ee
const GREEN      = '#5fb479'   // forest green; was #22c55e
const PURPLE     = '#b58af0'   // soft mulberry; was #c084fc
const VIOLET     = '#a878dc'   // similar but darker; was #a855f7
const PINK       = '#e57b9a'   // coral pink; was #ec4899
const RED        = '#e0716e'   // brick red; was #f87171

const CREAM      = '#ede8da'
const MIST       = 'rgba(237,232,218,0.55)'
const MIST_DIM   = 'rgba(237,232,218,0.30)'
const MIST_FAINT = 'rgba(237,232,218,0.12)'

const BODY    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
const DISPLAY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

// ════════════════════════════════════════════════════════════════════════════
//  REWARD LAYER DATA — the 4 layers preserved exactly as designed
// ════════════════════════════════════════════════════════════════════════════

// Tier labels — neutral, no military theme
const TIERS = [
  { num: 1, threshold: 10,   perk: '5% off forever',              color: CYAN },
  { num: 2, threshold: 25,   perk: '10% off + Early Access',      color: GREEN },
  { num: 3, threshold: 50,   perk: 'Jacket + Merch drops',        color: PURPLE },
  { num: 4, threshold: 100,  perk: '100 Free Meals + Hall Wall',  color: GOLD },
]

// Layer 1 — per-conversion cash ladder (lifetime scaling)
const LAYER1_LADDER = [
  { range: '1–2',  cash: 20 },
  { range: '3–5',  cash: 25 },
  { range: '6–9',  cash: 30 },
  { range: '10+',  cash: 40 },
]

// Layer 2 — per-cycle milestones. Phase 8D: Free Week / Free Month values
// are computed at render-time from the customer's mealPriceContext so the
// hub shows the actual AED they'll get (Veg Premium = AED 108, NonVeg Max
// = AED 258, etc.) instead of the old hardcoded ~132 / ~528.
interface CycleMilestone { at: number; label: string; value: string; color: string; Emblem: typeof Gift; rare?: boolean }
function buildCycleMilestones(ctx: MealPriceContext): CycleMilestone[] {
  return [
    { at: 3,  label: 'Mystery Cash Drop',  value: 'AED 30–90',                       color: PURPLE, Emblem: Gift },
    { at: 6,  label: 'Free Week',          value: `~AED ${freeWeekValue(ctx)}`,      color: CYAN,   Emblem: Calendar },
    { at: 10, label: 'Free Month',         value: `~AED ${freeMonthValue(ctx)}`,     color: GOLD,   Emblem: Trophy },
    { at: 15, label: '500 cr + 5 Skips',   value: '500 cr',                          color: PINK,   Emblem: Coins, rare: true },
    { at: 20, label: 'Dorm Weekend',       value: 'For all',                         color: RED,    Emblem: Users, rare: true },
  ]
}

// Layer 3 — lifetime tier rewards (matches TIERS above; redundant but explicit)
interface LifetimeTier { at: number; label: string; color: string; Emblem: typeof Percent }
const LIFETIME_TIERS: LifetimeTier[] = [
  { at: 10,  label: '5% off forever',              color: CYAN,   Emblem: Percent },
  { at: 25,  label: '10% off + Early Access',      color: GREEN,  Emblem: Percent },
  { at: 50,  label: 'Jacket + Merch',              color: PURPLE, Emblem: Shirt },
  { at: 100, label: '100 Free Meals',              color: GOLD,   Emblem: Trophy },
]

// Layer 4 — side rewards (footer ribbon)
const SIDE_REWARDS = [
  { label: 'Google review',         value: '+AED 25',  color: GREEN, Emblem: Star },
  { label: '4 weekly surveys',      value: '+AED 20',  color: CYAN,  Emblem: KeyRound },
  { label: '1-year anniversary',    value: '+AED 50',  color: PURPLE, Emblem: Calendar },
  { label: 'Renew & invite combo',  value: '+AED 10',  color: ORANGE, Emblem: Zap },
]

// Scout types — 4-stage mapping from current 2-state invite data
// (Phase 2 backend work will extend to 5 stages with a real 'sent' state)
type ScoutStage = 'sent' | 'scheduled' | 'delivered' | 'decided' | 'subscribed'
interface Scout { id: string; name: string; stage: ScoutStage; daysAgo: number }
const STAGES: Array<{ key: ScoutStage; label: string; color: string }> = [
  { key: 'sent',       label: 'Link sent',      color: ORANGE_LITE },
  { key: 'scheduled',  label: 'Meal scheduled', color: CYAN },
  { key: 'delivered',  label: 'Meal delivered', color: VIOLET },
  { key: 'decided',    label: 'Trial decision', color: RED },
  { key: 'subscribed', label: 'Subscribed',     color: GREEN },
]
function stageIndex(stage: ScoutStage): number {
  return STAGES.findIndex(s => s.key === stage)
}

type SubScreen = null | 'ladder' | 'quests' | 'chest' | 'squad'
type SendStep  = 'closed' | 'naming' | 'sent'

// ════════════════════════════════════════════════════════════════════════════
//  MAIN HUB — clean 5-section layout, single viewport
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  customerCid:        string
  customerName:       string
  customerDorm?:      string
  referralData:       ReferralData
  invites:            InviteRow[]
  activeSubscription: Subscription | null
  // Phase 7-05 — server-canonical streak count (SSR seed).
  initialStreak:      number
  // Phase 8E — Streak Chest replaces Daily Drop. Carries count + cooldown
  // (last_chest_day) + most recent claim payload so the hub can render
  // "chest ready" / "you just opened…" / "next chest in N days".
  initialChestState:  StreakChestState
  // Phase 7-06 — server-canonical cycle recruits + lifetime tier.
  // cycleRecruits comes from getCycleRecruits (same SQL the Layer 2 awarder
  // reads) — see RESEARCH Pitfall #3. lifetimeTier is the highest unlocked
  // Layer 3 row (0 = none unlocked yet).
  cycleRecruits:      number
  lifetimeTier:       0 | 1 | 2 | 3 | 4
  // Phase 7 audit FIX 15 — surface the tier-2 / tier-4 side-effect flags
  // so the hub can render the perks the awarder promised. Without these
  // the flags flip in the DB but the user sees nothing change.
  earlyAccess:        boolean
  hallWall:           boolean
  // Recent reward events (referral conversions, milestones, tier unlocks)
  // power the celebratory banner at the top. The hub compares the newest
  // event's id against a localStorage marker so the celebration only fires
  // once per event — re-renders + page-revisits stay quiet.
  recentRewards:      RewardEvent[]
  // Phase 8B — Premium+ gate. Only Monthly Premium and Monthly Max can
  // earn. When false, the hub renders blurred underneath a full-screen
  // upsell overlay. The hub still SSRs so the user can see the perks
  // they'd unlock by upgrading. `currentPlanId` powers the overlay copy
  // (different framing for "no sub yet" vs "Weekly Flex" vs "Trial").
  dormWarsEligible:   boolean
  currentPlanId:      'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial' | null
  // Phase 8C — Happening Now feed is cross-dorm now. Each item carries
  // firstName + dormName + isElite (hall_wall flag) so the feed can tag
  // Elite Dormers inline as rare social proof.
  crossDormRecent:    CrossDormRecentSub[]
  // Phase 8D — meal-pricing context for Free Week / Free Month display
  // values. SAME shape the awarder reads at fire-time, so the displayed
  // "~AED N" matches what eventually lands in the wallet.
  mealPriceContext:   MealPriceContext
}

// Phase 8E — bucket → palette mapping for the Streak Chest UI. Cash buckets
// scale common→rare; doubler is its own gold-epic class.
const CHEST_BUCKET_COLOR: Record<StreakChestBucket, string> = {
  cash_5_8:    '#5fb479',   // forest green — common
  cash_8_10:   '#5cb4c9',   // teal — uncommon
  cash_10_12:  '#b58af0',   // mulberry — rare
  doubler:     '#ffaa00',   // gold — epic
}
function chestBucketLabel(b: StreakChestBucket): string {
  if (b === 'doubler') return 'Week-long Doubler'
  return 'Cash chest'
}

// Map InviteRow (status = 'gift_claimed' | 'converted') to one of the 4 visible
// scout stages. The 5th stage ('sent' but not yet claimed) requires a backend
// change to expose pre-claim invite rows — flagged for Phase 2.
function deriveScoutStage(row: InviteRow): ScoutStage {
  if (row.status === 'converted') return 'subscribed'
  const claimedAt = row.claimedAt ? new Date(row.claimedAt) : null
  if (!claimedAt) return 'sent'
  const ageDays = (Date.now() - claimedAt.getTime()) / 86_400_000
  if (ageDays < 3)   return 'scheduled'
  if (ageDays < 10)  return 'delivered'
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
  cycleRecruits: serverCycleRecruits, lifetimeTier,
  earlyAccess, hallWall,
  recentRewards,
  dormWarsEligible, currentPlanId,
  crossDormRecent,
  mealPriceContext,
}: Props) {
  void customerDorm   // reserved for future dorm-specific copy
  const initials = useMemo(() => deriveInitials(customerName), [customerName])

  // ── REAL DATA from Supabase ─────────────────────────────────────────────
  const recruits = referralData.converted              // lifetime paid conversions
  const wallet   = Math.round(referralData.creditBalance)

  // Cycle window — derived from active subscription dates.
  // Audit P1-13: a Scheduled (not-yet-started) sub used to read as
  // "30 days left in cycle" because cycleEndTime - now wasn't sub-second
  // away from cycleStartTime. We now also surface cycleStartsInDays so the
  // CycleColumn can swap copy to "Starts in N days" when the cycle hasn't
  // begun yet, instead of pretending it's already counting down.
  const hasActiveSub   = activeSubscription !== null
  const cycleStartTime = hasActiveSub ? new Date(activeSubscription!.start_date).getTime() : 0
  const cycleEndTime   = hasActiveSub ? new Date(activeSubscription!.end_date).getTime()   : 0
  const cycleTotalDays = hasActiveSub
    ? Math.max(1, Math.ceil((cycleEndTime - cycleStartTime) / 86_400_000))
    : 30
  const cycleDaysLeft  = hasActiveSub
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
  // an Elite Dormer tag inline next to Tier-4 customers. Empty-array
  // fallback renders a single placeholder line below.
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
  const nextTier    = TIERS.find(t => recruits < t.threshold) ?? null

  // Streak — server-canonical (Phase 7-05). Seeded from SSR prop, then
  // ticked on mount; the post-tick count overrides the seed if it changed.
  // Phase 8E: tick_streak also reset last_chest_day on streak break, so we
  // refresh chest state (count + lastChestDay) in the same effect when the
  // count changes.
  const [streak, setStreak] = useState(initialStreak)
  const [chestState, setChestState] = useState<StreakChestState>(initialChestState)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dorm-wars/streak/tick', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data && typeof data.count === 'number') {
          setStreak(data.count)
          // If the count changed vs SSR seed, the chest gap may have
          // shifted (or last_chest_day was reset on break). Re-derive
          // chestReady from the new count + the seed lastChestDay; the
          // chest endpoint will give us authoritative state if the user
          // hits the chest UI.
          setChestState(prev => {
            const newCount = data.count as number
            // The tick endpoint doesn't return last_chest_day. If the count
            // dropped vs prev (streak broke), the RPC also reset
            // last_chest_day to 0 — mirror that locally so the UI shows
            // "8 days until next chest" instead of stale "ready".
            const newLastChestDay = newCount < prev.count ? 0 : prev.lastChestDay
            const gap = Math.max(0, newCount - newLastChestDay)
            return {
              ...prev,
              count: newCount,
              lastChestDay: newLastChestDay,
              chestReady: gap >= 8,
              daysUntilNext: gap >= 8 ? 0 : Math.max(0, 8 - gap),
            }
          })
        }
      })
      .catch(() => { /* silent — keep the SSR-seeded value */ })
    return () => { cancelled = true }
  }, [])

  // ── STATE ────────────────────────────────────────────────────────────────
  const [soundOn, setSoundOn]   = useState(true)
  const [open, setOpen]         = useState<SubScreen>(null)
  const [scouts, setScouts]     = useState<Scout[]>(initialScouts)
  // Resync scouts when real invites prop changes (e.g., live updates / re-fetch)
  useEffect(() => { setScouts(initialScouts) }, [initialScouts])
  const [viewingScout, setViewingScout] = useState<Scout | null>(null)
  const [sendStep, setSendStep]   = useState<SendStep>('closed')
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
    const text = `I get fresh meals delivered to my dorm from Dormers — try your first meal free: https://dormers.ae/r/${customerCid}`
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
  const newestReward    = recentRewards[0] ?? null
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
    try { localStorage.setItem(REWARD_SEEN_KEY, celebration.id) } catch {}
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
  function celebrationCopy(ev: RewardEvent): { headline: string; sub: string; accent: string } {
    if (ev.source === 'referral_conversion') {
      return {
        headline: `🎉 ${ev.invitee_name ?? 'A friend'} joined Dormers!`,
        sub:      `+AED ${ev.amount_aed} credit landed in your wallet`,
        accent:   GREEN,
      }
    }
    if (ev.source.startsWith('cycle_milestone_')) {
      const at = ev.source.replace('cycle_milestone_', '')
      return {
        headline: `🎯 Cycle milestone ${at} unlocked`,
        sub:      `+AED ${ev.amount_aed} credit deposited`,
        accent:   GOLD,
      }
    }
    if (ev.source === 'tier_4_meals') {
      return {
        headline: '🏆 TIER 4 UNLOCKED — Elite Dormer',
        sub:      `+AED ${ev.amount_aed} jackpot credit deposited`,
        accent:   GOLD_LITE,
      }
    }
    return {
      headline: '🎁 New reward unlocked',
      sub:      `+AED ${ev.amount_aed} credit deposited`,
      accent:   CYAN,
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
                letterSpacing: '-0.005em',
              }}>
                {copy.headline}
              </span>
              <span style={{
                fontFamily: BODY, fontSize: 12, fontWeight: 700, color: MIST,
                letterSpacing: '0.02em',
              }}>
                {copy.sub} · Wallet now <span style={{ color: copy.accent, fontWeight: 900 }}>AED {wallet}</span>
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

      {/* 1. TOP CHROME — identity + wallet + streak chest strip + sound */}
      <TopChrome
        initials={initials}
        name={customerName || 'You'}
        tier={currentTier}
        recruits={recruits}
        wallet={wallet}
        streak={streak}
        chestState={chestState}
        onChestClick={() => setOpen('chest')}
        soundOn={soundOn}
        onSoundToggle={() => setSoundOn(s => !s)}
        earlyAccess={earlyAccess}
        hallWall={hallWall}
        lifetimeTier={lifetimeTier}
      />

      {/* 2. HERO CTA — one massive button, the focal point */}
      <HeroCTA
        onClick={startSendFlow}
        nextCycleMilestone={cycleMilestones.find(m => cycleRecruits < m.at)}
        cycleRecruits={cycleRecruits}
      />

      {/* 3. THREE-COLUMN PROGRESS — Cycle, Lifetime, Side Rewards (Layer 4)
          Phase 8E.1: the old Daily Drop / Streak Chest column moved into the
          TopChrome strip (chest progress visualised as 8 flame icons + chest
          icon). The third column slot now hosts the Layer 4 side-rewards
          list so users see all four "more ways to earn" surfaces at parity
          with Cycle + Lifetime instead of buried in a footer ribbon. */}
      <div className="hub-progress-grid" style={{ flex: '0 0 auto' }}>
        <CycleColumn
          cycleRecruits={cycleRecruits}
          cycleDaysLeft={cycleDaysLeft}
          cycleTotalDays={cycleTotalDays}
          cycleStartsInDays={cycleStartsInDays}
          onOpen={() => setOpen('quests')}
          milestones={cycleMilestones}
        />
        <LifetimeColumn
          recruits={recruits}
          currentTier={currentTier}
          nextTier={nextTier}
          onOpen={() => setOpen('ladder')}
        />
        <SideRewardsColumn />
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
        accent={viewingScout ? STAGES[stageIndex(viewingScout.stage)].color : ORANGE}
      >
        {viewingScout && <JourneyScreen
          scout={viewingScout}
          onNudge={() => nudgeOnWhatsApp(viewingScout.name)}
          onSendAnother={() => { setViewingScout(null); startSendFlow() }}
        />}
      </Modal>

      <Modal open={open === 'quests'} onClose={() => setOpen(null)} title="This Month's Rewards" accent={GOLD}>
        <QuestsScreen recruitsCycle={cycleRecruits} milestones={cycleMilestones} />
      </Modal>
      <Modal open={open === 'ladder'} onClose={() => setOpen(null)} title="Lifetime Path" accent={CYAN}>
        <TrophyLadderScreen recruits={recruits} />
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

      {/* Phase 8B — Premium+ gate. Renders on top of the entire hub when
          the user isn't on Monthly Premium / Monthly Max. Hub still SSRs
          underneath (blurred) so the user can see the perks they'd unlock. */}
      {!dormWarsEligible && <PremiumGateOverlay currentPlanId={currentPlanId} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  ELITE DORMER BADGE — Tier 4 apex perk visual
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
      Elite Dormer
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
  currentPlanId: 'monthly-max' | 'monthly-premium' | 'weekly-flex' | 'trial' | null
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
    { icon: Coins,    label: 'Cash for every friend',  sub: 'AED 25–40 per conversion',     color: GREEN },
    { icon: Gift,     label: 'Monthly milestones',     sub: 'Mystery Cash Drops up to AED 90', color: PURPLE },
    { icon: Percent,  label: 'Lifetime % off',         sub: '5–10% off your plan forever',  color: CYAN },
    { icon: Shirt,    label: 'Dormers jacket',         sub: 'Tier 3 — yours to keep',        color: GOLD },
    { icon: Trophy,   label: 'Elite Dormer status',    sub: '100 invites = 100 free meals', color: GOLD_LITE },
    { icon: Flame,    label: 'Streak Chests',          sub: 'Open every 8 days for AED + jackpots', color: ORANGE },
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
      </div>
    </div>
  )
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
  color:     string
  glow:      string   // box-shadow color value
  glowSize:  number   // px
  animated:  boolean  // true for peak + epic tiers
}

function flameTier(count: number): FlameTier {
  // Pre-cap ladder
  if (count < 8)  return { color: '#ff9466', glow: '#ff946622', glowSize: 0,  animated: false } // pale
  if (count < 15) return { color: '#f57f20', glow: `${GOLD}44`, glowSize: 6,  animated: false } // chest-1
  if (count < 22) return { color: '#f57f20', glow: `${GOLD}77`, glowSize: 10, animated: false } // brighter
  if (count < 29) return { color: GOLD_LITE, glow: `${GOLD}bb`, glowSize: 14, animated: true  } // peak (cap)
  // Post-28 epic tiers — every 10 days a new color
  if (count < 40) return { color: GOLD_LITE, glow: `${GOLD}bb`, glowSize: 14, animated: true  } // sustain peak
  if (count < 50) return { color: PURPLE,    glow: `${PURPLE}bb`, glowSize: 16, animated: true } // purple
  if (count < 60) return { color: '#4fa9d6', glow: '#4fa9d6bb',   glowSize: 16, animated: true } // blue
  if (count < 70) return { color: CYAN,      glow: `${CYAN}bb`,   glowSize: 18, animated: true } // cyan
  if (count < 80) return { color: GREEN,     glow: `${GREEN}bb`,  glowSize: 18, animated: true } // forest
  if (count < 90) return { color: PINK,      glow: `${PINK}bb`,   glowSize: 20, animated: true } // pink
  return            { color: GOLD,           glow: `${GOLD}ee`,   glowSize: 24, animated: true } // supernova
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
function StreakChestStrip({
  count, chestProgress, chestReady, onChestClick,
}: {
  count:         number   // total streak days (drives epic color tier)
  chestProgress: number   // 0..8 — flames lit toward next chest
  chestReady:    boolean
  onChestClick:  () => void
}) {
  const tier = flameTier(count)
  const litCount = Math.max(0, Math.min(8, chestProgress))

  return (
    <div
      title={
        chestReady
          ? `Streak chest ready — ${count}-day streak`
          : `${count}-day streak — ${8 - litCount} more for next chest`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 999,
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%)`,
        border: `1.5px solid ${tier.color}88`,
        boxShadow: tier.glowSize > 0
          ? `0 4px 12px rgba(0,0,0,0.45), 0 0 ${tier.glowSize}px ${tier.glow}`
          : `0 4px 12px rgba(0,0,0,0.45)`,
      }}
    >
      {/* Total streak day count — small badge for context */}
      <span style={{
        fontFamily: BODY, fontSize: 11, fontWeight: 900, color: CREAM,
        fontFeatureSettings: '"tnum"',
        paddingRight: 2,
      }}>
        {count}d
      </span>

      {/* 8 flame icons — each lit one is brighter + more animated than the
          previous. The position-driven intensity is the visual "crescendo"
          toward the chest at the end. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const lit = i < litCount
          // 1-indexed position within the strip → intensity ramp 0.25..1.
          const pos = (i + 1) / 8
          const opacity = lit ? 0.35 + 0.65 * pos : 0.18
          const dropShadow = lit ? `drop-shadow(0 0 ${Math.round(pos * 5)}px ${tier.color})` : 'none'
          // Top 3 lit flames flicker; the rest stay still.
          const animate = lit && i >= Math.max(0, litCount - 3)
          return (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                opacity,
                filter: dropShadow,
                animation: animate ? `hub-flame-flicker ${1.4 + i * 0.05}s ease-in-out infinite` : undefined,
              }}
            >
              <Flame
                size={11}
                strokeWidth={lit ? 2.6 : 2}
                color={lit ? tier.color : MIST_FAINT}
              />
            </span>
          )
        })}
      </div>

      {/* Chest at end — locked dim icon until all 8 flames lit; then
          pulsing gold with a ring halo and click-to-claim. */}
      <button
        type="button"
        onClick={onChestClick}
        disabled={!chestReady}
        aria-label={chestReady ? 'Open streak chest' : 'Streak chest — locked'}
        style={{
          position: 'relative',
          padding: 0,
          marginLeft: 4,
          border: 'none',
          background: 'transparent',
          cursor: chestReady ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          backgroundColor: chestReady ? `${GOLD}22` : 'transparent',
          boxShadow: chestReady ? `0 0 10px ${GOLD}88, inset 0 0 6px ${GOLD}44` : 'none',
          transition: 'background-color 200ms ease, box-shadow 200ms ease',
        }}
      >
        <Gift
          size={14}
          strokeWidth={2.6}
          color={chestReady ? GOLD_LITE : MIST_DIM}
          style={{
            animation: chestReady ? 'hub-cta-pulse 2.2s ease-in-out infinite' : undefined,
          }}
        />
        {chestReady && (
          <span style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: `1.5px solid ${GOLD}`,
            animation: 'hub-pulse-ring 2.2s ease-out infinite',
            opacity: 0.55,
            pointerEvents: 'none',
          }} />
        )}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TOP CHROME — single horizontal row with identity + wallet + streak + sound
// ════════════════════════════════════════════════════════════════════════════

function TopChrome({
  initials, name, tier, recruits, wallet, streak, chestState, onChestClick,
  soundOn, onSoundToggle,
  earlyAccess, hallWall, lifetimeTier,
}: {
  initials:      string
  name:          string
  tier:          (typeof TIERS)[number] | null
  recruits:      number
  wallet:        number
  streak:        number
  chestState:    StreakChestState
  onChestClick:  () => void
  soundOn:       boolean
  onSoundToggle: () => void
  earlyAccess:   boolean
  hallWall:      boolean
  lifetimeTier:  0 | 1 | 2 | 3 | 4
}) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          backgroundImage: `linear-gradient(135deg, ${tier?.color ?? '#94a3b8'} 0%, ${BG_MID} 100%)`,
          border: `1.5px solid ${tier?.color ?? '#94a3b8'}`,
          color: CREAM,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BODY, fontSize: 13, fontWeight: 900, letterSpacing: '0.04em',
          flexShrink: 0,
          boxShadow: `0 0 14px ${tier?.color ?? '#94a3b8'}44`,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: BODY, fontSize: 14, fontWeight: 800, color: CREAM,
              maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </span>
            {tier && (
              <span style={{
                padding: '3px 9px', borderRadius: 999,
                backgroundColor: `${tier.color}22`,
                border: `1px solid ${tier.color}66`,
                fontFamily: BODY, fontSize: 10, fontWeight: 900, color: tier.color,
                letterSpacing: '0.16em', textTransform: 'uppercase',
              }}>
                Tier {tier.num}
              </span>
            )}
            {/* Tier-2 perk badge: early menu peek unlocked. Driven by the
                customers.early_access flag the awarder flips at 25 lifetime
                conversions. Without this badge the perk is invisible. */}
            {earlyAccess && (
              <span style={{
                padding: '3px 9px', borderRadius: 999,
                backgroundColor: `${GREEN}1f`,
                border: `1px solid ${GREEN}66`,
                fontFamily: BODY, fontSize: 10, fontWeight: 900, color: GREEN,
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>
                Early Access
              </span>
            )}
            {/* Tier-4 perk badge: Elite Dormer unlocked. Driven by the
                customers.hall_wall flag the awarder flips at 100 lifetime
                conversions. Custom shape (chevron tail + crown emblem)
                so it stands apart from the pill-shaped Early Access tag —
                this is the apex prize and needs to feel rarer than a chip. */}
            {hallWall && (
              <EliteDormerBadge size="sm" />
            )}
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 700, color: MIST_DIM,
            letterSpacing: '0.04em', marginTop: 2, fontFeatureSettings: '"tnum"',
          }}>
            {recruits} lifetime invites
            {lifetimeTier > 0 && (
              <> · <span style={{ color: CREAM, fontWeight: 800 }}>{lifetimeTier === 1 ? '5% off forever' : '10% off forever'}</span></>
            )}
          </div>
        </div>
      </div>

      {/* Wallet + Streak + Sound */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Wallet — the most important chip */}
        <div title="Auto-applies to your next Dormers renewal · not cashable" style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '8px 16px 8px 10px', borderRadius: 999,
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.32) 100%)`,
          border: `1.5px solid ${GOLD}66`,
          boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 18px ${GOLD}33`,
        }}>
          <CoinIcon size={26} />
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontFamily: BODY, fontSize: 8, fontWeight: 900, color: GOLD,
              letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1,
            }}>
              Wallet
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: CREAM,
              letterSpacing: '-0.02em', lineHeight: 1.1, fontFeatureSettings: '"tnum"',
              marginTop: 2,
            }}>
              AED {wallet}
            </div>
          </div>
        </div>

        {/* Phase 8E.1 — chest progress strip replaces the simple flame chip.
            Shows 8 flame icons (lit toward next chest) + a chest button at
            the end that opens the claim modal when ready. */}
        <StreakChestStrip
          count={streak}
          chestProgress={Math.max(0, Math.min(8, chestState.count - chestState.lastChestDay))}
          chestReady={chestState.chestReady}
          onChestClick={onChestClick}
        />

        <button
          type="button"
          onClick={onSoundToggle}
          aria-label={`Sound ${soundOn ? 'on' : 'off'}`}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.45)',
            border: `1px solid ${MIST_FAINT}`,
            color: MIST,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {soundOn ? <Volume2 size={14} strokeWidth={2.4} /> : <VolumeX size={14} strokeWidth={2.4} />}
        </button>
      </div>
    </header>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  HERO CTA — the focal point. Massive button, one line of copy, breathing.
// ════════════════════════════════════════════════════════════════════════════

function HeroCTA({
  onClick, nextCycleMilestone, cycleRecruits,
}: {
  onClick: () => void
  nextCycleMilestone?: CycleMilestone
  cycleRecruits: number
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
        Earn <span style={{ color: GOLD_LITE, fontWeight: 800 }}>AED 20</span> every time a friend joins Dormers.
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
        Send a link
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
  eyebrow, title, accent, onOpen, children,
}: {
  eyebrow: string
  title:   string
  accent:  string
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
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 900,
          color: accent, letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>
          {eyebrow}
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
      <div style={{
        fontFamily: DISPLAY, fontSize: 'clamp(16px, 1.5vw, 19px)', fontWeight: 900,
        color: CREAM, letterSpacing: '-0.01em', lineHeight: 1.15,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  CYCLE COLUMN — Layer 2 cycle milestones progress
// ════════════════════════════════════════════════════════════════════════════

function CycleColumn({
  cycleRecruits, cycleDaysLeft, cycleTotalDays, cycleStartsInDays, onOpen, milestones,
}: {
  cycleRecruits:     number
  cycleDaysLeft:     number
  cycleTotalDays:    number
  cycleStartsInDays: number
  onOpen:            () => void
  milestones:        CycleMilestone[]
}) {
  void cycleTotalDays
  // cycleStartsInDays > 0 means the user's sub hasn't started yet (Scheduled
  // status, queued after a current sub). Show "Starts in N days" instead of
  // "N days left in cycle" — the cycle is not counting down yet.
  const notYetStarted = cycleStartsInDays > 0
  const max = milestones[milestones.length - 1].at
  const fillPct = Math.min(100, (cycleRecruits / max) * 100)
  const nextMilestone = milestones.find(m => cycleRecruits < m.at)

  return (
    <Column eyebrow="This Month" title="Burst goals for big bonuses" accent={GOLD} onOpen={onOpen}>
      {/* Progress bar — bumped to 44px so the gift icons inside each
          milestone have breathing room. The bare-dot version made each
          stop unreadable; now every stop shows what it actually unlocks. */}
      <div style={{ position: 'relative', height: 44, marginTop: 6 }}>
        {/* Track */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 4, transform: 'translateY(-50%)',
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 2,
        }} />
        {/* Fill */}
        <div style={{
          position: 'absolute', left: 0, top: '50%',
          width: `${fillPct}%`, height: 4, transform: 'translateY(-50%)',
          backgroundImage: `linear-gradient(90deg, ${GREEN} 0%, ${GOLD} 100%)`,
          borderRadius: 2,
          boxShadow: `0 0 8px ${GOLD}88`,
          transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
        }} />
        {/* "You are here" head marker — a small white pulsing dot at the
            fill position so the user sees their current progress as a live
            cursor, distinct from the static milestone stops. Hidden at 0%
            (nothing achieved) and at 100% (final stop already glows). */}
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
        {/* Stops — each shows its gift icon (Gift/Calendar/Trophy/etc) so
            users can see what each milestone unlocks at a glance. */}
        {milestones.map(m => {
          const leftPct = (m.at / max) * 100
          const earned = cycleRecruits >= m.at
          const isNext = m.at === nextMilestone?.at
          const Emblem = m.Emblem
          return (
            <div key={m.at} style={{
              position: 'absolute', left: `${leftPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 26, height: 26, borderRadius: '50%',
              backgroundColor: earned ? m.color : 'rgba(0,0,0,0.85)',
              border: earned
                ? `2px solid ${m.color}`
                : isNext ? `2px solid ${m.color}`
                : `1.5px solid ${MIST_FAINT}`,
              boxShadow: earned ? `0 0 10px ${m.color}aa` : isNext ? `0 0 8px ${m.color}77` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2,
            }}>
              <Emblem
                size={12}
                strokeWidth={2.4}
                color={earned ? BG_DEEP : isNext ? m.color : MIST_DIM}
              />
              {/* Outward halo on the NEXT goal — drives attention to the
                  achievable target without screaming. Slow + soft. */}
              {isNext && (
                <span style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: '100%', height: '100%', borderRadius: '50%',
                  border: `2px solid ${m.color}`,
                  pointerEvents: 'none',
                  animation: 'hub-milestone-halo 2.4s ease-out infinite',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Threshold numbers under bar */}
      <div style={{ position: 'relative', height: 12 }}>
        {milestones.map(m => (
          <span key={m.at} style={{
            position: 'absolute',
            left: `${(m.at / max) * 100}%`,
            transform: 'translateX(-50%)',
            fontFamily: BODY, fontSize: 9, fontWeight: 800,
            color: cycleRecruits >= m.at ? m.color : MIST_DIM,
            fontFeatureSettings: '"tnum"',
          }}>
            {m.at}
          </span>
        ))}
      </div>

      {/* Status block — explicit RECRUITS unit + Users icon so the number
          reads as a quantity of people, not an abstract counter. */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
          letterSpacing: '-0.005em', marginBottom: 6,
        }}>
          <Users size={12} strokeWidth={2.6} color={GOLD_LITE} />
          <span style={{ color: GOLD_LITE, fontFeatureSettings: '"tnum"' }}>{cycleRecruits}</span>
          <span style={{ color: MIST_DIM, fontWeight: 600 }}>
            of {max} <span style={{ letterSpacing: '0.10em', textTransform: 'uppercase', fontSize: 10, fontWeight: 900 }}>recruits</span> this month
          </span>
        </div>
        {nextMilestone && (
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
          }}>
            <span style={{ color: nextMilestone.color, fontWeight: 900 }}>
              {nextMilestone.at - cycleRecruits} more {nextMilestone.at - cycleRecruits === 1 ? 'recruit' : 'recruits'}
            </span>
            {' '}for {nextMilestone.label}
          </div>
        )}
        <div style={{
          marginTop: 6,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: BODY, fontSize: 10, fontWeight: 700,
          color: CYAN, letterSpacing: '0.04em',
        }}>
          <Calendar size={10} strokeWidth={2.6} />
          {notYetStarted
            ? <>Starts in {cycleStartsInDays} {cycleStartsInDays === 1 ? 'day' : 'days'}</>
            : <>{cycleDaysLeft} {cycleDaysLeft === 1 ? 'day' : 'days'} left in cycle</>}
        </div>
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  LIFETIME COLUMN — Layer 1 (cash tier) + Layer 3 (perk tier) combined
// ════════════════════════════════════════════════════════════════════════════

function LifetimeColumn({
  recruits, currentTier, nextTier, onOpen,
}: {
  recruits:    number
  currentTier: (typeof TIERS)[number] | null
  nextTier:    (typeof TIERS)[number] | null
  onOpen:      () => void
}) {
  const max = LIFETIME_TIERS[LIFETIME_TIERS.length - 1].at
  const fillPct = Math.min(100, (recruits / max) * 100)

  // Layer 1 cash for current and next tier
  const currentCash = LAYER1_LADDER.slice().reverse().find(l => {
    const [low] = l.range.split('–').map(s => parseInt(s, 10))
    return recruits >= low
  })?.cash ?? 20

  return (
    <Column eyebrow="Lifetime Path" title="Permanent perks unlock as you climb" accent={CYAN} onOpen={onOpen}>
      {/* Progress bar — matches CycleColumn dimensions so the two bars feel
          like one design system. Tier stops show the perk icon (Percent /
          Shirt / Trophy) for at-a-glance "what does this unlock?". */}
      <div style={{ position: 'relative', height: 44, marginTop: 6 }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 4, transform: 'translateY(-50%)',
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', left: 0, top: '50%',
          width: `${fillPct}%`, height: 4, transform: 'translateY(-50%)',
          backgroundImage: `linear-gradient(90deg, ${CYAN} 0%, ${GOLD} 100%)`,
          borderRadius: 2,
          boxShadow: `0 0 8px ${CYAN}88`,
          transition: 'width 1s cubic-bezier(0.16,1,0.3,1)',
        }} />
        {/* "You are here" head marker — matches CycleColumn. */}
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
        {LIFETIME_TIERS.map(t => {
          const leftPct = (t.at / max) * 100
          const earned = recruits >= t.at
          const isNext = t.at === nextTier?.threshold
          const Emblem = t.Emblem
          return (
            <div key={t.at} style={{
              position: 'absolute', left: `${leftPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 26, height: 26, borderRadius: '50%',
              backgroundColor: earned ? t.color : 'rgba(0,0,0,0.85)',
              border: earned
                ? `2px solid ${t.color}`
                : isNext ? `2px solid ${t.color}`
                : `1.5px solid ${MIST_FAINT}`,
              boxShadow: earned ? `0 0 10px ${t.color}aa` : isNext ? `0 0 8px ${t.color}77` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2,
            }}>
              <Emblem
                size={12}
                strokeWidth={2.4}
                color={earned ? BG_DEEP : isNext ? t.color : MIST_DIM}
              />
              {/* Outward halo on the next-tier marker — same as cycle bar. */}
              {isNext && (
                <span style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: '100%', height: '100%', borderRadius: '50%',
                  border: `2px solid ${t.color}`,
                  pointerEvents: 'none',
                  animation: 'hub-milestone-halo 2.4s ease-out infinite',
                }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ position: 'relative', height: 12 }}>
        {LIFETIME_TIERS.map(t => (
          <span key={t.at} style={{
            position: 'absolute',
            left: `${(t.at / max) * 100}%`,
            transform: 'translateX(-50%)',
            fontFamily: BODY, fontSize: 9, fontWeight: 800,
            color: recruits >= t.at ? t.color : MIST_DIM,
            fontFeatureSettings: '"tnum"',
          }}>
            {t.at}
          </span>
        ))}
      </div>

      {/* Status block — Users icon + explicit RECRUITS unit, parity with
          CycleColumn. The lifetime number was reading as an abstract
          counter; framing it as people-converted is the clarity win. */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
          letterSpacing: '-0.005em', marginBottom: 6,
        }}>
          <Users size={12} strokeWidth={2.6} color={GOLD_LITE} />
          <span style={{ color: GOLD_LITE, fontFeatureSettings: '"tnum"' }}>{recruits}</span>
          <span style={{ color: MIST_DIM, fontWeight: 600 }}>
            lifetime <span style={{ letterSpacing: '0.10em', textTransform: 'uppercase', fontSize: 10, fontWeight: 900 }}>recruits</span>
          </span>
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
        }}>
          Earning <span style={{ color: GOLD_LITE, fontWeight: 900 }}>AED {currentCash}</span> per recruit
          {currentTier && <> · <span style={{ color: currentTier.color, fontWeight: 900 }}>{currentTier.perk}</span></>}
        </div>
        {nextTier && (
          <div style={{
            marginTop: 6,
            fontFamily: BODY, fontSize: 10, fontWeight: 700,
            color: nextTier.color, letterSpacing: '0.04em',
          }}>
            Tier {nextTier.num} ({nextTier.threshold - recruits} more {nextTier.threshold - recruits === 1 ? 'recruit' : 'recruits'}): {nextTier.perk}
          </div>
        )}
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SIDE REWARDS COLUMN — Phase 8E.1 (Layer 4 surface)
//  Third progress column. Lists the four Layer 4 "more ways to earn" perks
//  with status. Streak Chest moved to the TopChrome strip; the chest claim
//  modal opens from there. Backend wiring for these rewards ships in 8G —
//  until then each item displays as "Coming soon" so the surface honestly
//  reflects what's actionable today.
// ════════════════════════════════════════════════════════════════════════════

function SideRewardsColumn() {
  return (
    <Column eyebrow="Side Rewards" title="Four more ways to earn AED" accent={GREEN}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        flex: '1 1 auto',
        marginTop: 4,
      }}>
        {SIDE_REWARDS.map(r => {
          const Emblem = r.Emblem
          return (
            <div
              key={r.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px solid ${r.color}33`,
              }}
            >
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

              {/* Label + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
                  lineHeight: 1.2,
                }}>
                  {r.label}
                </div>
                <div style={{
                  fontFamily: BODY, fontSize: 9, fontWeight: 700,
                  color: MIST_DIM, letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginTop: 2,
                }}>
                  Coming soon
                </div>
              </div>

              {/* Value chip */}
              <span style={{
                flexShrink: 0,
                fontFamily: BODY, fontSize: 11, fontWeight: 900, color: r.color,
                fontFeatureSettings: '"tnum"',
                padding: '3px 8px', borderRadius: 999,
                backgroundColor: `${r.color}14`,
                border: `1px solid ${r.color}44`,
              }}>
                {r.value}
              </span>
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

// Compact inline variant of the Elite Dormer badge — sized for activity-feed
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
      <Column eyebrow="Happening Now" title="" accent={GREEN}>
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
    <Column eyebrow="Happening Now" title="" accent={GREEN}>
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
  scouts:     Scout[]
  onScoutTap: (s: Scout) => void
  onSendNew:  () => void
  onViewAll:  () => void
}) {
  return (
    <Column eyebrow={`Your Scouts · ${scouts.length}`} title="" accent={PINK} onOpen={onViewAll}>
      <div style={{
        flex: '1 1 auto',
        display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
        scrollbarWidth: 'none',
        paddingBottom: 4,
        marginTop: -6,
      }} className="hub-scouts-scroll">
        {scouts.map(s => {
          const stage = STAGES[stageIndex(s.stage)]
          const isWin = s.stage === 'subscribed'
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
              <div style={{ display: 'flex', gap: 2 }}>
                {STAGES.map((_, idx) => (
                  <span key={idx} style={{
                    width: 4, height: 4, borderRadius: '50%',
                    backgroundColor: idx <= stageIndex(s.stage) ? stage.color : 'rgba(255,255,255,0.10)',
                  }} />
                ))}
              </div>
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
            Send<br/>new
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

      @keyframes hub-pulse-ring {
        0%   { transform: scale(1);   opacity: 0.75; }
        70%  { transform: scale(1.7); opacity: 0;    }
        100% { transform: scale(1.7); opacity: 0;    }
      }
      @keyframes hub-pulse-fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      /* Halo for the nearest-milestone marker on cycle + lifetime progress
         bars. Outward ring at 2.6× scale drives the eye to the goal in
         play. Uses a centred ::after via inline style on the wrapper. */
      @keyframes hub-milestone-halo {
        0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.65; }
        70%  { transform: translate(-50%, -50%) scale(2.4); opacity: 0;    }
        100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0;    }
      }
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

      .hub-column-tap {
        cursor: pointer;
      }
      .hub-column-tap:hover {
        transform: translateY(-2px);
        border-color: rgba(245,127,32,0.55);
      }

      /* Responsive grids — audit P1-9. Fixed repeat(3, 1fr) made each
         progress column ~110px wide at 375px, colliding milestone dots
         with their numeric labels. Collapse to two columns at <1024px,
         single column at <720px so phones get readable, scrollable cards. */
      .hub-progress-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(3, 1fr);
      }
      .hub-activity-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: 1.1fr 1fr;
      }
      @media (max-width: 1024px) {
        .hub-progress-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 720px) {
        .hub-progress-grid,
        .hub-activity-grid  { grid-template-columns: 1fr; }
      }

      .hub-scouts-scroll::-webkit-scrollbar { display: none; }

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
        const dx = Math.cos(angle) * 80
        const dy = Math.sin(angle) * 80
        return `@keyframes hub-confetti-${i} {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4); }
        }`
      }).join('\n')}

      @media (max-width: 900px) {
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
  const dialogRef    = useRef<HTMLDivElement>(null)
  const titleId      = useRef(`hub-modal-title-${Math.random().toString(36).slice(2, 8)}`).current
  useEffect(() => {
    if (!open) return
    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    // Defer focus until after the open animation kicks off so the focus
    // ring doesn't flash before the modal is visible.
    const t = setTimeout(() => dialogRef.current?.focus(), 60)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      // Restore focus to whatever triggered the modal so keyboard users
      // don't lose their place when it closes.
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: 'rgba(8,5,31,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640, width: '100%', maxHeight: '88vh', overflow: 'auto',
          backgroundImage: `linear-gradient(180deg, ${BG_MID} 0%, ${BG_DEEP} 100%)`,
          border: `1.5px solid ${accent}55`,
          borderRadius: 18,
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${accent}28`,
          animation: 'hub-modal-in 280ms cubic-bezier(0.16,1,0.3,1) both',
          outline: 'none',
        }}
      >
        <div style={{
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
        <div style={{ padding: 22 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  SUB-SCREENS — Trophy Ladder, Quests, Daily Drop, Squad
// ════════════════════════════════════════════════════════════════════════════

function TrophyLadderScreen({ recruits }: { recruits: number }) {
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
          {LAYER1_LADDER.map(l => {
            const [low] = l.range.split('–').map(s => parseInt(s, 10))
            const earned = recruits >= low
            return (
              <div key={l.range} style={{
                flex: '1 1 0', minWidth: 100,
                padding: '10px 12px', borderRadius: 8,
                backgroundColor: earned ? `${GREEN}14` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${earned ? `${GREEN}44` : MIST_FAINT}`,
              }}>
                <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 700, color: MIST_DIM, fontFeatureSettings: '"tnum"' }}>
                  Recruits {l.range}
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 900, color: earned ? GREEN : CREAM, marginTop: 2 }}>
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
            <div key={t.at} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 12,
              backgroundColor: earned ? `${GREEN}10` : isNext ? `${t.color}10` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${earned ? `${GREEN}44` : isNext ? `${t.color}55` : MIST_FAINT}`,
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: earned ? GREEN : isNext ? t.color : 'rgba(255,255,255,0.05)',
                color: earned || isNext ? BG_DEEP : MIST_DIM,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: DISPLAY, fontSize: 14, fontWeight: 900, fontFeatureSettings: '"tnum"',
                flexShrink: 0,
                boxShadow: isNext ? `0 0 10px ${t.color}66` : 'none',
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 900, color: earned || isNext ? CREAM : MIST }}>
                  Tier {i + 1} · {t.label}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: earned ? GREEN : isNext ? t.color : MIST_DIM, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
                  {earned ? '✓ Unlocked' : `${t.at} recruits (${t.at - recruits} to go)`}
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
        Credits auto-apply to your next Dormers renewal · not cashable
      </p>
    </div>
  )
}

function QuestsScreen({ recruitsCycle, milestones }: { recruitsCycle: number; milestones: CycleMilestone[] }) {
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
            <div key={m.at} style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 12,
              backgroundColor: earned ? `${GREEN}10` : isNext ? `${m.color}12` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${earned ? `${GREEN}44` : isNext ? `${m.color}55` : MIST_FAINT}`,
            }}>
              {m.rare && (
                <span style={{
                  position: 'absolute', top: 8, right: 10,
                  fontFamily: BODY, fontSize: 8, fontWeight: 900,
                  color: m.color, letterSpacing: '0.16em', textTransform: 'uppercase',
                }}>
                  Rare
                </span>
              )}
              <span style={{
                width: 38, height: 38, borderRadius: 10,
                backgroundColor: earned ? GREEN : isNext ? m.color : 'rgba(255,255,255,0.05)',
                color: earned || isNext ? BG_DEEP : MIST_DIM,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: DISPLAY, fontSize: 14, fontWeight: 900, fontFeatureSettings: '"tnum"',
                flexShrink: 0,
              }}>
                {m.at}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 900, color: earned || isNext ? CREAM : MIST, marginBottom: 2 }}>
                  {m.label}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: earned ? GREEN : isNext ? m.color : MIST_DIM }}>
                  {m.value}
                </div>
              </div>
              {earned ? <Check size={16} strokeWidth={3} color={GREEN} /> : isNext ? <Zap size={14} strokeWidth={2.6} color={m.color} /> : <Lock size={12} strokeWidth={2.4} color={MIST_DIM} />}
            </div>
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
function StreakChestScreen({
  state, onClaimed,
}: {
  state:     StreakChestState
  onClaimed: (next: StreakChestState) => void
}) {
  const [claiming, setClaiming] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<{
    rng_bucket:         StreakChestBucket
    value_aed:          number | null
    doubler_expires_at: string | null
    streak_day:         number
  } | null>(null)

  // If the user already claimed at the current streak day, show that as the
  // result. Otherwise show whatever they just opened in-modal.
  const showResult = justClaimed ?? (
    state.recentChest && state.recentChest.streak_day === state.lastChestDay
      ? state.recentChest
      : null
  )
  const bucketColor = showResult ? CHEST_BUCKET_COLOR[showResult.rng_bucket] : GOLD

  async function handleClaim() {
    if (!state.chestReady || claiming) return
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch('/api/dorm-wars/streak-chest', { method: 'POST' })
      const data = await res.json().catch(() => null) as {
        claimed?:           boolean
        reason?:            string
        rng_bucket?:        StreakChestBucket
        value_aed?:         number | null
        doubler_expires_at?: string | null
        streak_day?:        number
        error?:             string
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
          rng_bucket:         data.rng_bucket,
          value_aed:          data.value_aed ?? null,
          doubler_expires_at: data.doubler_expires_at ?? null,
          streak_day:         data.streak_day,
        }
        setJustClaimed(claim)
        // Sync the hub-wide chest state: advance lastChestDay so the column
        // flips to "cooldown" and the badge updates.
        onClaimed({
          ...state,
          lastChestDay:  data.streak_day,
          chestReady:    false,
          daysUntilNext: 8,
          recentChest:   {
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

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 20px',
      }}>
        Every 8 unbroken streak days unlocks a chest. Break the streak and the
        chest resets — re-earn 8 days from scratch.
      </p>

      <button
        type="button"
        onClick={handleClaim}
        disabled={!state.chestReady || claiming || showResult !== null}
        style={{
          margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: 14,
          padding: '28px 36px', borderRadius: 18,
          backgroundImage: showResult
            ? `linear-gradient(135deg, ${bucketColor}28 0%, ${bucketColor}10 100%)`
            : state.chestReady
              ? `linear-gradient(135deg, ${GOLD}28 0%, ${ORANGE}10 100%)`
              : `linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)`,
          border: `1.5px solid ${(showResult ? bucketColor : state.chestReady ? GOLD : MIST_FAINT)}66`,
          cursor: (!state.chestReady || claiming || showResult !== null) ? 'default' : 'pointer',
          minWidth: 320,
          opacity: claiming ? 0.85 : 1,
          transition: 'opacity 200ms ease',
        }}
      >
        {showResult ? (
          <>
            <span style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: bucketColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {showResult.rng_bucket === 'doubler'
                ? <Zap size={28} strokeWidth={2.6} color={BG_DEEP} />
                : <Check size={28} strokeWidth={3} color={BG_DEEP} />}
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, color: bucketColor,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {showResult.rng_bucket === 'doubler'
                  ? <>2× rewards · 7 days</>
                  : <><CoinIcon size={18} /> +{showResult.value_aed} credits</>}
              </div>
              <div style={{
                fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
              }}>
                {chestBucketLabel(showResult.rng_bucket)} · earned at day {showResult.streak_day}
              </div>
            </div>
          </>
        ) : (
          <>
            <span style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: state.chestReady ? GOLD : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {state.chestReady
                ? <Gift size={28} strokeWidth={2.4} color={BG_DEEP} />
                : <Lock size={26} strokeWidth={2.4} color={MIST_DIM} />}
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: state.chestReady ? CREAM : MIST }}>
                {claiming ? 'Opening…' : state.chestReady ? 'Tap to open' : 'Locked'}
              </div>
              <div style={{
                fontFamily: BODY, fontSize: 11, fontWeight: 700,
                color: state.chestReady ? GOLD_LITE : MIST_DIM, letterSpacing: '0.10em',
              }}>
                {state.chestReady
                  ? 'Credits · or something epic'
                  : `${state.daysUntilNext} more streak day${state.daysUntilNext === 1 ? '' : 's'}`}
              </div>
            </div>
          </>
        )}
      </button>

      {error && (
        <div style={{
          marginTop: 16,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: `${RED}18`,
          border: `1px solid ${RED}55`,
          fontFamily: BODY, fontSize: 12, fontWeight: 600, color: CREAM,
          textAlign: 'left',
        }}>
          {error}
        </div>
      )}

      <p style={{
        fontFamily: BODY, fontSize: 10, fontWeight: 600, color: MIST_DIM,
        lineHeight: 1.5, margin: '20px 0 0',
      }}>
        Cash chests are dropped instantly into your wallet · doubler boosts
        cycle + per-conversion rewards for 7 days
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
          const stage = STAGES[stageIndex(s.stage)]
          const isWin = s.stage === 'subscribed'
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
                  {STAGES.map((stg, i) => (
                    <span key={stg.key} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: i <= stageIndex(s.stage) ? stage.color : 'rgba(255,255,255,0.08)',
                    }} />
                  ))}
                  <span style={{ marginLeft: 8, fontFamily: BODY, fontSize: 10, fontWeight: 800, color: stage.color, letterSpacing: '0.10em' }}>
                    {stage.label}
                  </span>
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
//  SEND SCOUT MODAL + JOURNEY — referral flow + per-recruit journey detail
// ════════════════════════════════════════════════════════════════════════════

function SendScoutModal({
  step, scoutName, onNameChange, onSend, onClose, onTrackJourney,
}: {
  step:           SendStep
  scoutName:      string
  onNameChange:   (s: string) => void
  onSend:         () => void
  onClose:        () => void
  onTrackJourney: () => void
}) {
  // a11y parity with Modal (audit P1-7) — Escape dismiss + focus management.
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId   = 'hub-send-modal-title'
  useEffect(() => {
    if (step === 'closed') return
    const prev = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const t = setTimeout(() => dialogRef.current?.focus(), 60)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      prev?.focus?.()
    }
  }, [step, onClose])

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
                We&apos;ll track their journey from the moment you send the link.
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
                Opens WhatsApp · they eat free · you earn AED 20 when they subscribe
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
                      position: 'absolute', inset: -6, borderRadius: '50%',
                      border: `2px solid ${stg.color}`,
                      animation: 'hub-pulse-ring 1.8s ease-out infinite',
                      opacity: 0.55,
                    }} />
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
    case 'sent':       return scout.daysAgo === 0 ? `Link just sent to ${scout.name}` : `${scout.name} hasn't claimed yet — ${scout.daysAgo}d ago`
    case 'scheduled':  return `${scout.name}'s meal scheduled`
    case 'delivered':  return `${scout.name} got their first meal`
    case 'decided':    return `${scout.name}'s trial window passed`
    case 'subscribed': return `${scout.name} is a paid subscriber`
  }
}

function ActionPrompt({
  intent, headline, body, primary, secondary, color,
}: {
  intent:     'helpful' | 'urgent' | 'positive'
  headline:   string
  body:       string
  primary?:   { label: string; onClick: () => void; color?: string }
  secondary?: { label: string; onClick: () => void }
  color?:     string
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
//  ICONS — bougie SVG coin + trophy (preserved from previous build)
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
          <stop offset="0%"   stopColor="transparent" />
          <stop offset="92%"  stopColor="transparent" />
          <stop offset="100%" stopColor="#6b3500" />
        </radialGradient>
        <radialGradient id={`${id}-face`} cx="32%" cy="28%" r="80%">
          <stop offset="0%"   stopColor="#fffbeb" />
          <stop offset="20%"  stopColor="#fde68a" />
          <stop offset="55%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#a16207" />
        </radialGradient>
        <linearGradient id={`${id}-shineArc`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.7)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15.2" fill="#7a3d00" />
      <circle cx="16" cy="16" r="14.6" fill="#3d1900" />
      <circle cx="16" cy="16" r="14" fill={`url(#${id}-face)`} />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="rgba(120,55,0,0.55)" strokeWidth="0.6" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="rgba(255,235,160,0.55)" strokeWidth="0.5" strokeDasharray="2.2 2.2" />
      <text x="16" y="19" textAnchor="middle"
        fontFamily={BODY} fontSize="13" fontWeight={900} fill="#5c2a00"
        style={{ paintOrder: 'stroke', stroke: 'rgba(255,235,170,0.55)', strokeWidth: 0.7 }}
      >د.إ</text>
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

function deriveInitials(name: string): string {
  if (!name) return 'YOU'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'YOU'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
