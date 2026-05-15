import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Soldier rank — single chevron stripe (one-stripe insignia). 24×24 stencil. */
export function RankSoldier({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <polyline points="4 14 12 8 20 14" />
    </svg>
  )
}
