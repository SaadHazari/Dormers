'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotionGate } from '../utils/useReducedMotionGate'

const UPDATE_FPS = 30           // Cap updates at 30fps per UI-SPEC Audio-Reactive Bloom
const MIN_INTENSITY = 1.0
const MAX_INTENSITY = 1.4
const MIN_BIN = 10              // ~200Hz at 44.1kHz / 256 fft
const MAX_BIN = 60              // ~2000Hz at 44.1kHz / 256 fft

/**
 * Reads AnalyserNode mid-band amplitude → returns intensity multiplier 1.0..1.4
 * for Bloom components to consume.
 *
 * D-15 reduced-motion: returns flat 1.0 always (no audio-reactive variation).
 * If `analyser` is null (audio not enabled), returns flat 1.0.
 * `active=false` opts out per-element (Bloom prop `audioReactive={false}`).
 */
export function useAudioReactive(analyser: AnalyserNode | null, active: boolean): number {
  const reduced = useReducedMotionGate()
  const [intensity, setIntensity] = useState(MIN_INTENSITY)
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    if (!analyser || !active || reduced) {
      setIntensity(MIN_INTENSITY)
      return
    }
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = (now: number) => {
      // Throttle to 30fps.
      if (now - lastUpdateRef.current >= 1000 / UPDATE_FPS) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        let count = 0
        for (let i = MIN_BIN; i <= Math.min(MAX_BIN, data.length - 1); i++) {
          sum += data[i]
          count++
        }
        const avg = count > 0 ? sum / count : 0
        const next = MIN_INTENSITY + (avg / 255) * (MAX_INTENSITY - MIN_INTENSITY)
        setIntensity(next)
        lastUpdateRef.current = now
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [analyser, active, reduced])

  return intensity
}
