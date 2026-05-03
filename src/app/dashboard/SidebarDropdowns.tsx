'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check, ChevronRight, CreditCard, LogOut, MessagesSquare, Moon, Sun,
  User as UserIcon,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV, NV2, BODY } from './_shared/tokens'

export type DropdownKind = 'notif' | 'settings' | 'profile' | 'dormwars' | null

// Light-surface tokens for the dropdowns (which sit over a navy sidebar).
const D = {
  fg:       NV,
  fgMuted:  'rgba(9,24,37,0.65)',
}

interface Props {
  openDropdown: DropdownKind
  setOpenDropdown: (k: DropdownKind) => void
  customerCid: string
  referralCount: number
  displayName: string
  userEmail: string
  initials: string
}

/**
 * Dropdown panel anchored to the sidebar's right edge — owns the four
 * conditional bodies (DormWars, Notifications, Settings, Profile) along
 * with their local state (referralCopied, theme), the outside-click /
 * Escape handlers, and the `body.dropdown-open` tooltip-suppression flag.
 *
 * Was 196 inline LOC + ~25 CSS lines + 4 effects in Sidebar.tsx.
 */
export function SidebarDropdowns({
  openDropdown, setOpenDropdown, customerCid, referralCount,
  displayName, userEmail, initials,
}: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [referralCopied, setReferralCopied] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Persisted theme — read on mount, write on toggle.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('dormers-settings') || '{}')
      if (s.theme) { setTheme(s.theme); applyTheme(s.theme) }
    } catch {}
  }, [])

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
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [openDropdown, setOpenDropdown])

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

  const copyReferralCode = () => {
    if (!customerCid) return
    navigator.clipboard.writeText(customerCid).then(() => {
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 1500)
    })
  }

  if (!openDropdown) return null

  return (
    <>
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
              <ToggleSwitch on={theme === 'dark'} />
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

      <style jsx global>{`
        .utility-row:hover { background: rgba(9,24,37,0.05) !important; }
        .utility-signout-row:hover { background: rgba(239,68,68,0.07) !important; color: #b91c1c !important; }

        /* Suppress all data-tooltip while a dropdown is open */
        body.dropdown-open [data-tooltip]::after,
        body.dropdown-open [data-tooltip]::before {
          display: none !important;
        }
      `}</style>
    </>
  )
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 36, height: 20, borderRadius: 999, background: on ? OG : 'rgba(9,24,37,0.14)', transition: 'background 200ms', position: 'relative', flexShrink: 0, display: 'inline-block' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
    </span>
  )
}
