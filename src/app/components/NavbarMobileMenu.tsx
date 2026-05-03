'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { NavLinkItem, type NavLink } from './NavLinkItem'

interface Props {
  links: readonly NavLink[]
  isOpen: boolean
  isLight: boolean
  activeSection: string
  theme: string | undefined
  setTheme: (theme: string) => void
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}

/**
 * Mobile-only accordion that expands inside the nav pill — owns the section
 * link list, login link, and dark/light toggle row. The outer height/opacity
 * spring lives here so all mobile-menu motion stays in one file.
 */
export function NavbarMobileMenu({
  links, isOpen, isLight, activeSection, theme, setTheme, onLinkClick,
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

          {/* Theme toggle row */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${isLight
              ? 'border border-[#091825]/20 text-[#091825]'
              : 'border border-white/20 text-white'
              }`}
          >
            <span>{isLight ? 'Light Mode' : 'Dark Mode'}</span>
            <span className={`w-9 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0 ${isLight ? 'bg-[#091825]/15' : 'bg-[#f57f20]/50'}`}>
              <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full transition-all duration-200 ${isLight ? 'left-[3px] bg-[#091825]/40' : 'left-[19px] bg-white'}`} />
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  )
}
