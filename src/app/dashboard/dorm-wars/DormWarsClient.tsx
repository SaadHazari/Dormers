'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Gift, Sparkles, ArrowRight,
  Shield, Crown, Trophy, Star, Flame, Users, SkipForward, Calendar, Pause,
  Lock, Check, ChevronUp, ChevronDown, Minus, Zap,
} from 'lucide-react'
import { OG, OG3, NV, CR, BODY, DISPLAY } from '../_shared/tokens'
import type { ReferralData, DormStats, InviteRow } from '@/utils/supabase/queries'

const EXPO_OUT  = 'cubic-bezier(0.16, 1, 0.3, 1)'
const QUART_OUT = 'cubic-bezier(0.25, 1, 0.5, 1)'

// ── Stub data (Wave 1 — to be wired in Waves 2-3) ─────────────────────────
// STUB: Leaderboard rows (D-14). Real cross-dorm leaderboard query lands in a future backend phase.
// STUB: Recruit list (Wave 2 replaces with `invites` prop per D-13).
// STUB: Trophy meta strings (Wave 2 derives from referralData per D-23).
// STUB: Cycle days-left (Wave 2 reads active subscription per D-22).
// STUB: Daily Drop localStorage key uses `dw-mock-drop-…` here; Wave 2 renames to `dw-drop-…` (D-20).

const MOCK_CYCLE_TOTAL_DAYS = 30
const MOCK_CYCLE_DAYS_LEFT  = 12
const MOCK_CYCLE_NUMBER     = 3

const MOCK_CONVERTED = 2
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MOCK_TOTAL     = 5   // Wave 2: wired into leaderboard/hero stats
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MOCK_CREDIT    = 40  // Wave 2: wired into hero credit stat

const PULSE_ITEMS: string[] = [
  'Sarah joined Khalidiyah Hall',
  'Ahmed unlocked Sergeant',
  'Muroor Hall took #2 from Mushrif',
  'Yousef sent 3 invites today',
  'Layla joined Zayed City Dorms',
  'Khalidiyah Hall hit 25 subscribers',
  'Ali claimed his first reward',
  'Nahyan Hall climbed to #4',
]

type DropKind = 'credit' | 'multi' | 'skip' | 'spotlight' | 'intel'
interface DailyDrop {
  kind:  DropKind
  label: string
  sub:   string
}
const DAILY_DROPS: DailyDrop[] = [
  { kind: 'credit',    label: '+10 AED Bonus',  sub: 'Drops straight into your wallet today.' },
  { kind: 'multi',     label: '2× Multiplier',  sub: 'Your next conversion pays AED 40 instead of 20. Active 24h.' },
  { kind: 'skip',      label: '+1 Free Skip',   sub: 'Banked. Use it any week, any plan.' },
  { kind: 'spotlight', label: '24h Spotlight',  sub: 'Your name leads your dorm activity feed for a full day.' },
  { kind: 'intel',     label: 'Field Intel',    sub: 'Top inviter this week sent 4 links from one WhatsApp group.' },
]

interface Milestone { at: number; reward: string; detail: string }
const MILESTONES: Milestone[] = [
  { at: 1,  reward: 'AED 20 Credit',  detail: 'Wallet drop on first conversion.' },
  { at: 3,  reward: 'Free Skip',      detail: 'Bank a skip for any week.' },
  { at: 6,  reward: 'Free Week',      detail: 'One week comped — or AED 100 off.' },
  { at: 10, reward: 'Pause Unlocked', detail: 'Take a break on Weekly Flex without cancelling.' },
]

type RecruitStatus = 'converted' | 'trying' | 'past'
interface Recruit { name: string; status: RecruitStatus; when: string; amount: string }
const MOCK_RECRUITS: Recruit[] = [
  { name: 'Sara',   status: 'converted', when: '3d ago',  amount: '+AED 20' },
  { name: 'Omar',   status: 'converted', when: '6d ago',  amount: '+AED 20' },
  { name: 'Hala',   status: 'trying',    when: '1d ago',  amount: 'Trying us' },
  { name: 'Yousef', status: 'trying',    when: '2d ago',  amount: 'Trying us' },
  { name: 'Mariam', status: 'past',      when: '12d ago', amount: 'Meal delivered' },
]

type Trend = 'up' | 'down' | 'flat'
interface DormRow { rank: number; dorm: string; subs: number; delta: string; trend: Trend; isYou?: boolean }
const MOCK_LEADERBOARD: DormRow[] = [
  { rank: 1, dorm: 'Khalidiyah Hall',  subs: 28, delta: '+3', trend: 'up'   },
  { rank: 2, dorm: 'Muroor Hall',      subs: 21, delta: '+1', trend: 'up'   },
  { rank: 3, dorm: 'Mushrif Block',    subs: 18, delta: '-1', trend: 'down' },
  { rank: 4, dorm: 'Zayed City Dorms', subs: 14, delta: '+2', trend: 'up'   },
  { rank: 5, dorm: 'Nahyan Hall',      subs: 11, delta: '0',  trend: 'flat' },
]

interface Achievement {
  id:     string
  label:  string
  Icon:   typeof Shield
  earned: boolean
  meta:   string   // "Earned May 7" when earned · "1 more conversion" when locked
}
const MOCK_TROPHIES: Achievement[] = [
  { id: 'first_recruit', label: 'First Recruit', Icon: Users,       earned: true,  meta: 'Earned May 7'           },
  { id: 'soldier',       label: 'Soldier',       Icon: Shield,      earned: true,  meta: 'Earned May 9'           },
  { id: 'streak_3',      label: '3-Day Streak',  Icon: Flame,       earned: true,  meta: 'Earned May 12'          },
  { id: 'free_skip',     label: 'Free Skip',     Icon: SkipForward, earned: false, meta: '1 more conversion'      },
  { id: 'sergeant',      label: 'Sergeant',      Icon: Crown,       earned: false, meta: '1 more conversion'      },
  { id: 'free_week',     label: 'Free Week',     Icon: Calendar,    earned: false, meta: '4 more conversions'     },
  { id: 'war_hero',      label: 'War Hero',      Icon: Trophy,      earned: false, meta: '8 more conversions'     },
  { id: 'founder',       label: 'Founder',       Icon: Star,        earned: false, meta: 'Cycle 1 reward (missed)' },
]

const MOCK_RANK = { label: 'Soldier', flavour: "You're in the war now" }

interface Props {
  customerCid:   string
  customerDorm?: string
  referralData:  ReferralData
  dormStats:     DormStats
  invites:       InviteRow[]
}

export default function DormWarsClient({ customerCid, customerDorm, referralData, dormStats, invites }: Props) {
  // invites accepted for Wave 2 wiring (D-13); Wave 1 uses MOCK_RECRUITS instead
  void invites
  const dormLabel = customerDorm || 'Your Dorm'

  // ── State machine (D-19) ─────────────────────────────────────────
  // hasClaimed: page-mode flip — at least one invitee claimed a free meal.
  // hasConverted: at least one paid conversion — unlocks credit/milestone visibility.
  const hasClaimed   = referralData.total >= 1
  const hasConverted = referralData.converted >= 1
  // TODO(05-future-phase): Full zero-state visual revamp deferred per CONTEXT <deferred>. Engaged-state is the primary target.

  // Suppress unused-vars lint while Wave 2 wires these in
  void hasClaimed
  void hasConverted

  // ── Daily drop claim state (persisted per day) ────────────────────────
  const todayKey  = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const todayDrop = useMemo(() => DAILY_DROPS[new Date().getDate() % DAILY_DROPS.length], [])
  const [claimed, setClaimed] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setClaimed(localStorage.getItem(`dw-mock-drop-${todayKey}`) === '1')
  }, [todayKey])
  function claimDrop() {
    if (claimed) return
    setClaimed(true)
    localStorage.setItem(`dw-mock-drop-${todayKey}`, '1')
  }

  // ── Pulse ticker — duplicate for seamless marquee ─────────────────────
  const liveItems  = (dormStats.recent ?? []).map(r => `${r.firstName} joined ${r.planName}`)
  const pulseItems = liveItems.length >= 3 ? liveItems : PULSE_ITEMS
  const ticker     = [...pulseItems, ...pulseItems]

  // ── End-of-day countdown for next drop ────────────────────────────────
  const [nextDropIn, setNextDropIn] = useState('')
  useEffect(() => {
    function tick() {
      const now = new Date()
      const end = new Date(now)
      end.setHours(24, 0, 0, 0)
      const ms = end.getTime() - now.getTime()
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setNextDropIn(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  // Compose leaderboard with the user's own dorm row injected
  const leaderboardWithYou: DormRow[] = useMemo(() => {
    const rows = MOCK_LEADERBOARD.slice()
    const youRow: DormRow = { rank: 7, dorm: dormLabel, subs: MOCK_CONVERTED, delta: `+${MOCK_CONVERTED}`, trend: 'up', isYou: true }
    return [...rows, youRow]
  }, [dormLabel])

  return (
    <div style={{ backgroundColor: NV, minHeight: '100vh', padding: 0, position: 'relative' }}>
      <SharedKeyframes />

      <PulseTicker ticker={ticker} />

      <HeroBlock
        dormLabel={dormLabel}
        customerCid={customerCid}
      />

      <DailyDropBlock
        claimed={claimed}
        todayDrop={todayDrop}
        nextDropIn={nextDropIn}
        onClaim={claimDrop}
      />

      <ActiveMissionBlock converted={MOCK_CONVERTED} />

      <MissionLadderBlock converted={MOCK_CONVERTED} />

      <RecruitsBlock recruits={MOCK_RECRUITS} />

      <LeaderboardBlock rows={leaderboardWithYou} />

      <TrophyRoomBlock trophies={MOCK_TROPHIES} />

      <ActionSurfaceBlock customerCid={customerCid} />

      <FinePrintBlock />
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  SHARED KEYFRAMES + ANIMATION CLASSES
// ════════════════════════════════════════════════════════════════════════════

function SharedKeyframes() {
  return (
    <style>{`
      ::selection { background: rgba(245,127,32,0.32); }

      @keyframes dwm-marquee {
        from { transform: translateX(0); }
        to   { transform: translateX(-50%); }
      }
      @keyframes dwm-pulse-dot {
        0%   { transform: scale(1);   opacity: 0.85; }
        70%  { transform: scale(2.4); opacity: 0;    }
        100% { transform: scale(2.4); opacity: 0;    }
      }
      @keyframes dwm-rise {
        from { opacity: 0; transform: translateY(28px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      @keyframes dwm-rise-slow {
        from { opacity: 0; transform: translateY(40px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      @keyframes dwm-spin-in {
        from { opacity: 0; transform: rotate(-12deg) scale(0.92); }
        to   { opacity: 1; transform: rotate(0)      scale(1);    }
      }
      @keyframes dwm-arc-grow {
        from { stroke-dashoffset: var(--arc-offset-start); }
        to   { stroke-dashoffset: var(--arc-offset-end);   }
      }
      @keyframes dwm-glow {
        0%, 100% { opacity: 0.45; }
        50%      { opacity: 0.85; }
      }
      @keyframes dwm-reveal {
        0%   { transform: scale(0.94); opacity: 0; }
        50%  { transform: scale(1.04); opacity: 1; }
        100% { transform: scale(1);    opacity: 1; }
      }

      .dwm-pulse-track {
        display: flex; gap: 48px; white-space: nowrap;
        width: max-content;
        animation: dwm-marquee 80s linear infinite;
      }
      .dwm-pulse-track:hover { animation-play-state: paused; }

      .dwm-headline-pre { animation: dwm-rise      750ms ${EXPO_OUT}  120ms both; }
      .dwm-headline-pay { animation: dwm-rise-slow 900ms ${EXPO_OUT}  300ms both; }
      .dwm-sub          { animation: dwm-rise      700ms ${EXPO_OUT}  540ms both; }
      .dwm-eyebrow      { animation: dwm-rise      600ms ${EXPO_OUT}     0ms both; }
      .dwm-dial         { animation: dwm-spin-in   1000ms ${EXPO_OUT} 200ms both; }
      .dwm-rank-pill    { animation: dwm-rise      600ms ${EXPO_OUT}  680ms both; }
      .dwm-drop-card    { animation: dwm-rise      800ms ${EXPO_OUT}  800ms both; }
      .dwm-claimed      { animation: dwm-reveal    600ms ${EXPO_OUT}    0ms both; }

      .dwm-drop-btn {
        transition: transform 320ms ${EXPO_OUT}, box-shadow 320ms ${EXPO_OUT}, border-color 320ms ${EXPO_OUT};
      }
      .dwm-drop-btn:hover:not(:disabled) {
        transform: translateY(-3px);
        box-shadow: 0 18px 56px rgba(245,127,32,0.32), 0 0 0 1px rgba(245,127,32,0.55);
      }
      .dwm-drop-btn:active:not(:disabled) { transform: scale(0.98); }
      .dwm-drop-btn:focus-visible { outline: 2px solid ${OG}; outline-offset: 4px; }

      .dwm-cta-link {
        transition: background 220ms ${EXPO_OUT}, transform 220ms ${EXPO_OUT};
      }
      .dwm-cta-link:hover {
        background: rgba(245,127,32,0.16) !important;
        transform: translateX(2px);
      }

      .dwm-ladder-card { transition: transform 280ms ${QUART_OUT}, border-color 280ms ${QUART_OUT}; }
      .dwm-ladder-card:hover { transform: translateY(-3px); }

      .dwm-trophy { transition: transform 240ms ${QUART_OUT}, background 240ms ${QUART_OUT}; }
      .dwm-trophy:hover { transform: translateY(-2px); }

      .dwm-action-card {
        transition: transform 280ms ${EXPO_OUT}, box-shadow 280ms ${EXPO_OUT};
      }
      .dwm-action-card:hover { transform: translateY(-3px); }
      .dwm-action-card:active { transform: scale(0.98); }
      .dwm-action-card:focus-visible { outline: 2px solid ${OG}; outline-offset: 3px; }

      /* Mobile reflow */
      @media (max-width: 720px) {
        .dwm-hero-grid     { flex-direction: column-reverse !important; gap: 24px !important; }
        .dwm-hero-left     { width: 100% !important; }
        .dwm-hero-right    { width: 100% !important; justify-content: center !important; }
        .dwm-dial-wrap     { transform: scale(0.78); transform-origin: center; }
        .dwm-headline-pay  { font-size: clamp(72px, 18vw, 120px) !important; }
        .dwm-ladder-grid   { grid-template-columns: 1fr 1fr !important; }
        .dwm-trophy-grid   { grid-template-columns: 1fr 1fr !important; }
        .dwm-actions-grid  { grid-template-columns: 1fr !important; }
        .dwm-mission-grid  { flex-direction: column !important; gap: 24px !important; }
      }

      @media (prefers-reduced-motion: reduce) {
        .dwm-pulse-track,
        .dwm-headline-pre, .dwm-headline-pay, .dwm-sub, .dwm-eyebrow,
        .dwm-dial, .dwm-rank-pill, .dwm-drop-card, .dwm-claimed,
        .dwm-ladder-card, .dwm-trophy, .dwm-action-card {
          animation: none; opacity: 1; transform: none;
        }
      }
    `}</style>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  PULSE TICKER  —  marquee strip across the top, "world is alive"
// ════════════════════════════════════════════════════════════════════════════

function PulseTicker({ ticker }: { ticker: string[] }) {
  return (
    <div style={{
      height: 36, backgroundColor: '#050f17',
      borderBottom: '1px solid rgba(245,127,32,0.18)',
      overflow: 'hidden', position: 'relative',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 96,
        backgroundImage: 'linear-gradient(90deg, #050f17 30%, transparent 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 96,
        backgroundImage: 'linear-gradient(270deg, #050f17 30%, transparent 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div className="dwm-pulse-track">
        {ticker.map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: BODY, fontSize: 11, fontWeight: 600,
            color: 'rgba(237,232,218,0.72)', letterSpacing: '0.04em',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              backgroundColor: OG, flexShrink: 0, boxShadow: `0 0 8px ${OG}`,
            }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  HERO  —  cycle clock + dramatic typography
// ════════════════════════════════════════════════════════════════════════════

function HeroBlock({ dormLabel, customerCid }: { dormLabel: string; customerCid: string }) {
  return (
    <section style={{
      position: 'relative',
      padding: 'clamp(40px, 6vw, 72px) clamp(28px, 5vw, 64px)',
      minHeight: 'clamp(540px, 70vh, 720px)',
      overflow: 'hidden', backgroundColor: NV,
    }}>
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '70%', height: '90%',
        backgroundImage: 'radial-gradient(ellipse at center, rgba(245,127,32,0.10) 0%, transparent 60%)',
        pointerEvents: 'none', animation: 'dwm-glow 6s ease-in-out infinite',
      }} />

      <svg
        viewBox="0 0 600 600"
        style={{ position: 'absolute', bottom: -120, right: -120, width: 620, height: 620, opacity: 0.06, pointerEvents: 'none' }}
      >
        {[40, 100, 160, 220, 280].map(r => (
          <circle key={r} cx="300" cy="300" r={r} fill="none" stroke={CR} strokeWidth="0.6" />
        ))}
      </svg>

      <div className="dwm-hero-grid" style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 48,
        maxWidth: 1280, margin: '0 auto', minHeight: 'inherit',
      }}>
        <div className="dwm-hero-left" style={{ flex: '1 1 60%', minWidth: 0 }}>

          <div className="dwm-eyebrow" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '6px 14px', borderRadius: 999,
            backgroundColor: 'rgba(245,127,32,0.10)',
            border: '1px solid rgba(245,127,32,0.30)', marginBottom: 32,
          }}>
            <span style={{ position: 'relative', width: 7, height: 7, display: 'inline-flex' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: OG, animation: 'dwm-pulse-dot 2.2s ease-out infinite' }} />
              <span style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', backgroundColor: OG, display: 'block' }} />
            </span>
            <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 900, color: OG3, letterSpacing: '0.26em', textTransform: 'uppercase' }}>
              Cycle 0{MOCK_CYCLE_NUMBER} &nbsp;·&nbsp; Live
            </span>
          </div>

          <div className="dwm-headline-pre" style={{
            fontFamily: BODY, fontSize: 'clamp(20px, 2.4vw, 30px)', fontWeight: 300,
            color: 'rgba(237,232,218,0.62)', letterSpacing: '0.02em',
            lineHeight: 1, marginBottom: 8,
          }}>
            This is your
          </div>

          <div className="dwm-headline-pay" style={{
            fontFamily: DISPLAY, fontSize: 'clamp(96px, 14vw, 180px)', fontWeight: 900,
            color: OG, letterSpacing: '-0.055em', lineHeight: 0.88,
            marginBottom: 28, textShadow: '0 0 60px rgba(245,127,32,0.28)',
          }}>
            war.
          </div>

          <p className="dwm-sub" style={{
            fontFamily: BODY, fontSize: 15, fontWeight: 400,
            color: 'rgba(237,232,218,0.62)', lineHeight: 1.6,
            margin: '0 0 24px', maxWidth: 460,
          }}>
            {MOCK_CYCLE_DAYS_LEFT} days to claim <span style={{ color: CR, fontWeight: 700 }}>{dormLabel}</span> before your cycle resets. Every invite stakes the ground.
          </p>

          <div className="dwm-rank-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 999,
              backgroundColor: 'rgba(237,232,218,0.05)',
              border: '1px solid rgba(237,232,218,0.10)',
            }}>
              <Shield size={13} strokeWidth={2.4} color={OG3} />
              <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: CR, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                {MOCK_RANK.label}
              </span>
              <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 500, color: 'rgba(237,232,218,0.45)' }}>
                {MOCK_RANK.flavour}
              </span>
            </span>

            <Link
              href={`https://wa.me/?text=${encodeURIComponent(`I get fresh meals delivered to my dorm from Dormers — try your first meal free: https://dormers.ae/r/${customerCid}`)}`}
              target="_blank"
              rel="noreferrer"
              className="dwm-cta-link"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 22px', borderRadius: 999,
                backgroundColor: 'rgba(245,127,32,0.10)',
                border: '1.5px solid rgba(245,127,32,0.55)',
                fontFamily: BODY, fontSize: 12, fontWeight: 900,
                color: OG3, letterSpacing: '0.16em', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Send a link <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        </div>

        <div className="dwm-hero-right" style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
          <div className="dwm-dial-wrap">
            <CycleClock daysLeft={MOCK_CYCLE_DAYS_LEFT} totalDays={MOCK_CYCLE_TOTAL_DAYS} />
          </div>
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  CYCLE CLOCK  —  SVG dial, remaining arc shrinks clockwise
// ════════════════════════════════════════════════════════════════════════════

function CycleClock({ daysLeft, totalDays }: { daysLeft: number; totalDays: number }) {
  const size = 320
  const cx = size / 2
  const cy = size / 2
  const radius = 132
  const strokeW = 6
  const circumference = 2 * Math.PI * radius
  const remainingFraction = Math.max(0, Math.min(1, daysLeft / totalDays))
  const remainingDash     = circumference * remainingFraction
  const arcOffsetStart    = circumference
  const arcOffsetEnd      = circumference - remainingDash

  return (
    <svg
      className="dwm-dial"
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', filter: 'drop-shadow(0 8px 32px rgba(245,127,32,0.18))' }}
    >
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(237,232,218,0.08)" strokeWidth={strokeW} />
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none" stroke={OG} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={arcOffsetEnd}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{
          ['--arc-offset-start' as string]: `${arcOffsetStart}`,
          ['--arc-offset-end'   as string]: `${arcOffsetEnd}`,
          animation: `dwm-arc-grow 1600ms ${EXPO_OUT} 400ms both`,
          filter: 'drop-shadow(0 0 12px rgba(245,127,32,0.55))',
        }}
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 - 90) * Math.PI / 180
        const inner = radius - 14
        const outer = radius - 4
        const x1 = cx + Math.cos(angle) * inner
        const y1 = cy + Math.sin(angle) * inner
        const x2 = cx + Math.cos(angle) * outer
        const y2 = cy + Math.sin(angle) * outer
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(237,232,218,0.18)" strokeWidth={1.5} strokeLinecap="round" />
      })}
      <circle cx={cx} cy={cy} r={radius - 28} fill="none" stroke="rgba(237,232,218,0.05)" strokeWidth={1} />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
        fontFamily={DISPLAY} fontSize={92} fontWeight={900}
        fill={CR} letterSpacing="-0.05em"
        style={{ fontFeatureSettings: '"tnum"' }}
      >{daysLeft}</text>
      <text x={cx} y={cy + 50} textAnchor="middle" dominantBaseline="middle"
        fontFamily={BODY} fontSize={10} fontWeight={900}
        fill="rgba(237,232,218,0.50)" letterSpacing="0.32em"
      >DAYS LEFT</text>
      <text x={cx} y={cy - 64} textAnchor="middle" dominantBaseline="middle"
        fontFamily={BODY} fontSize={9} fontWeight={800}
        fill="rgba(245,127,32,0.78)" letterSpacing="0.32em"
      >CYCLE 0{MOCK_CYCLE_NUMBER}</text>
    </svg>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  DAILY DROP  —  variable reward, claim once per day
// ════════════════════════════════════════════════════════════════════════════

function DailyDropBlock({
  claimed, todayDrop, nextDropIn, onClaim,
}: {
  claimed: boolean; todayDrop: DailyDrop; nextDropIn: string; onClaim: () => void
}) {
  return (
    <section style={{
      padding: 'clamp(28px, 4vw, 56px) clamp(28px, 5vw, 64px) clamp(48px, 6vw, 72px)',
      backgroundColor: NV, position: 'relative',
      borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div className="dwm-drop-card" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase' }}>
            Daily Drop
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: 'rgba(237,232,218,0.42)', letterSpacing: '0.10em', textTransform: 'uppercase', fontFeatureSettings: '"tnum"' }}>
            Next drop in {nextDropIn || '—'}
          </div>
        </div>

        <button
          type="button"
          onClick={onClaim}
          disabled={claimed}
          className="dwm-drop-btn"
          aria-label={claimed ? 'Drop already claimed' : "Claim today's drop"}
          style={{
            width: '100%',
            padding: 'clamp(32px, 5vw, 56px)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: claimed ? 'rgba(34,197,94,0.06)' : 'rgba(245,127,32,0.05)',
            border: claimed
              ? '1px solid rgba(34,197,94,0.32)'
              : '1px solid rgba(245,127,32,0.32)',
            cursor: claimed ? 'default' : 'pointer',
            textAlign: 'left', fontFamily: BODY,
            position: 'relative', overflow: 'hidden',
            boxShadow: claimed
              ? 'inset 0 0 0 1px rgba(34,197,94,0.10)'
              : '0 10px 40px rgba(245,127,32,0.18)',
          }}
        >
          <div style={{
            position: 'absolute', top: '50%', right: 'clamp(24px, 4vw, 56px)',
            transform: 'translateY(-50%)', opacity: 0.10, pointerEvents: 'none',
          }}>
            {claimed
              ? <Sparkles size={160} color="#22c55e" strokeWidth={1.2} />
              : <Gift     size={160} color={OG}     strokeWidth={1.2} />}
          </div>

          {claimed ? (
            <div className="dwm-claimed" style={{ position: 'relative' }}>
              <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 900, color: '#22c55e', letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 12 }}>
                Claimed Today
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px, 5.5vw, 64px)', fontWeight: 900, color: '#22c55e', letterSpacing: '-0.035em', lineHeight: 1, marginBottom: 14 }}>
                {todayDrop.label}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 400, color: 'rgba(237,232,218,0.66)', lineHeight: 1.55, maxWidth: 520 }}>
                {todayDrop.sub}
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 900, color: OG3, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 12 }}>
                Today&apos;s drop &nbsp;·&nbsp; Sealed
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(32px, 4.8vw, 56px)', fontWeight: 700, color: CR, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 16, maxWidth: 540 }}>
                One reward.<br />
                <span style={{ color: 'rgba(237,232,218,0.45)' }}>Tap to open.</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: BODY, fontSize: 12, fontWeight: 900, color: OG, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Claim drop <ArrowRight size={14} strokeWidth={2.5} />
              </div>
            </div>
          )}
        </button>

        <div style={{
          marginTop: 18, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          fontFamily: BODY, fontSize: 10, fontWeight: 700,
          color: 'rgba(237,232,218,0.42)', letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>
          <span style={{ marginRight: 6 }}>This week:</span>
          {DAILY_DROPS.map((d, i) => {
            const isToday = i === (new Date().getDate() % DAILY_DROPS.length)
            return (
              <span key={d.kind} style={{
                padding: '5px 10px', borderRadius: 999,
                border: isToday ? `1px solid ${OG}` : '1px solid rgba(237,232,218,0.12)',
                color: isToday ? OG3 : 'rgba(237,232,218,0.42)',
                backgroundColor: isToday ? 'rgba(245,127,32,0.08)' : 'transparent',
              }}>
                {d.kind}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  ACTIVE MISSION  —  current chapter, the next milestone to chase
// ════════════════════════════════════════════════════════════════════════════

function ActiveMissionBlock({ converted }: { converted: number }) {
  const next     = MILESTONES.find(m => converted < m.at) ?? MILESTONES[MILESTONES.length - 1]
  const prev     = MILESTONES.slice().reverse().find(m => converted >= m.at)
  const lowerBound = prev?.at ?? 0
  const segments = next.at - lowerBound
  const filled   = converted - lowerBound
  const moreNeeded = next.at - converted

  return (
    <section style={{
      padding: 'clamp(48px, 6vw, 80px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="dwm-mission-grid" style={{
          display: 'flex', alignItems: 'stretch', gap: 32,
          backgroundImage: 'none',
          backgroundColor: 'rgba(245,127,32,0.04)',
          border: '1px solid rgba(245,127,32,0.22)',
          borderRadius: 'var(--radius-md)',
          padding: 'clamp(28px, 4vw, 48px)',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(245,127,32,0.10)',
        }}>
          <div style={{
            position: 'absolute', top: '50%', right: 'clamp(40px, 6vw, 80px)', transform: 'translateY(-50%)',
            fontFamily: DISPLAY, fontSize: 'clamp(180px, 22vw, 320px)', fontWeight: 900,
            color: 'rgba(245,127,32,0.06)', lineHeight: 1, letterSpacing: '-0.06em',
            pointerEvents: 'none', userSelect: 'none', fontFeatureSettings: '"tnum"',
          }}>
            {moreNeeded}
          </div>

          <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            <div>
              <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 10 }}>
                Active Mission
              </div>
              <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: 'rgba(237,232,218,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Chapter 0{MILESTONES.findIndex(m => m.at === next.at) + 1} / 04
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {Array.from({ length: segments }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 8, borderRadius: 4,
                    backgroundColor: i < filled
                      ? OG
                      : 'rgba(237,232,218,0.08)',
                    boxShadow: i < filled ? `0 0 10px rgba(245,127,32,0.55)` : 'none',
                    transition: `background 480ms ${EXPO_OUT}`,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontSize: 11, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                <span style={{ color: OG }}>{converted} done</span>
                <span style={{ color: 'rgba(237,232,218,0.42)' }}>{next.at} target</span>
              </div>
            </div>
          </div>

          <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: 'rgba(237,232,218,0.52)', letterSpacing: '0.06em', marginBottom: 10 }}>
              {moreNeeded === 1 ? 'One more subscriber to unlock' : `${moreNeeded} more subscribers to unlock`}
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900,
              color: CR, letterSpacing: '-0.045em', lineHeight: 0.95, marginBottom: 14,
            }}>
              {next.reward}
            </div>
            <div style={{ fontFamily: BODY, fontSize: 15, fontWeight: 400, color: 'rgba(237,232,218,0.55)', lineHeight: 1.55, maxWidth: 480 }}>
              {next.detail}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  MISSION LADDER  —  all 4 milestones as a progression tree
// ════════════════════════════════════════════════════════════════════════════

function MissionLadderBlock({ converted }: { converted: number }) {
  const rewardIcons = [
    null,            // AED 20 — no icon, the number is the icon
    SkipForward,     // Free Skip
    Calendar,        // Free Week
    Pause,           // Pause Unlocked
  ] as const

  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 64px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 6 }}>
              Mission Ladder
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, letterSpacing: '-0.02em' }}>
              The road to War Hero.
            </div>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: 'rgba(237,232,218,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Resets next cycle
          </div>
        </div>

        <div className="dwm-ladder-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        }}>
          {MILESTONES.map((m, i) => {
            const unlocked  = converted >= m.at
            const isCurrent = !unlocked && i === MILESTONES.findIndex(x => converted < x.at)
            const Icon      = rewardIcons[i]

            const tint =
              unlocked   ? 'rgba(34,197,94,0.08)' :
              isCurrent  ? 'rgba(245,127,32,0.06)' :
                           'rgba(237,232,218,0.03)'
            const borderColor =
              unlocked  ? 'rgba(34,197,94,0.32)' :
              isCurrent ? 'rgba(245,127,32,0.40)' :
                          'rgba(237,232,218,0.08)'
            const numColor =
              unlocked  ? '#22c55e' :
              isCurrent ? OG3 :
                          'rgba(237,232,218,0.30)'

            return (
              <div key={m.at} className="dwm-ladder-card" style={{
                padding: 22, borderRadius: 'var(--radius-md)',
                backgroundColor: tint, border: `1px solid ${borderColor}`,
                position: 'relative', overflow: 'hidden',
                minHeight: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{
                      fontFamily: DISPLAY, fontSize: 28, fontWeight: 900,
                      color: numColor, letterSpacing: '-0.04em', lineHeight: 1, fontFeatureSettings: '"tnum"',
                    }}>
                      {String(m.at).padStart(2, '0')}
                    </span>
                    <span style={{
                      width: 32, height: 32, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: unlocked ? 'rgba(34,197,94,0.18)' : isCurrent ? 'rgba(245,127,32,0.18)' : 'rgba(237,232,218,0.05)',
                    }}>
                      {unlocked
                        ? <Check size={14} strokeWidth={3} color="#22c55e" />
                        : isCurrent
                          ? <Zap   size={14} strokeWidth={2.6} color={OG3} />
                          : <Lock  size={12} strokeWidth={2.4} color="rgba(237,232,218,0.30)" />}
                    </span>
                  </div>

                  <div style={{ fontFamily: BODY, fontSize: 9, fontWeight: 800, color: 'rgba(237,232,218,0.40)', letterSpacing: '0.20em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {m.at === 1 ? 'First conversion' : `${m.at} conversions`}
                  </div>
                  <div style={{
                    fontFamily: BODY, fontSize: 17, fontWeight: 900,
                    color: unlocked || isCurrent ? CR : 'rgba(237,232,218,0.50)',
                    letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 4,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    {Icon ? <Icon size={16} strokeWidth={2.2} color={unlocked ? '#22c55e' : isCurrent ? OG3 : 'rgba(237,232,218,0.30)'} /> : null}
                    {m.reward}
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 400, color: 'rgba(237,232,218,0.45)', lineHeight: 1.45 }}>
                    {m.detail}
                  </div>
                </div>

                <div style={{
                  fontFamily: BODY, fontSize: 10, fontWeight: 800,
                  color: unlocked ? '#22c55e' : isCurrent ? OG : 'rgba(237,232,218,0.30)',
                  letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 18,
                }}>
                  {unlocked ? '✓ Unlocked' : isCurrent ? '→ Active' : 'Locked'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  RECRUITS  —  per-invitee squad list
// ════════════════════════════════════════════════════════════════════════════

function RecruitsBlock({ recruits }: { recruits: Recruit[] }) {
  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 64px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 6 }}>
              Your Squad
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, letterSpacing: '-0.02em' }}>
              {recruits.length} recruits enlisted.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, fontFamily: BODY, fontSize: 11, fontWeight: 700, color: 'rgba(237,232,218,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span><span style={{ color: '#22c55e', fontWeight: 900 }}>{recruits.filter(r => r.status === 'converted').length}</span> subscribed</span>
            <span><span style={{ color: OG3, fontWeight: 900 }}>{recruits.filter(r => r.status === 'trying').length}</span> trying</span>
          </div>
        </div>

        <div style={{
          backgroundImage: 'none',
          backgroundColor: 'rgba(237,232,218,0.03)',
          border: '1px solid rgba(237,232,218,0.08)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {recruits.map((r, i) => {
            const isLast = i === recruits.length - 1
            const fg =
              r.status === 'converted' ? '#22c55e' :
              r.status === 'trying'    ? OG3 :
                                         'rgba(237,232,218,0.50)'
            const tint =
              r.status === 'converted' ? 'rgba(34,197,94,0.14)' :
              r.status === 'trying'    ? 'rgba(245,127,32,0.14)' :
                                         'rgba(237,232,218,0.05)'
            const ring =
              r.status === 'converted' ? 'rgba(34,197,94,0.36)' :
              r.status === 'trying'    ? 'rgba(245,127,32,0.36)' :
                                         'rgba(237,232,218,0.10)'

            return (
              <div key={r.name + i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: '14px 22px',
                borderBottom: isLast ? 'none' : '1px solid rgba(237,232,218,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%',
                    backgroundColor: tint, border: `1px solid ${ring}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: BODY, fontSize: 13, fontWeight: 900, color: fg,
                    flexShrink: 0,
                  }}>
                    {r.name.charAt(0)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 800, color: CR, lineHeight: 1.2, marginBottom: 2 }}>
                      {r.name}
                    </div>
                    <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: fg, letterSpacing: '0.04em' }}>
                      {r.amount}
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, color: 'rgba(237,232,218,0.42)', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
                  {r.when}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  LEADERBOARD  —  Territory; unblurred dorm rankings
// ════════════════════════════════════════════════════════════════════════════

function LeaderboardBlock({ rows }: { rows: DormRow[] }) {
  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 64px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 6 }}>
              Territory
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, letterSpacing: '-0.02em' }}>
              May rankings.
            </div>
          </div>
          <span style={{
            padding: '5px 12px', borderRadius: 999,
            backgroundColor: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.28)',
            fontFamily: BODY, fontSize: 10, fontWeight: 800,
            color: '#22c55e', letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            Live · 8 days left
          </span>
        </div>

        <div style={{
          backgroundImage: 'none',
          backgroundColor: 'rgba(237,232,218,0.03)',
          border: '1px solid rgba(237,232,218,0.08)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1
            const rankColor =
              row.rank === 1 ? '#d4a544' :   // gold
              row.rank === 2 ? '#c9c2b1' :   // silver-cream
              row.rank === 3 ? '#a67838' :   // bronze
                               'rgba(237,232,218,0.45)'
            const isYou = !!row.isYou

            return (
              <div key={row.dorm + i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: '16px 24px',
                borderBottom: isLast ? 'none' : '1px solid rgba(237,232,218,0.05)',
                backgroundColor: isYou ? 'rgba(245,127,32,0.08)' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                  <span style={{
                    fontFamily: DISPLAY, fontSize: 22, fontWeight: 900,
                    color: rankColor, letterSpacing: '-0.04em', minWidth: 28,
                    fontFeatureSettings: '"tnum"', textAlign: 'center',
                  }}>
                    {row.rank}
                  </span>
                  {row.rank === 1 && <Crown size={14} strokeWidth={2.2} color="#d4a544" />}
                  <span style={{
                    fontFamily: BODY, fontSize: 14, fontWeight: 800,
                    color: isYou ? OG3 : CR, lineHeight: 1.2,
                  }}>
                    {row.dorm}
                    {isYou && <span style={{ marginLeft: 10, fontFamily: BODY, fontSize: 10, fontWeight: 800, color: OG, letterSpacing: '0.18em', textTransform: 'uppercase' }}>You</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: BODY, fontSize: 11, fontWeight: 800,
                    color: row.trend === 'up' ? '#22c55e' : row.trend === 'down' ? '#e53e3e' : 'rgba(237,232,218,0.40)',
                    fontFeatureSettings: '"tnum"',
                  }}>
                    {row.trend === 'up'   && <ChevronUp   size={12} strokeWidth={2.8} />}
                    {row.trend === 'down' && <ChevronDown size={12} strokeWidth={2.8} />}
                    {row.trend === 'flat' && <Minus       size={12} strokeWidth={2.8} />}
                    {row.delta}
                  </span>
                  <span style={{
                    fontFamily: BODY, fontSize: 14, fontWeight: 700,
                    color: 'rgba(237,232,218,0.72)', fontFeatureSettings: '"tnum"', minWidth: 60, textAlign: 'right',
                  }}>
                    {row.subs} <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(237,232,218,0.40)' }}>subs</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  TROPHY ROOM  —  lifetime stamps; earned + locked
// ════════════════════════════════════════════════════════════════════════════

function TrophyRoomBlock({ trophies }: { trophies: Achievement[] }) {
  const earnedCount = trophies.filter(t => t.earned).length

  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 64px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 6 }}>
              Trophy Room
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, letterSpacing: '-0.02em' }}>
              <span style={{ color: '#22c55e' }}>{earnedCount}</span><span style={{ color: 'rgba(237,232,218,0.40)' }}> / {trophies.length}</span> earned.
            </div>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, color: 'rgba(237,232,218,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Lifetime · never resets
          </div>
        </div>

        <div className="dwm-trophy-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
        }}>
          {trophies.map(t => {
            const Icon = t.Icon
            return (
              <div key={t.id} className="dwm-trophy" style={{
                padding: 20, borderRadius: 'var(--radius-md)',
                backgroundColor: t.earned ? 'rgba(34,197,94,0.06)' : 'rgba(237,232,218,0.03)',
                border: t.earned ? '1px solid rgba(34,197,94,0.28)' : '1px solid rgba(237,232,218,0.08)',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                position: 'relative', overflow: 'hidden',
                minHeight: 140,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: t.earned ? 'rgba(34,197,94,0.16)' : 'rgba(237,232,218,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: t.earned ? 'drop-shadow(0 0 8px rgba(34,197,94,0.30))' : 'none',
                }}>
                  <Icon size={20} strokeWidth={2.2} color={t.earned ? '#22c55e' : 'rgba(237,232,218,0.32)'} />
                </div>
                <div>
                  <div style={{
                    fontFamily: BODY, fontSize: 14, fontWeight: 900,
                    color: t.earned ? CR : 'rgba(237,232,218,0.45)',
                    letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 4,
                  }}>
                    {t.label}
                  </div>
                  <div style={{
                    fontFamily: BODY, fontSize: 10, fontWeight: 700,
                    color: t.earned ? '#22c55e' : 'rgba(237,232,218,0.35)',
                    letterSpacing: '0.10em', textTransform: 'uppercase',
                  }}>
                    {t.earned ? '✓ ' : ''}{t.meta}
                  </div>
                </div>
                {!t.earned && (
                  <div style={{ position: 'absolute', top: 16, right: 16 }}>
                    <Lock size={11} strokeWidth={2.4} color="rgba(237,232,218,0.25)" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  ACTION SURFACE  —  demoted share row; user knows the drill by here
// ════════════════════════════════════════════════════════════════════════════

function ActionSurfaceBlock({ customerCid }: { customerCid: string }) {
  const [copied, setCopied] = useState(false)
  function copyLink() {
    if (!customerCid) return
    navigator.clipboard.writeText(`https://dormers.ae/r/${customerCid}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 64px) clamp(28px, 5vw, 64px)',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 900, color: OG, letterSpacing: '0.26em', textTransform: 'uppercase', marginBottom: 6 }}>
            Arsenal
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, letterSpacing: '-0.02em' }}>
            Send one more.
          </div>
        </div>

        <div className="dwm-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button
            type="button"
            onClick={copyLink}
            disabled={!customerCid}
            className="dwm-action-card"
            style={{
              padding: '24px 26px', borderRadius: 'var(--radius-md)',
              backgroundColor: copied ? 'rgba(34,197,94,0.06)' : 'rgba(237,232,218,0.03)',
              border: copied ? '1px solid rgba(34,197,94,0.30)' : '1px solid rgba(237,232,218,0.10)',
              cursor: customerCid ? 'pointer' : 'default',
              textAlign: 'left', fontFamily: BODY,
              boxShadow: '0 6px 18px rgba(9,24,37,0.18)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: copied ? '#22c55e' : 'rgba(237,232,218,0.42)', marginBottom: 11 }}>
              Your link
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: copied ? '#22c55e' : CR, fontFeatureSettings: '"tnum"', marginBottom: 14, wordBreak: 'break-all', lineHeight: 1.4 }}>
              {customerCid ? `dormers.ae/r/${customerCid}` : '—'}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: copied ? '#22c55e' : OG }}>
              {copied ? <><Check size={11} strokeWidth={3} /> Copied!</> : 'Tap to copy'}
            </div>
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(`I get fresh meals delivered to my dorm from Dormers — try your first meal free: https://dormers.ae/r/${customerCid}`)}`}
            target="_blank"
            rel="noreferrer"
            className="dwm-action-card"
            style={{
              padding: '24px 26px', borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(37,211,102,0.06)',
              border: '1px solid rgba(37,211,102,0.24)',
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              boxShadow: '0 6px 18px rgba(37,211,102,0.15)',
            }}
          >
            <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(37,211,102,0.65)', marginBottom: 11 }}>
              WhatsApp
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: '#25d366', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 14 }}>
              Send to<br />your dorm
            </div>
            <div style={{ fontFamily: BODY, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#25d366' }}>
              Open chat <ArrowRight size={12} strokeWidth={2.5} />
            </div>
          </a>
        </div>
      </div>
    </section>
  )
}


// ════════════════════════════════════════════════════════════════════════════
//  FINE PRINT  —  quiet rules at the bottom
// ════════════════════════════════════════════════════════════════════════════

function FinePrintBlock() {
  return (
    <section style={{
      padding: 'clamp(40px, 5vw, 56px) clamp(28px, 5vw, 64px) 8px',
      backgroundColor: NV, borderTop: '1px solid rgba(237,232,218,0.04)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 800, color: 'rgba(237,232,218,0.45)', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 14 }}>
          Fine print
        </div>
        <ul style={{
          fontFamily: BODY, fontSize: 12, fontWeight: 400,
          color: 'rgba(237,232,218,0.45)', lineHeight: 1.75,
          margin: 0, padding: '0 0 0 16px',
        }}>
          <li>One free meal per invitee. Each phone number and email can only claim once.</li>
          <li>Credit lands only when your invitee makes their first paid subscription.</li>
          <li>Capped at 10 paid conversions per <strong>subscription cycle</strong>.</li>
          <li>Milestone rewards apply within 24 hours of qualifying.</li>
          <li>Daily Drop refreshes at 00:00 local. One claim per cycle day.</li>
          <li>Dormers may void credits for suspected abuse.</li>
        </ul>
      </div>
    </section>
  )
}
