"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { TextRotate } from "@/components/ui/text-rotate";
import { useTheme } from "next-themes";
import ThemeToggleOrb from "./ThemeToggleOrb";
import { NavLinkItem, navLinks } from "./NavLinkItem";
import { NavbarOrnaments } from "./NavbarOrnaments";
import { NavbarDesktopSectionMenu } from "./NavbarDesktopSectionMenu";
import { NavbarMobileMenu } from "./NavbarMobileMenu";

export default function Navbar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("/home#hero");
  const { theme, setTheme } = useTheme();
  const isLight = mounted && theme === "light";

  const navRef = useRef<HTMLElement>(null);
  const [orbSize, setOrbSize] = useState(62);

  useLayoutEffect(() => {
    const measure = () => {
      if (navRef.current) setOrbSize(navRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close any open menu when clicking outside the nav pill
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        setIsDesktopMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Scroll Spying
  useEffect(() => {
    if (!mounted) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(`/home#${entry.target.id}`);
          }
        });
      },
      { rootMargin: "-40% 0px -40% 0px" }
    );

    navLinks.forEach((link) => {
      const element = document.getElementById(link.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [mounted]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setActiveSection(href);
    setIsMenuOpen(false);
    setIsDesktopMenuOpen(false);

    const targetId = href.split("#")[1];
    // Delay scroll until after the accordion close animation (300ms) so
    // getBoundingClientRect returns the settled position, not the expanded-menu position.
    setTimeout(() => {
      const elem = document.getElementById(targetId);
      if (elem) {
        const yOffset = -100;
        const y = Math.max(0, elem.getBoundingClientRect().top + window.scrollY + yOffset);
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    }, 350);
  };

  return (
    <header className={`fixed top-6 inset-x-0 mx-auto w-[95%] max-w-6xl z-[90] font-montserrat flex items-stretch gap-5 lg:gap-6 transition-opacity duration-200 opacity-100`}>

      <NavbarOrnaments />

      {/* NAV PILL — always rounded-3xl on mobile to avoid shape-morph jank */}
      <nav
        ref={navRef}
        className={`flex-grow w-full max-w-[100vw] flex flex-col rounded-3xl lg:rounded-full backdrop-blur-[28px] saturate-[1.5] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_1px_0_0_rgba(255,255,255,0.06),0_8px_32px_0_rgba(0,0,0,0.25)] transition-colors duration-300 ${isMenuOpen
          ? isLight
            ? "bg-[#F5F0E8]/85 border border-[#091825]/15"
            : "bg-[#091825]/80 border border-white/20"
          : isLight
            ? "bg-[#091825]/06 border border-[#091825]/15"
            : "bg-[#FAF6EB]/10 border border-white/10"
          }`}
        style={{ WebkitBackdropFilter: "blur(28px) saturate(1.5)", backdropFilter: "blur(28px) saturate(1.5)" }}
      >
        {/* TOP ROW — always visible */}
        <div className="flex items-center justify-between px-4 lg:px-6 py-1.5 lg:py-3">

          {/* LOGO */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/home" onClick={(e) => handleNavClick(e, "/home#hero")}>
              <Image
                src={isLight ? "/logo-light.svg" : "/logo-dark.svg"}
                alt="Dormers"
                width={180}
                height={56}
                className="w-auto h-11 lg:h-12 hover:opacity-80 transition-opacity drop-shadow-md"
                priority
              />
            </Link>
          </div>

          {/* CENTER: Navigation Links (desktop only) */}
          <div className="hidden lg:flex items-center justify-center gap-1 relative">
            {navLinks.map((link) => (
              <NavLinkItem
                key={link.name}
                variant="pill"
                link={link}
                active={activeSection === link.href}
                isLight={isLight}
                onClick={(e) => handleNavClick(e, link.href)}
              />
            ))}
          </div>

          {/* RIGHT: Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">

            <NavbarDesktopSectionMenu
              links={navLinks}
              isOpen={isDesktopMenuOpen}
              setIsOpen={setIsDesktopMenuOpen}
              isLight={isLight}
              activeSection={activeSection}
              onLinkClick={handleNavClick}
            />

            <Link
              href="/maintenance"
              className={`flex items-center justify-center px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-wider transition-colors ${isLight
                ? "border border-[#091825]/25 text-[#091825] hover:bg-[#091825]/08"
                : "border border-white/30 text-white hover:bg-white/10"
                }`}
            >
              Log In
            </Link>

            <button
              onClick={() => router.push("/maintenance")}
              className="flex items-center justify-center min-w-[155px] overflow-hidden relative bg-gradient-to-r from-[#f57f20] to-[#ffaa00] text-white px-6 py-2.5 rounded-full shadow-[0_0_20px_rgba(245,127,32,0.4)] hover:scale-105 hover:shadow-[0_0_30px_rgba(245,127,32,0.6)] transition-all duration-300"
            >
              <TextRotate
                texts={["Get Started", "View Plans"]}
                mainClassName="text-[12px] uppercase font-black tracking-wider text-white !whitespace-nowrap !flex-nowrap"
                staggerDuration={0.03}
                staggerFrom="last"
                rotationInterval={3500}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            </button>
          </div>

          {/* MOBILE: Get Started + Hamburger */}
          <div className="lg:hidden flex items-center gap-2.5">
            <button
              onClick={() => router.push("/maintenance")}
              className={`flex items-center justify-center min-w-[125px] overflow-hidden relative backdrop-blur-sm px-4 py-2 rounded-full active:scale-95 transition-all duration-200 border ${isLight ? "bg-[#f57f20]/15 border-[#f57f20]/40 text-[#f57f20]" : "bg-[#f57f20]/15 border-[#f57f20]/35 text-[#f57f20]"}`}
              style={{ WebkitBackdropFilter: "blur(4px)", backdropFilter: "blur(4px)" }}
            >
              <TextRotate
                texts={["Get Started", "View Plans"]}
                mainClassName="text-[11px] uppercase font-black tracking-wider text-[#f57f20] !whitespace-nowrap !flex-nowrap"
                staggerDuration={0.03}
                staggerFrom="last"
                rotationInterval={3500}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            </button>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-1.5 rounded-full focus:outline-none transition-colors ${isLight
                ? "text-[rgba(9,24,37,0.8)] hover:text-[#091825] bg-[#091825]/08 border border-[#091825]/15"
                : "text-[rgba(255,255,255,0.9)] hover:text-white bg-white/10 border border-white/20"
                }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMenuOpen ? (
                  <motion.span
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="block"
                  >
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="open"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="block"
                  >
                    <Bars3Icon className="h-5 w-5" aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

        </div>

        <NavbarMobileMenu
          links={navLinks}
          isOpen={isMenuOpen}
          isLight={isLight}
          activeSection={activeSection}
          theme={theme}
          setTheme={setTheme}
          onLinkClick={handleNavClick}
        />

      </nav>

      {/* Theme Toggle — desktop only */}
      <div className="hidden lg:flex items-stretch">
        <ThemeToggleOrb size={orbSize} />
      </div>

    </header>
  );
}
