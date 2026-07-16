'use client'

import { useEffect, useState } from 'react'

/**
 * One silent retry before an error boundary shows its dialog.
 *
 * The dominant real-world cause of dashboard boundaries firing is a cold
 * serverless instance timing out and truncating the RSC stream
 * mid-navigation — by the time the boundary mounts, that instance (or a
 * sibling) is warm and an immediate retry succeeds. sessionStorage (not a
 * ref) tracks the attempt because reset() remounts the boundary component,
 * wiping component state. A second failure inside the window means
 * something is genuinely wrong — the boundary should show its dialog.
 *
 * Returns true while the silent retry is pending (render a quiet loading
 * state), false when the dialog should render.
 */
const AUTO_RETRY_KEY = 'dash-error-auto-retry-at'
const AUTO_RETRY_WINDOW_MS = 30_000
const AUTO_RETRY_DELAY_MS = 1_500

function shouldAutoRetry(): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_RETRY_KEY) ?? 0)
    return Date.now() - last > AUTO_RETRY_WINDOW_MS
  } catch {
    return false
  }
}

export function useSilentRetry(reset: () => void): boolean {
  const [retrying, setRetrying] = useState(shouldAutoRetry)

  useEffect(() => {
    if (!retrying) return
    try {
      sessionStorage.setItem(AUTO_RETRY_KEY, String(Date.now()))
    } catch {
      setRetrying(false)
      return
    }
    const t = setTimeout(() => reset(), AUTO_RETRY_DELAY_MS)
    return () => clearTimeout(t)
  }, [retrying, reset])

  return retrying
}
