'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Traps keyboard focus inside the ref'd element while `active` is true.
 * Restores focus to the previously-focused element on deactivation.
 *
 * Standard modal-accessibility pattern: keeps Tab/Shift-Tab cycling within
 * the modal so keyboard users can't accidentally Tab into background
 * elements that are visually obscured by the backdrop.
 *
 * Behaviour:
 *   • On activation: snapshots document.activeElement (the trigger), focuses
 *     the first focusable child inside the container after a short delay
 *     (lets the open animation settle so the focused element is paintable).
 *   • While active: on Tab/Shift+Tab keydown, wraps focus from last→first
 *     and first→last respectively. Other keys (Escape, etc.) flow through
 *     unmodified — the modal handles those itself.
 *   • On deactivation: restores focus to the trigger element so keyboard
 *     users land back where they were when the modal opened.
 *
 * No-op when there are zero focusable children — modal won't break, just
 * won't trap. SSR-safe (effect doesn't run on server).
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  containerRef: React.RefObject<T | null>,
) {
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    triggerRef.current = (document.activeElement as HTMLElement) ?? null

    // Live query — recomputed on each Tab so dynamically-added/removed
    // controls (e.g. a button that becomes enabled mid-flight) are picked up.
    const getFocusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null)

    const initialFocusTimer = window.setTimeout(() => {
      const els = getFocusables()
      els[0]?.focus()
    }, 40)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const els = getFocusables()
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(initialFocusTimer)
      window.removeEventListener('keydown', onKey)
      const trigger = triggerRef.current
      // Defer the focus restore so it lands after the modal's exit animation
      // unmounts the container — focusing during unmount can be a no-op.
      if (trigger && typeof trigger.focus === 'function') {
        window.setTimeout(() => trigger.focus(), 0)
      }
    }
  }, [active, containerRef])
}
