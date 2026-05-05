'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { NavLinkItem, type NavLink } from './NavLinkItem'

interface Props {
  links: readonly NavLink[]
  isOpen: boolean
  isLight: boolean
  activeSection: string
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}

// Theme toggle is the page-level hanging-bulb apparatus (always visible at
// the viewport top-right). The menu doesn't render its own toggle row.
export function NavbarMobileMenu({
  links, isOpen, isLight, activeSection, onLinkClick,
}: Props) {
  return (
    <motion.div
      initial={false}
      animate={isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="lg:hidden overflow-hidden"
      style={{ willChange: 'height' }}
    >
      <div className="px-4 pb-5 pt-1 space-y-1">
        {links.map((link) => (
          <NavLinkItem
            key={link.name}
            variant="mobile"
            link={link}
            active={activeSection === link.href}
            isLight={isLight}
            onClick={(e) => onLinkClick(e, link.href)}
          />
        ))}

        <div className={`pt-3 mt-1 border-t flex flex-col gap-2 ${isLight ? 'border-[#091825]/10' : 'border-white/10'}`}>
          <Link
            href="/maintenance"
            className={`w-full text-center px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${isLight
              ? 'border border-[#091825]/20 text-[#091825]'
              : 'border border-white/20 text-white'
              }`}
          >
            Log In
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
