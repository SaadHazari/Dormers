'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Utensils, CalendarDays, MessagesSquare, Trophy, Compass,
  X, Activity, Gift, Shield,
} from 'lucide-react'
import { OG, OG3, NV2, CR, BODY } from './_shared/tokens'
import { SidebarDropdowns, type DropdownKind } from './SidebarDropdowns'
import type { ReferralData } from '@/infra/supabase/referrals-repo'
import { EMPTY_REVIEW_STATE, badgeFromReviewState, type WeeklyReviewState } from '@/contexts/subscriptions/domain/weekly-review'
import { monthlyBadgeFromWindow, type MonthlyReviewWindow } from '@/contexts/subscriptions/domain/monthly-review'

const EMPTY_MONTHLY_WINDOW: MonthlyReviewWindow = {
  eligible: false, submitted: false,
  daysLeftForFullReward: 0, daysSinceCycleEnd: 0,
  expired: false, preCron: false, cycleLabel: null, planTier: 'monthly',
}

// Surface tokens for the navy sidebar — opacities tuned for AA contrast against #1e3a4f
const S = {
  divider:  'rgba(237,232,218,0.10)',
  fgIdle:   'rgba(237,232,218,0.72)',  // ~6:1 vs NV2
  fgMuted:  'rgba(237,232,218,0.55)',
  fgSub:    'rgba(237,232,218,0.45)',
}

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; soon?: boolean }
const NAV: NavItem[] = [
  { label: 'My Dashboard',    href: '/dashboard',                icon: LayoutDashboard },
  { label: 'My Menu',         href: '/dashboard/menu',           icon: Utensils       },
  { label: 'My Plan',         href: '/dashboard/plan',           icon: CalendarDays   },
  { label: 'Explore Plans',   href: '/dashboard/explore-plans',  icon: Compass        },
  { label: 'Dorm Wars',       href: '/dashboard/dorm-wars',      icon: Trophy },
  { label: 'Help & Support',  href: '/dashboard/support',        icon: MessagesSquare },
]

const DEFAULT_REFERRAL: ReferralData = { total: 0, converted: 0, creditBalance: 0, creditPending: 0 }

interface Props {
  customerName: string
  customerCid: string
  customerDorm: string
  userEmail: string
  isAdmin?: boolean
  referralData?: ReferralData
  /** Premium/Max → has Dorm Wars access (badge shows the live wallet). Others
   *  treat Refer & Earn standalone (badge shows referral-only earnings). */
  dormWarsEligible?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
  /** Pending/late weekly reviews — drives weekly tray content. */
  weeklyReviewState?: WeeklyReviewState
  /** Monthly wrap window state — drives the wrap tray card + combined badge. */
  monthlyWindow?: MonthlyReviewWindow
}

export default function Sidebar({
  customerName, customerCid, customerDorm, userEmail,
  isAdmin = false,
  referralData = DEFAULT_REFERRAL, dormWarsEligible = false, mobileOpen = false, onMobileClose,
  weeklyReviewState = EMPTY_REVIEW_STATE,
  monthlyWindow = EMPTY_MONTHLY_WINDOW,
}: Props) {
  // Combined badge state for the Now tray icon — escalates by precedence:
  //   'active' (orange dot) > 'late' (muted dot) > 'none' (no dot)
  // Lives on the tray, not on the My Menu icon — reviews + wrap are
  // time-bound items and belong to the tray's mental model, not the menu's
  // "what am I eating" model.
  const weeklyBadge  = badgeFromReviewState(weeklyReviewState)
  const monthlyBadge = monthlyBadgeFromWindow(monthlyWindow)
  const nowBadge =
    weeklyBadge === 'active' || monthlyBadge === 'active' ? 'active'
    : weeklyBadge === 'late'  || monthlyBadge === 'late'  ? 'late'
    : 'none'
  // Count of pending Now-tray items — drives the numeric badge that
  // replaced the orange dot. Mirrors the liveCount computed inside
  // SidebarDropdowns' NowTray so the badge can't disagree with the tray.
  const monthlyLive = monthlyWindow.eligible && !monthlyWindow.submitted && !monthlyWindow.expired
  const nowPendingCount =
    (weeklyReviewState.current ? 1 : 0)
    + weeklyReviewState.late.length
    + (monthlyLive ? 1 : 0)
  // Graded urgency drives the dot's pulse animation. Active + something
  // close to a deadline → pulsing halo. Active but several days out →
  // quiet dot, no pulse. Two-tier signal so customers with 5d left don't
  // get the same visual alarm as someone on their last day.
  //   weekly current: ≤1 day for full reward → urgent
  //   monthly: last-day-of-7 OR pre-cron (last delivery evening) → urgent
  const isUrgent =
    nowBadge === 'active' && (
      (weeklyReviewState.current?.daysLeft ?? Infinity) <= 1
      || monthlyWindow.preCron
      || (monthlyWindow.eligible
          && monthlyWindow.daysLeftForFullReward === 0
          && monthlyWindow.daysSinceCycleEnd <= 7)
    )
  const pathname = usePathname()
  const router = useRouter()
  const [hover, setHover] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null)
  const drawerOpen = mobileOpen
  // The rail expands its labels on desktop hover. Touch devices never hover,
  // so the open mobile drawer must also count as "expanded" — otherwise the
  // 280px drawer renders a column of centered icons with the labels collapsed
  // to zero width. Drive every label/gap/justify off this, not `hover`.
  const expanded = hover || drawerOpen

  // Profile / History live in dropdowns and aren't visible at mount, so Next's
  // automatic Link prefetcher never sees them. Prefetch imperatively after a
  // brief idle so the user's first click into the profile menu feels instant.
  useEffect(() => {
    const idle = (cb: () => void) =>
      ('requestIdleCallback' in window
        ? (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(cb)
        : setTimeout(cb, 200))
    idle(() => {
      router.prefetch('/dashboard/profile')
      router.prefetch('/dashboard/history')
    })
  }, [router])

  // Collapse on navigate. Without this, dropdown links — which sit in a
  // panel that's a DOM child of <aside> but rendered visually OUTSIDE its
  // bounds (left: calc(100% + 8px)) — leave the sidebar stuck expanded
  // after click: the dropdown unmounts, the cursor lands in dead space,
  // and mouseleave never fires because the cursor never crossed <aside>'s
  // boundary. A pathname-watching reset catches every sidebar exit, so
  // this can't regress when new dropdown links are added later.
  useEffect(() => {
    setHover(false)
    setOpenDropdown(null)
  }, [pathname])

  const displayName = customerName || userEmail.split('@')[0] || ''
  const parts = displayName.split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname?.startsWith(href)

  // Item base style — used for both nav links and utility icon-rows
  const rowStyle = (active = false, soon = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center',
    gap: expanded ? 12 : 0,
    justifyContent: expanded ? 'flex-start' : 'center',
    padding: '11px 12px', borderRadius: 'var(--radius-sm)',
    fontFamily: BODY, fontSize: 13, fontWeight: 600,
    background: active ? 'rgba(245,127,32,0.18)' : 'transparent',
    border: active ? '1px solid rgba(245,127,32,0.32)' : '1px solid transparent',
    color: soon ? S.fgSub : (active ? OG : S.fgIdle),
    whiteSpace: 'nowrap',
    transition: 'background 150ms, color 150ms, border-color 150ms, gap 220ms',
    cursor: soon ? 'not-allowed' : 'pointer',
    width: '100%',
    textAlign: 'left',
    textDecoration: 'none',
  })

  const labelStyle: React.CSSProperties = {
    opacity: expanded ? 1 : 0,
    maxWidth: expanded ? 200 : 0,
    overflow: 'hidden',
    transition: 'opacity 180ms, max-width 220ms',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          role="presentation"
          onClick={() => onMobileClose?.()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,24,37,0.45)', zIndex: 50, backdropFilter: 'blur(4px)' }}
        />
      )}

      <aside
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        data-open={drawerOpen}
        className="dash-sidebar"
        style={{
          position: 'fixed', top: 16, left: 16, bottom: 16,
          zIndex: 60,
          width: expanded ? 240 : 76,
          padding: '14px 12px',
          background: NV2,
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 12px 40px rgba(9,24,37,0.25)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 220ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* Close — pinned to the drawer's top-right (the floating hamburger is
            hidden while open, so this is the one dismiss affordance). Absolute so
            it costs no vertical space: the logo + nav rise to fill the top. */}
        {drawerOpen && (
          <button
            type="button"
            onClick={() => onMobileClose?.()}
            aria-label="Close menu"
            style={{
              // Mirrors the hamburger exactly (white circle, navy glyph) so the
              // open/close affordance reads as one continuous control.
              position: 'absolute', top: 14, right: 14, zIndex: 2,
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(9,24,37,0.10)', background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(20px) saturate(1.4)', boxShadow: 'var(--shadow-md)',
              color: '#091825', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        )}

        {/* ── Logo / Wordmark ───────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px 6px', marginBottom: 18,
            height: 36,
            overflow: 'hidden',
            width: 52,
            alignSelf: 'flex-start',
            flexShrink: 0,
          }}
        >
          <Image
            src="/logo-dark.svg"
            alt="Dormers"
            width={140}
            height={32}
            priority
            style={{
              height: 32,
              width: 'auto',
              minWidth: 140,
              objectFit: 'contain',
            }}
          />
        </div>

        {/* ── Nav ─────────────────────────────────────────────────────────────── */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(item => {
            const active = isActive(item.href)
            const Icon = item.icon

            if (item.soon) {
              return (
                <button
                  key={item.href}
                  type="button"
                  disabled
                  data-tooltip={`${item.label} — coming soon`}
                  data-tooltip-placement="right"
                  className="sidebar-nav-item sidebar-nav-soon"
                  style={rowStyle(false, true)}
                >
                  <Icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {item.label}
                    <span style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 'var(--radius-pill)', background: 'rgba(245,127,32,0.10)', color: OG, border: '1px solid rgba(245,127,32,0.22)' }}>Soon</span>
                  </span>
                </button>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onMobileClose?.()}
                aria-current={active ? 'page' : undefined}
                data-tooltip={item.label}
                data-tooltip-placement="right"
                className={active ? 'sidebar-nav-active' : 'sidebar-nav-item'}
                style={rowStyle(active)}
              >
                <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                  <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span style={labelStyle}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Dorm Wars rail — its own small framed container above utilities ── */}
        <div
          style={{
            marginBottom: 12,
            padding: 6,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(245,127,32,0.10)',
            border: '1px solid rgba(245,127,32,0.22)',
          }}
        >
          <button
            type="button"
            onClick={() => setOpenDropdown(d => d === 'dormwars' ? null : 'dormwars')}
            data-tooltip={referralData.total > 0 ? `Refer & earn — ${referralData.total} referred` : 'Refer a friend, earn a meal'}
            data-tooltip-placement="right"
            aria-label="Refer a friend"
            className={openDropdown === 'dormwars' ? 'sidebar-nav-active' : 'sidebar-dormwars-row'}
            style={{
              display: 'flex', alignItems: 'center',
              gap: expanded ? 10 : 0,
              justifyContent: expanded ? 'flex-start' : 'center',
              padding: '9px 10px', borderRadius: 'var(--radius-sm)',
              fontFamily: BODY, fontSize: 12, fontWeight: 700,
              background: openDropdown === 'dormwars' ? 'rgba(245,127,32,0.18)' : 'transparent',
              border: 'none',
              color: OG3,
              whiteSpace: 'nowrap',
              transition: 'background 150ms, gap 220ms',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <Gift size={18} strokeWidth={2.2} />
              {referralData.total > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  minWidth: 14, height: 14, borderRadius: 999,
                  background: '#1d8a30', color: '#fff',
                  fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', lineHeight: 1,
                }}>
                  {referralData.total > 9 ? '9+' : referralData.total}
                </span>
              )}
            </span>
            <span style={labelStyle}>Refer & earn</span>
          </button>
        </div>

        {/* ── Utility row (Now tray + theme toggle) — sits just above profile ─
            "Now" is the home for time-bound items: pending weekly reviews,
            monthly wrap, anything with a deadline window. Repurposed from the
            old Notifications icon — the badge dot moved here from the My Menu
            icon because reviews/wrap belong to the tray's mental model, not
            the menu's "what am I eating today" model. See
            project_now_tray_architecture memory for the full design intent. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {(() => {
            // Notif-open state is the affordance the user reads to know
            // "this trigger is currently pressed — click again to close."
            // Stronger visual treatment than the other sidebar buttons'
            // open states because the tray has no panel-internal X; the
            // trigger button itself IS the dismiss affordance via toggle.
            const notifOpen = openDropdown === 'notif'
            return (
              <button
                type="button"
                onClick={() => setOpenDropdown(d => d === 'notif' ? null : 'notif')}
                data-tooltip={
                  notifOpen ? 'Close'
                  : nowBadge === 'active' ? 'Now — review pending'
                  : nowBadge === 'late' ? 'Now — late review'
                  : 'Now'
                }
                data-tooltip-placement="right"
                aria-label={
                  notifOpen ? 'Close Now tray'
                  : nowBadge === 'active' ? 'Now tray — weekly review pending'
                  : nowBadge === 'late' ? 'Now tray — late weekly review'
                  : 'Now tray'
                }
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
                className={notifOpen ? 'sidebar-now-armed' : 'sidebar-nav-item'}
                style={{
                  ...rowStyle(notifOpen),
                  // Stronger "armed" treatment when the tray is open — cream
                  // fill + visible cream border + brighter icon + inset
                  // press-shadow. Reads as "this is currently pressed" so
                  // the toggle-to-close affordance is obvious without a
                  // dedicated X. Idle stays untouched.
                  background: notifOpen ? 'rgba(237,232,218,0.14)' : 'transparent',
                  border: `1px solid ${notifOpen ? 'rgba(237,232,218,0.28)' : 'transparent'}`,
                  color: notifOpen ? CR : S.fgIdle,
                  boxShadow: notifOpen ? 'inset 0 1px 2px rgba(9,24,37,0.30)' : 'none',
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                  <Activity size={18} strokeWidth={notifOpen ? 2.4 : 2} />
                  {nowBadge !== 'none' && nowPendingCount > 0 && (
                    <span
                      aria-hidden
                      className={isUrgent ? 'now-count now-count-urgent' : 'now-count'}
                      data-tone={nowBadge}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -8,
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 8,
                        background: nowBadge === 'active' ? OG : 'rgba(237,232,218,0.55)',
                        color: nowBadge === 'active' ? '#fff' : NV2,
                        border: `2px solid ${NV2}`,
                        fontFamily: BODY,
                        fontSize: 10,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFeatureSettings: '"tnum"',
                      }}
                    >
                      {nowPendingCount > 9 ? '9+' : nowPendingCount}
                    </span>
                  )}
                </span>
                <span style={labelStyle}>Now</span>
              </button>
            )
          })()}

        </div>

        {/* ── Admin shortcut — visible only for allowlisted admin emails ──── */}
        {isAdmin && (
          <div style={{ marginBottom: 4 }}>
            <Link
              href="/admin"
              onClick={() => onMobileClose?.()}
              data-tooltip="Admin Panel"
              data-tooltip-placement="right"
              className="sidebar-nav-item"
              style={rowStyle(false)}
            >
              <Shield size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={labelStyle}>Admin Panel</span>
            </Link>
          </div>
        )}

        {/* ── Profile chip (button) — opens profile dropdown ───────────────── */}
        <div style={{ borderTop: `1px solid ${S.divider}`, paddingTop: 10 }}>
          <button
            type="button"
            onClick={() => setOpenDropdown(d => d === 'profile' ? null : 'profile')}
            data-tooltip="Your account"
            data-tooltip-placement="right"
            aria-label="Account menu"
            className="sidebar-profile-chip"
            style={{
              display: 'flex', alignItems: 'center',
              gap: expanded ? 10 : 0,
              justifyContent: expanded ? 'flex-start' : 'center',
              padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              background: openDropdown === 'profile' ? 'rgba(237,232,218,0.08)' : 'transparent',
              border: 'none', cursor: 'pointer',
              transition: 'background 150ms, gap 220ms',
              width: '100%', textAlign: 'left',
              fontFamily: BODY,
            }}
          >
            <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: `linear-gradient(135deg, ${OG3}, ${OG})`, color: NV2, fontFamily: BODY, fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(245,127,32,0.30)' }}>
              {initials}
            </div>
            <div style={{ minWidth: 0, opacity: expanded ? 1 : 0, maxWidth: expanded ? 160 : 0, overflow: 'hidden', transition: 'opacity 180ms, max-width 220ms', whiteSpace: 'nowrap' }}>
              <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: CR, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
              {customerCid && (
                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted, lineHeight: 1.2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerDorm ? `${customerDorm} · ` : ''}{customerCid}
                </div>
              )}
            </div>
          </button>
        </div>

        <SidebarDropdowns
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          onMobileClose={onMobileClose}
          customerCid={customerCid}
          referralData={referralData}
          dormWarsEligible={dormWarsEligible}
          displayName={displayName}
          userEmail={userEmail}
          initials={initials}
          weeklyReviewState={weeklyReviewState}
          monthlyWindow={monthlyWindow}
        />
      </aside>

      <style jsx global>{`
        /* Now-tray pending-count badge — three visual states. Color does most
           of the hierarchy work; the pulse animation reserves the loudest
           signal for urgent items (last-day-of-window) so the badge doesn't
           cry wolf every time something's merely pending. */
        .now-count {
          box-shadow: 0 0 0 0 rgba(245,127,32,0);
        }
        .now-count[data-tone="active"]:not(.now-count-urgent) {
          /* Quiet active — no pulse, soft halo. */
          box-shadow: 0 0 6px rgba(245,127,32,0.55);
        }
        .now-count-urgent {
          /* Urgent — slow breathing halo. 2.4s cycle, ease-in-out so it
             reads as living, not flashing. Wakes the eye without being
             aggressive. */
          animation: now-count-pulse 2.4s ease-in-out infinite;
        }
        @keyframes now-count-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,127,32,0.55), 0 0 4px rgba(245,127,32,0.40); }
          50%      { box-shadow: 0 0 0 4px rgba(245,127,32,0.00), 0 0 10px rgba(245,127,32,0.70); }
        }
        @media (prefers-reduced-motion: reduce) {
          .now-count-urgent { animation: none; box-shadow: 0 0 8px rgba(245,127,32,0.70); }
        }

        .sidebar-nav-item:hover:not([disabled]) {
          background: rgba(237,232,218,0.06) !important;
          border-color: rgba(237,232,218,0.10) !important;
          color: rgba(237,232,218,0.92) !important;
        }
        .sidebar-nav-soon:hover {
          background: transparent !important;
          border-color: transparent !important;
        }
        .sidebar-profile-chip:hover {
          background: rgba(237,232,218,0.06) !important;
        }
        .sidebar-dormwars-row:hover {
          background: rgba(245,127,32,0.10) !important;
        }
        @media (max-width: 1024px) {
          .dash-sidebar {
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            border-radius: 0 !important;
            transform: translateX(-100%);
            width: 280px !important;
            transition: transform 240ms cubic-bezier(.22,1,.36,1);
          }
          .dash-sidebar[data-open="true"] {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  )
}
