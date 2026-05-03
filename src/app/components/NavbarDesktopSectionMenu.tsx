'use client'

import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { NavLinkItem, type NavLink } from './NavLinkItem'

interface Props {
  links: readonly NavLink[]
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  isLight: boolean
  activeSection: string
  onLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}

/**
 * Desktop-only section navigation hamburger — the right-side trigger that
 * opens a dropdown of all sections (mirror of the mobile accordion). Owns
 * its own AnimatePresence so the open/close animation lives with the panel.
 */
export function NavbarDesktopSectionMenu({
  links, isOpen, setIsOpen, isLight, activeSection, onLinkClick,
}: Props) {
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-full transition-colors ${isLight
          ? 'text-[rgba(9,24,37,0.8)] hover:text-[#091825] bg-[#091825]/08 border border-[#091825]/15'
          : 'text-[rgba(255,255,255,0.9)] hover:text-white bg-white/10 border border-white/20'
          }`}
      >
        {isOpen ? (
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bars3Icon className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="desktop-section-menu"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute right-0 top-[calc(100%+10px)] w-52 rounded-3xl backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.3)] overflow-hidden z-50 ${isLight
              ? 'bg-[#FAF6EB]/95 border border-[#091825]/12'
              : 'bg-[#091825]/95 border border-white/20'
              }`}
          >
            <div className="px-3 pt-3 pb-4 space-y-1">
              {links.map((link) => (
                <NavLinkItem
                  key={link.name}
                  variant="dropdown"
                  link={link}
                  active={activeSection === link.href}
                  isLight={isLight}
                  onClick={(e) => onLinkClick(e, link.href)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
