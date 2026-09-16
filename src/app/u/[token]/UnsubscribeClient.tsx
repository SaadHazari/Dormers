'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BellOff, Check, Undo2 } from 'lucide-react'
import { resubscribe, unsubscribe, type UnsubState } from './actions'

const NAVY = '#091825'
const ORANGE = '#f57f20'
const CREAM = 'rgba(237,232,218,0.85)'
const FAINT = 'rgba(237,232,218,0.5)'

export function UnsubscribeClient({ token, valid }: { token: string; valid: boolean }) {
    // 'ready' is the only state that writes nothing: some mail clients fetch
    // every link in a message, so the opt-out has to be a press, not a visit.
    const [state, setState] = useState<'ready' | UnsubState>(valid ? 'ready' : 'invalid')
    const [busy, setBusy] = useState(false)

    async function run(fn: (t: string) => Promise<UnsubState>) {
        setBusy(true)
        setState(await fn(token))
        setBusy(false)
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: NAVY }}>
            <div
                className="pointer-events-none fixed inset-0"
                style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,127,32,0.08) 0%, transparent 70%)' }}
            />

            <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full">
                <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                    style={{
                        background: 'linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(245,127,32,0.06) 100%)',
                        border: '1.5px solid rgba(245,127,32,0.25)',
                    }}
                >
                    {state === 'unsubscribed'
                        ? <BellOff size={26} strokeWidth={1.6} color={ORANGE} />
                        : <Check size={26} strokeWidth={1.6} color={ORANGE} />}
                </div>

                {state === 'ready' && (
                    <>
                        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: CREAM }}>
                            Stop these emails?
                        </h1>
                        <p className="text-sm font-medium mb-7" style={{ color: FAINT }}>
                            You will still get anything about an order or your account — just no more news
                            and offers.
                        </p>
                        <button
                            type="button"
                            onClick={() => run(unsubscribe)}
                            disabled={busy}
                            className="px-6 py-3 rounded-2xl text-sm font-bold w-full transition-opacity disabled:opacity-50"
                            style={{ backgroundColor: ORANGE, color: NAVY }}
                        >
                            {busy ? 'One moment…' : 'Unsubscribe'}
                        </button>
                    </>
                )}

                {state === 'unsubscribed' && (
                    <>
                        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: CREAM }}>
                            Done — you are off the list
                        </h1>
                        <p className="text-sm font-medium mb-7" style={{ color: FAINT }}>
                            No more news or offers from us. Anything about an order or your account still comes through.
                        </p>
                        <button
                            type="button"
                            onClick={() => run(resubscribe)}
                            disabled={busy}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-opacity disabled:opacity-50"
                            style={{ border: '1px solid rgba(237,232,218,0.2)', color: CREAM }}
                        >
                            <Undo2 size={15} strokeWidth={2.2} />
                            {busy ? 'One moment…' : 'That was a mistake, put me back'}
                        </button>
                    </>
                )}

                {state === 'resubscribed' && (
                    <>
                        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: CREAM }}>
                            You are back on the list
                        </h1>
                        <p className="text-sm font-medium" style={{ color: FAINT }}>
                            We will keep you posted.
                        </p>
                    </>
                )}

                {state === 'invalid' && (
                    <>
                        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: CREAM }}>
                            That link did not work
                        </h1>
                        <p className="text-sm font-medium" style={{ color: FAINT }}>
                            It may have been cut short by your email app. Reply to any email from us and we
                            will take you off the list ourselves.
                        </p>
                    </>
                )}

                {state === 'error' && (
                    <>
                        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: CREAM }}>
                            Something went wrong
                        </h1>
                        <p className="text-sm font-medium mb-5" style={{ color: FAINT }}>
                            Nothing changed. Try once more, and if it still fails, just reply to the email.
                        </p>
                        <button
                            type="button"
                            onClick={() => run(unsubscribe)}
                            disabled={busy}
                            className="px-6 py-3 rounded-2xl text-sm font-bold transition-opacity disabled:opacity-50"
                            style={{ backgroundColor: ORANGE, color: NAVY }}
                        >
                            Try again
                        </button>
                    </>
                )}

                <Link href="/" className="text-xs font-bold mt-8 tracking-[0.12em] uppercase" style={{ color: 'rgba(237,232,218,0.35)' }}>
                    dormers.ae
                </Link>
            </div>
        </div>
    )
}
