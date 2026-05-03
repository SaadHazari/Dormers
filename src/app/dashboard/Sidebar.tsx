'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Utensils, CalendarDays, MessagesSquare, Trophy, Compass,
  LogOut, X, Bell, Settings, Sun, Moon, ChevronRight, User as UserIcon, CreditCard,
  Gift, Check,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV, NV2, CR, BODY } from './_shared/tokens'

// Surface tokens for the navy sidebar — opacities tuned for AA contrast against #1e3a4f
const S = {
  divider:  'rgba(237,232,218,0.10)',
  fgIdle:   'rgba(237,232,218,0.72)',  // ~6:1 vs NV2
  fgMuted:  'rgba(237,232,218,0.55)',
  fgSub:    'rgba(237,232,218,0.45)',
}

// Light-surface tokens for the dropdowns (which stay light over a navy sidebar)
const D = {
  fg:       NV,
  fgMuted:  'rgba(9,24,37,0.65)',
  border:   'rgba(9,24,37,0.10)',
}

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; soon?: boolean }
const NAV: NavItem[] = [
  { label: 'My Dashboard',    href: '/dashboard',                icon: LayoutDashboard },
  { label: 'My Menu',         href: '/dashboard/menu',           icon: Utensils       },
  { label: 'My Plan',         href: '/dashboard/plan',           icon: CalendarDays   },
  { label: 'Explore Plans',   href: '/dashboard/explore-plans',  icon: Compass        },
  { label: 'Dorm Wars',       href: '/dashboard/dorm-wars',      icon: Trophy, soon: true },
  { label: 'Help & Support',  href: '/dashboard/support',        icon: MessagesSquare },
]

interface Props {
  customerName: string
  customerCid: string
  customerDorm: string
  userEmail: string
  notificationCount?: number
  referralCount?: number
  mobileOpen?: boolean
  onMobileClose?: () => void
}

type DropdownKind = 'notif' | 'settings' | 'profile' | 'dormwars' | null

export default function Sidebar({
  customerName, customerCid, customerDorm, userEmail,
  notificationCount = 0, referralCount = 0, mobileOpen = false, onMobileClose,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [hover, setHover] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [referralCopied, setReferralCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
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

  const copyReferralCode = () => {
    if (!customerCid) return
    navigator.clipboard.writeText(customerCid).then(() => {
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 1500)
    })
  }

  const displayName = customerName || userEmail.split('@')[0] || ''
  const parts = displayName.split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname?.startsWith(href)

  // Persisted theme
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('dormers-settings') || '{}')
      if (s.theme) { setTheme(s.theme); applyTheme(s.theme) }
    } catch {}
  }, [])
  function applyTheme(t: 'light' | 'dark') {
    if (t === 'light') document.documentElement.classList.add('light')
    else               document.documentElement.classList.remove('light')
  }
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next); applyTheme(next)
    try {
      const cur = JSON.parse(localStorage.getItem('dormers-settings') || '{}')
      localStorage.setItem('dormers-settings', JSON.stringify({ ...cur, theme: next }))
    } catch {}
  }

  // Suppress tooltips while ANY dropdown is open + close on Escape + outside-click
  useEffect(() => {
    if (openDropdown) document.body.classList.add('dropdown-open')
    else              document.body.classList.remove('dropdown-open')
    return () => { document.body.classList.remove('dropdown-open') }
  }, [openDropdown])

  useEffect(() => {
    if (!openDropdown) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDropdown(null) }
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [openDropdown])

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
                <Icon size={18} strokeWidth={active ? 2.4 : 2} style={{ flexShrink: 0 }} />
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
            data-tooltip={referralCount > 0 ? `Refer & earn — ${referralCount} referred` : 'Refer a friend, earn a meal'}
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
              {referralCount > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  minWidth: 14, height: 14, borderRadius: 999,
                  background: '#1d8a30', color: '#fff',
                  fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', lineHeight: 1,
                }}>
                  {referralCount > 9 ? '9+' : referralCount}
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

          <button
            type="button"
            onClick={() => setOpenDropdown(d => d === 'settings' ? null : 'settings')}
            data-tooltip="Settings"
            data-tooltip-placement="right"
            aria-label="Settings"
            className={openDropdown === 'settings' ? 'sidebar-nav-active' : 'sidebar-nav-item'}
            style={{ ...rowStyle(openDropdown === 'settings'), background: openDropdown === 'settings' ? 'rgba(237,232,218,0.08)' : 'transparent', border: '1px solid transparent', color: S.fgIdle }}
          >
            <Settings size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={labelStyle}>Settings</span>
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

        {/* ── Dropdowns — anchored to sidebar's right edge ───────────────────── */}
        {openDropdown && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              left: 'calc(100% + 8px)',
              // Notifications, settings, and profile all anchor near the bottom now
              // since utilities sit just above the profile chip.
              ...(openDropdown === 'dormwars' ? { bottom: 168 } :
                  openDropdown === 'notif'    ? { bottom: 110 } :
                  openDropdown === 'settings' ? { bottom: 64 }  :
                                                { bottom: 16 }),
              minWidth: 280,
              background: 'rgba(255,255,255,0.99)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(9,24,37,0.10)',
              boxShadow: 'var(--shadow-lg)',
              padding: openDropdown === 'profile' ? 0 : 8,
              fontFamily: BODY, zIndex: 200,
              overflow: 'hidden',
            }}
          >
            {openDropdown === 'dormwars' && (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG }}>
                      Dorm Wars
                    </div>
                    {referralCount > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(29,138,48,0.12)', color: '#1d8a30',
                        fontSize: 11, fontWeight: 800,
                        letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
                        fontFeatureSettings: '"tnum"',
                      }}>
                        <Check size={10} strokeWidth={2.6} />
                        {referralCount} referred
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, color: D.fg, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    Refer a friend, earn a meal.
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: D.fgMuted, lineHeight: 1.5 }}>
                    {referralCount > 0
                      ? 'Keep the streak going — share your code below.'
                      : 'Be the first in your dorm to send your code.'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyReferralCode}
                  disabled={!customerCid}
                  aria-label={customerCid ? `Copy referral code ${customerCid}` : 'No referral code yet'}
                  style={{
                    width: '100%', padding: '14px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: referralCopied
                      ? '1.5px dashed rgba(29,138,48,0.45)'
                      : '1.5px dashed rgba(245,127,32,0.40)',
                    background: referralCopied
                      ? 'rgba(29,138,48,0.06)'
                      : 'rgba(245,127,32,0.04)',
                    cursor: customerCid ? 'pointer' : 'default',
                    textAlign: 'center',
                    fontFamily: BODY,
                    transition: 'background 200ms, border-color 200ms',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.45)', marginBottom: 6 }}>
                    Your referral code
                  </div>
                  <div style={{
                    fontSize: 28, fontWeight: 900, color: D.fg,
                    letterSpacing: '0.10em', fontFeatureSettings: '"tnum"',
                    lineHeight: 1, marginBottom: 6,
                  }}>
                    {customerCid || '—'}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                    color: referralCopied ? '#1d8a30' : D.fgMuted,
                  }}>
                    {referralCopied ? (
                      <><Check size={11} strokeWidth={2.6} /> Copied</>
                    ) : (
                      <>Tap to copy</>
                    )}
                  </div>
                </button>

                <a
                  href={`https://wa.me/?text=I%20get%20fresh%20meals%20delivered%20to%20my%20dorm%20from%20Dormers%27%20using%20code%20${customerCid}%20%E2%80%94%20try%20it%3A%20dormers.ae`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpenDropdown(null)}
                  style={{
                    padding: '11px 14px', borderRadius: 999,
                    background: 'rgba(37,211,102,0.09)',
                    border: '1.5px solid rgba(37,211,102,0.45)',
                    color: '#1a9e50',
                    fontSize: 12, fontWeight: 800,
                    letterSpacing: '0.04em', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%',
                  }}
                >
                  Share on WhatsApp
                  <ChevronRight size={14} strokeWidth={2.4} />
                </a>
              </div>
            )}

            {openDropdown === 'notif' && (
              <>
                <div style={{ padding: '10px 12px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.40)' }}>
                  Notifications
                </div>
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'rgba(9,24,37,0.45)', fontSize: 13 }}>
                  You&rsquo;re all caught up.
                </div>
              </>
            )}

            {openDropdown === 'settings' && (
              <>
                <div style={{ padding: '10px 12px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,24,37,0.40)' }}>
                  Appearance
                </div>
                <button
                  onClick={toggleTheme}
                  className="utility-row"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: BODY }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {theme === 'light' ? <Sun size={14} color={D.fg} /> : <Moon size={14} color={D.fg} />}
                    <span style={{ fontSize: 13, fontWeight: 500, color: D.fg }}>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
                  </span>
                  <Toggle on={theme === 'dark'} />
                </button>
              </>
            )}

            {openDropdown === 'profile' && (
              <>
                <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(9,24,37,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
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
                      onClick={() => setOpenDropdown(null)}
                      className="utility-row"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', color: D.fg, fontSize: 13, fontWeight: 500 }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icon size={14} strokeWidth={2} color={D.fg} />
                        {label}
                      </span>
                      <ChevronRight size={13} color="rgba(9,24,37,0.35)" />
                    </Link>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid rgba(9,24,37,0.07)', padding: 6 }}>
                  <form action={signout}>
                    <button
                      type="submit"
                      className="utility-signout-row"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(9,24,37,0.65)', fontFamily: BODY, fontSize: 13, fontWeight: 600 }}
                    >
                      <LogOut size={14} strokeWidth={2} />
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}
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
        .utility-row:hover { background: rgba(9,24,37,0.05) !important; }
        .utility-signout-row:hover { background: rgba(239,68,68,0.07) !important; color: #b91c1c !important; }

        /* Suppress all data-tooltip while a dropdown is open */
        body.dropdown-open [data-tooltip]::after,
        body.dropdown-open [data-tooltip]::before {
          display: none !important;
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

function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{ width: 36, height: 20, borderRadius: 999, background: on ? OG : 'rgba(9,24,37,0.14)', transition: 'background 200ms', position: 'relative', flexShrink: 0, display: 'inline-block' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
    </span>
  )
}
