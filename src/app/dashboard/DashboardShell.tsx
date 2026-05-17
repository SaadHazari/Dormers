'use client'

import { useState } from 'react'
import { Menu as MenuIcon } from 'lucide-react'
import Sidebar from './Sidebar'
import type { ReferralData } from '@/utils/supabase/queries'

interface Props {
  customerName:  string
  customerCid:   string
  customerDorm:  string
  userEmail:     string
  planName:      string
  referralData?: ReferralData
  children: React.ReactNode
}

const DEFAULT_REFERRAL: ReferralData = { total: 0, converted: 0, creditBalance: 0 }

export default function DashboardShell({
  customerName, customerCid, customerDorm, userEmail,
  referralData = DEFAULT_REFERRAL, children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <Sidebar
        customerName={customerName}
        customerCid={customerCid}
        customerDorm={customerDorm}
        userEmail={userEmail}
        referralData={referralData}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile hamburger — only visible on small screens, opens the sidebar drawer. */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="dash-mobile-menu"
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 70,
          width: 44, height: 44, display: 'none',
          alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(9,24,37,0.10)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          boxShadow: 'var(--shadow-md)',
          cursor: 'pointer', color: '#091825',
        }}
      >
        <MenuIcon size={18} strokeWidth={2} />
      </button>

      {children}

      <style jsx global>{`
        @media (max-width: 1024px) {
          .dash-mobile-menu { display: flex !important; }
        }
      `}</style>
    </>
  )
}
