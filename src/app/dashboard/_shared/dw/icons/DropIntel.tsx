import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Drop Intel — eye motif (intelligence / surveillance). 24×24 stencil. */
export function DropIntel({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* Outer eye almond */}
      <path d="M2 12 C 5 6, 9 4, 12 4 C 15 4, 19 6, 22 12 C 19 18, 15 20, 12 20 C 9 20, 5 18, 2 12 Z" />
      {/* Iris */}
      <circle cx="12" cy="12" r="3" />
      {/* Pupil dot */}
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
