'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Phase 5's synth sound system, migrated into _shared/dw/audio/ per Phase 6 D-09.
 *
 * Phase 6 D-16 reverses default ON → default OFF: the AudioPrompt pill is the
 * canonical gate now via `dw-audio-enabled`. This hook reads `dw-audio-enabled`
 * (Phase 6 key) — falls back to `dw-sound` (Phase 5 key) for back-compat one
 * cycle, then both default to OFF.
 *
 * Acts as the placeholder stinger source for `copy-tick`, `milestone-fanfare`,
 * `drop-reveal` through Waves 2-4 until Wave 5 swaps recorded stems.
 *
 * Exports `ctx` so the new useAudioBed and useStingers hooks can share the
 * same AudioContext instance via the prop wiring done by DormWarsClient.
 */
export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [on, setOn] = useState(false) // Phase 6 D-16: default OFF

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Phase 6 priority: dw-audio-enabled. Fall back to dw-sound for one cycle.
    const v6 = localStorage.getItem('dw-audio-enabled')
    const v5 = localStorage.getItem('dw-sound')
    if (v6 === 'on') setOn(true)
    else if (v6 === 'off') setOn(false)
    else if (v5 === 'on') setOn(true) // back-compat: honor Phase 5 user pref one cycle
    else setOn(false)
  }, [])

  const toggle = useCallback(() => {
    setOn(prev => {
      const next = !prev
      localStorage.setItem('dw-audio-enabled', next ? 'on' : 'off') // Phase 6 D-16 key
      return next
    })
  }, [])

  const ctx = useCallback(() => {
    if (!ctxRef.current && typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined
      if (Ctor) ctxRef.current = new Ctor()
    }
    return ctxRef.current
  }, [])

  const playCopyTick = useCallback(() => {
    if (!on) return
    const ac = ctx(); if (!ac) return
    const osc = ac.createOscillator()
    const g   = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1500, ac.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.08)
    g.gain.setValueAtTime(0.08, ac.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08)
    osc.connect(g).connect(ac.destination)
    osc.start(); osc.stop(ac.currentTime + 0.08)
  }, [on, ctx])

  const playMilestoneFanfare = useCallback(() => {
    if (!on) return
    const ac = ctx(); if (!ac) return
    ;[523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ac.createOscillator()
      const g   = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ac.currentTime + i * 0.08
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.04)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      osc.connect(g).connect(ac.destination)
      osc.start(t0); osc.stop(t0 + 0.22)
    })
  }, [on, ctx])

  const playDropReveal = useCallback(() => {
    if (!on) return
    const ac = ctx(); if (!ac) return
    const osc = ac.createOscillator()
    const g   = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, ac.currentTime)
    osc.frequency.exponentialRampToValueAtTime(800, ac.currentTime + 0.4)
    g.gain.setValueAtTime(0.0001, ac.currentTime)
    g.gain.exponentialRampToValueAtTime(0.10, ac.currentTime + 0.05)
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4)
    osc.connect(g).connect(ac.destination)
    osc.start(); osc.stop(ac.currentTime + 0.4)
  }, [on, ctx])

  return { on, toggle, playCopyTick, playMilestoneFanfare, playDropReveal, ctx }
}
