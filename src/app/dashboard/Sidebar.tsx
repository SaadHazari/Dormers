'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Utensils, CalendarDays, MessagesSquare, Trophy, Compass,
  X, Bell, Sun, Moon, Gift,
} from 'lucide-react'
import { OG, OG3, NV2, CR, BODY } from './_shared/tokens'
import { SidebarDropdowns, type DropdownKind } from './SidebarDropdowns'
import type { ReferralData } from '@/utils/supabase/queries'
import type { WeeklyReviewBadge } from '@/lib/weekly-review'

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
  notificationCount?: number
  referralData?: ReferralData
  mobileOpen?: boolean
  onMobileClose?: () => void
  /** When set to 'active' or 'late', renders a small dot on the My Menu icon to signal a pending weekly review. */
  weeklyReviewBadge?: WeeklyReviewBadge
}

export default function Sidebar({
  customerName, customerCid, customerDorm, userEmail,
  notificationCount = 0, referralData = DEFAULT_REFERRAL, mobileOpen = false, onMobileClose,
  weeklyReviewBadge = 'none',
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [hover, setHover] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const drawerOpen = mobileOpen

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

  // Persisted theme — read on mount, write on toggle.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('dormers-settings') || '{}')
      if (s.theme === 'light' || s.theme === 'dark') {
        setTheme(s.theme)
        applyTheme(s.theme)
      }
    } catch {}
  }, [])

  function applyTheme(t: 'light' | 'dark') {
    if (t === 'light') document.documentElement.classList.add('light')
    else               document.documentElement.classList.remove('light')
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(next)
    try {
      const cur = JSON.parse(localStorage.getItem('dormers-settings') || '{}')
      localStorage.setItem('dormers-settings', JSON.stringify({ ...cur, theme: next }))
    } catch {}
  }

  const displayName = customerName || userEmail.split('@')[0] || ''
  const parts = displayName.split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname?.startsWith(href)

  // Item base style — used for both nav links and utility icon-rows
  const rowStyle = (active = false, soon = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center',
    gap: hover ? 12 : 0,
    justifyContent: hover ? 'flex-start' : 'center',
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
    opacity: hover ? 1 : 0,
    maxWidth: hover ? 200 : 0,
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
          width: hover ? 240 : 76,
          padding: '14px 12px',
          background: NV2,
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 12px 40px rgba(9,24,37,0.25)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 220ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* Mobile close button */}
        {drawerOpen && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => onMobileClose?.()}
              aria-label="Close menu"
              style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${S.divider}`, background: 'rgba(237,232,218,0.06)', color: CR, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>
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
          <img
            src="/logo-dark.svg"
            alt="Dormers"
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

            const showBadge = item.href === '/dashboard/menu' && weeklyReviewBadge !== 'none'
            const badgeIsActive = weeklyReviewBadge === 'active'

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
                  {showBadge && (
                    <span
                      aria-label={badgeIsActive ? 'Weekly review pending' : 'Late weekly review'}
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: badgeIsActive ? OG : 'rgba(237,232,218,0.45)',
                        border: `2px solid ${NV2}`,
                        boxShadow: badgeIsActive ? '0 0 6px rgba(245,127,32,0.7)' : 'none',
                      }}
                    />
                  )}
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
              gap: hover ? 10 : 0,
              justifyContent: hover ? 'flex-start' : 'center',
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

        {/* ── Utility row (notifications + settings) — sits just above profile ─ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setOpenDropdown(d => d === 'notif' ? null : 'notif')}
            data-tooltip={notificationCount > 0 ? `${notificationCount} new notification${notificationCount === 1 ? '' : 's'}` : 'Notifications'}
            data-tooltip-placement="right"
            aria-label="Notifications"
            className={openDropdown === 'notif' ? 'sidebar-nav-active' : 'sidebar-nav-item'}
            style={{ ...rowStyle(openDropdown === 'notif'), background: openDropdown === 'notif' ? 'rgba(237,232,218,0.08)' : 'transparent', border: '1px solid transparent', color: S.fgIdle }}
          >
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <Bell size={18} strokeWidth={2} />
              {notificationCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 999, background: '#e53e3e', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </span>
            <span style={labelStyle}>Notifications</span>
          </button>

          {/* Direct theme toggle — replaces the old Settings dropdown
              (which only ever held this single control). One tap flips
              light/dark, no intermediate menu. Icon + label both reflect
              the CURRENT mode, matching the previous dropdown labelling. */}
          <button
            type="button"
            onClick={toggleTheme}
            data-tooltip={theme === 'light' ? 'Light mode — tap for dark' : 'Dark mode — tap for light'}
            data-tooltip-placement="right"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-pressed={theme === 'dark'}
            className="sidebar-nav-item"
            style={{ ...rowStyle(false), background: 'transparent', border: '1px solid transparent', color: S.fgIdle }}
          >
            {theme === 'light'
              ? <Sun  size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
              : <Moon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />}
            <span style={labelStyle}>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>

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
              gap: hover ? 10 : 0,
              justifyContent: hover ? 'flex-start' : 'center',
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
            <div style={{ minWidth: 0, opacity: hover ? 1 : 0, maxWidth: hover ? 160 : 0, overflow: 'hidden', transition: 'opacity 180ms, max-width 220ms', whiteSpace: 'nowrap' }}>
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
          displayName={displayName}
          userEmail={userEmail}
          initials={initials}
        />
      </aside>

      <style jsx global>{`
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
