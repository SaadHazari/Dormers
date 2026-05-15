/**
 * Apply a 1.5px random microshake to the target element for `durationMs`.
 * UI-SPEC Motion Craft: ±1.5px translate per frame at 60fps for 120ms (rank-up cutscene step 5,
 * also conversion impact flash partner).
 *
 * D-15 reduced-motion: caller is responsible for checking the gate BEFORE calling this function.
 * (No internal MQ check — caller has access to `useReducedMotionGate()` and can early-return.)
 *
 * NOT a hook — this is an imperative function so cutscenes can fire it from event handlers.
 */
export function triggerScreenShake(target: HTMLElement | null, durationMs = 120, magnitudePx = 1.5): void {
  if (!target) return
  if (typeof window === 'undefined') return
  const start = performance.now()
  const originalTransform = target.style.transform
  let rafId = 0

  const tick = (now: number) => {
    const elapsed = now - start
    if (elapsed >= durationMs) {
      target.style.transform = originalTransform
      return
    }
    const dx = (Math.random() * 2 - 1) * magnitudePx
    const dy = (Math.random() * 2 - 1) * magnitudePx
    target.style.transform = `${originalTransform} translate(${dx}px, ${dy}px)`
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  // Safety cleanup after duration — guarantees the transform is restored even
  // if the rAF loop is interrupted (tab backgrounded, page unmounted, etc.).
  setTimeout(() => {
    cancelAnimationFrame(rafId)
    target.style.transform = originalTransform
  }, durationMs + 16)
}
