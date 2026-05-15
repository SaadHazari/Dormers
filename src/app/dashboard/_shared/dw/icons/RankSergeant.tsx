import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Sergeant rank — two stacked chevrons. 24×24 stencil. */
export function RankSergeant({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <polyline points="4 16 12 10 20 16" />
      <polyline points="4 11 12 5 20 11" />
    </svg>
  )
}
