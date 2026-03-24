"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import OrderForm from "@/app/components/OrderForm";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const [, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [isAtTop, setIsAtTop] = useState(true);

  // ─── MAGIC SCROLL LOGIC TO HIDE NAVBAR ON HERO ───
  useEffect(() => {
    if (pathname !== "/home" && pathname !== "/") {
      setIsAtTop(false);
      return;
    }
    const handleScroll = () => {
      // Hides navbar if in the top 85% of the screen
      setIsAtTop(window.scrollY < window.innerHeight * 0.85);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); 
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);
  // ────────────────────────────────────────────────

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOrderFormOpen = () => {
    window.open("https://vip.dormers.ae/", "_blank");
  };

  const handleOrderFormClose = () => {
    setIsOrderFormOpen(false);
  };

  const navLinks = [
    { name: "Home", href: "/home#hero" },
    { name: "Menu", href: "/home#menu" },
    { name: "FAQ's", href: "/home#faq" },
    { name: "About", href: "/home#about" },
    { name: "Voices of Delight", href: "/home#testimonials" },
  ];

  const handleNavClick = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const [basePath, hash] = href.split("#");

    const scrollToSection = (id: string) => {
      const section = document.getElementById(id);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
        window.history.pushState(null, "", `#${id}`);
      }
    };

    if (window.location.pathname === basePath) {
      scrollToSection(hash);
    } else {
      router.push(basePath, { scroll: false });
      setTimeout(() => scrollToSection(hash), 300);
    }
    setIsMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed w-11/12 md:w-[98%] shadow-md z-[100] rounded-[12px] md:rounded-[14px] mx-auto left-0 right-0 mt-4 transition-all duration-500 bg-[#031624] ${
          isAtTop ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'
        }`}
      >
        <div className="w-full px-2 sm:px-4">
          <div className="flex justify-between h-16 sm:h-20 items-center">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0 flex items-center MobileNavbarlogo">
              <div className="relative w-[45px] h-[45px] md:w-[52px] md:h-[52px]">
                <Image
                  src={"/logo-dark.svg"}
                  alt="Dormer's Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </Link>

            <div className="flex items-center justify-end md:justify-end w-full px-3 py-1">
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  type="button"
                  onClick={handleOrderFormOpen}
                  className={`Join_the_club text-[10px] border rounded-[8px] px-3 py-3 md:hidden block transition-colors text-white border-white hover:bg-white hover:text-[#031624]`}
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 600,
                    lineHeight: "100%",
                  }}
                >
                  Join the club
                </button>
                <div>
                  <button
                    type="button"
                    onClick={handleOrderFormOpen}
                    className={`Join_the_club !text-white !border-white !hover:bg-white !hover:text-[#031624] md:block hidden`}
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 600,
                      lineHeight: "100%",
                    }}
                  >
                    Join the club
                  </button>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={`w-6 h-6 rounded-full flex items-center justify-center md:h-[37px] md:w-[37px] ${theme === "light" ? "bg-white" : "bg-[#EEE9DA]"}`}
                >
                  {theme === "light" ? (
                    <MoonIcon className="h-3 w-3 text-[#031624] md:w-[24px]" />
                  ) : (
                    <SunIcon className="h-3 w-3 text-[#031624] md:w-[24px] md:h-[24px]" />
                  )}
                </button>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center md:h-[37px] md:w-[37px] ${theme === "light" ? "bg-white" : "bg-[#EEE9DA]"}`}
                >
                  <svg className="h-4 w-4 text-[#031624] md:w-[18px] md:h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`${isMenuOpen ? "block" : "hidden"}`}>
          <div className="px-2 pt-1 pb-2 space-y-0.5 sm:px-3">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`block px-3 py-1.5 text-sm transition-colors ${theme === "light" ? "text-white hover:text-orange-500" : "text-gray-300 hover:text-orange-400"}`}
              >
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <OrderForm isOpen={isOrderFormOpen} onClose={handleOrderFormClose} />
    </>
  );
}
