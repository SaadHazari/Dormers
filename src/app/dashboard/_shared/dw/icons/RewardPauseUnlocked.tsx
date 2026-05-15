import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Reward Pause Unlocked — pause bars with an open padlock above. 24×24 stencil. */
export function RewardPauseUnlocked({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* Open padlock shackle (top) — broken on the right per "unlocked" convention */}
      <path d="M9 7 L 9 5 C 9 3.5, 10 2.5, 12 2.5 C 14 2.5, 15 3.5, 15 5" />
      {/* Padlock body */}
      <rect x="7" y="7" width="10" height="6" rx="1" />
      {/* Pause bars (below the lock) */}
      <line x1="10" y1="16" x2="10" y2="21" />
      <line x1="14" y1="16" x2="14" y2="21" />
    </svg>
  )
}
