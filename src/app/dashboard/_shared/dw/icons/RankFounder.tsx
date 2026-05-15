import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Founder rank — laurel wreath (top tier, victorious leader). 24×24 stencil. */
export function RankFounder({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      {/* Left laurel branch */}
      <path d="M7 4 C 4 8, 4 14, 7 19" />
      <path d="M6 7 C 7 7.5, 8 8, 8.5 9" />
      <path d="M5 11 C 6 11, 7.5 11.5, 8 12" />
      <path d="M5.5 15 C 6.5 15, 8 15.5, 8.5 16" />
      {/* Right laurel branch */}
      <path d="M17 4 C 20 8, 20 14, 17 19" />
      <path d="M18 7 C 17 7.5, 16 8, 15.5 9" />
      <path d="M19 11 C 18 11, 16.5 11.5, 16 12" />
      <path d="M18.5 15 C 17.5 15, 16 15.5, 15.5 16" />
      {/* Center star */}
      <polygon points="12 9 12.9 11 15 11.2 13.4 12.6 13.9 14.7 12 13.6 10.1 14.7 10.6 12.6 9 11.2 11.1 11" />
    </svg>
  )
}
