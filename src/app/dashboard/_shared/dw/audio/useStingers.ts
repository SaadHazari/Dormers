'use client'

import { useCallback, useRef } from 'react'

const STINGER_PATHS = {
  'copy-tick':         '/audio/dw/stingers/copy-tick.mp3',
  'unlock':            '/audio/dw/stingers/unlock.mp3',
  'drop-reveal':       '/audio/dw/stingers/drop-reveal.mp3',
  'warning':           '/audio/dw/stingers/warning.mp3',
  'rank-up':           '/audio/dw/stingers/rank-up.mp3',
  'milestone-fanfare': '/audio/dw/stingers/milestone-fanfare.mp3',
  'conversion-impact': '/audio/dw/stingers/conversion-impact.mp3',
  'title-intro':       '/audio/dw/stingers/title-intro.mp3',
} as const

export type StingerKey = keyof typeof STINGER_PATHS

function duckBed(bedGain: GainNode, durationSec: number, ctx: AudioContext) {
  const now = ctx.currentTime
  const tail = 0.200    // 200ms tail after stinger ends
  const ramp = 0.240    // 240ms exponential rise back
  const duckGain = 0.501 // -6 dB
  bedGain.gain.cancelScheduledValues(now)
  bedGain.gain.setValueAtTime(bedGain.gain.value, now)
  bedGain.gain.linearRampToValueAtTime(duckGain, now + 0.04) // duck in 40ms
  bedGain.gain.setValueAtTime(duckGain, now + durationSec + tail)
  bedGain.gain.exponentialRampToValueAtTime(1.0, now + durationSec + tail + ramp)
}

/**
 * Stinger library hook. Lazy-fetches and decodes each stem on first play.
 * Ducks the bed by -6dB during play + 200ms tail, ramps back over 240ms (UI-SPEC Ducking).
 * Spatial pan via StereoPannerNode (UI-SPEC Spatial Pan).
 *
 * If `ctx` or `bedGain` is null (audio not enabled), `play` is a no-op.
 * If the fetch / decode fails (stem not yet present — Wave 5 lands real stems),
 * the call is silent — no error UI.
 */
export function useStingers(ctx: AudioContext | null, bedGain: GainNode | null) {
  const cacheRef = useRef<Map<string, AudioBuffer>>(new Map())

  const play = useCallback(async (key: StingerKey, opts: { panX?: number; gainDb?: number } = {}) => {
    if (!ctx || !bedGain) return
    try {
      let buf = cacheRef.current.get(key)
      if (!buf) {
        const res = await fetch(STINGER_PATHS[key])
        if (!res.ok) return // silent fail — stem not yet present in Wave 2
        const arr = await res.arrayBuffer()
        buf = await ctx.decodeAudioData(arr)
        cacheRef.current.set(key, buf)
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, opts.panX ?? 0))
      const g = ctx.createGain()
      g.gain.value = opts.gainDb !== undefined ? Math.pow(10, opts.gainDb / 20) : 1.0
      src.connect(g).connect(pan).connect(ctx.destination)
      duckBed(bedGain, buf.duration, ctx)
      src.start()
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[useStingers] play failed:', key, err)
    }
  }, [ctx, bedGain])

  return { play }
}
