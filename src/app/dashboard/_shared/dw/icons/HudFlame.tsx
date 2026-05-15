import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** HUD Flame — single asymmetric flame silhouette (streak indicator). 24×24 stencil. */
export function HudFlame({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* Outer flame silhouette */}
      <path d="M12 2.5 C 13.5 6, 18 8, 18 13 C 18 17, 15.5 21, 12 21 C 8.5 21, 6 17, 6 13 C 6 10, 8 9, 9 7 C 9.5 9, 11 10, 12 8 C 12 6, 11.5 4, 12 2.5 Z" />
      {/* Inner flame — secondary asymmetric tongue */}
      <path d="M12 11 C 13 13, 14.5 14.5, 14.5 16.5 C 14.5 18.5, 13.5 20, 12 20 C 10.5 20, 9.5 18.5, 9.5 16.5 C 9.5 15, 10.5 14, 11 13 C 11.5 14, 12 13.5, 12 11 Z" />
    </svg>
  )
}
