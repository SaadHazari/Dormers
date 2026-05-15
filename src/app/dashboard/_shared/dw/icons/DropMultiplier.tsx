import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Drop Multiplier — "×2" mark in stencil. 24×24 stencil. */
export function DropMultiplier({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* X mark (multiplication) */}
      <line x1="4" y1="6" x2="11" y2="13" />
      <line x1="11" y1="6" x2="4" y2="13" />
      {/* "2" digit */}
      <path d="M14 7.5 C 14 6, 16 5.5, 17.5 6 C 19 6.5, 19 8, 18 9.5 C 17 11, 14 13, 14 13 L 19 13" />
    </svg>
  )
}
