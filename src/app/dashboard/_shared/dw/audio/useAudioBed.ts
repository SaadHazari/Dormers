'use client'

import { useEffect, useRef, useState } from 'react'

const BED_STEMS = {
  drone:   { url: '/audio/dw/ambient/drone.mp3',   dbGain: -18 },
  chatter: { url: '/audio/dw/ambient/chatter.mp3', dbGain: -24 },
  duct:    { url: '/audio/dw/ambient/duct.mp3',    dbGain: -22 },
} as const

type BedHandle = {
  /** Master gain node for the bed bus — useStingers ducks this. */
  bedGain: GainNode
  /** AnalyserNode tap — useAudioReactive reads this. */
  analyser: AnalyserNode
  /** Stop all three sources and disconnect. */
  stop: () => void
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

/**
 * Three-stem ambient bed manager. Loads on enable (lazy — only after user gesture).
 * Crossfades in over 800ms (UI-SPEC). All three stems loop seamlessly.
 *
 * Returns `null` until enabled. Caller (DormWarsClient) gates by `audioEnabled` flag.
 *
 * Phase 6 architecture-first (D-03): files at /audio/dw/ambient/*.mp3 may not exist yet —
 * Wave 5 lands real stems. If fetch fails, hook stays silent (no error UI per UI-SPEC error state).
 */
export function useAudioBed(ctx: AudioContext | null, enabled: boolean) {
  const handleRef = useRef<BedHandle | null>(null)
  const [ready, setReady] = useState(false)

  // Mount/unmount based on `enabled`.
  useEffect(() => {
    if (!ctx || !enabled) {
      if (handleRef.current) {
        handleRef.current.stop()
        handleRef.current = null
        setReady(false)
      }
      return
    }

    let cancelled = false

    async function start() {
      if (!ctx) return
      try {
        const bedGain = ctx.createGain()
        bedGain.gain.value = 0 // start silent, crossfade in
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        bedGain.connect(analyser)
        analyser.connect(ctx.destination)

        // Fetch + decode all three in parallel.
        const buffers = await Promise.all(
          (Object.keys(BED_STEMS) as Array<keyof typeof BED_STEMS>).map(async key => {
            const cfg = BED_STEMS[key]
            const res = await fetch(cfg.url)
            if (!res.ok) throw new Error(`Bed stem fetch failed: ${cfg.url} ${res.status}`)
            const arr = await res.arrayBuffer()
            const buf = await ctx.decodeAudioData(arr)
            return { key, buf, cfg }
          })
        )

        if (cancelled) return

        // Connect each stem with its own gain.
        for (const { buf, cfg } of buffers) {
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.loop = true
          const g = ctx.createGain()
          g.gain.value = dbToGain(cfg.dbGain)
          src.connect(g).connect(bedGain)
          src.start()
        }

        // Crossfade in: master bed gain 0 → 1.0 over 800ms (UI-SPEC).
        const now = ctx.currentTime
        bedGain.gain.setValueAtTime(0, now)
        bedGain.gain.linearRampToValueAtTime(1.0, now + 0.8)

        handleRef.current = {
          bedGain,
          analyser,
          stop: () => {
            try { bedGain.disconnect() } catch { /* ignore */ }
            try { analyser.disconnect() } catch { /* ignore */ }
          },
        }
        setReady(true)
      } catch (err) {
        // Silent fail per UI-SPEC error state — audio is opt-in atmosphere, not core functionality.
        if (typeof console !== 'undefined') console.warn('[useAudioBed] failed to start bed:', err)
      }
    }

    start()
    return () => {
      cancelled = true
      if (handleRef.current) {
        handleRef.current.stop()
        handleRef.current = null
        setReady(false)
      }
    }
  }, [ctx, enabled])

  return { ready, bedGain: handleRef.current?.bedGain ?? null, analyser: handleRef.current?.analyser ?? null }
}
