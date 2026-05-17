'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check, ChevronRight, CreditCard, LogOut, MessagesSquare,
  User as UserIcon, Gift, ArrowRight,
} from 'lucide-react'
import { signout } from '@/app/login/actions'
import { OG, OG3, NV2, BODY } from './_shared/tokens'
import type { ReferralData } from '@/utils/supabase/queries'

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
}

export function SidebarDropdowns({
  openDropdown, setOpenDropdown, onMobileClose,
  customerCid, referralData, displayName, userEmail, initials,
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

