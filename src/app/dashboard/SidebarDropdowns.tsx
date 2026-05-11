'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check, ChevronRight, CreditCard, LogOut, MessagesSquare,
  User as UserIcon,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV2, BODY } from './_shared/tokens'

export type DropdownKind = 'notif' | 'profile' | 'dormwars' | null

// Theme-aware tokens for the dropdowns (which sit over a navy sidebar).
// Variables flip in dark mode via globals.css → the panels remain
// readable in either palette.
const D = {
  fg:       'var(--ds-fg)',
  fgMuted:  'var(--ds-fg-muted)',
}

interface Props {
  openDropdown: DropdownKind
  setOpenDropdown: (k: DropdownKind) => void
  onMobileClose?: () => void
  customerCid: string
  referralCount: number
  displayName: string
  userEmail: string
  initials: string
}

/**
 * Dropdown panel anchored to the sidebar's right edge — owns the three
 * conditional bodies (DormWars, Notifications, Profile), the referral-
 * copy state, the outside-click / Escape handlers, and the
 * `body.dropdown-open` tooltip-suppression flag.
 */
export function SidebarDropdowns({
  openDropdown, setOpenDropdown, onMobileClose,
  customerCid, referralCount, displayName, userEmail, initials,
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
                    background: 'var(--ds-success-wash)', color: 'var(--ds-success-fg)',
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
                  ? '1.5px dashed var(--ds-success-border)'
                  : '1.5px dashed var(--ds-og-border-strong)',
                background: referralCopied
                  ? 'var(--ds-success-wash)'
                  : 'var(--ds-og-wash)',
                cursor: customerCid ? 'pointer' : 'default',
                textAlign: 'center',
                fontFamily: BODY,
                transition: 'background 200ms, border-color 200ms',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ds-fg-faint)', marginBottom: 6 }}>
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
                color: referralCopied ? 'var(--ds-success-fg)' : D.fgMuted,
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
          </div>
        )}

        {openDropdown === 'notif' && (
          <>
            <div style={{ padding: '10px 12px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ds-fg-tint)' }}>
              Notifications
            </div>
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ds-fg-faint)', fontSize: 13 }}>
              You&rsquo;re all caught up.
            </div>
          </>
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
      </div>

      <style jsx global>{`
        .utility-row:hover { background: var(--ds-og-wash) !important; }
        .utility-signout-row:hover { background: var(--ds-danger-wash) !important; color: var(--ds-danger-fg) !important; }

        /* Suppress all data-tooltip while a dropdown is open */
        body.dropdown-open [data-tooltip]::after,
        body.dropdown-open [data-tooltip]::before {
          display: none !important;
        }
      `}</style>
    </>
  )
}

