/**
 * Shown when `/r/[cid]` carries a code that matches no customer.
 *
 * The tone matters more than usual. Whoever lands here was sent a gift by a
 * friend and the link broke in transit — almost always WhatsApp truncating it.
 * They did nothing wrong, the invite is probably real, and the meal is probably
 * still theirs. So this says "ask them to resend" rather than "invalid link",
 * and it never implies the visitor mistyped something.
 *
 * Two ways forward, no dead end: get the link resent, or talk to a human. The
 * browse-the-menu link is last on purpose — it is the consolation route, not
 * the thing we want them to do.
 */

import Link from 'next/link'
import { whatsAppHref } from '@/shared/contacts'

const BG = '#faf8f4'
const CARD = '#ffffff'
const NAVY = '#091825'
const MUTED = '#5b6672'
const ORANGE = '#f57f20'
const BORDER = '#e8e4dc'
const FONT = 'var(--font-montserrat), Arial, Helvetica, sans-serif'

export function InvalidReferralLink() {
    return (
        <main
            style={{
                minHeight: '100dvh',
                backgroundColor: BG,
                color: NAVY,
                fontFamily: FONT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 20px',
            }}
        >
            <div
                style={{
                    backgroundColor: CARD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: '20px',
                    padding: '32px 26px',
                    maxWidth: '440px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: '0 1px 2px rgba(9,24,37,.04), 0 12px 32px -18px rgba(9,24,37,.22)',
                }}
            >
                <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: ORANGE, marginBottom: '14px' }}>
                    Dormers&rsquo;
                </div>

                <h1 style={{ fontSize: '25px', fontWeight: 800, lineHeight: 1.2, margin: '0 0 14px', textWrap: 'balance' }}>
                    This invite link didn&rsquo;t come through
                </h1>

                <p style={{ fontSize: '15.5px', lineHeight: 1.6, color: MUTED, margin: '0 0 10px' }}>
                    The code on the end of this link doesn&rsquo;t match anyone. Long links
                    often get cut short in WhatsApp, so the quickest fix is to ask your
                    friend to send it again.
                </p>
                <p style={{ fontSize: '15.5px', lineHeight: 1.6, color: MUTED, margin: '0 0 26px' }}>
                    Your free welcome meal is still there. Nothing has been used up.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <a
                        href={whatsAppHref('Hi! A friend sent me a Dormers invite link but it says the code doesn\'t match. Can you help?')}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'block',
                            padding: '15px 24px',
                            borderRadius: '13px',
                            backgroundColor: ORANGE,
                            color: '#ffffff',
                            fontSize: '15.5px',
                            fontWeight: 700,
                            textDecoration: 'none',
                        }}
                    >
                        Message us on WhatsApp
                    </a>

                    <Link
                        href="/home"
                        style={{
                            display: 'block',
                            padding: '15px 24px',
                            borderRadius: '13px',
                            border: `1.5px solid ${BORDER}`,
                            color: NAVY,
                            fontSize: '15.5px',
                            fontWeight: 700,
                            textDecoration: 'none',
                        }}
                    >
                        See this week&rsquo;s menu
                    </Link>
                </div>
            </div>
        </main>
    )
}
