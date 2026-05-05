'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

// Hanging bulb (LEFT) + separate red flip switch (RIGHT) clustered close
// together in the top-right corner. The lever rotates 0° (UP = light on) ↔
// 180° (DOWN = light off) around an explicit viewBox-coord pivot — drawing
// the lever's children at absolute viewBox coordinates avoids the
// transform-box ambiguity that was making the rotation pivot drift.
//
// Pre-mount returns dark to match the layout's `defaultTheme="dark"` and the
// SSR-injected `class="dark"` on <html>.
export default function ThemeToggle({ className = '' }: { className?: string }) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const { resolvedTheme, setTheme } = useTheme()
    const isLight = mounted ? resolvedTheme === 'light' : false
    const reduceMotion = useReducedMotion()

    // Persistent AudioContext, lazily created on first user gesture so the
    // browser's autoplay policy doesn't reject it.
    const audioCtxRef = useRef<AudioContext | null>(null)

    const playSwitchClick = (turningOn: boolean) => {
        if (typeof window === 'undefined') return
        try {
            const Ctx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            if (!Ctx) return
            if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
            const ctx = audioCtxRef.current
            if (ctx.state === 'suspended') ctx.resume()
            const t = ctx.currentTime

            const bufLen = Math.floor(ctx.sampleRate * 0.04)
            const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
            const data = buf.getChannelData(0)
            for (let i = 0; i < bufLen; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / bufLen * 4)
            }
            const noise = ctx.createBufferSource()
            noise.buffer = buf
            const noiseGain = ctx.createGain()
            noiseGain.gain.setValueAtTime(0.18, t)
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
            noise.connect(noiseGain).connect(ctx.destination)
            noise.start(t)
            noise.stop(t + 0.05)

            const osc = ctx.createOscillator()
            const oscGain = ctx.createGain()
            osc.type = 'square'
            osc.frequency.setValueAtTime(turningOn ? 1100 : 600, t)
            osc.frequency.exponentialRampToValueAtTime(turningOn ? 750 : 380, t + 0.04)
            oscGain.gain.setValueAtTime(0.06, t)
            oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
            osc.connect(oscGain).connect(ctx.destination)
            osc.start(t)
            osc.stop(t + 0.06)
        } catch {
            // AudioContext unsupported / blocked — ignore silently
        }
    }

    const flick = () => {
        playSwitchClick(!isLight)
        setTheme(isLight ? 'dark' : 'light')
    }

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flick() }
    }

    return (
        <div
            className={`fixed top-0 right-4 sm:right-8 z-[95] pointer-events-none select-none ${className}`}
            aria-hidden={!mounted ? true : undefined}
        >
            <div className="relative">
                <svg
                    width="210"
                    height="380"
                    viewBox="-50 0 210 380"
                    xmlns="http://www.w3.org/2000/svg"
                    className="block"
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <defs>
                        <radialGradient id="bulb-on" cx="50%" cy="62%" r="55%">
                            <stop offset="0%"  stopColor="#fffbe8" stopOpacity="0.98" />
                            <stop offset="55%" stopColor="#ffd987" stopOpacity="0.82" />
                            <stop offset="100%" stopColor="#e8a14b" stopOpacity="0.45" />
                        </radialGradient>
                        <radialGradient id="bulb-off-light" cx="50%" cy="62%" r="55%">
                            <stop offset="0%"  stopColor="#e6e0d2" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="#a89f88" stopOpacity="0.65" />
                        </radialGradient>
                        <radialGradient id="bulb-off-dark" cx="50%" cy="62%" r="55%">
                            <stop offset="0%"  stopColor="#2a313e" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="#10161f" stopOpacity="0.95" />
                        </radialGradient>
                        <linearGradient id="screw" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#4a4a4a" />
                            <stop offset="50%"  stopColor="#1f1f1f" />
                            <stop offset="100%" stopColor="#4a4a4a" />
                        </linearGradient>
                        <linearGradient id="lever-red" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#ef4444" />
                            <stop offset="55%"  stopColor="#dc2626" />
                            <stop offset="100%" stopColor="#991b1b" />
                        </linearGradient>
                        <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#2a2a2a" />
                            <stop offset="50%"  stopColor="#161616" />
                            <stop offset="100%" stopColor="#0a0a0a" />
                        </linearGradient>
                        <filter id="halo-tight" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="9" />
                        </filter>
                        <filter id="halo-mid" x="-150%" y="-150%" width="400%" height="400%">
                            <feGaussianBlur stdDeviation="18" />
                        </filter>
                        <filter id="halo-ambient" x="-300%" y="-300%" width="700%" height="700%">
                            <feGaussianBlur stdDeviation="38" />
                        </filter>
                        <filter id="filament-glow" x="-100%" y="-100%" width="300%" height="300%">
                            <feGaussianBlur stdDeviation="2.2" />
                        </filter>
                    </defs>

                    {/* Wire from off-canvas top down to the screw — bulb sits 16px from switch's left edge */}
                    <line
                        x1="-20" y1="-60"
                        x2="-20" y2="160"
                        stroke={isLight ? '#0d1218' : '#cfd6df'}
                        strokeOpacity={isLight ? 0.85 : 0.55}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    />

                    {/* Ambient environmental glow — three stacked blurs, only when on */}
                    <AnimatePresence>
                        {isLight && (
                            <motion.g
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <circle cx="-20" cy="235" r="170" fill="#ffe2a4" filter="url(#halo-ambient)" opacity="0.22" />
                                <circle cx="-20" cy="230" r="92"  fill="#ffe4a8" filter="url(#halo-mid)"     opacity="0.45" />
                                <circle cx="-20" cy="228" r="44"  fill="#fff2c2" filter="url(#halo-tight)"   opacity="0.7" />
                            </motion.g>
                        )}
                    </AnimatePresence>

                    {/* ── Bulb (inverted, on the LEFT, near the switch) ───── */}
                    <ellipse cx="-20" cy="160" rx="6" ry="2.2" fill="#0e0e0e" />

                    <rect x="-30" y="162" width="20" height="5" fill="url(#screw)" rx="1" />
                    <rect x="-31" y="168" width="22" height="6" fill="url(#screw)" rx="1" />
                    <rect x="-31" y="176" width="22" height="6" fill="url(#screw)" rx="1" />

                    <motion.path
                        d="M -28 182
                           L -28 192
                           C -38 192, -46 208, -46 230
                           C -46 248, -36 262, -20 262
                           C -4 262, 6 248, 6 230
                           C 6 208, -2 192, -12 192
                           L -12 182 Z"
                        animate={{
                            fill: isLight
                                ? 'url(#bulb-on)'
                                : (resolvedTheme === 'dark' ? 'url(#bulb-off-dark)' : 'url(#bulb-off-light)'),
                        }}
                        transition={{ duration: 0.35 }}
                        stroke={isLight ? '#c69240' : 'rgba(150,165,185,0.30)'}
                        strokeOpacity={isLight ? 0.55 : 0.6}
                        strokeWidth="1"
                    />

                    <path
                        d="M -40 202 Q -44 228, -40 252"
                        stroke="rgba(255,255,255,0.5)"
                        strokeWidth="2.2"
                        fill="none"
                        strokeLinecap="round"
                    />
                    <path
                        d="M -35 195 Q -38 202, -37 210"
                        stroke="rgba(255,255,255,0.32)"
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="round"
                    />

                    <motion.g
                        animate={{ opacity: isLight ? 1 : 0.55 }}
                        transition={{ duration: 0.3 }}
                    >
                        <line x1="-26" y1="192" x2="-26" y2="225" stroke={isLight ? '#a87b3c' : '#3a414c'} strokeWidth="1" />
                        <line x1="-14" y1="192" x2="-14" y2="225" stroke={isLight ? '#a87b3c' : '#3a414c'} strokeWidth="1" />
                        <path
                            d="M -26 225 L -24 232 L -22 225 L -20 232 L -18 225 L -16 232 L -14 225"
                            stroke={isLight ? '#fff2c2' : '#5a6271'}
                            strokeWidth="1.6"
                            fill="none"
                            strokeLinecap="round"
                            filter={isLight ? 'url(#filament-glow)' : undefined}
                        />
                        {isLight && (
                            <path
                                d="M -26 225 L -24 232 L -22 225 L -20 232 L -18 225 L -16 232 L -14 225"
                                stroke="#fffbe8"
                                strokeWidth="0.8"
                                fill="none"
                                strokeLinecap="round"
                            />
                        )}
                    </motion.g>

                    {/* ── Flip switch (red, on dark backplate) ─────────────── */}
                    <g
                        onClick={flick}
                        onKeyDown={onKey}
                        role="switch"
                        aria-checked={isLight}
                        aria-label={`${isLight ? 'Light' : 'Dark'} mode — flick to turn on ${isLight ? 'dark' : 'light'} mode`}
                        tabIndex={0}
                        focusable="true"
                        style={{ pointerEvents: 'auto', cursor: 'pointer', outline: 'none' }}
                    >
                        <rect
                            x="22" y="118" width="36" height="84" rx="3"
                            fill="url(#plate)"
                            stroke="rgba(0,0,0,0.6)"
                            strokeWidth="0.6"
                        />
                        <rect x="23" y="119" width="34" height="1.4" fill="rgba(255,255,255,0.10)" rx="1" />
                        <circle cx="28" cy="124" r="1.4" fill="#3a3a3a" />
                        <circle cx="52" cy="124" r="1.4" fill="#3a3a3a" />
                        <circle cx="28" cy="196" r="1.4" fill="#3a3a3a" />
                        <circle cx="52" cy="196" r="1.4" fill="#3a3a3a" />
                        <line x1="26.5" y1="124" x2="29.5" y2="124" stroke="#0a0a0a" strokeWidth="0.5" />
                        <line x1="50.5" y1="124" x2="53.5" y2="124" stroke="#0a0a0a" strokeWidth="0.5" />
                        <line x1="26.5" y1="196" x2="29.5" y2="196" stroke="#0a0a0a" strokeWidth="0.5" />
                        <line x1="50.5" y1="196" x2="53.5" y2="196" stroke="#0a0a0a" strokeWidth="0.5" />
                        <ellipse cx="40" cy="160" rx="9" ry="3.5" fill="#050505" />
                        <ellipse cx="40" cy="159" rx="8" ry="2.6" fill="#1a1a1a" />

                        {/* Static socket cap at the pivot */}
                        <ellipse cx="40" cy="160" rx="5.5" ry="2.6" fill="#000" />

                        {/* Lever — children drawn at ABSOLUTE viewBox coords so
                            the explicit transformOrigin '40px 160px' rotates
                            cleanly around the pivot. No parent <g translate>,
                            no transform-box: fill-box, no ambiguity. */}
                        <motion.g
                            animate={{ rotate: isLight ? 0 : 180 }}
                            transition={
                                reduceMotion
                                    ? { duration: 0 }
                                    : { type: 'spring', stiffness: 320, damping: 26 }
                            }
                            style={{ transformOrigin: '40px 160px' }}
                        >
                            <rect x="36.5" y="134" width="7" height="26" rx="2.4" fill="url(#lever-red)" />
                            <circle cx="40" cy="134" r="3.6" fill="#dc2626" stroke="#7a1414" strokeWidth="0.5" />
                            <ellipse cx="38.8" cy="133" rx="1.2" ry="0.8" fill="rgba(255,255,255,0.55)" />
                            <rect x="37" y="136" width="1.4" height="20" fill="rgba(255,255,255,0.18)" rx="0.6" />
                        </motion.g>

                        <text
                            x="40" y="135" textAnchor="middle"
                            fontSize="5" fontWeight="700"
                            letterSpacing="0.5"
                            fill={isLight ? '#5a5a5a' : '#3a3a3a'}
                            style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                            ON
                        </text>
                        <text
                            x="40" y="188" textAnchor="middle"
                            fontSize="5" fontWeight="700"
                            letterSpacing="0.5"
                            fill={isLight ? '#3a3a3a' : '#5a5a5a'}
                            style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                            OFF
                        </text>
                    </g>
                </svg>

            </div>
        </div>
    )
}
