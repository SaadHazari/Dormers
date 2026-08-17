'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { BODY, S, TIER1 } from './tokens'
import { useFocusTrap } from './useFocusTrap'
import { useBodyScrollLock } from '@/ui-system/hooks/useBodyScrollLock'
import { COMPACT } from './breakpoints'

/**
 * MobileSheet — the keystone Phase-0 primitive for the mobile redesign.
 *
 * ONE container that presents as:
 *   • ≥768px  → a centered dialog (the existing desktop modal look — preserved
 *               so migrating a modal here is a no-op on desktop).
 *   • <768px  → a bottom sheet: pinned to the bottom edge, full-width, rounded
 *               top corners, grab handle, slide-up entrance, safe-area bottom
 *               padding, a scrollable body, and an action cluster pinned to the
 *               bottom (thumb zone) with a hairline divider.
 *
 * It owns the plumbing every bespoke modal currently re-implements: the
 * backdrop, scrim-tap + ESC dismissal, focus trap (via the shared
 * {@link useFocusTrap}), and background scroll-lock. Callers render their own
 * headline/medallion/content as `children` and pass their action buttons as
 * `footer` — on mobile that cluster becomes the bottom-pinned CTA band, on
 * desktop it sits inline at the end like today.
 *
 * Decisions locked 2026-06-02: modals + rail popovers route through this;
 * forcing overlays pass `dismissible={false}` (no scrim/ESC dismiss).
 * See .interface-design/mobile-redesign-spec.md.
 */

// Re-exported from the shared contract so sheets follow the same switch as
// the tree they belong to — a portrait iPad shows the mobile tree, so it must
// get mobile sheets too, not desktop modals sized for a mouse.
const COMPACT_QUERY = COMPACT

/**
 * SSR-safe compact-viewport flag. Sheets only ever mount after a client-side
 * interaction (a trigger sets `open`), so there's no hydration flash to guard
 * against — the first paint is already client-side.
 *
 * The initial state is read SYNCHRONOUSLY from matchMedia (not `false` + an
 * effect) — that flag picks the entrance variant, and a sheet only mounts on
 * first open. Defaulting false then flipping true a tick later mounted the
 * sheet as the desktop dialog variant, and the flip's mobile `animate` (no
 * `opacity` key) orphaned the fade-in → an invisible sheet over the blurred
 * scrim on the FIRST open, working only on the second. Reading the real value
 * up front makes the first open slide up correctly.
 */
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY)
    setCompact(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact
}

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  /** Action cluster — buttons. Bottom-pinned band on mobile; inline-end on desktop. */
  footer?: ReactNode
  /** False for forcing overlays: disables scrim-tap + ESC dismiss, hides the X. Default true. */
  dismissible?: boolean
  /** Desktop centered-dialog max width. Default 460. */
  maxWidth?: number
  /** Hide the default close X (when a flow renders its own dismiss). Default false. */
  hideClose?: boolean
  /** Stacking context base. Default 300 (matches existing modals). */
  zIndex?: number
  /** Accessible label for the dialog when there's no visible headline with an id. */
  ariaLabel?: string
  /** Points aria-labelledby at the caller's headline element id. */
  ariaLabelledby?: string
  children: ReactNode
}

export function MobileSheet({
  open,
  onClose,
  footer,
  dismissible = true,
  maxWidth = 460,
  hideClose = false,
  zIndex = 300,
  ariaLabel,
  ariaLabelledby,
  children,
}: MobileSheetProps) {
  const compact = useIsCompact()
  const sheetRef = useRef<HTMLDivElement>(null)
  // Drag-to-dismiss is driven by dragControls and STARTED ONLY from the grab
  // handle (dragListener:false). That scoping is the whole trick: the gesture
  // can never be picked up by the scrollable body or the date-grid, so swiping
  // content scrolls it and only grabbing the handle moves the sheet — no fight,
  // no jitter. Compact + dismissible only; desktop and forcing overlays opt out.
  const dragControls = useDragControls()
  useFocusTrap(open, sheetRef)

  // ESC to dismiss (dismissible sheets only). Forcing overlays opt out.
  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  // Background scroll-lock while a sheet is open. Uses the repo's iOS-airtight
  // hook (position:fixed + saved-scrollY restore) — plain `overflow:hidden` does
  // NOT stop iOS rubber-band/scroll-chaining, which was the "page behind scrolls"
  // half of the bug. overscrollBehavior:contain on the body is the second layer.
  useBodyScrollLock(open)

  // Entrance/exit differs by presentation: slide-up from the bottom on mobile,
  // the established scale+rise on desktop.
  const surfaceMotion = compact
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { opacity: 0, scale: 0.94, y: 14 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 8 } }

  const surfaceStyle: CSSProperties = compact
    ? {
        ...TIER1,
        cursor: 'default',
        width: '100%',
        maxWidth: '100%',
        // maxHeight lives in the .mobile-sheet-surface-compact class (92svh with
        // a 92vh cascade fallback) — it CANNOT be an inline style: a duplicate
        // maxHeight key in this object collapses to one value and drops the
        // legacy fallback. See globals.css.
        borderRadius: '20px 20px 0 0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 -12px 40px rgba(9,24,37,0.25)',
        // REQUIRED: anchors the absolutely-positioned close-X to the SHEET. Without
        // it the X falls back to the fixed overlay (the whole screen) and lands in
        // the dark scrim top-right — invisible and nowhere near where you'd tap.
        position: 'relative',
      }
    : {
        ...TIER1,
        cursor: 'default',
        width: '100%',
        maxWidth,
        maxHeight: '88vh',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }

  // Drag-to-dismiss props — only on a compact, dismissible sheet. top elastic 0
  // forbids dragging UP past the rest position; downward has rubber-band give and
  // springs back unless the release clears the distance/velocity threshold.
  const enableDrag = compact && dismissible
  const dragProps = enableDrag
    ? {
        drag: 'y' as const,
        dragControls,
        dragListener: false,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0, bottom: 0.7 },
        onDragEnd: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
          if (info.offset.y > 110 || info.velocity.y > 550) onClose()
        },
      }
    : {}

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mobile-sheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={dismissible ? onClose : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabelledby ? undefined : ariaLabel}
          aria-labelledby={ariaLabelledby}
          className="mobile-sheet-scroll"
          style={{
            position: 'fixed', inset: 0, zIndex,
            background: 'rgba(9,24,37,0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            justifyContent: 'center',
            // Bottom-anchored on mobile (sheet rises from the edge), centered on desktop.
            alignItems: compact ? 'flex-end' : 'center',
            padding: compact ? 0 : 20,
            cursor: dismissible ? 'pointer' : 'default',
          }}
        >
          <motion.div
            ref={sheetRef}
            className={compact ? 'mobile-sheet-surface-compact' : undefined}
            initial={surfaceMotion.initial}
            animate={surfaceMotion.animate}
            exit={surfaceMotion.exit}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
            style={surfaceStyle}
            {...dragProps}
          >
            {/* Grab handle — visible pill plus a GENEROUS invisible drag zone over
                the whole top of the sheet, so the user doesn't have to hit the
                thin pill. The zone is zIndex 1 (below the close X at zIndex 2, so
                the X stays tappable) and touchAction:none so the gesture isn't
                taken as a scroll. Body scroll below the zone is untouched. */}
            {enableDrag && (
              <>
                <div style={{ flex: 'none', display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 8 }}>
                  <span aria-hidden style={{ width: 36, height: 4, borderRadius: 999, background: S.border2 }} />
                </div>
                <div
                  onPointerDown={e => dragControls.start(e)}
                  aria-hidden
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 84, zIndex: 1, cursor: 'grab', touchAction: 'none' }}
                />
              </>
            )}

            {/* Close X — sits over the scrollable body so it stays pinned. */}
            {!hideClose && dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  position: 'absolute', top: compact ? 12 : 14, right: 14, zIndex: 2,
                  width: 44, height: 44, padding: 0, borderRadius: 8,
                  background: 'transparent', border: 'none', color: S.fgMuted,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            )}

            {/* Scrollable body — caller renders headline + content here. Bottom
                padding shrinks when a footer follows so body+footer don't
                double-pad; the footer supplies the closing space. */}
            <div
              className="mobile-sheet-scroll"
              style={{
                flex: '1 1 auto',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                paddingTop: compact ? 4 : 'clamp(24px, 4vw, 32px)',
                paddingLeft: compact ? 20 : 'clamp(24px, 4vw, 32px)',
                paddingRight: compact ? 20 : 'clamp(24px, 4vw, 32px)',
                paddingBottom: footer ? (compact ? 12 : 16) : (compact ? 20 : 'clamp(24px, 4vw, 32px)'),
                fontFamily: BODY,
              }}
            >
              {children}
            </div>

            {/* Action cluster — bottom-pinned band on mobile (thumb zone + safe
                area + hairline), inline-end on desktop to preserve the look. */}
            {footer && (
              <div
                style={compact
                  ? {
                      flex: 'none',
                      display: 'flex', gap: 10, flexWrap: 'wrap',
                      padding: '14px 20px',
                      paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
                      borderTop: `1px solid ${S.border}`,
                      background: 'var(--ds-surface-tier1)',
                    }
                  : {
                      flex: 'none',
                      display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end',
                      paddingTop: 8,
                      paddingLeft: 'clamp(24px, 4vw, 32px)',
                      paddingRight: 'clamp(24px, 4vw, 32px)',
                      paddingBottom: 'clamp(24px, 4vw, 32px)',
                    }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
