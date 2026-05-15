import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Reward Free Skip — skip-forward with a small "free" dot accent. 24×24 stencil. */
export function RewardFreeSkip({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <polygon points="3 7 3 17 10 12" />
      <polygon points="9 7 9 17 16 12" />
      <line x1="17" y1="7" x2="17" y2="17" />
      {/* Free-pass dot (top-right corner) */}
      <circle cx="20" cy="6" r="2" fill="currentColor" />
    </svg>
  )
}
