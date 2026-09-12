'use client'

import { useState } from 'react'
import { Heart, Plus, Send, MessageCircle, ArrowRight } from 'lucide-react'
import { DoroMark } from '../_shared/DoroMark'
import { MobileColumn, CARD, OG, S, BODY } from './kit'
import { MONO, TIER_POP, TIER_POP_TEXT } from '../_shared/tokens'
import { whatsAppHref } from '@/shared/contacts'
import { SupportChat } from './SupportChat'
import { SUPPORT_FAQS as FAQS } from '../_shared/support-faqs'

/**
 * MobileSupport — the height-optimised <768 support surface.
 *
 * One job: get help. The AI assistant is the PRIMARY self-serve channel (it
 * answers instantly and escalates to a human itself), so it owns the page's one
 * dark spotlight. WhatsApp is demoted to a quiet human-escalation line — we
 * don't want reps pinged for things the assistant can solve. Below: the user's
 * reference details (for when they do reach out) and a short, flat FAQ.
 */

interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null; created_at: string
}


function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(9,24,37,0.07)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: BODY, touchAction: 'manipulation' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: open ? OG : S.fg, lineHeight: 1.35, transition: 'color 180ms' }}>{q}</span>
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: open ? OG : 'var(--ds-og-wash-strong)', border: `1px solid ${open ? OG : 'var(--ds-og-border)'}`, color: open ? '#fff' : OG, transform: open ? 'rotate(135deg)' : 'rotate(0deg)', transition: 'transform 240ms cubic-bezier(0.16,1,0.3,1), background 200ms, color 200ms' }}>
          <Plus size={14} strokeWidth={2.6} />
        </span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 260ms cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: S.fgMuted, lineHeight: 1.6 }}>{a}</p>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono = false, full = false }: { label: string; value?: string | null; mono?: boolean; full?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, ...(full ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.fgFaint }}>{label}</span>
      <span style={{ fontFamily: mono ? MONO : BODY, fontSize: 14, fontWeight: mono ? 700 : 600, color: mono ? OG : S.fg, lineHeight: 1.3, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}

export function MobileSupport({
  customer, userEmail, customerContext,
}: {
  customer: Customer | null
  userEmail: string
  totalDelivered: number
  customerContext?: string
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const cid = customer?.cid ?? null
  const name = customer?.name ?? null
  const email = customer?.email ?? userEmail

  return (
    <MobileColumn style={{ color: S.fg, gap: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>

      {/* Header — one line title (clears hamburger); caption sits below it,
          un-indented, the way the other pages do. */}
      <div style={{ paddingTop: 2 }}>
        <h1 style={{ paddingLeft: 56, margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', color: S.fg, lineHeight: 1.1 }}>
          We&rsquo;re here for you<span style={{ color: OG }}>.</span>
        </h1>
        <p style={{ marginTop: 9, fontSize: 13, color: S.fgMuted, lineHeight: 1.5 }}>
          Get an instant answer from our assistant — or reach a real person when you need one.
        </p>
      </div>

      {/* PRIMARY — the AI assistant. The page's one dark spotlight. */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        style={{ ...TIER_POP, borderRadius: 22, padding: 18, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: BODY }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, background: `linear-gradient(135deg, #ffaa00, ${OG})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(245,127,32,0.4)' }}>
            <DoroMark size={19} strokeWidth={2.2} color="#fff" aria-hidden />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TIER_POP_TEXT.primary, letterSpacing: '-0.01em' }}>Doro</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: '#37d167' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: TIER_POP_TEXT.muted }}>Online · replies instantly</span>
            </span>
          </div>
        </div>
        <p style={{ margin: '13px 0 0', fontSize: 13, color: TIER_POP_TEXT.muted, lineHeight: 1.5 }}>
          Skips, delivery, allergies, pausing, billing — ask in plain words. I&rsquo;ll bring in a human if it needs one.
        </p>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 999, background: 'rgba(245,240,232,0.07)', border: '1px solid rgba(245,240,232,0.16)' }}>
          <span style={{ fontSize: 14, color: TIER_POP_TEXT.faint }}>Ask me anything…</span>
          <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: OG, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={15} strokeWidth={2.5} color="#fff" />
          </span>
        </div>
      </button>

      {/* Quiet human-escalation line — secondary to the assistant. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginTop: -4 }}>
        <span style={{ fontSize: 12.5, color: S.fgMuted }}>Prefer a real person?</span>
        <a href={whatsAppHref()} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 6px', margin: '-6px 0', fontSize: 12.5, fontWeight: 700, color: '#157a38', textDecoration: 'none', touchAction: 'manipulation' }}>
          <MessageCircle size={14} strokeWidth={2.4} aria-hidden /> Message us on WhatsApp →
        </a>
      </div>

      {/* Your details — reference for when they reach out. */}
      <section style={{ ...CARD, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgFaint }}>Your details</div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 14, columnGap: 14 }}>
          <DetailRow label="Name" value={name} />
          <DetailRow label="Member ID" value={cid} mono />
          <DetailRow label="Email" value={email} full />
        </div>
        <div style={{ marginTop: 14, fontSize: 11.5, color: S.fgSub, lineHeight: 1.45 }}>
          Quote your ID if you message the team — it pulls up your account instantly.
        </div>
      </section>

      {/* FAQ — short, flat, one heading. */}
      <div style={{ paddingTop: 2 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: S.fg }}>
          Common questions<span style={{ color: OG }}>.</span>
        </h2>
        <div style={{ marginTop: 6 }}>
          {FAQS.map((f, i) => <FaqRow key={i} q={f.q} a={f.a} />)}
        </div>
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          style={{ marginTop: 16, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 999, background: 'var(--ds-og-wash)', border: '1px solid var(--ds-og-border)', color: OG, fontFamily: BODY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}
        >
          Can&rsquo;t find it? Ask the assistant <ArrowRight size={15} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '6px 0 2px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
        </span>
      </div>

      <SupportChat open={chatOpen} onClose={() => setChatOpen(false)} customerContext={customerContext} />
    </MobileColumn>
  )
}
