import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Commander rank — three stacked chevrons. 24×24 stencil. */
export function RankCommander({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <polyline points="4 18 12 12 20 18" />
      <polyline points="4 13 12 7 20 13" />
      <polyline points="4 8 12 2 20 8" />
    </svg>
  )
}
