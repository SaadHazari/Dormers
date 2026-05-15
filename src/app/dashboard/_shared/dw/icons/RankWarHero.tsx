import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** War Hero rank — five-pointed star inside a circle (battlefield medal motif). 24×24 stencil. */
export function RankWarHero({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <polygon points="12 6 13.6 10.2 18 10.5 14.5 13.3 15.8 17.5 12 15.1 8.2 17.5 9.5 13.3 6 10.5 10.4 10.2" />
    </svg>
  )
}
