'use client'

import { motion } from 'framer-motion'
import { Mail, MessageCircle, Heart } from 'lucide-react'
import { OG, BODY, MONO, S as BASE_S, TIER2, TIER_POP, TIER_POP_TEXT } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { FAQItem } from '../_shared/FAQItem'
import { SUPPORT_EMAIL, whatsAppHref } from '@/shared/contacts'

// Single typeface across the dashboard — DISPLAY aliases BODY (Montserrat).
// Matches MenuClient/PlanClient: hierarchy comes from scale + weight + colour,
// not a serif/sans pairing. Brings Support out of the Profile/History serif
// cohort and into the main-app surface cohort it sits next to in the sidebar.
const DISPLAY = BODY

// Slightly stronger muted/sub variants for dense FAQ-heavy copy. Vars flip in dark mode.
const S = {
  ...BASE_S,
  fgMuted: 'var(--ds-fg-sub)',
  fgSub: 'var(--ds-fg-faint)',
}

const WA_GREEN = '#25D366'
const WA_GREEN_DARK = '#1ea34d'

interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null; created_at: string
}

const FAQS = [
  {
    q: 'When is my meal delivered?',
    a: 'Every weekday (Monday–Saturday) by 7-8 PM, directly to your dorm building. Sunday is always a rest day — no delivery.',
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

export default function SupportClient({
  customer,
  userEmail,
  totalDelivered,
}: {
  customer: Customer | null
  userEmail: string
  totalDelivered: number
}) {
  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: 'var(--ds-fg)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Header — matches Menu/Plan: motion fade-in, single-typeface display, period accent. */}
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ marginBottom: 36 }}
        >
          <Eyebrow>Help &amp; Support</Eyebrow>
          <h1 style={{
            margin: '8px 0 0',
            fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 30px)',
            fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ds-fg)',
          }}>
            We&apos;re here for you<span style={{ color: OG }}>.</span>
          </h1>
          <p style={{
            marginTop: 10, fontFamily: BODY, fontSize: 15, fontWeight: 400,
            color: S.fgMuted, maxWidth: 640, lineHeight: 1.6,
          }}>
            {totalDelivered >= 5 ? (
              <>
                <strong style={{ color: 'var(--ds-fg)', fontWeight: 700 }}>{totalDelivered}</strong> dinners delivered — we&rsquo;ve got your back. Usually reply within 15 minutes.
              </>
            ) : (
              <>Real humans, real food, real support. Usually reply within 15 minutes.</>
            )}
          </p>
        </motion.header>

        {/* ── Section 1: Get in touch — three equal cards.
              Account info leads (your reference for the conversation),
              Email next (paper trail), WhatsApp last (fastest reply). ── */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Get in touch</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>

          <div className="support-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 20,
          }}>

            {/* 1. Account info — TIER_POP: the only data card on the page. Name,
                  email, and customer ID are the reference the user needs before
                  they can use either contact channel, so it earns the spotlight.
                  Email + WhatsApp stay on TIER2 — they're channels, not data. */}
            <div style={{
              ...TIER_POP,
              padding: 'clamp(20px, 2.2vw, 28px)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', flexDirection: 'column', gap: 14,
              minHeight: 260,
            }}>
              <Eyebrow color={OG}>Your reference</Eyebrow>
              <h3 style={{
                margin: 0, fontFamily: DISPLAY,
                fontSize: 'clamp(18px, 1.6vw, 22px)',
                fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25,
                color: TIER_POP_TEXT.primary,
              }}>
                Account info
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {[
                  { label: 'Name', value: customer?.name ?? '—', mono: false },
                  { label: 'Email', value: customer?.email ?? userEmail, mono: false },
                  { label: 'ID', value: customer?.cid ?? '—', mono: true },
                ].map(row => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      gap: 8, paddingBottom: 10,
                      borderBottom: '1px solid rgba(245,240,232,0.12)',
                    }}
                  >
                    <span style={{
                      fontFamily: BODY, fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: TIER_POP_TEXT.muted,
                    }}>
                      {row.label}
                    </span>
                    <span style={{
                      fontFamily: row.mono ? MONO : BODY,
                      fontSize: 13, fontWeight: 600, color: TIER_POP_TEXT.primary,
                      maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{
                fontFamily: BODY, fontSize: 11, color: TIER_POP_TEXT.faint, lineHeight: 1.5,
              }}>
                Quote your ID so we can pull up your account instantly.
              </div>
            </div>

            {/* 2. Email — TIER2 surface (recedes vs the accent-bordered Account card) */}
            <div style={{
              ...TIER2,
              padding: 'clamp(20px, 2.2vw, 28px)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', flexDirection: 'column', gap: 14,
              minHeight: 260,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(245,127,32,0.14)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: OG,
              }}>
                <Mail size={20} strokeWidth={2} aria-hidden />
              </div>
              <Eyebrow color={OG}>Within 24 hours</Eyebrow>
              <h3 style={{
                margin: 0, fontFamily: DISPLAY,
                fontSize: 'clamp(18px, 1.6vw, 22px)',
                fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--ds-fg)',
              }}>
                Email us
              </h3>
              <p style={{
                margin: 0, fontFamily: BODY, fontSize: 13,
                color: S.fgMuted, lineHeight: 1.6,
              }}>
                For billing, plan changes, or anything that needs a paper trail.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                data-tooltip="Opens your email app"
                className="support-cta-email"
                style={{
                  marginTop: 'auto', alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 18px', borderRadius: 999,
                  background: 'rgba(245,127,32,0.14)',
                  border: '1px solid rgba(245,127,32,0.25)',
                  color: OG,
                  fontFamily: BODY, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  transition: 'background 150ms, border-color 150ms',
                  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            {/* 3. WhatsApp — TIER2 surface + green accent border. Green is the
                  established WhatsApp vocabulary (see dormwars-share-btn). */}
            <div style={{
              ...TIER2,
              padding: 'clamp(20px, 2.2vw, 28px)',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid rgba(37,211,102,0.32)',
              display: 'flex', flexDirection: 'column', gap: 14,
              minHeight: 260,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(37,211,102,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: WA_GREEN_DARK,
              }}>
                <MessageCircle size={20} strokeWidth={2} aria-hidden />
              </div>
              <Eyebrow color={WA_GREEN_DARK}>Fastest · ~15 min</Eyebrow>
              <h3 style={{
                margin: 0, fontFamily: DISPLAY,
                fontSize: 'clamp(18px, 1.6vw, 22px)',
                fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--ds-fg)',
              }}>
                Chat on WhatsApp
              </h3>
              <p style={{
                margin: 0, fontFamily: BODY, fontSize: 13,
                color: S.fgMuted, lineHeight: 1.6,
              }}>
                The fastest way to reach us. Available 7 AM – 9 PM, 7 days a week.
              </p>
              <a
                href={whatsAppHref()}
                target="_blank"
                rel="noreferrer"
                data-tooltip="Opens WhatsApp"
                className="support-cta-wa"
                style={{
                  marginTop: 'auto', alignSelf: 'flex-start',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 18px', borderRadius: 999,
                  background: WA_GREEN, color: '#fff',
                  fontFamily: BODY, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  textDecoration: 'none',
                  boxShadow: '0 6px 18px rgba(37,211,102,0.30)',
                  transition: 'transform 150ms, box-shadow 150ms',
                }}
              >
                Open WhatsApp →
              </a>
            </div>
          </div>
        </section>

        {/* ── Section 2: FAQ — TIER2 surface, section eyebrow + hairline mirrors
              Menu's section rhythm ── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>Common questions</Eyebrow>
            <div style={{ flex: 1, height: 1, background: S.border }} />
          </div>
          <div style={{
            ...TIER2,
            padding: 'clamp(20px, 2.2vw, 28px)',
            borderRadius: 'var(--radius-md)',
          }}>
            {FAQS.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </section>

        <div style={{ textAlign: 'center', padding: '16px 0', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
          </span>
        </div>
      </div>

      <style>{`
        .support-cta-wa:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(37,211,102,0.40) !important;
        }
        .support-cta-email:hover {
          background: rgba(245,127,32,0.20) !important;
          border-color: rgba(245,127,32,0.40) !important;
        }
        @media (max-width: 1024px) {
          .support-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
