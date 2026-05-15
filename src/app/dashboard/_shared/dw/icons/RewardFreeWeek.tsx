import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Reward Free Week — calendar with "7" mark (full week reward). 24×24 stencil. */
export function RewardFreeWeek({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
      {/* "7" digit inside calendar body */}
      <polyline points="9 13 15 13 11.5 18" />
    </svg>
  )
}
