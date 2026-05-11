'use client'

import { MapPin } from 'lucide-react'
import { BODY, S } from './tokens'
import { whatsAppHref } from '@/lib/contacts'

const OOZ_MESSAGE =
  'Hi! I just signed up but my dorm is outside the listed delivery radius — could you confirm whether you can deliver to me?'

/**
 * Shown when customers.out_of_zone = true (customer picked "Other" for dorm
 * at onboarding). Pairs with disabled "Pick a plan" / "Renew" CTAs on the
 * same page — single source of truth for the gating signal.
 *
 * Customer-service flips out_of_zone via Supabase admin once delivery is
 * confirmed; there's no in-app UI to clear it.
 */
export function OutOfZoneBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div style={{
      marginBottom: 18,
      padding: '14px 18px',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(58,111,140,0.12)',
      border: '1px solid rgba(58,111,140,0.40)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
        background: 'rgba(58,111,140,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#5fa1c4',
      }}>
        <MapPin size={18} strokeWidth={2.4} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 700, color: S.fg, lineHeight: 1.3 }}>
          Your dorm is outside our usual delivery radius.
        </div>
        <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: S.fgMuted, lineHeight: 1.5 }}>
          Message customer service on WhatsApp so we can confirm whether we can cater to you.
        </div>
      </div>
      <a
        href={whatsAppHref(OOZ_MESSAGE)}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '10px 16px',
          background: '#25D366', color: '#fff',
          borderRadius: 'var(--radius-pill)',
          fontFamily: BODY, fontSize: 12, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(37,211,102,0.30)',
          flexShrink: 0,
        }}
      >
        Message us on WhatsApp →
      </a>
    </div>
  )
}
