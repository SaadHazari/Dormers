'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Send, Sparkles, ArrowRight, MessageCircle, UtensilsCrossed, CalendarRange } from 'lucide-react'
import Link from 'next/link'
import { whatsAppHref } from '@/shared/contacts'
import { useBodyScrollLock } from '@/ui-system/hooks/useBodyScrollLock'

const NV = '#091825'
const CR = '#f5f0e8'
const OG = '#f57f20'
const WA_GREEN = '#25D366'
const BODY = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

const STARTERS = [
  'How do skips work?',
  'Change my meal preference',
  "When's my delivery?",
  'How do I pause my plan?',
]

function renderMd(s: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(s)) !== null) {
    if (match.index > last) parts.push(s.slice(last, match.index))
    if (match[2]) parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{match[2]}</strong>)
    else if (match[3]) parts.push(<em key={key++} style={{ fontStyle: 'italic' }}>{match[3]}</em>)
    last = match.index + match[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts.length ? parts : s
}

const LOADING_WORDS = ['thinking', 'checking', 'cooking', 'prepping', 'plating', 'stirring']

function TypingLoader() {
  const [text, setText] = useState('')
  const [i, setI] = useState(0)
  useEffect(() => {
    const word = LOADING_WORDS[i % LOADING_WORDS.length]
    let c = 0
    const t = setInterval(() => {
      c++
      setText(word.slice(0, c))
      if (c >= word.length) {
        clearInterval(t)
        setTimeout(() => { setText(''); setI(n => n + 1) }, 700)
      }
    }, 70)
    return () => clearInterval(t)
  }, [i])
  return <span style={{ fontStyle: 'italic', color: 'rgba(245,240,232,0.7)', fontSize: 13.5 }}>{text}…</span>
}

function parseReply(raw: string) {
  const flags = {
    whatsapp: raw.includes('[WHATSAPP_ESCALATION]'),
    plan: raw.includes('[MANAGE_PLAN]'),
    menu: raw.includes('[VIEW_MENU]'),
  }
  const text = raw
    .replace('[WHATSAPP_ESCALATION]', '')
    .replace('[MANAGE_PLAN]', '')
    .replace('[VIEW_MENU]', '')
    .trim()
  return { text, flags }
}

function useIsDesktop() {
  const [v, setV] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)')
    setV(mq.matches)
    const h = (e: MediaQueryListEvent) => setV(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return v
}

export function SupportChat({ open, onClose, customerContext }: { open: boolean; onClose: () => void; customerContext?: string }) {
  const [input, setInput] = useState('')
  const [chatError, setChatError] = useState(false)
  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/support-chat',
      body: customerContext ? { customerContext } : undefined,
    }),
    onError: () => setChatError(true),
  })
  const endRef = useRef<HTMLDivElement>(null)
  const isLoading = status === 'submitted' || status === 'streaming'
  const dk = useIsDesktop()

  useBodyScrollLock(open)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isLoading])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t || isLoading) return
    sendMessage({ text: t })
    setInput('')
  }

  const linkBtn = (href: string, label: string, icon: React.ReactNode, external = false) => (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : { onClick: onClose })}
      className="sc-link-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 999,
        background: external ? WA_GREEN : 'rgba(245,127,32,0.16)',
        border: external ? 'none' : '1px solid rgba(245,127,32,0.4)',
        color: external ? '#fff' : OG,
        fontFamily: BODY, fontSize: 12.5, fontWeight: 700,
        textDecoration: 'none', transition: 'filter 150ms',
      }}
    >
      {icon} {label}
    </Link>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="support-chat-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="dialog" aria-modal="true" aria-label="Dormers support assistant"
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(9,24,37,0.55)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column',
            justifyContent: dk ? 'center' : 'flex-end',
            alignItems: dk ? 'center' : 'stretch',
          }}
        >
          <motion.div
            initial={dk ? { scale: 0.96, opacity: 0, y: 0 } : { y: '100%', scale: 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={dk ? { scale: 0.96, opacity: 0, y: 0 } : { y: '100%', scale: 1, opacity: 1 }}
            transition={{ duration: dk ? 0.22 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            className="sc-panel"
            style={{
              position: 'relative',
              width: dk ? 460 : '100%',
              height: dk ? 640 : '86svh',
              maxHeight: dk ? 640 : '86svh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRadius: dk ? 20 : '22px 22px 0 0',
              background: `linear-gradient(180deg, rgba(20,48,65,${dk ? '0.95' : '0.5'}) 0%, ${NV} ${dk ? '18%' : '22%'})`,
              backgroundColor: NV,
              boxShadow: dk
                ? '0 0 0 1px rgba(245,127,32,0.06), 0 24px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)'
                : '0 -16px 48px rgba(9,24,37,0.4)',
              fontFamily: BODY,
            }}
          >
            {!dk && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                <span aria-hidden style={{ width: 36, height: 4, borderRadius: 999, background: 'rgba(245,240,232,0.25)' }} />
              </div>
            )}

            <div style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: dk ? '16px 22px' : '12px 16px 14px',
              borderBottom: '1px solid rgba(245,240,232,0.08)',
            }}>
              <span style={{
                width: 38, height: 38, borderRadius: 11,
                background: `linear-gradient(135deg, #ffaa00, ${OG})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 16px rgba(245,127,32,0.35)', flexShrink: 0,
              }}>
                <Sparkles size={18} strokeWidth={2.2} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: CR, letterSpacing: '-0.01em' }}>Doro</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: '#37d167' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(245,240,232,0.5)' }}>
                    Online · replies instantly
                  </span>
                </div>
              </div>
              <button
                type="button" onClick={onClose} aria-label="Close"
                className="sc-close"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(245,240,232,0.06)', border: 'none',
                  color: 'rgba(245,240,232,0.5)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 150ms, color 150ms',
                }}
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className="support-chat-scroll" style={{
              flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              padding: dk ? 22 : 16,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {messages.length === 0 ? (
                <div style={{ marginTop: dk ? 16 : 6 }}>
                  <p style={{ margin: 0, fontSize: dk ? 15 : 14.5, fontWeight: 600, color: CR, lineHeight: 1.55 }}>
                    Hi! I&rsquo;m Doro, your Dormers assistant. Ask me about skips, delivery, allergies, pausing — anything. I&rsquo;ll loop in a human if it needs one.
                  </p>
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.35)' }}>
                      Try asking
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: dk ? '1fr 1fr' : '1fr', gap: 8 }}>
                      {STARTERS.map(s => (
                        <button
                          key={s} type="button" onClick={() => submit(s)}
                          className="sc-starter"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 8, width: '100%', textAlign: 'left',
                            padding: dk ? '12px 16px' : '12px 14px', borderRadius: 14,
                            background: 'rgba(245,240,232,0.04)',
                            border: '1px solid rgba(245,240,232,0.1)',
                            color: CR, fontFamily: BODY, fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', touchAction: 'manipulation',
                            transition: 'background 150ms, border-color 150ms',
                          }}
                        >
                          {s}
                          <ArrowRight size={14} strokeWidth={2.2} color="rgba(245,240,232,0.35)" style={{ flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map(m => {
                  const isUser = m.role === 'user'
                  const raw = (m.parts ?? []).filter(p => p.type === 'text').map(p => (p as { text: string }).text).join('')
                  const { text, flags } = isUser ? { text: raw, flags: { whatsapp: false, plan: false, menu: false } } : parseReply(raw)
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {text && (
                          <div style={{
                            padding: dk ? '12px 16px' : '11px 14px',
                            borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                            ...(isUser
                              ? { background: 'rgba(245,127,32,0.14)', border: '1px solid rgba(245,127,32,0.3)', color: CR, borderBottomRightRadius: 5, fontWeight: 500 }
                              : { background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.1)', color: CR, borderBottomLeftRadius: 5 }),
                          }}>
                            {isUser ? text : renderMd(text)}
                          </div>
                        )}
                        {flags.whatsapp && linkBtn(whatsAppHref(), 'Message a teammate', <MessageCircle size={15} strokeWidth={2.2} />, true)}
                        {flags.plan && linkBtn('/dashboard/plan', 'Go to my plan', <CalendarRange size={15} strokeWidth={2.2} />)}
                        {flags.menu && linkBtn('/dashboard/menu', "See this week's menu", <UtensilsCrossed size={15} strokeWidth={2.2} />)}
                      </div>
                    </div>
                  )
                })
              )}
              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    padding: dk ? '12px 16px' : '11px 14px',
                    borderRadius: 16, borderBottomLeftRadius: 5,
                    background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.1)',
                    minWidth: 90,
                  }}>
                    <TypingLoader />
                  </div>
                </div>
              )}
              {chatError && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{
                      padding: dk ? '12px 16px' : '11px 14px',
                      borderRadius: 16, borderBottomLeftRadius: 5,
                      background: 'rgba(224,113,110,0.12)', border: '1px solid rgba(224,113,110,0.35)',
                      fontSize: 13, lineHeight: 1.5, color: 'rgba(245,240,232,0.85)',
                    }}>
                      Couldn&rsquo;t reach the assistant — try again in a moment, or message us directly.
                    </div>
                    {linkBtn(whatsAppHref(), 'Message us on WhatsApp', <MessageCircle size={15} strokeWidth={2.2} />, true)}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div style={{
              padding: dk ? '14px 22px' : '12px 14px',
              paddingBottom: dk ? 14 : 'max(env(safe-area-inset-bottom), 12px)',
              borderTop: '1px solid rgba(245,240,232,0.08)',
              background: 'rgba(9,24,37,0.5)',
            }}>
              <form onSubmit={e => { e.preventDefault(); submit(input) }} style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask anything…"
                  aria-label="Message the assistant"
                  className="sc-input"
                  style={{
                    flex: 1, height: 46, padding: '0 48px 0 16px', borderRadius: 999,
                    background: 'rgba(245,240,232,0.06)', border: '1px solid rgba(245,240,232,0.12)',
                    color: CR, fontFamily: BODY, fontSize: dk ? 14 : 16, outline: 'none',
                    transition: 'border-color 150ms, background 150ms',
                  }}
                />
                <button
                  type="submit" disabled={!input.trim() || isLoading} aria-label="Send"
                  className="sc-send"
                  style={{
                    position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                    width: 38, height: 38, borderRadius: 999,
                    background: OG, border: 'none', color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                    opacity: input.trim() && !isLoading ? 1 : 0.35,
                    transition: 'opacity 150ms, background 150ms',
                  }}
                >
                  <Send size={16} strokeWidth={2.5} />
                </button>
              </form>
            </div>

            <style>{`
              .support-chat-scroll::-webkit-scrollbar { width: 0; display: none; }
              .support-chat-scroll { scrollbar-width: none; }
              .sc-starter:hover {
                background: rgba(245,240,232,0.08) !important;
                border-color: rgba(245,240,232,0.18) !important;
              }
              .sc-close:hover {
                background: rgba(245,240,232,0.1) !important;
                color: rgba(245,240,232,0.8) !important;
              }
              .sc-input:focus {
                border-color: rgba(245,127,32,0.4) !important;
                background: rgba(245,240,232,0.08) !important;
              }
              .sc-input::placeholder { color: rgba(245,240,232,0.3); }
              .sc-send:not(:disabled):hover {
                background: #ff8f36 !important;
              }
              .sc-link-btn:hover { filter: brightness(1.1); }
            `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
