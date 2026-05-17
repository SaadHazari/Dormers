'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Gift, Users, Send, Flame, Lock, Check, X, ArrowRight,
  Volume2, VolumeX, Star, Trophy, Percent, Shirt,
  Calendar, Coins, KeyRound, Zap, Target,
} from 'lucide-react'
import type { ReferralData, DormStats, InviteRow } from '@/utils/supabase/queries'
import type { Subscription } from '../../_shared/types'

// ════════════════════════════════════════════════════════════════════════════
//  PALETTE — disciplined: navy ground, gold action, cream text, green achieved
// ════════════════════════════════════════════════════════════════════════════

const BG_DEEP    = '#08051f'
const BG_MID     = '#1a1140'

const GOLD       = '#f59e0b'
const GOLD_LITE  = '#fbbf24'
const ORANGE     = '#f57f20'
const ORANGE_LITE = '#ffaa00'

const CYAN       = '#22d3ee'
const GREEN      = '#22c55e'
const PURPLE     = '#c084fc'
const VIOLET     = '#a855f7'
const PINK       = '#ec4899'
const RED        = '#f87171'

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

// Layer 2 — per-cycle milestones
interface CycleMilestone { at: number; label: string; value: string; color: string; Emblem: typeof Gift; rare?: boolean }
const CYCLE_MILESTONES: CycleMilestone[] = [
  { at: 3,  label: 'Mystery Drop',       value: '30–150 cr', color: PURPLE, Emblem: Gift },
  { at: 6,  label: 'Free Week',          value: '~132 cr',   color: CYAN,   Emblem: Calendar },
  { at: 10, label: 'Free Month',         value: '~528 cr',   color: GOLD,   Emblem: Trophy },
  { at: 15, label: '500 cr + 5 Skips',   value: '500 cr',    color: PINK,   Emblem: Coins, rare: true },
  { at: 20, label: 'Dorm Weekend',       value: 'For all',   color: RED,    Emblem: Users, rare: true },
]

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
  { label: 'Google review',         value: '+AED 30',  color: GREEN, Emblem: Star },
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

type SubScreen = null | 'ladder' | 'quests' | 'daily' | 'squad'
type SendStep  = 'closed' | 'naming' | 'sent'

// ════════════════════════════════════════════════════════════════════════════
//  MAIN HUB — clean 5-section layout, single viewport
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  customerCid:        string
  customerName:       string
  customerDorm?:      string
  referralData:       ReferralData
  dormStats:          DormStats
  invites:            InviteRow[]
  activeSubscription: Subscription | null
  // Phase 7-05 — server-canonical initial state for Daily Drop + Streak.
  // Replaces the localStorage-only useStreak() and DailyDropScreen mock RNG.
  initialStreak:      number
  initialDailyDrop:   { value_aed: number; rng_bucket: 'common' | 'rare' | 'epic' } | null
}

// Server-shape for today's Daily Drop, mirrored in the API response payload.
type DailyDropState = { value_aed: number; rng_bucket: 'common' | 'rare' | 'epic' } | null

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
  referralData, dormStats, invites, activeSubscription,
  initialStreak, initialDailyDrop,
}: Props) {
  void customerDorm // reserved for future dorm-specific copy
  const initials = useMemo(() => deriveInitials(customerName), [customerName])

  // ── REAL DATA from Supabase ─────────────────────────────────────────────
  const recruits = referralData.converted              // lifetime paid conversions
  const wallet   = Math.round(referralData.creditBalance)

  // Cycle window — derived from active subscription dates
  const hasActiveSub   = activeSubscription !== null
  const cycleStartTime = hasActiveSub ? new Date(activeSubscription!.start_date).getTime() : 0
  const cycleEndTime   = hasActiveSub ? new Date(activeSubscription!.end_date).getTime()   : 0
  const cycleTotalDays = hasActiveSub
    ? Math.max(1, Math.ceil((cycleEndTime - cycleStartTime) / 86_400_000))
    : 30
  const cycleDaysLeft  = hasActiveSub
    ? Math.max(0, Math.ceil((cycleEndTime - Date.now()) / 86_400_000))
    : 0

  // Cycle recruits — count of invites converted since cycle start
  const cycleRecruits = useMemo(() => {
    if (!hasActiveSub) return 0
    return invites.filter(i =>
      i.status === 'converted' &&
      i.convertedAt &&
      new Date(i.convertedAt).getTime() >= cycleStartTime
    ).length
  }, [invites, hasActiveSub, cycleStartTime])

  // Scouts — map real invites to visible journey stages, most recent first
  const initialScouts: Scout[] = useMemo(() => invites.map(row => ({
    id: row.id,
    name: row.firstName,
    stage: deriveScoutStage(row),
    daysAgo: daysAgoFromISO(
      row.status === 'converted' && row.convertedAt ? row.convertedAt : row.claimedAt
    ),
  })), [invites])

  // Pulse feed — built from same-dorm recent subscribers (dormStats.recent)
  const pulseItems = useMemo(() => {
    const fromDorm = (dormStats.recent ?? []).map(r =>
      `${r.firstName} joined ${customerDorm || 'your dorm'}`
    )
    return fromDorm.length > 0 ? fromDorm : ['No recent activity in your dorm yet']
  }, [dormStats.recent, customerDorm])

  // ── DERIVED ─────────────────────────────────────────────────────────────
  // Current tier from lifetime recruits
  const currentTier = TIERS.slice().reverse().find(t => recruits >= t.threshold) ?? null
  const nextTier    = TIERS.find(t => recruits < t.threshold) ?? null

  // Streak — server-canonical (Phase 7-05). Seeded from SSR prop, then
  // ticked on mount; the post-tick count overrides the seed if it changed.
  const [streak, setStreak] = useState(initialStreak)
  useEffect(() => {
    let cancelled = false
    fetch('/api/dorm-wars/streak/tick', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data && typeof data.count === 'number') {
          setStreak(data.count)
        }
      })
      .catch(() => { /* silent — keep the SSR-seeded value */ })
    return () => { cancelled = true }
  }, [])

  // Daily Drop — server-canonical (Phase 7-05). Seeded from SSR prop; flips
  // to the claimed payload after the user taps "claim" in DailyDropScreen.
  const [dailyDrop, setDailyDrop] = useState<DailyDropState>(initialDailyDrop)

  // ── STATE ────────────────────────────────────────────────────────────────
  const [soundOn, setSoundOn]   = useState(true)
  const [open, setOpen]         = useState<SubScreen>(null)
  const [scouts, setScouts]     = useState<Scout[]>(initialScouts)
  // Resync scouts when real invites prop changes (e.g., live updates / re-fetch)
  useEffect(() => { setScouts(initialScouts) }, [initialScouts])
  const [viewingScout, setViewingScout] = useState<Scout | null>(null)
  const [sendStep, setSendStep]   = useState<SendStep>('closed')
  const [scoutName, setScoutName] = useState('')

  // Rotating pulse text
  const [pulseIdx, setPulseIdx] = useState(0)
  useEffect(() => {
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
    const newScout: Scout = { id: `sc-${Date.now()}`, name: trimmed, stage: 'sent', daysAgo: 0 }
    setScouts(s => [newScout, ...s])
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

  return (
    <div style={{
      backgroundColor: BG_DEEP,
      backgroundImage: `radial-gradient(ellipse at 50% -10%, rgba(40,28,90,0.45) 0%, transparent 55%)`,
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      padding: 'clamp(16px, 2vw, 24px) clamp(20px, 3vw, 32px)',
      gap: 16,
      overflow: 'hidden',
    }}>
      <HubStyles />

      {/* 1. TOP CHROME — minimal: identity + wallet + streak + sound */}
      <TopChrome
        initials={initials}
        name={customerName || 'You'}
        tier={currentTier}
        recruits={recruits}
        wallet={wallet}
        streak={streak}
        soundOn={soundOn}
        onSoundToggle={() => setSoundOn(s => !s)}
      />

      {/* 2. HERO CTA — one massive button, the focal point */}
      <HeroCTA
        onClick={startSendFlow}
        nextCycleMilestone={CYCLE_MILESTONES.find(m => cycleRecruits < m.at)}
        cycleRecruits={cycleRecruits}
      />

      {/* 3. THREE-COLUMN PROGRESS — Cycle, Lifetime, Daily Drop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
        flex: '0 0 auto',
      }}>
        <CycleColumn
          cycleRecruits={cycleRecruits}
          cycleDaysLeft={cycleDaysLeft}
          cycleTotalDays={cycleTotalDays}
          onOpen={() => setOpen('quests')}
        />
        <LifetimeColumn
          recruits={recruits}
          currentTier={currentTier}
          nextTier={nextTier}
          onOpen={() => setOpen('ladder')}
        />
        <DailyDropColumn onOpen={() => setOpen('daily')} />
      </div>

      {/* 4. ACTIVITY + SCOUTS — two-column lower row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14,
        flex: '1 1 auto', minHeight: 0,
      }}>
        <ActivityFeed pulseText={pulseItems[pulseIdx]} pulseItems={pulseItems} />
        <ScoutsStrip
          scouts={scouts}
          onScoutTap={setViewingScout}
          onSendNew={startSendFlow}
          onViewAll={() => setOpen('squad')}
        />
      </div>

      {/* 5. FOOTER REWARDS — side rewards quick chip list */}
      <FooterRewards />

      {/* ── MODALS ── */}
      <SendScoutModal
        step={sendStep}
        scoutName={scoutName}
        onNameChange={setScoutName}
        onSend={sendLink}
        onClose={closeSendFlow}
        onTrackJourney={() => {
          closeSendFlow()
          if (scouts[0]) setViewingScout(scouts[0])
        }}
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

      <Modal open={open === 'quests'} onClose={() => setOpen(null)} title="This Cycle's Rewards" accent={GOLD}>
        <QuestsScreen recruitsCycle={cycleRecruits} />
      </Modal>
      <Modal open={open === 'ladder'} onClose={() => setOpen(null)} title="Lifetime Path" accent={CYAN}>
        <TrophyLadderScreen recruits={recruits} />
      </Modal>
      <Modal open={open === 'daily'} onClose={() => setOpen(null)} title="Daily Drop" accent={GOLD}>
        <DailyDropScreen drop={dailyDrop} onClaimed={setDailyDrop} />
      </Modal>
      <Modal open={open === 'squad'} onClose={() => setOpen(null)} title="Your Squad" accent={PINK}>
        <SquadScreen scouts={scouts} onScoutTap={(s) => { setOpen(null); setViewingScout(s) }} />
      </Modal>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TOP CHROME — single horizontal row with identity + wallet + streak + sound
// ════════════════════════════════════════════════════════════════════════════

function TopChrome({
  initials, name, tier, recruits, wallet, streak, soundOn, onSoundToggle,
}: {
  initials:      string
  name:          string
  tier:          (typeof TIERS)[number] | null
  recruits:      number
  wallet:        number
  streak:        number
  soundOn:       boolean
  onSoundToggle: () => void
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
          </div>
          <div style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 700, color: MIST_DIM,
            letterSpacing: '0.04em', marginTop: 2, fontFeatureSettings: '"tnum"',
          }}>
            {recruits} lifetime invites
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

        {streak > 0 && (
          <div title="Daily visits in a row" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 999,
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%)`,
            border: `1.5px solid ${RED}55`,
            boxShadow: `0 4px 12px rgba(0,0,0,0.45)`,
          }}>
            <Flame size={14} strokeWidth={2.5} color={RED} />
            <span style={{
              fontFamily: BODY, fontSize: 13, fontWeight: 900, color: CREAM,
              fontFeatureSettings: '"tnum"',
            }}>
              {streak}d
            </span>
          </div>
        )}

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

      {/* THE button */}
      <button
        type="button"
        onClick={onClick}
        className="hub-cta"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 18,
          padding: 'clamp(20px, 2.4vw, 30px) clamp(36px, 5vw, 60px)',
          borderRadius: 999,
          backgroundImage: `linear-gradient(135deg, ${ORANGE} 0%, ${GOLD} 50%, ${ORANGE_LITE} 100%)`,
          border: '3px solid rgba(255,225,140,0.95)',
          color: BG_DEEP,
          fontFamily: BODY, fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: 900,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: 'pointer',
          animation: 'hub-cta-pulse 2.6s ease-in-out infinite, hub-cta-bob 4s ease-in-out infinite',
          minWidth: 320,
        }}
      >
        <Send size={26} strokeWidth={2.8} />
        Send a link
        <ArrowRight size={26} strokeWidth={2.8} />
      </button>

      {/* Helper text — sets up what happens */}
      <div style={{
        fontFamily: BODY, fontSize: 12, fontWeight: 500,
        color: MIST_DIM, letterSpacing: '0.03em',
        maxWidth: 540,
      }}>
        Opens WhatsApp · they eat their first meal free · you earn when they subscribe
      </div>

      {/* If there's a near-term milestone, hint it directly under the CTA */}
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
          <Target size={12} strokeWidth={2.6} color={nextCycleMilestone.color} />
          <span><span style={{ color: nextCycleMilestone.color, fontWeight: 900, fontFeatureSettings: '"tnum"' }}>{recruitsLeft}</span> more this cycle unlocks <span style={{ color: nextCycleMilestone.color, fontWeight: 900 }}>{nextCycleMilestone.label}</span></span>
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
        padding: 16,
        borderRadius: 14,
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.22) 100%)`,
        border: `1px solid ${accent}33`,
        boxShadow: `0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 ${accent}1c`,
        display: 'flex', flexDirection: 'column',
        gap: 10,
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'transform 220ms ease, border-color 220ms ease',
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
          <span style={{
            fontFamily: BODY, fontSize: 9, fontWeight: 800,
            color: MIST_DIM, letterSpacing: '0.10em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 3,
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
  cycleRecruits, cycleDaysLeft, cycleTotalDays, onOpen,
}: {
  cycleRecruits:  number
  cycleDaysLeft:  number
  cycleTotalDays: number
  onOpen:         () => void
}) {
  void cycleTotalDays
  const max = CYCLE_MILESTONES[CYCLE_MILESTONES.length - 1].at
  const fillPct = Math.min(100, (cycleRecruits / max) * 100)
  const nextMilestone = CYCLE_MILESTONES.find(m => cycleRecruits < m.at)

  return (
    <Column eyebrow="This Cycle" title="Burst goals for big bonuses" accent={GOLD} onOpen={onOpen}>
      {/* Progress bar with milestone stops */}
      <div style={{ position: 'relative', height: 36, marginTop: 4 }}>
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
        {/* Stops */}
        {CYCLE_MILESTONES.map(m => {
          const leftPct = (m.at / max) * 100
          const earned = cycleRecruits >= m.at
          const isNext = m.at === nextMilestone?.at
          return (
            <div key={m.at} style={{
              position: 'absolute', left: `${leftPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: earned ? m.color : 'rgba(0,0,0,0.75)',
              border: earned ? `2px solid ${m.color}` : isNext ? `2px solid ${m.color}` : `1.5px solid ${MIST_FAINT}`,
              boxShadow: earned ? `0 0 8px ${m.color}aa` : isNext ? `0 0 6px ${m.color}66` : 'none',
            }} />
          )
        })}
      </div>

      {/* Threshold numbers under bar */}
      <div style={{ position: 'relative', height: 12 }}>
        {CYCLE_MILESTONES.map(m => (
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

      {/* Status block */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <div style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
          letterSpacing: '-0.005em', marginBottom: 6,
        }}>
          <span style={{ color: GOLD_LITE, fontFeatureSettings: '"tnum"' }}>{cycleRecruits}</span>
          <span style={{ color: MIST_DIM, fontWeight: 600 }}> of {max} recruits this cycle</span>
        </div>
        {nextMilestone && (
          <div style={{
            fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST,
          }}>
            <span style={{ color: nextMilestone.color, fontWeight: 900 }}>{nextMilestone.at - cycleRecruits} more</span> for {nextMilestone.label}
          </div>
        )}
        <div style={{
          marginTop: 6,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: BODY, fontSize: 10, fontWeight: 700,
          color: CYAN, letterSpacing: '0.04em',
        }}>
          <Calendar size={10} strokeWidth={2.6} /> {cycleDaysLeft} days left in cycle
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
      {/* Progress bar with tier stops */}
      <div style={{ position: 'relative', height: 36, marginTop: 4 }}>
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
        {LIFETIME_TIERS.map(t => {
          const leftPct = (t.at / max) * 100
          const earned = recruits >= t.at
          const isNext = t.at === nextTier?.threshold
          return (
            <div key={t.at} style={{
              position: 'absolute', left: `${leftPct}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: earned ? t.color : 'rgba(0,0,0,0.75)',
              border: earned ? `2px solid ${t.color}` : isNext ? `2px solid ${t.color}` : `1.5px solid ${MIST_FAINT}`,
              boxShadow: earned ? `0 0 8px ${t.color}aa` : isNext ? `0 0 6px ${t.color}66` : 'none',
            }} />
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

      {/* Status block */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <div style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 800, color: CREAM,
          letterSpacing: '-0.005em', marginBottom: 6,
        }}>
          <span style={{ color: GOLD_LITE, fontFeatureSettings: '"tnum"' }}>{recruits}</span>
          <span style={{ color: MIST_DIM, fontWeight: 600 }}> lifetime invites</span>
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
            Tier {nextTier.num} ({nextTier.threshold - recruits} more): {nextTier.perk}
          </div>
        )}
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  DAILY DROP COLUMN — Layer 4, focal claim affordance
// ════════════════════════════════════════════════════════════════════════════

function DailyDropColumn({ onOpen }: { onOpen: () => void }) {
  // Compute "next drop in" countdown
  const [nextDrop, setNextDrop] = useState('')
  useEffect(() => {
    function tick() {
      const now = new Date()
      const end = new Date(now)
      end.setHours(24, 0, 0, 0)
      const ms = end.getTime() - now.getTime()
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setNextDrop(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <Column eyebrow="Today's Drop" title="One mystery reward · per day" accent={GOLD} onOpen={onOpen}>
      <div style={{
        flex: '1 1 auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '6px 0 4px',
      }}>
        {/* Glowing gift icon */}
        <div style={{
          position: 'relative',
          width: 64, height: 64, borderRadius: '50%',
          backgroundImage: `radial-gradient(circle at 35% 30%, ${GOLD_LITE}66 0%, ${GOLD}22 70%, transparent 100%)`,
          border: `2px solid ${GOLD}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 26px ${GOLD}88, inset 0 0 12px ${GOLD}44`,
          animation: 'hub-cta-pulse 2.6s ease-in-out infinite',
        }}>
          <Gift size={32} strokeWidth={2.2} color={GOLD_LITE} />
          <span style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            border: `1.5px solid ${GOLD}`,
            animation: 'hub-pulse-ring 2.2s ease-out infinite',
            opacity: 0.55,
          }} />
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 11, fontWeight: 900,
          color: GOLD, letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          Tap to claim
        </div>
        <div style={{
          fontFamily: BODY, fontSize: 10, fontWeight: 700,
          color: MIST_DIM, letterSpacing: '0.04em', fontFeatureSettings: '"tnum"',
        }}>
          Next drop in {nextDrop || '—'}
        </div>
      </div>
    </Column>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  ACTIVITY FEED — left side of lower row; live pulse + recent items
// ════════════════════════════════════════════════════════════════════════════

function ActivityFeed({ pulseText, pulseItems }: { pulseText: string; pulseItems: string[] }) {
  const recent = useMemo(() => pulseItems.slice(0, 3), [pulseItems])
  return (
    <Column eyebrow="Happening Now" title="" accent={GREEN}>
      <div style={{
        flex: '1 1 auto',
        display: 'flex', flexDirection: 'column', gap: 6,
        marginTop: -6,
      }}>
        {/* Live pulse — the highlighted "just happened" line */}
        <div
          key={pulseText}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8,
            backgroundColor: `${GREEN}14`,
            border: `1px solid ${GREEN}44`,
            animation: 'hub-pulse-fade-in 600ms ease-out',
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
            {pulseText}
          </span>
        </div>

        {/* Recent items list (static) */}
        {recent.filter(r => r !== pulseText).slice(0, 3).map((item, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px',
            fontFamily: BODY, fontSize: 11, fontWeight: 600, color: MIST,
            letterSpacing: '0.02em',
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: '50%',
              backgroundColor: MIST_DIM, flexShrink: 0,
            }} />
            {item}
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
//  FOOTER REWARDS — Layer 4 side rewards as a quick chip strip
// ════════════════════════════════════════════════════════════════════════════

function FooterRewards() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
      paddingTop: 4,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: BODY, fontSize: 9, fontWeight: 900,
        color: MIST_DIM, letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        More ways to earn ·
      </span>
      {SIDE_REWARDS.map(r => (
        <div key={r.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.35)',
          border: `1px solid ${r.color}44`,
        }}>
          <r.Emblem size={11} strokeWidth={2.4} color={r.color} />
          <span style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 700, color: CREAM,
          }}>
            {r.label}
          </span>
          <span style={{
            fontFamily: BODY, fontSize: 10, fontWeight: 900, color: r.color,
            fontFeatureSettings: '"tnum"', marginLeft: 4,
          }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  STYLES — minimal keyframes (no decoration animations)
// ════════════════════════════════════════════════════════════════════════════

function HubStyles() {
  return (
    <style>{`
      ::selection { background: rgba(245,127,32,0.32); }

      @keyframes hub-cta-pulse {
        0%, 100% { box-shadow: 0 0 24px rgba(245,158,11,0.45), 0 0 48px rgba(245,158,11,0.20), inset 0 0 0 1.5px rgba(255,200,80,0.85); }
        50%      { box-shadow: 0 0 40px rgba(245,158,11,0.7),  0 0 80px rgba(245,158,11,0.36), inset 0 0 0 1.5px rgba(255,200,80,1); }
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

      .hub-column-tap {
        cursor: pointer;
      }
      .hub-column-tap:hover {
        transform: translateY(-2px);
        border-color: rgba(245,158,11,0.5);
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
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640, width: '100%', maxHeight: '88vh', overflow: 'auto',
          backgroundImage: `linear-gradient(180deg, ${BG_MID} 0%, ${BG_DEEP} 100%)`,
          border: `1.5px solid ${accent}55`,
          borderRadius: 18,
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${accent}28`,
          animation: 'hub-modal-in 280ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <div style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${accent}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundImage: `linear-gradient(180deg, ${accent}14 0%, transparent 100%)`,
        }}>
          <div style={{
            fontFamily: DISPLAY, fontSize: 18, fontWeight: 900,
            color: CREAM, letterSpacing: '-0.01em',
          }}>
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

function QuestsScreen({ recruitsCycle }: { recruitsCycle: number }) {
  return (
    <div>
      <p style={{
        fontFamily: BODY, fontSize: 13, fontWeight: 500, color: MIST,
        lineHeight: 1.6, margin: '0 0 12px',
      }}>
        Hit these recruit counts <strong style={{ color: CREAM }}>in this cycle</strong> for big bonuses. Resets when your subscription renews.
      </p>
      <div style={{
        marginBottom: 18,
        fontFamily: BODY, fontSize: 11, fontWeight: 800, color: RED,
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <span style={{ fontFeatureSettings: '"tnum"' }}>{recruitsCycle}</span> recruits this cycle
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CYCLE_MILESTONES.map(m => {
          const earned = recruitsCycle >= m.at
          const isNext = !earned && m.at === CYCLE_MILESTONES.find(x => recruitsCycle < x.at)?.at
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

// Phase 7-05 — server-canonical Daily Drop screen.
// Outcome is determined by POST /api/dorm-wars/daily-drop (server RNG +
// idempotent insert). The button drives a brief "claiming…" state while
// the request is in flight, then renders the locked-in result.
//
// On modal-open, if the user already claimed today, we receive that state
// from props (seeded server-side via getDailyDropToday) and render the
// claimed view immediately — no fetch needed.
function DailyDropScreen({
  drop, onClaimed,
}: {
  drop:      DailyDropState
  onClaimed: (next: DailyDropState) => void
}) {
  const [claiming, setClaiming] = useState(false)
  const claimed = drop !== null

  // Bucket → palette mapping. Epic = gold/jackpot, rare = purple, common = green.
  const bucketColor =
    drop?.rng_bucket === 'epic' ? GOLD :
    drop?.rng_bucket === 'rare' ? PURPLE :
    GREEN

  async function handleClaim() {
    if (claimed || claiming) return
    setClaiming(true)
    try {
      const res = await fetch('/api/dorm-wars/daily-drop', { method: 'POST' })
      if (!res.ok) {
        setClaiming(false)
        return
      }
      const data = await res.json() as {
        claimed?: boolean
        alreadyClaimed?: boolean
        value_aed?: number
        rng_bucket?: 'common' | 'rare' | 'epic'
      }
      if (typeof data.value_aed === 'number' && data.rng_bucket) {
        onClaimed({ value_aed: data.value_aed, rng_bucket: data.rng_bucket })
      }
    } catch {
      // Swallow — leave button enabled for retry on transient error
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
        A small reward, just for opening the page today. One claim per 24 hours.
      </p>
      <button
        type="button"
        onClick={handleClaim}
        disabled={claimed || claiming}
        style={{
          margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: 14,
          padding: '28px 36px', borderRadius: 18,
          backgroundImage: claimed
            ? `linear-gradient(135deg, ${bucketColor}28 0%, ${bucketColor}10 100%)`
            : `linear-gradient(135deg, ${GOLD}28 0%, ${ORANGE}10 100%)`,
          border: `1.5px solid ${(claimed ? bucketColor : GOLD)}66`,
          cursor: (claimed || claiming) ? 'default' : 'pointer',
          minWidth: 320,
          opacity: claiming ? 0.85 : 1,
          transition: 'opacity 200ms ease',
        }}
      >
        {claimed && drop ? (
          <>
            <span style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: bucketColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={28} strokeWidth={3} color={BG_DEEP} />
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, color: bucketColor, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CoinIcon size={18} /> +{drop.value_aed} credits
              </div>
              <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: MIST, textTransform: 'capitalize' }}>
                {drop.rng_bucket} · back tomorrow
              </div>
            </div>
          </>
        ) : (
          <>
            <span style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: GOLD,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Gift size={28} strokeWidth={2.4} color={BG_DEEP} />
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 900, color: CREAM }}>
                {claiming ? 'Opening…' : 'Tap to open'}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: GOLD_LITE, letterSpacing: '0.10em' }}>
                Credits · multiplier · or a jackpot
              </div>
            </div>
          </>
        )}
      </button>
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
      <div onClick={(e) => e.stopPropagation()} style={{
        maxWidth: 440, width: '100%',
        backgroundImage: `linear-gradient(180deg, ${BG_MID} 0%, ${BG_DEEP} 100%)`,
        border: `1.5px solid ${ORANGE}55`,
        borderRadius: 18,
        boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${ORANGE}28`,
        animation: 'hub-modal-in 280ms cubic-bezier(0.16,1,0.3,1) both',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${ORANGE}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backgroundImage: `linear-gradient(180deg, ${ORANGE}14 0%, transparent 100%)`,
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Send size={14} strokeWidth={2.4} color={GOLD_LITE} />
            <span style={{
              fontFamily: BODY, fontSize: 11, fontWeight: 900, color: GOLD_LITE,
              letterSpacing: '0.20em', textTransform: 'uppercase',
            }}>
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
          Link sent to <span style={{ color: GOLD_LITE }}>{name}</span>
        </div>
        <div style={{ fontFamily: BODY, fontSize: 13, fontWeight: 400, color: MIST, lineHeight: 1.55, marginBottom: 22 }}>
          Now watch them go from link sent → meal scheduled → subscribed.
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
            Track journey <ArrowRight size={13} strokeWidth={2.6} />
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
            Done
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TrophyIcon({ size = 20 }: { size?: number }) {
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
        <linearGradient id={`${id}-body`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#fffbeb" />
          <stop offset="15%"  stopColor="#fde68a" />
          <stop offset="45%"  stopColor="#fbbf24" />
          <stop offset="75%"  stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id={`${id}-handle`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor="#a16207" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
        <linearGradient id={`${id}-base`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor="#d97706" />
          <stop offset="50%" stopColor="#a16207" />
          <stop offset="100%" stopColor="#5c2a00" />
        </linearGradient>
      </defs>
      <path d="M 9 7 Q 3 8 3 13 Q 3 17 8 17" fill="none" stroke={`url(#${id}-handle)`} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M 23 7 Q 29 8 29 13 Q 29 17 24 17" fill="none" stroke={`url(#${id}-handle)`} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M 8 5 L 24 5 L 24 13 Q 24 20 16 22 Q 8 20 8 13 Z" fill={`url(#${id}-body)`} stroke="#5c2a00" strokeWidth="0.7" strokeLinejoin="round" />
      <rect x="7.5" y="5" width="17" height="1.6" rx="0.6" fill="rgba(255,255,255,0.55)" />
      <g transform="translate(16 13)">
        <path d="M 0 -3.6 L 1.08 -1.13 L 3.6 -0.7 L 1.77 1.03 L 2.15 3.55 L 0 2.27 L -2.15 3.55 L -1.77 1.03 L -3.6 -0.7 L -1.08 -1.13 Z" fill="#5c2a00" opacity="0.6" />
      </g>
      <rect x="14" y="22" width="4" height="3" fill={`url(#${id}-base)`} />
      <rect x="9" y="25" width="14" height="3.6" rx="1.4" fill={`url(#${id}-base)`} stroke="#3d1900" strokeWidth="0.5" />
      <rect x="11" y="28.6" width="10" height="1.6" rx="0.7" fill="#3d1900" />
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
