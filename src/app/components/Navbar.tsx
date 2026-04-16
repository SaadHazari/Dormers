"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { TextRotate } from "@/components/ui/text-rotate";
import ThemeToggleOrb from "./ThemeToggleOrb";
import { useTheme } from "next-themes";

// Mapped exactly to the IDs in page.tsx
const navLinks = [
  { name: "Home", href: "/home#hero", id: "hero" },
  { name: "Why Us", href: "/home#usp", id: "usp" },
  { name: "How it Works", href: "/home#howitworks", id: "howitworks" },
  { name: "Menu", href: "/home#menu", id: "menu" },
  { name: "Testimonials", href: "/home#testimonials", id: "testimonials" },
  { name: "FAQ", href: "/home#faq", id: "faq" },
];

export default function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("/home#hero");
  const { theme, setTheme } = useTheme();
  const isLight = mounted && theme === "light";

  const navRef = useRef<HTMLElement>(null);
  const [orbSize, setOrbSize] = useState(62);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const open  = () => setIsChatOpen(true);
    const close = () => setIsChatOpen(false);
    window.addEventListener('open-chat',  open);
    window.addEventListener('close-chat', close);
    return () => {
      window.removeEventListener('open-chat',  open);
      window.removeEventListener('close-chat', close);
    };
  }, []);

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

  const handleOrderFormOpen = () => {
    window.open("https://vip.dormers.ae/", "_blank");
  };

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
    <header className={`fixed top-6 inset-x-0 mx-auto w-[95%] max-w-6xl z-[90] font-montserrat flex items-stretch gap-5 lg:gap-6 transition-opacity duration-200 ${isChatOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

      {/*
        Golden-ratio decorative rings — desktop only, behind the nav pill.
        Radii: nav height ~62px → φ = 1.618
          Large ring:  62 × φ² ≈ 162px  (anchored left-of-center)
          Medium ring: 62 × φ  ≈ 100px  (anchored right-of-center)
          Small ring:  62px             (anchored far right)
        All pointer-events-none, z-[-1], so they never block interaction.
      */}
      <span
        aria-hidden
        className="hidden lg:block pointer-events-none select-none absolute z-[-1]"
        style={{
          width: 162, height: 162,
          left: "calc(50% - 280px)",
          top: "50%",
          transform: "translateY(-50%)",
          borderRadius: "50%",
          border: "1px solid rgba(245,127,32,0.10)",
        }}
      />
      <span
        aria-hidden
        className="hidden lg:block pointer-events-none select-none absolute z-[-1]"
        style={{
          width: 100, height: 100,
          left: "calc(50% + 140px)",
          top: "50%",
          transform: "translateY(-50%)",
          borderRadius: "50%",
          border: "1px solid rgba(245,127,32,0.08)",
        }}
      />
      <span
        aria-hidden
        className="hidden lg:block pointer-events-none select-none absolute z-[-1]"
        style={{
          width: 62, height: 62,
          right: "calc(6% + 70px)",
          top: "50%",
          transform: "translateY(-50%)",
          borderRadius: "50%",
          border: "1px solid rgba(245,127,32,0.06)",
        }}
      />

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
            {navLinks.map((link) => {
              const isActive = activeSection === link.href;
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className={`relative px-2 lg:px-4 py-2 rounded-full text-[11px] lg:text-[12px] uppercase tracking-wider font-bold transition-all duration-300 z-10 ${isActive
                      ? isLight ? "text-[#091825]" : "text-white"
                      : "opacity-0 pointer-events-none select-none"
                    }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="desktopNavBubble"
                      className="absolute inset-0 bg-[#f57f20]/30 border border-[#f57f20]/40 rounded-full -z-10 shadow-[0_0_10px_rgba(245,127,32,0.2)]"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {link.name}
                </a>
              );
            })}
          </div>

          {/* RIGHT: Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">

            {/* Desktop section navigation hamburger */}
            <div className="relative">
              <button
                onClick={() => setIsDesktopMenuOpen(!isDesktopMenuOpen)}
                className={`p-2 rounded-full transition-colors ${isLight
                    ? "text-[rgba(9,24,37,0.8)] hover:text-[#091825] bg-[#091825]/08 border border-[#091825]/15"
                    : "text-[rgba(255,255,255,0.9)] hover:text-white bg-white/10 border border-white/20"
                  }`}
              >
                {isDesktopMenuOpen ? (
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Bars3Icon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>

              <AnimatePresence>
                {isDesktopMenuOpen && (
                  <motion.div
                    key="desktop-section-menu"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`absolute right-0 top-[calc(100%+10px)] w-52 rounded-3xl backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.3)] overflow-hidden z-50 ${isLight
                        ? "bg-[#FAF6EB]/95 border border-[#091825]/12"
                        : "bg-[#091825]/95 border border-white/20"
                      }`}
                  >
                    <div className="px-3 pt-3 pb-4 space-y-1">
                      {navLinks.map((link) => {
                        const isActive = activeSection === link.href;
                        return (
                          <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            className={`block px-4 py-2.5 rounded-2xl text-[12px] font-bold uppercase tracking-wider transition-colors ${isActive
                                ? "bg-[#f57f20]/20 text-[#f57f20] border border-[#f57f20]/30"
                                : isLight
                                  ? "text-[rgba(9,24,37,0.7)] hover:bg-[#091825]/05 hover:text-[#091825]"
                                  : "text-[rgba(255,255,255,0.8)] hover:bg-white/5 hover:text-white"
                              }`}
                          >
                            {link.name}
                          </a>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link
              href="/login"
              className={`flex items-center justify-center px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-wider transition-colors ${isLight
                  ? "border border-[#091825]/25 text-[#091825] hover:bg-[#091825]/08"
                  : "border border-white/30 text-white hover:bg-white/10"
                }`}
            >
              Log In
            </Link>

            <button
              onClick={handleOrderFormOpen}
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
              onClick={handleOrderFormOpen}
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

        {/* MOBILE EXPANDED CONTENT — accordion inside the pill */}
        <motion.div
          initial={false}
          animate={isMenuOpen ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="lg:hidden overflow-hidden"
          style={{ willChange: "height" }}
        >
          <div className="px-4 pb-5 pt-1 space-y-1">
            {navLinks.map((link) => {
              const isActive = activeSection === link.href;
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className={`block px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${isActive
                      ? "bg-[#f57f20]/20 text-[#f57f20] border border-[#f57f20]/30"
                      : isLight
                        ? "text-[rgba(9,24,37,0.7)] active:bg-[#091825]/05 active:text-[#091825]"
                        : "text-[rgba(255,255,255,0.8)] active:bg-white/5 active:text-white"
                    }`}
                >
                  {link.name}
                </a>
              );
            })}

            <div className={`pt-3 mt-1 border-t flex flex-col gap-2 ${isLight ? "border-[#091825]/10" : "border-white/10"}`}>
              <Link
                href="/login"
                className={`w-full text-center px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${isLight
                    ? "border border-[#091825]/20 text-[#091825]"
                    : "border border-white/20 text-white"
                  }`}
              >
                Log In
              </Link>

              {/* Theme toggle row */}
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-colors ${isLight
                    ? "border border-[#091825]/20 text-[#091825]"
                    : "border border-white/20 text-white"
                  }`}
              >
                <span>{isLight ? "Light Mode" : "Dark Mode"}</span>
                <span className={`w-9 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0 ${isLight ? "bg-[#091825]/15" : "bg-[#f57f20]/50"}`}>
                  <span className={`absolute top-[3px] w-[14px] h-[14px] rounded-full transition-all duration-200 ${isLight ? "left-[3px] bg-[#091825]/40" : "left-[19px] bg-white"}`} />
                </span>
              </button>
            </div>
          </div>
        </motion.div>

      </nav>

      {/* Theme Toggle — desktop only */}
      <div className="hidden lg:flex items-stretch">
        <ThemeToggleOrb size={orbSize} />
      </div>

    </header>
  );
}
