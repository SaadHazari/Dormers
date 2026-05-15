import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Drop Spotlight — cone shape pointing down (spotlight beam). 24×24 stencil. */
export function DropSpotlight({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* Light source (small rect at top) */}
      <rect x="9" y="2" width="6" height="3" rx="1" />
      {/* Cone (downward beam) */}
      <path d="M9 5 L 4 19 L 20 19 L 15 5 Z" />
      {/* Inner highlight line */}
      <line x1="11" y1="9" x2="9" y2="17" />
    </svg>
  )
}
