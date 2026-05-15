'use client'

import type { CSSProperties } from 'react'
import { OG, NV } from '../../tokens'

type AnchorImageProps = {
  /** Source path. Defaults to /images/dw/anchor.jpg (the war-room photograph). */
  src?: string
  /** Optional override for max width as a fraction of viewport. Defaults to "min(40%, 480px)". */
  maxWidth?: string
  /** Optional position overrides for the anchor moment placement. */
  style?: CSSProperties
  /** Optional alt text. Decorative by default (alt=""). */
  alt?: string
}

const FILTER_ID = 'dw-anchor-duotone'

/**
 * Phase 6 D-07 — Treated war-room anchor image.
 *
 * SINGLE MOUNT EXPECTATION: this component is the ONE anchor moment per page (per D-07
 * "One specific anchor moment: place behind the cycle clock in the hero, or as a watermark
 * in the Active Mission card. Not multiple anchor uses."). Mounting it more than once on
 * the same page violates the design intent and dilutes the perception flip.
 *
 * Mandatory treatments applied (D-07 + UI-SPEC):
 *   1. Duotone NV→OG via inline SVG <feColorMatrix> filter (shadows mapped to NV #091825,
 *      highlights to OG #F57F20). The filter is referenced by url(#dw-anchor-duotone).
 *   2. Partial composition: max width clamped via `style={{ width: 'min(40%, 480px)',
 *      maxWidth: '40%' }}` — never full-bleed.
 *   3. Edge feathering via maskImage radial-gradient — edges fade to transparent so the
 *      image dissolves into the NV background rather than sitting as a hard rectangle.
 *   4. Local vignette via inset box-shadow — corners darker than page vignette to anchor
 *      the visual weight inward.
 *   5. Grain match: the page-level Grain overlay (z-index 9999) passes over this image
 *      naturally because it sits at a lower z-index. No per-image grain layer needed.
 *   6. Parallax 0.5x: this component does NOT wrap itself in <ParallaxLayer multiplier={0.5}>;
 *      callers (HeroBlock) wrap it externally so they can place it absolutely without nesting
 *      transform contexts. When wrapped in ParallaxLayer multiplier=0.5 it drifts slowest of
 *      the three strata (foreground 1.0, mid 0.85, background 0.5).
 *
 * Reduced-motion: no animation here — the component is a treated still. Parallax handling
 * lives in ParallaxLayer; reduced-motion neutralizes it there.
 *
 * Missing-file behavior: if /images/dw/anchor.jpg is absent, the <image> renders nothing
 * (browser shows alt text or empty area) and the SVG filter applies to nothing. The
 * component still mounts safely and the rest of the page is unaffected.
 */
export function AnchorImage({
  src = '/images/dw/anchor.jpg',
  maxWidth,
  style,
  alt = '',
}: AnchorImageProps) {
  const widthRule = maxWidth ?? 'min(40%, 480px)'
  return (
    <div
      style={{
        position: 'relative',
        width: widthRule,
        maxWidth: '40%',
        aspectRatio: '16 / 10',
        // Edge feathering — radial mask fades the rectangle into transparency at the rim
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 60%, transparent 100%)',
        maskImage: 'radial-gradient(ellipse at center, black 60%, transparent 100%)',
        // Local vignette — inset shadow darkens the corners further than the page vignette
        boxShadow: 'inset 0 0 80px 0 rgba(0,0,0,0.55), inset 0 0 200px 0 rgba(9,24,37,0.40)',
        backgroundColor: NV,
        overflow: 'hidden',
        ...style,
      }}
      aria-hidden={alt === ''}
    >
      {/* Inline SVG filter definition — duotone NV→OG via feColorMatrix.
          Shadows (R,G,B all ≈ 0) map to NV #091825 = (9, 24, 37).
          Highlights (R,G,B all ≈ 1) map to OG #F57F20 = (245, 127, 32).
          The matrix uses the luminance channel of the source image to interpolate
          between the two colors. */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute', width: 0, height: 0 }}
        aria-hidden
      >
        <defs>
          <filter id={FILTER_ID}>
            {/* Step 1: convert source RGB to luminance (single grayscale channel in alpha-out via matrix). */}
            <feColorMatrix
              type="matrix"
              values="
                0.2126 0.7152 0.0722 0 0
                0.2126 0.7152 0.0722 0 0
                0.2126 0.7152 0.0722 0 0
                0      0      0      1 0
              "
            />
            {/* Step 2: map grayscale → duotone gradient.
                NV (#091825 = 9/255=0.035, 24/255=0.094, 37/255=0.145) when input = 0
                OG (#F57F20 = 245/255=0.961, 127/255=0.498, 32/255=0.125) when input = 1
                Linear interp via the diagonal coefficient + constant offset. */}
            <feColorMatrix
              type="matrix"
              values="
                0.926 0     0     0 0.035
                0.404 0     0     0 0.094
               -0.020 0     0     0 0.145
                0     0     0     1 0
              "
            />
          </filter>
        </defs>
      </svg>

      {/* The image itself — wrapped in an SVG so we can apply the filter to the rasterized output.
          Using <image> inside <svg> lets the duotone filter cascade over the photograph. */}
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          filter: `url(#${FILTER_ID})`,
        }}
        aria-hidden={alt === ''}
        role={alt === '' ? undefined : 'img'}
        aria-label={alt || undefined}
      >
        <image
          href={src}
          x="0"
          y="0"
          width="1600"
          height="1000"
          preserveAspectRatio="xMidYMid slice"
        />
      </svg>

      {/* OG accent rim — subtle 1px inner border in OG to tie the anchor to the war-room palette. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 0 1px ${OG}33`,
        }}
      />
    </div>
  )
}
