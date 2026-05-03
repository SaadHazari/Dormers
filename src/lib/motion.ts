import type { Easing } from 'framer-motion'

/**
 * Shared Framer Motion ease curves. Each curve was inlined across
 * multiple files with subtle drift in how it was typed (`as const`
 * vs `Easing`). Pulled up here so brand motion stays consistent.
 */

/**
 * Smooth, balanced cubic-bezier — Framer's "easeInOutQuart"-ish curve.
 * The default brand ease for entrance animations and stagger reveals.
 *
 * Was inlined as `E` (HeroReveal, HowItWorks) and `cardEase` (USPBento).
 */
export const EASE_STANDARD: Easing = [0.25, 0.46, 0.45, 0.94]

/**
 * Sharp cubic-bezier for dramatic exits. Preloader's outgoing slide.
 */
export const EASE_DRAMATIC: Easing = [0.76, 0, 0.24, 1]

/**
 * Smoother sigmoid for clip-path reveals. Preloader's orange-fill wipe.
 */
export const EASE_SMOOTH: Easing = [0.65, 0, 0.35, 1]
