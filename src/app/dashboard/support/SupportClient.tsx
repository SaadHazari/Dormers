'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, MessageCircle, Heart } from 'lucide-react'
import { Eyebrow } from '../_shared/Eyebrow'
import { FAQItem } from '../_shared/FAQItem'

const OG  = '#f57f20'
const NV  = '#091825'
const BG  = 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)'
const DISPLAY = 'var(--font-lora), Georgia, "Times New Roman", serif'
const BODY    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

const S = {
  surface2: 'rgba(255,255,255,0.60)',
  border:   'rgba(9,24,37,0.09)',
  border2:  'rgba(9,24,37,0.15)',
  fg:       NV,
  fgMuted:  'rgba(9,24,37,0.55)',
  fgSub:    'rgba(9,24,37,0.50)',
}

interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null; created_at: string
}

// Eyebrow moved to _shared/Eyebrow.tsx — imported above.

const FAQS = [
  {
    q: 'When is my meal delivered?',
    a: 'Every weekday (Monday–Saturday) by 7:45 AM, directly to your dorm building. Sunday is always a rest day — no delivery.',
  },
  {
    q: 'Can I skip a meal?',
    a: 'Yes — Weekly Flex includes 1 skip, Monthly Premium includes 3 skips per cycle. Credits are automatically added back when you skip. Use the Skip button on your dashboard before midnight the day prior.',
  },
  {
    q: 'How does pausing work?',
    a: 'Monthly Premium subscribers get 1 free pause per cycle (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals.',
  },
  {
    q: 'Can I change my meal preference (Veg/Non-Veg)?',
    a: 'Yes — update your preference on the Plan page. Changes apply from the next delivery cycle. Mid-cycle changes are not supported.',
  },
  {
    q: 'What if I have an allergy?',
    a: 'Update your allergens on the Plan page. Our kitchen team reviews all allergen flags before preparing your meal. For severe allergies, message us on WhatsApp directly.',
  },
  {
    q: 'How do I renew my plan?',
    a: 'Tap "Renew plan" on your dashboard before your end date. Your new cycle starts immediately after the current one ends.',
  },
  {
    q: 'Do you deliver to my dorm?',
    a: 'We currently deliver to YUGO, Study World, and partnered university accommodations in Dubai. Message us on WhatsApp to confirm your building.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major cards (Visa, Mastercard, Amex) via Stripe. All transactions are encrypted — we never store your card details.',
  },
]

// FAQItem moved to _shared/FAQItem.tsx — imported above.

export default function SupportClient({ customer, userEmail }: { customer: Customer | null; userEmail: string }) {
  return (
    <div style={{ minHeight: '100vh', background: BG, padding: 'clamp(16px, 3vw, 28px)', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <Eyebrow>Help & Support</Eyebrow>
          <div style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1.05, color: NV }}>
            We&apos;re here for you<span style={{ color: OG }}>.</span>
          </div>
          <div style={{ fontFamily: BODY, fontSize: 14, color: S.fgMuted, marginTop: 8 }}>
            Real humans, real food, real support. Usually reply within 15 minutes.
          </div>
        </div>

        <div className="support-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20, marginBottom: 36 }}>

          {/* 1. Account info card — first, with a distinct orange tint to draw attention */}
          <div style={{ gridColumn: 'span 4', padding: 28, borderRadius: 20, background: 'linear-gradient(135deg, rgba(245,127,32,0.10) 0%, rgba(255,170,0,0.06) 100%)', border: '1.5px solid rgba(245,127,32,0.30)', boxShadow: '0 8px 24px -10px rgba(245,127,32,0.18)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Eyebrow color="#a35100">Your reference</Eyebrow>
            <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: NV }}>Account info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {[
                { label: 'Name',  value: customer?.name  ?? '—' },
                { label: 'Email', value: customer?.email ?? userEmail },
                { label: 'ID',    value: customer?.cid   ?? '—' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingBottom: 10, borderBottom: `1px solid rgba(245,127,32,0.18)` }}>
                  <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a35100' }}>{row.label}</span>
                  <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: NV }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: BODY, fontSize: 11, color: S.fgSub, lineHeight: 1.5 }}>
              Share your Customer ID when contacting us so we can pull up your account instantly.
            </div>
          </div>

          {/* 2. Email Us — second */}
          <div style={{ gridColumn: 'span 4', padding: 28, borderRadius: 20, background: S.surface2, border: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(245,127,32,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: OG }}>
              <Mail size={22} strokeWidth={2} aria-hidden />
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: NV }}>Email us</div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, marginTop: 6, lineHeight: 1.5 }}>
                For billing, plan changes, or anything that needs a paper trail. We reply within 24 hours.
              </div>
            </div>
            <a
              href="mailto:care@dormers.ae"
              data-tooltip="Opens your email app"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 999, background: 'rgba(245,127,32,0.14)', border: '1px solid rgba(245,127,32,0.25)', color: OG, fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', marginTop: 'auto' }}
            >
              care@dormers.ae
            </a>
          </div>

          {/* 3. WhatsApp CTA — third */}
          <div style={{ gridColumn: 'span 4', padding: 28, borderRadius: 20, background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.22)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(37,211,102,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1ea34d' }}>
              <MessageCircle size={22} strokeWidth={2} aria-hidden />
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: NV }}>Chat on WhatsApp</div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: S.fgMuted, marginTop: 6, lineHeight: 1.5 }}>
                Fastest way to reach us. Available 7 AM – 9 PM, 7 days a week.
              </div>
            </div>
            <a
              href="https://wa.me/971504619384"
              target="_blank"
              rel="noreferrer"
              data-tooltip="Opens WhatsApp"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 999, background: '#25D366', color: '#fff', fontFamily: BODY, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', marginTop: 'auto' }}
            >
              Open WhatsApp
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ padding: 32, borderRadius: 20, background: S.surface2, border: `1px solid ${S.border}`, marginBottom: 24 }}>
          <div style={{ marginBottom: 24 }}>
            <Eyebrow>FAQ</Eyebrow>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: NV, marginTop: 10 }}>
              Common questions
            </div>
          </div>
          <div>
            {FAQS.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
          </span>
        </div>
      </div>
      <style>{`
        @media (max-width: 1024px) {
          .support-grid > * { grid-column: span 12 !important; }
        }
      `}</style>
    </div>
  )
}
