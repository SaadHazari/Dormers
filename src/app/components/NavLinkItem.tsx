'use client'

import { motion } from 'framer-motion'

// Mapped exactly to the IDs in page.tsx
export const navLinks = [
  { name: 'Home', href: '/home#hero', id: 'hero' },
  { name: 'Why Us', href: '/home#usp', id: 'usp' },
  { name: 'How it Works', href: '/home#howitworks', id: 'howitworks' },
  { name: 'Menu', href: '/home#menu', id: 'menu' },
  { name: 'Testimonials', href: '/home#testimonials', id: 'testimonials' },
  { name: 'FAQ', href: '/home#faq', id: 'faq' },
] as const

// One link rendered three different ways depending on where it sits.
// Was duplicated as three near-identical `navLinks.map(...)` blocks
// (desktop pill, desktop dropdown, mobile accordion).
export type NavLink = (typeof navLinks)[number]
export type NavLinkVariant = 'pill' | 'dropdown' | 'mobile'

interface Props {
  variant: NavLinkVariant
  link: NavLink
  active: boolean
  isLight: boolean
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

export function NavLinkItem({ variant, link, active, isLight, onClick }: Props) {
  if (variant === 'pill') {
    return (
      <a
        href={link.href}
        onClick={onClick}
        className={`relative px-2 lg:px-4 py-2 rounded-full text-[11px] lg:text-[12px] uppercase tracking-wider font-bold transition-all duration-300 z-10 ${active
          ? isLight ? 'text-[#091825]' : 'text-white'
          : 'opacity-0 pointer-events-none select-none'
          }`}
      >
        {active && (
          <motion.div
            layoutId="desktopNavBubble"
            className="absolute inset-0 bg-[#f57f20]/30 border border-[#f57f20]/40 rounded-full -z-10 shadow-[0_0_10px_rgba(245,127,32,0.2)]"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
        {link.name}
      </a>
    )
  }

  if (variant === 'dropdown') {
    return (
      <a
        href={link.href}
        onClick={onClick}
        className={`block px-4 py-2.5 rounded-2xl text-[12px] font-bold uppercase tracking-wider transition-colors ${active
          ? 'bg-[#f57f20]/20 text-[#f57f20] border border-[#f57f20]/30'
          : isLight
            ? 'text-[rgba(9,24,37,0.7)] hover:bg-[#091825]/05 hover:text-[#091825]'
            : 'text-[rgba(255,255,255,0.8)] hover:bg-white/5 hover:text-white'
          }`}
      >
        {link.name}
      </a>
    )
  }

  // mobile
  return (
    <a
      href={link.href}
      onClick={onClick}
      className={`block px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${active
        ? 'bg-[#f57f20]/20 text-[#f57f20] border border-[#f57f20]/30'
        : isLight
          ? 'text-[rgba(9,24,37,0.7)] active:bg-[#091825]/05 active:text-[#091825]'
          : 'text-[rgba(255,255,255,0.8)] active:bg-white/5 active:text-white'
        }`}
    >
      {link.name}
    </a>
  )
}
