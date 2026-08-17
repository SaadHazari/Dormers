'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { MobileSheet } from './_shared/MobileSheet'
import { useIsCompact } from './_mobile/kit'
import {
  Bug, Check, CheckCircle2, ChevronRight, CreditCard, LogOut, MessagesSquare,
  Plus, User as UserIcon, Gift, ArrowRight, Sparkles,
} from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV2, BODY } from './_shared/tokens'
import type { ReferralData } from '@/infra/supabase/referrals-repo'
import { totalCashForConversions } from '@/contexts/dorm-wars/domain/constants'
import { EMPTY_REVIEW_STATE, BASE_REWARD_AED, LATE_REWARD_AED, type WeeklyReviewState, type LateItem } from '@/contexts/subscriptions/domain/weekly-review'
import { MONTHLY_REWARD_AED, MONTHLY_LATE_REWARD_AED, WEEKLY_WRAP_UNLOCK_MEALS, wrapVocabFor, type MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'
import { useWeeklyDraftActive, useMonthlyDraftActive } from './_shared/draft-hooks'
import { referralUrl, referralUrlDisplay } from '@/shared/contacts'

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, locked: false, submitted: false,
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

// Credit a referrer earns scales with their lifetime converted count
// (AED 20 → 35 per recruit). totalCashForConversions sums each conversion at
// its own rung so the badge matches what creditInviterOnConversion actually
// deposits — single source of truth in the dorm-wars LAYER1_CASH_LADDER.

// Robust copy. The async Clipboard API only exists in a SECURE context
// (https / localhost). On a phone served over a LAN IP (plain http),
// `navigator.clipboard` is undefined, so the write throws and the "Copied"
// success feedback never fires — the reported bug where the copy animation
// played on desktop but not on mobile. Fall back to the legacy execCommand
// path (with the iOS-safe selection range) so the copy AND its feedback work
// everywhere.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    const range = document.createRange()       // iOS Safari needs a real range
    range.selectNodeContents(ta)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

interface Props {
  openDropdown: DropdownKind
  setOpenDropdown: (k: DropdownKind) => void
  onMobileClose?: () => void
  customerCid: string
  referralData: ReferralData
  /** Premium/Max → the badge shows the live Dorm Wars wallet. Others →
   *  standalone Refer & Earn, badge shows referral-only earnings. */
  dormWarsEligible?: boolean
  displayName: string
  userEmail: string
  initials: string
  /** Pending/late weekly reviews — drives the weekly cards in the Now tray. */
  weeklyReviewState?: WeeklyReviewState
  /** Monthly wrap window — drives the wrap card in the Now tray. */
  monthlyWindow?: MonthlyReviewWindow
  /** Seasonal intake pause — drives the "New plans paused" Now-tray entry. */
  intakePaused?: boolean
}

export function SidebarDropdowns({
  openDropdown, setOpenDropdown, onMobileClose,
  customerCid, referralData, dormWarsEligible = false, displayName, userEmail, initials,
  weeklyReviewState = EMPTY_REVIEW_STATE,
  monthlyWindow = EMPTY_MONTHLY_WINDOW,
  intakePaused = false,
}: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [referralCopied, setReferralCopied] = useState(false)
  // Below 768px a rail-anchored popover has no horizontal room to grow into —
  // it clips off the right edge. The natural compact-width equivalent (per the
  // iOS HIG, and what the rest of this mobile redesign does) is a bottom sheet.
  const compact = useIsCompact()

  // On mobile, the trigger lives inside the slide-in drawer. When a sheet takes
  // over, close the drawer so there's ONE focused surface — never drawer-scrim
  // stacked under sheet-scrim.
  useEffect(() => {
    if (compact && openDropdown) onMobileClose?.()
  }, [compact, openDropdown, onMobileClose])

  // Suppress all data-tooltip rendering while ANY dropdown is open + close
  // on Escape + outside-click. Body class is consumed by the global CSS rule.
  useEffect(() => {
    if (openDropdown) document.body.classList.add('dropdown-open')
    else              document.body.classList.remove('dropdown-open')
    return () => { document.body.classList.remove('dropdown-open') }
  }, [openDropdown])

  useEffect(() => {
    // Desktop popover only — the mobile sheet owns its own ESC + scrim dismiss
    // (and its content isn't inside `dropdownRef`, so this outside-click handler
    // would otherwise fire on every in-sheet tap and close it instantly).
    if (!openDropdown || compact) return
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
  }, [openDropdown, setOpenDropdown, compact])

  const shareUrl = customerCid ? referralUrl(customerCid) : ''

  const copyShareLink = () => {
    if (!shareUrl) return
    copyText(shareUrl).then(ok => {
      if (!ok) return
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 1800)
    })
  }

  // Next milestone the inviter hasn't yet reached.
  const nextMilestone = MILESTONES.find(m => referralData.converted < m.at)
  const prevMilestone = MILESTONES.slice().reverse().find(m => referralData.converted >= m.at)

  if (!openDropdown) return null

  // The three panel bodies, shared by both presentations (desktop popover and
  // mobile bottom sheet). They use light-theme tokens, so they read cleanly on
  // either the frosted-glass popover or the cream sheet surface.
  const body = (
    <>
        {openDropdown === 'dormwars' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG }}>
                Refer &amp; Earn
              </div>
              {(() => {
                // Premium/Max users have Dorm Wars access → the badge mirrors
                // their live Dorm Wars wallet. Everyone else (Weekly Flex /
                // Trial / no sub) treats Refer & Earn as their own model, so the
                // badge shows referral-only earnings — the AED 20→35 ladder
                // summed across their conversions — which the Dorm Wars wallet
                // would never reflect.
                const amount = dormWarsEligible
                  ? referralData.creditBalance
                  : totalCashForConversions(referralData.converted)
                // Wallet users: hide an empty wallet (unchanged). Standalone
                // users: always show, so it reads 0 → 20 → 40 as they convert.
                if (dormWarsEligible && amount <= 0) return null
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 999,
                    background: 'var(--ds-success-wash)', color: 'var(--ds-success-fg)',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                    textTransform: 'uppercase', lineHeight: 1, fontFeatureSettings: '"tnum"',
                  }}>
                    <Gift size={9} strokeWidth={2.8} />
                    AED {amount.toFixed(0)} credit
                  </span>
                )
              })()}
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
              className="refer-copy-btn"
              style={{
                width: '100%', padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: referralCopied
                  ? '1.5px dashed var(--ds-success-border)'
                  : '1.5px dashed var(--ds-og-border-strong)',
                background: referralCopied ? 'var(--ds-success-wash)' : 'var(--ds-og-wash)',
                cursor: customerCid ? 'pointer' : 'default',
                textAlign: 'center', fontFamily: BODY,
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 200ms, border-color 200ms, transform 120ms cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: D.fg, fontFeatureSettings: '"tnum"', marginBottom: 3, wordBreak: 'break-all' }}>
                {customerCid ? referralUrlDisplay(customerCid) : '—'}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: referralCopied ? 'var(--ds-success-fg)' : D.fgMuted }}>
                {referralCopied ? <><Check size={11} strokeWidth={2.6} /> Copied</> : <>Tap to copy</>}
              </div>
            </button>

            {/* ── WhatsApp share ── */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `I get fresh meals delivered to my dorm from Dormers — try your first meal free: ${referralUrl(customerCid)}`,
              )}`}
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
            intakePaused={intakePaused}
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
              {/* Desktop only — bug-report is a desktop affordance, and on mobile
                  the sheet's focus trap would land on it and auto-show its
                  tooltip. Dropping it here removes the focus target entirely. */}
              {!compact && <BugReportIconButton />}
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
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-fg-muted)', fontFamily: BODY, fontSize: 13, fontWeight: 600 }}
                >
                  <LogOut size={14} strokeWidth={2} />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
    </>
  )

  const styleBlock = (
    <style jsx global>{`
      /* Copy button — instant press feedback (<100ms) so the tap registers on
         touch before the copy completes, then the success state animates in. */
      .refer-copy-btn:active:not(:disabled) { transform: scale(0.985); }
      .utility-row:hover { background: var(--ds-og-wash) !important; }
      .utility-signout-row:hover { background: var(--ds-danger-wash) !important; color: var(--ds-danger-fg) !important; }
      .utility-bug-row:hover { background: var(--ds-og-wash) !important; color: ${OG} !important; }
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
  )

  // ── Mobile (<768): present as a bottom sheet. PORTALED to <body> so it
  //    escapes the sidebar's translateX() transform — a transformed ancestor
  //    becomes the containing block for fixed children, which would otherwise
  //    drag the fixed sheet off-screen with the closing drawer. The negative
  //    side-margin lets each panel's own padding + full-bleed dividers govern.
  //    Dismiss via grab handle / swipe / scrim (hideClose avoids colliding with
  //    the panels' own top-right header elements). ──
  if (compact) {
    const sheet = (
      <>
        <MobileSheet
          open
          onClose={() => setOpenDropdown(null)}
          hideClose
          ariaLabel={openDropdown === 'dormwars' ? 'Refer and earn' : openDropdown === 'notif' ? 'Now' : 'Account menu'}
        >
          <div style={{ margin: '0 -20px' }}>{body}</div>
        </MobileSheet>
        {styleBlock}
      </>
    )
    return typeof document !== 'undefined' ? createPortal(sheet, document.body) : null
  }

  // ── Desktop: the rail-anchored frosted popover, emerging from the icon. ──
  return (
    <>
      <motion.div
        ref={dropdownRef}
        // Soft scale-in from the sidebar's edge; transform-origin on the LEFT
        // so it reads as growing out of the icon. Quart-out, no spring.
        initial={{ opacity: 0, scale: 0.96, x: -6 }}
        animate={{ opacity: 1, scale: 1,    x:  0 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        style={{
          position: 'absolute',
          left: 'calc(100% + 8px)',
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
        {body}
      </motion.div>
      {styleBlock}
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
  intakePaused,
  onItemClick,
}: {
  weeklyReviewState: WeeklyReviewState
  monthlyWindow: MonthlyReviewWindow
  intakePaused: boolean
  onItemClick: () => void
}) {
  const { current, late, justSubmitted, rewards } = weeklyReviewState
  const monthlyLive = monthlyWindow.eligible
  // A locked weekly wrap (day 4 up to the 5th delivered meal) shows in the
  // tray so the reward is discoverable early, but it is not a to-do yet.
  const monthlyLocked = monthlyWindow.locked
  const hasContent = !!current || late.length > 0 || !!justSubmitted || monthlyLive || monthlyLocked || intakePaused
  // Monthly plans (Premium/Max) have multiple weekly reviews in a cycle; the
  // all-or-nothing rule only applies to them. Weekly plans no longer have
  // weekly reviews at all — the wrap is their only survey.
  const showAllOrNothing = rewards.total > 1 && (current || late.length > 0)
  // Intake-pause entries are quiet/persistent state, not decisive to-dos with
  // a deadline — they deliberately don't count toward the "N live" chip or
  // the sidebar rail's numeric badge (see Sidebar.tsx nowPendingCount). A
  // locked wrap is excluded for the same reason: nothing to act on yet.
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
          {(monthlyLive || monthlyLocked) && <MonthlyWrapCard window={monthlyWindow} onClick={onItemClick} />}
          {showAllOrNothing && <AllOrNothingLine state={weeklyReviewState} />}
          {current && <PendingReviewCard data={current} onClick={onItemClick} />}
          {late.map(item => (
            <LateReviewRow key={item.week} data={item} onClick={onItemClick} />
          ))}
          {justSubmitted && !current && late.length === 0 && !monthlyLive && (
            <JustSubmittedRow week={justSubmitted.week} rewardPct={justSubmitted.rewardPct} />
          )}
          {/* Seasonal intake pause — quiet residue rows, last in the stack so
              the decisive review/wrap actions above keep the primary spot.
              See project_now_tray_architecture: time-bound state lives here,
              not on content pages. */}
          {intakePaused && <IntakePausedRow onClick={onItemClick} />}
        </div>
      )}
    </>
  )
}

// Quiet, factual residue of the seasonal-pause takeover (Task 15) — no date,
// no countdown, no reopening estimate. Links to the plan page rather than
// carrying its own action; the one-tap join lives on IntakePausedGate /
// PlanEndingPausedBanner, not duplicated here.
function IntakePausedRow({ onClick }: { onClick: () => void }) {
  return (
    <Link
      href="/dashboard/plan"
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
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-fg)', lineHeight: 1.2 }}>
          New plans paused
        </div>
        <div style={{ fontSize: 11, color: 'var(--ds-fg-muted)', marginTop: 2, lineHeight: 1.3 }}>
          We are between semesters.
        </div>
      </div>
      <ChevronRight size={13} strokeWidth={2.2} color="var(--ds-fg-tint)" style={{ flexShrink: 0 }} />
    </Link>
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

// Cycle-stakes summary. Four states by reward progress:
//   • all in    → success tone, "Cycle locked in"
//   • none in   → orange tone, "Submit all N to lock AED X"
//   • partial   → orange tone, two-segment chip:
//                 "[✓] AED X ready · [+] AED Y to claim"
//
// The partial-state chip used to read "N/M in · AED 9 on the line" — a
// single number that collapsed three distinct sub-buckets (submitted
// on-time, submitted late, still earnable) into one figure. Users
// couldn't tell what was already banked vs what was still up for grabs,
// and "on the line" doesn't carry urgency or signal "yours to lose."
// The two-segment treatment splits the same total into:
//   ready  = aedPending - aedToGo   → already submitted, awaiting cycle lock
//   claim  = aedToGo                → unsubmitted, still earnable
// The icon prefix (check vs plus) does the semantic lifting so the line
// can carry both numbers without becoming a sentence.
function AllOrNothingLine({ state }: { state: WeeklyReviewState }) {
  const { rewards, current, late } = state
  const submitted = rewards.submitted
  const total = rewards.total
  const earned = rewards.aedEarned
  const pending = rewards.aedPending
  const allIn = submitted >= total

  // Earnable from still-unsubmitted slots — current week at full reward,
  // each late slot at the late reward. Mirrors the breakdown in
  // weekly-review-queries.ts so the math here stays in lockstep with
  // what produced `pending`.
  const aedToClaim = (current ? BASE_REWARD_AED : 0) + late.length * LATE_REWARD_AED
  const aedReady = Math.max(0, pending - aedToClaim)

  // Partial state — the only case where one-liner copy fails. Render a
  // two-segment chip so each number carries its own meaning.
  if (!allIn && submitted > 0) {
    const fg = '#8c4214'
    return (
      <div
        aria-label={`${submitted} of ${total} submitted · AED ${aedReady} ready · AED ${aedToClaim} still to claim`}
        style={{
          padding: '7px 10px', borderRadius: 'var(--radius-sm)',
          background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: BODY, fontSize: 11, fontWeight: 700, color: fg,
          lineHeight: 1.2, fontFeatureSettings: '"tnum"',
        }}
      >
        {aedReady > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={11} strokeWidth={2.6} />
            <span>AED {aedReady} ready</span>
          </span>
        )}
        {aedReady > 0 && aedToClaim > 0 && (
          <span aria-hidden style={{ color: 'rgba(140,66,20,0.45)' }}>·</span>
        )}
        {aedToClaim > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} strokeWidth={2.6} />
            <span>AED {aedToClaim} to claim</span>
          </span>
        )}
      </div>
    )
  }

  // All-in and zero-submitted states still read clearly as one line.
  const body = allIn
    ? `All ${total} in · AED ${earned} locked`
    : `Submit all ${total} on time for AED ${total * BASE_REWARD_AED}`
  const tone: 'success' | 'urgent' = allIn ? 'success' : 'urgent'
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

  // Locked weekly preview: same card silhouette so it reads as the same thing
  // that will later go live, but flat (no orange edge, no shadow) and inert.
  // The dashed CTA is the house disabled affordance — it matches the greyed
  // "Plan a skip" / "Pause" buttons on the mobile home card.
  if (window.locked) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '12px 12px 12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--ds-surface)',
        border: '1px solid var(--ds-border-soft)',
        color: 'var(--ds-fg)', fontFamily: BODY,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--ds-fg-muted)',
          }}>
            {vocab.qualifier} wrap
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
            padding: '2px 7px', borderRadius: 999,
            background: 'rgba(9,24,37,0.06)', color: 'var(--ds-fg-muted)',
            border: '1px solid rgba(9,24,37,0.18)',
          }}>
            Locked
          </span>
        </div>

        <div style={{
          fontSize: 15, fontWeight: 800, color: 'var(--ds-fg-muted)',
          letterSpacing: '-0.005em', lineHeight: 1.15,
        }}>
          Wrap your {cycleLabel}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ds-fg-faint)', lineHeight: 1.35 }}>
          Opens after your {WEEKLY_WRAP_UNLOCK_MEALS}th meal
        </div>

        <div style={{
          marginTop: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px 10px', borderRadius: 999,
          border: '1px dashed rgba(9,24,37,0.28)',
          color: 'var(--ds-fg-faint)',
          fontSize: 11, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          +AED {MONTHLY_REWARD_AED} waiting
        </div>
      </div>
    )
  }

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

// Bug-report icon at the top-right of the profile dropdown's avatar header.
// Mirrors the floating BugReportTrigger pattern — Sentry's user-feedback
// dialog attaches imperatively on mount, detaches on unmount (the dropdown
// remounts every open, so this is safe).
//
// Tooltip is state-driven rather than the global [data-tooltip] helper
// because body.dropdown-open globally suppresses data-tooltip popups
// (so they don't clash with open panels). We still want a hint here so
// users know what the icon does — a small inline tooltip handles it.
function BugReportIconButton() {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const button = buttonRef.current
    if (!button) return
    const feedback = Sentry.getFeedback()
    if (!feedback) return
    const unsubscribe = feedback.attachTo(button)
    return () => { if (typeof unsubscribe === 'function') unsubscribe() }
  }, [])

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <div
        role="tooltip"
        aria-hidden={!hover}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          fontFamily: BODY,
          fontSize: 10, fontWeight: 700,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: '#f5f0e8',
          background: 'var(--ds-fg, #091825)',
          padding: '6px 10px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateY(0)' : 'translateY(-2px)',
          pointerEvents: 'none',
          transition: 'opacity 140ms ease, transform 140ms ease',
          boxShadow: '0 4px 12px rgba(9,24,37,0.18)',
          zIndex: 1,
        }}
      >
        Report a bug
      </div>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Report a bug"
        className="utility-bug-row"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, padding: '0 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ds-fg-muted)', flexShrink: 0,
        }}
      >
        <Bug size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

