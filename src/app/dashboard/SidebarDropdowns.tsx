'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Check, ChevronRight, CreditCard, LogOut, MessagesSquare,
  User as UserIcon, Gift, ArrowRight, Sparkles,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV2, BODY } from './_shared/tokens'
import type { ReferralData } from '@/utils/supabase/queries'
import { EMPTY_REVIEW_STATE, BASE_REWARD_AED, LATE_REWARD_AED, type WeeklyReviewState, type LateItem } from '@/lib/weekly-review'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED, wrapVocabFor, type MonthlyReviewWindow } from '@/lib/monthly-review'
import { useWeeklyDraftActive, useMonthlyDraftActive } from './_shared/draft-hooks'

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

export type DropdownKind = 'notif' | 'profile' | 'dormwars' | null

// Theme-aware tokens for the dropdowns (which sit over a navy sidebar).
// Variables flip in dark mode via globals.css → the panels remain
// readable in either palette.
const D = {
  fg:       'var(--ds-fg)',
  fgMuted:  'var(--ds-fg-muted)',
}

// Milestones earned on paid conversions. Must stay in sync with the reward
// tiers in the referral program design doc.
const MILESTONES = [
  { at: 1,  label: 'AED 20 credit'           },
  { at: 3,  label: '+1 skip this cycle'       },
  { at: 6,  label: 'Free week / AED 100 off' },
  { at: 10, label: 'Pause unlock'            },
]

interface Props {
  openDropdown: DropdownKind
  setOpenDropdown: (k: DropdownKind) => void
  onMobileClose?: () => void
  customerCid: string
  referralData: ReferralData
  displayName: string
  userEmail: string
  initials: string
  /** Pending/late weekly reviews — drives the weekly cards in the Now tray. */
  weeklyReviewState?: WeeklyReviewState
  /** Monthly wrap window — drives the wrap card in the Now tray. */
  monthlyWindow?: MonthlyReviewWindow
}

export function SidebarDropdowns({
  openDropdown, setOpenDropdown, onMobileClose,
  customerCid, referralData, displayName, userEmail, initials,
  weeklyReviewState = EMPTY_REVIEW_STATE,
  monthlyWindow = EMPTY_MONTHLY_WINDOW,
}: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [referralCopied, setReferralCopied] = useState(false)

  // Suppress all data-tooltip rendering while ANY dropdown is open + close
  // on Escape + outside-click. Body class is consumed by the global CSS rule.
  useEffect(() => {
    if (openDropdown) document.body.classList.add('dropdown-open')
    else              document.body.classList.remove('dropdown-open')
    return () => { document.body.classList.remove('dropdown-open') }
  }, [openDropdown])

  useEffect(() => {
    if (!openDropdown) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDropdown(null) }
    // Outside-click dismiss. Uses 'click' (not 'mousedown') so the trigger
    // button's own onClick toggle runs FIRST in the bubble phase; by the
    // time this handler runs, openDropdown is already null and the
    // setOpenDropdown(null) here is a harmless no-op. With mousedown the
    // order reversed — the handler closed the panel, then the trigger's
    // click toggle re-opened it, and the panel could never be dismissed
    // by clicking the trigger again.
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [openDropdown, setOpenDropdown])

  const shareUrl = customerCid ? `https://dormers.ae/r/${customerCid}` : ''

  const copyShareLink = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 1800)
    })
  }

  // Next milestone the inviter hasn't yet reached.
  const nextMilestone = MILESTONES.find(m => referralData.converted < m.at)
  const prevMilestone = MILESTONES.slice().reverse().find(m => referralData.converted >= m.at)

  if (!openDropdown) return null

  return (
    <>
      <motion.div
        ref={dropdownRef}
        // Soft scale-in from the sidebar's edge. transform-origin sits on
        // the LEFT side because the dropdown emerges horizontally outward
        // from the sidebar's right edge — anchoring the origin to the left
        // makes the entry feel like it's growing out of the icon. Custom
        // easing (quart-out) keeps it crisp without spring overshoot,
        // appropriate for a utility panel (not a celebration moment).
        initial={{ opacity: 0, scale: 0.96, x: -6 }}
        animate={{ opacity: 1, scale: 1,    x:  0 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        style={{
          position: 'absolute',
          left: 'calc(100% + 8px)',
          // Anchor each dropdown to the y-position of the icon that opens
          // it. Theme toggle is now an inline button (no dropdown), so the
          // 'settings' anchor is gone.
          ...(openDropdown === 'dormwars' ? { bottom: 168 } :
              openDropdown === 'notif'    ? { bottom: 110 } :
                                            { bottom: 16 }),
          minWidth: 280,
          background: 'var(--ds-glass-bg-strong)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--ds-border2)',
          boxShadow: 'var(--ds-shadow-modal)',
          padding: openDropdown === 'profile' ? 0 : 8,
          fontFamily: BODY, zIndex: 200,
          overflow: 'hidden',
          transformOrigin: 'left center',
        }}
      >
        {openDropdown === 'dormwars' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG }}>
                Refer &amp; Earn
              </div>
              {referralData.creditBalance > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 999,
                  background: 'var(--ds-success-wash)', color: 'var(--ds-success-fg)',
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                  textTransform: 'uppercase', lineHeight: 1, fontFeatureSettings: '"tnum"',
                }}>
                  <Gift size={9} strokeWidth={2.8} />
                  AED {referralData.creditBalance.toFixed(0)} credit
                </span>
              )}
            </div>

            {/* ── Next milestone — single line ── */}
            {nextMilestone && (
              <div style={{ fontSize: 12, fontWeight: 600, color: D.fgMuted }}>
                <span style={{ fontWeight: 800, color: OG, fontFeatureSettings: '"tnum"' }}>
                  {referralData.converted}/{nextMilestone.at}
                </span>
                {' '}subscribers → <span style={{ fontWeight: 700, color: D.fg }}>{nextMilestone.label}</span>
              </div>
            )}
            {prevMilestone && !nextMilestone && (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ds-success-fg)' }}>
                All rewards unlocked
              </div>
            )}

            {/* ── Copy link ── */}
            <button
              type="button"
              onClick={copyShareLink}
              disabled={!customerCid}
              aria-label="Copy your referral link"
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: referralCopied
                  ? '1.5px dashed var(--ds-success-border)'
                  : '1.5px dashed var(--ds-og-border-strong)',
                background: referralCopied ? 'var(--ds-success-wash)' : 'var(--ds-og-wash)',
                cursor: customerCid ? 'pointer' : 'default',
                textAlign: 'center', fontFamily: BODY,
                transition: 'background 200ms, border-color 200ms',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: D.fg, fontFeatureSettings: '"tnum"', marginBottom: 3, wordBreak: 'break-all' }}>
                {customerCid ? `dormers.ae/r/${customerCid}` : '—'}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: referralCopied ? 'var(--ds-success-fg)' : D.fgMuted }}>
                {referralCopied ? <><Check size={11} strokeWidth={2.6} /> Copied</> : <>Tap to copy</>}
              </div>
            </button>

            {/* ── WhatsApp share ── */}
            <a
              href={`https://wa.me/?text=I%20get%20fresh%20meals%20delivered%20to%20my%20dorm%20from%20Dormers%20%E2%80%94%20try%20your%20first%20meal%20free%3A%20https%3A%2F%2Fdormers.ae%2Fr%2F${customerCid}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpenDropdown(null)}
              style={{
                padding: '10px 14px', borderRadius: 999,
                background: 'var(--ds-success-wash)',
                border: '1.5px solid var(--ds-success-border)',
                color: 'var(--ds-success-fg)',
                fontSize: 12, fontWeight: 800,
                letterSpacing: '0.04em', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%',
              }}
            >
              Share on WhatsApp
              <ChevronRight size={14} strokeWidth={2.4} />
            </a>

            {/* ── Link to full page ── */}
            <Link
              href="/dashboard/dorm-wars"
              onClick={() => setOpenDropdown(null)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: D.fgMuted, textDecoration: 'none',
                textTransform: 'uppercase',
              }}
            >
              View Dorm Wars
              <ArrowRight size={11} strokeWidth={2.4} />
            </Link>
          </div>
        )}

        {openDropdown === 'notif' && (
          <NowTray
            weeklyReviewState={weeklyReviewState}
            monthlyWindow={monthlyWindow}
            onItemClick={() => { setOpenDropdown(null); onMobileClose?.() }}
          />
        )}

        {openDropdown === 'profile' && (
          <>
            <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--ds-border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${OG3}, ${OG})`, color: NV2, fontFamily: BODY, fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: D.fg, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                <div style={{ fontSize: 12, color: D.fgMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
              </div>
            </div>
            <div style={{ padding: 6 }}>
              {[
                { href: '/dashboard/profile', label: 'Profile',         icon: UserIcon       },
                { href: '/dashboard/plan',    label: 'Plan & billing',  icon: CreditCard     },
                { href: '/dashboard/support', label: 'Help & support',  icon: MessagesSquare },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => { setOpenDropdown(null); onMobileClose?.() }}
                  className="utility-row"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', color: D.fg, fontSize: 13, fontWeight: 500 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={14} strokeWidth={2} color="currentColor" />
                    {label}
                  </span>
                  <ChevronRight size={13} color="var(--ds-fg-tint)" />
                </Link>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--ds-border-soft)', padding: 6 }}>
              <form action={signout}>
                <button
                  type="submit"
                  className="utility-signout-row"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-fg-muted)', fontFamily: BODY, fontSize: 13, fontWeight: 600 }}
                >
                  <LogOut size={14} strokeWidth={2} />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </motion.div>

      <style jsx global>{`
        .utility-row:hover { background: var(--ds-og-wash) !important; }
        .utility-signout-row:hover { background: var(--ds-danger-wash) !important; color: var(--ds-danger-fg) !important; }
        .now-tray-row:hover { background: var(--ds-og-wash) !important; }
        .now-tray-card-primary:hover {
          transform: translateY(-1px);
          box-shadow: inset 3px 0 0 ${OG}, 0 6px 16px rgba(245,127,32,0.14) !important;
        }
        .now-tray-card-monthly:hover {
          transform: translateY(-1px);
          box-shadow: inset 3px 0 0 ${OG}, 0 6px 16px rgba(245,127,32,0.14) !important;
        }
        .now-tray-card-monthly-late:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(9,24,37,0.08) !important;
          border-color: var(--ds-og-border) !important;
        }

        /* Suppress all data-tooltip while a dropdown is open */
        body.dropdown-open [data-tooltip]::after,
        body.dropdown-open [data-tooltip]::before {
          display: none !important;
        }
      `}</style>
    </>
  )
}

// ── Now Tray ────────────────────────────────────────────────────────────────
// Home for time-bound items (pending/late weekly reviews; Phase C adds the
// monthly wrap). Entry rule: only items with a hard expiry/deadline window.
// Past confirmations, system status (delivery countdown), promos — none belong
// here. See project_now_tray_architecture memory for the full rationale.
//
// Composition rules:
//   • Primary pending → PendingReviewCard with full-width CTA button (the
//     decisive action of the tray; orange edge for urgency)
//   • Catch-up late → compact LateReviewRow (secondary, scannable)
//   • Monthly plans (rewards.total > 1) → one-line AllOrNothingLine above
//     the cards naming the cycle stakes (forfeit/locked-in/in-progress)
//   • Just-submitted → green confirmation row when nothing else is pending
//   • Nothing → designed empty state (not silence)

function NowTray({
  weeklyReviewState,
  monthlyWindow,
  onItemClick,
}: {
  weeklyReviewState: WeeklyReviewState
  monthlyWindow: MonthlyReviewWindow
  onItemClick: () => void
}) {
  const { current, late, justSubmitted, rewards } = weeklyReviewState
  const monthlyLive = monthlyWindow.eligible
  const hasContent = !!current || late.length > 0 || !!justSubmitted || monthlyLive
  // Monthly plans (Premium/Max) have multiple weekly reviews in a cycle; the
  // all-or-nothing rule only applies to them. Weekly Flex collapses to a
  // single review per cycle — no rule banner.
  const showAllOrNothing = rewards.total > 1 && (current || late.length > 0)
  const liveCount = (current ? 1 : 0) + late.length + (monthlyLive ? 1 : 0)

  return (
    <>
      <div style={{
        padding: '12px 14px 8px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--ds-fg-tint)',
        }}>
          Now
        </div>
        {hasContent && liveCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--ds-fg-faint)',
            fontFeatureSettings: '"tnum"',
          }}>
            {liveCount} live
          </span>
        )}
      </div>

      {!hasContent ? (
        <NowTrayEmpty />
      ) : (
        <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Monthly wrap leads when present — it's the cycle-closing moment
              that anchors the milestone path the weekly reviews opened. */}
          {monthlyLive && <MonthlyWrapCard window={monthlyWindow} onClick={onItemClick} />}
          {showAllOrNothing && <AllOrNothingLine state={weeklyReviewState} />}
          {current && <PendingReviewCard data={current} onClick={onItemClick} />}
          {late.map(item => (
            <LateReviewRow key={item.week} data={item} onClick={onItemClick} />
          ))}
          {justSubmitted && !current && late.length === 0 && !monthlyLive && (
            <JustSubmittedRow week={justSubmitted.week} rewardPct={justSubmitted.rewardPct} />
          )}
        </div>
      )}
    </>
  )
}

function NowTrayEmpty() {
  return (
    <div style={{
      padding: '28px 18px 22px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--ds-og-wash)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: OG,
      }}>
        <Sparkles size={16} strokeWidth={2} />
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.3,
      }}>
        All clear<span style={{ color: OG }}>.</span>
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--ds-fg-muted)', lineHeight: 1.45, maxWidth: 240,
      }}>
        Time-sensitive items appear here as they come up.
      </div>
    </div>
  )
}

// One-line cycle-stakes summary. Three states by reward progress:
//   • all in    → success tone, "Cycle locked in"
//   • none in   → orange tone, "Submit all N to lock AED X"
//   • partial   → orange tone, "N/M in · AED X on the line"
function AllOrNothingLine({ state }: { state: WeeklyReviewState }) {
  const { rewards } = state
  const submitted = rewards.submitted
  const total = rewards.total
  const earned = rewards.aedEarned
  const pending = rewards.aedPending
  const allIn = submitted >= total

  let body: string
  let tone: 'success' | 'urgent'

  if (allIn) {
    body = `All ${total} in · AED ${earned} locked`
    tone = 'success'
  } else if (submitted === 0) {
    body = `Submit all ${total} for AED ${total * BASE_REWARD_AED}`
    tone = 'urgent'
  } else {
    body = `${submitted}/${total} in · AED ${pending} on the line`
    tone = 'urgent'
  }

  const fg = tone === 'success' ? 'var(--ds-success-fg)' : '#8c4214'
  const bg = tone === 'success' ? 'var(--ds-success-wash)' : 'var(--ds-og-wash)'
  const border = tone === 'success' ? 'var(--ds-success-border)' : 'var(--ds-og-border)'

  return (
    <div style={{
      padding: '7px 10px', borderRadius: 'var(--radius-sm)',
      background: bg, border: `1px solid ${border}`,
      fontSize: 11, fontWeight: 700, color: fg, lineHeight: 1.3,
      fontFeatureSettings: '"tnum"',
      letterSpacing: '0.01em',
    }}>
      {body}
    </div>
  )
}

// Monthly wrap — the cycle-closing moment. Leads the tray when eligible
// because it anchors the milestone path the weekly reviews opened. Slightly
// taller than the weekly tile: it earns the extra body height with an extra
// supporting line that names the cycle and the time investment ("~3 min").
//
// Tone shifts with reward window state:
//   • >0 days left  → orange-edge primary, "Start/Resume wrap · +AED 5"
//   • last day      → orange-edge primary with "Last day" chip
//   • late (post-7) → neutral surface, muted chip, "+AED 2"
function MonthlyWrapCard({
  window,
  onClick,
}: {
  window: MonthlyReviewWindow
  onClick: () => void
}) {
  const vocab = wrapVocabFor(window.planTier)
  const cycleLabel = window.cycleLabel ?? 'cycle'
  const draftActive = useMonthlyDraftActive(cycleLabel)
  const isPreEnd = window.daysSinceCycleEnd < 0
  const isLastDay = !isPreEnd && window.daysLeftForFullReward === 0 && window.daysSinceCycleEnd <= MONTHLY_FULL_REWARD_DAYS_THRESHOLD
  const isLate = window.daysSinceCycleEnd > MONTHLY_FULL_REWARD_DAYS_THRESHOLD
  const reward = isLate ? MONTHLY_LATE_REWARD_AED : MONTHLY_REWARD_AED
  const ctaLabel = draftActive ? 'Resume wrap' : 'Start wrap'

  const chipLabel = isLate
    ? `${window.daysSinceCycleEnd}d late`
    : isPreEnd
      ? `${-window.daysSinceCycleEnd}d to end`
      : isLastDay
        ? 'Last day'
        : `${window.daysLeftForFullReward}d left`

  return (
    <Link
      href="/dashboard/menu/review/monthly"
      onClick={onClick}
      className={isLate ? 'now-tray-card-monthly-late' : 'now-tray-card-monthly'}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '12px 12px 12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-surface)',
        border: isLate ? '1px solid var(--ds-border-soft)' : '1px solid var(--ds-og-border)',
        boxShadow: isLate
          ? '0 1px 2px rgba(9,24,37,0.04)'
          : `inset 3px 0 0 ${OG}, 0 1px 2px rgba(9,24,37,0.04)`,
        textDecoration: 'none', color: 'var(--ds-fg)',
        fontFamily: BODY,
        transition: 'transform 150ms, box-shadow 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: isLate ? 'var(--ds-fg-muted)' : OG,
        }}>
          {vocab.qualifier} wrap
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
          padding: '2px 7px', borderRadius: 999,
          background: isLate ? 'rgba(9,24,37,0.06)' : 'var(--ds-og-wash)',
          color: isLate ? 'var(--ds-fg-muted)' : '#8c4214',
          border: `1px solid ${isLate ? 'rgba(9,24,37,0.18)' : 'var(--ds-og-border)'}`,
          fontFeatureSettings: '"tnum"',
        }}>
          {chipLabel}
        </span>
      </div>

      <div style={{
        fontSize: 15, fontWeight: 800, color: 'var(--ds-fg)',
        letterSpacing: '-0.005em', lineHeight: 1.15,
      }}>
        Wrap your {cycleLabel}
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--ds-fg-muted)', lineHeight: 1.35,
      }}>
        {vocab.period === 'meal'
          ? '~2 min · see how it went'
          : `~3 min · see your ${vocab.period} report at the end`}
      </div>

      <div style={{
        marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 10px', borderRadius: 999,
        background: isLate ? 'transparent' : OG,
        color: isLate ? OG : '#fff',
        border: isLate ? `1px solid ${OG}` : 'none',
        fontSize: 11, fontWeight: 800,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        boxShadow: isLate ? 'none' : '0 4px 12px rgba(245,127,32,0.35)',
      }}>
        {ctaLabel} · +AED {reward}
      </div>
    </Link>
  )
}

// The 7-day full-reward threshold is named here for clarity at the call sites
// above. Beyond 7 days the wrap is "late" until the 30-day cap kicks in.
const MONTHLY_FULL_REWARD_DAYS_THRESHOLD = 7

// Primary pending review — the decisive action of the tray. Full-width CTA
// inside the card (not just a chevron). Orange edge anchors urgency without
// flooding the card with brand colour. Draft state flips "Start" → "Resume".
function PendingReviewCard({
  data,
  onClick,
}: {
  data: { week: number; range: string; daysLeft: number }
  onClick: () => void
}) {
  const isLastDay = data.daysLeft === 0
  const draftActive = useWeeklyDraftActive(data.week)

  return (
    <Link
      href={`/dashboard/menu/review/${data.week}`}
      onClick={onClick}
      className="now-tray-card-primary"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '12px 12px 12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-surface)',
        border: '1px solid var(--ds-og-border)',
        boxShadow: `inset 3px 0 0 ${OG}, 0 1px 2px rgba(9,24,37,0.04)`,
        textDecoration: 'none', color: 'var(--ds-fg)',
        fontFamily: BODY,
        transition: 'transform 150ms, box-shadow 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: OG,
        }}>
          Review
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
          padding: '2px 7px', borderRadius: 999,
          background: 'var(--ds-og-wash)', color: '#8c4214',
          border: '1px solid var(--ds-og-border)',
          fontFeatureSettings: '"tnum"',
        }}>
          {isLastDay ? 'Last day' : `${data.daysLeft}d left`}
        </span>
      </div>

      <div style={{
        fontSize: 15, fontWeight: 800, color: 'var(--ds-fg)',
        letterSpacing: '-0.005em', lineHeight: 1.15,
      }}>
        Week {data.week}
      </div>
      <div style={{
        fontSize: 11.5, color: 'var(--ds-fg-muted)', lineHeight: 1.35,
      }}>
        {data.range}
      </div>

      <div style={{
        marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 10px', borderRadius: 999,
        background: OG, color: '#fff',
        fontSize: 11, fontWeight: 800,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        boxShadow: '0 4px 12px rgba(245,127,32,0.35)',
      }}>
        {draftActive ? 'Resume review' : 'Start review'} · +AED {BASE_REWARD_AED}
      </div>
    </Link>
  )
}

// Compact catch-up row for late reviews. Same shape regardless of how many
// stacked; rows are decisive but secondary to the primary pending tile.
function LateReviewRow({ data, onClick }: { data: LateItem; onClick: () => void }) {
  const draftActive = useWeeklyDraftActive(data.week)
  const expiringSoon = data.daysLate >= 23

  return (
    <Link
      href={`/dashboard/menu/review/${data.week}`}
      onClick={onClick}
      className="now-tray-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        border: '1px solid var(--ds-border-soft)',
        textDecoration: 'none', color: 'var(--ds-fg)',
        fontFamily: BODY,
        transition: 'background 150ms',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.2,
        }}>
          Week {data.week}
          {expiringSoon && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: '#8c4214',
              padding: '1px 5px', borderRadius: 3,
              background: 'var(--ds-og-wash)',
            }}>
              Expiring
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ds-fg-muted)', marginTop: 2, lineHeight: 1.3 }}>
          {data.daysLate}d late · {draftActive ? 'Resume' : 'Submit'} for AED {LATE_REWARD_AED}
        </div>
      </div>
      <ChevronRight size={13} strokeWidth={2.2} color="var(--ds-fg-tint)" style={{ flexShrink: 0 }} />
    </Link>
  )
}

function JustSubmittedRow({ week, rewardPct }: { week: number; rewardPct: 50 | 100 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--ds-success-wash)',
      border: '1px solid var(--ds-success-border)',
      fontFamily: BODY,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'var(--ds-success-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Check size={13} strokeWidth={3} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-success-fg)', lineHeight: 1.2 }}>
          Week {week} submitted
        </div>
        <div style={{ fontSize: 11, color: 'var(--ds-fg-muted)', marginTop: 2, lineHeight: 1.3 }}>
          {rewardPct === 100 ? `Full AED ${BASE_REWARD_AED} reward locked` : `AED ${LATE_REWARD_AED} reward locked`}
        </div>
      </div>
    </div>
  )
}

