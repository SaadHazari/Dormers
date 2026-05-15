import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Drop Skip — forward triangles + vertical bar (skip-forward, stencil rendition). 24×24 stencil. */
export function DropSkip({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...rest}
    >
      <polygon points="4 6 4 18 12 12" />
      <polygon points="11 6 11 18 19 12" />
      <line x1="20" y1="6" x2="20" y2="18" />
    </svg>
  )
}
