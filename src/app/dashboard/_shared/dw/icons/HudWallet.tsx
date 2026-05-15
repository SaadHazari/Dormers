import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** HUD Wallet — wallet rectangle with fold and a card slot. 24×24 stencil. */
export function HudWallet({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <rect x="3" y="6" width="18" height="13" rx="1" />
      {/* Card slot / clasp on the right side */}
      <path d="M16 12 L 21 12" />
      <circle cx="17.5" cy="12" r="1" fill="currentColor" />
      {/* Top fold line (wallet flap edge) */}
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  )
}
