import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** HUD Callsign — minimalist tag mark (dot + underline + small bar). 24×24 stencil. */
export function HudCallsign({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <circle cx="6" cy="9" r="2" fill="currentColor" />
      <line x1="10" y1="9" x2="20" y2="9" />
      <line x1="6" y1="15" x2="14" y2="15" />
    </svg>
  )
}
