"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import OrderForm from "@/app/components/OrderForm";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOrderFormOpen = () => {
    console.log("Opening order form...");
    setIsOrderFormOpen(true);
  };

  const handleOrderFormClose = () => {
    console.log("Closing order form...");
    setIsOrderFormOpen(false);
  };

  const navLinks = [
    { name: "Home", href: "/home#hero" },
    { name: "Menu", href: "/home#menu" },
    { name: "FAQ's", href: "/home#faq" },
    { name: "About", href: "/home#about" },
    { name: "Voices of Delight", href: "/home#testimonials" },
  ];

  // const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
  //   e.preventDefault();
  //   const isHomeHash = href.startsWith('/home#');

  //   if (isHomeHash) {
  //     const hash = href.split('#')[1];
  //     if (window.location.pathname === '/home') {
  //       const element = document.querySelector(`#${hash}`);
  //       if (element) {
  //         element.scrollIntoView({ behavior: 'smooth' });
  //       }
  //     } else {
  //       // If not on home page, navigate and then scroll
  //       router.push(href);
  //     }
  //   } else {
  //     router.push(href);
  //   }
  //   setIsMenuOpen(false);
  // };
  const handleNavClick = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const [basePath, hash] = href.split("#");

    if (window.location.pathname === basePath) {
      // Already on the page, scroll to element
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // Navigate first, then scroll manually after route change
      router.push(basePath, { scroll: false }); // 👈 prevent default scroll behavior

      // Delay scroll to element after navigation
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 300); // delay to wait for page to mount
    }

    setIsMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed w-11/12 md:w-[98%] shadow-md z-[100] rounded-3xl mx-auto left-0 right-0 mt-4 transition-colors duration-300 ${
          theme === "light" ? "bg-white" : "bg-[#031624]"
        }`}
      >
        <div className="w-full px-2 sm:px-4">
          <div className="flex justify-between h-16 sm:h-20 items-center">
            {/* Logo */}
            <Link href="/home" className="flex-shrink-0 flex items-center">
              <div className="relative w-12 h-12 sm:w-16 md:w-24 sm:h-16 md:h-24">
                <Image
                  src={theme === "light" ? "/logo-light.png" : "/logo.png"}
                  alt="Dormer's Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className={`transition-colors ${
                    theme === "light"
                      ? "text-gray-700 hover:text-orange-500"
                      : "text-gray-300 hover:text-orange-400"
                  }`}
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 700,
                    lineHeight: "100%",
                    letterSpacing: "0",
                  }}
                >
                  {link.name}
                </a>
              ))}
            </div>

            {/* Mobile Navbar Container */}
            <div className="md:hidden flex items-center justify-between w-full px-3 py-1">
              {/* Join the Club Button */}
              <button
                type="button"
                onClick={handleOrderFormOpen}
                className={`text-[10px] border rounded-[8px] px-3 py-3 transition-colors
    ${
      theme === "light"
        ? "text-[#031624] border-[#031624] hover:bg-[#031624] hover:text-white"
        : "text-white border-white hover:bg-white hover:text-[#031624]"
    }
  `}
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 600,
                  lineHeight: "100%",
                  letterSpacing: "0",
                  marginLeft: "40%",
                }}
              >
                Join the club
              </button>

              {/* Theme Toggle & Menu Button Wrapper */}
              <div className="flex items-center gap-2">
                {/* Theme Toggle */}
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    theme === "light" ? "bg-white" : "bg-[#EEE9DA]"
                  }`}
                >
                  {theme === "light" ? (
                    <MoonIcon className="h-3 w-3 text-[#031624]" />
                  ) : (
                    <SunIcon className="h-3 w-3 text-[#031624]" />
                  )}
                </button>

                {/* Hamburger Menu */}
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    theme === "light" ? "bg-white" : "bg-[#EEE9DA]"
                  }`}
                >
                  <svg
                    className="h-4 w-4 text-[#031624]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {isMenuOpen ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Desktop Theme Toggle & CTA */}
            <div className="hidden md:flex items-center space-x-4">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none bg-transparent border-2 ${
                  theme === "light" ? "border-gray-700" : "border-white"
                }`}
              >
                <span className="sr-only">Toggle theme</span>
                <div
                  className={`${
                    mounted && theme === "dark"
                      ? "translate-x-7"
                      : "translate-x-1"
                  } inline-block h-6 w-6 transform rounded-full transition-transform duration-200 ease-in-out relative ${
                    theme === "light" ? "bg-gray-700" : "bg-white"
                  }`}
                >
                  {mounted && theme === "dark" ? (
                    <MoonIcon className="h-4 w-4 absolute top-1 left-1 text-[#031624]" />
                  ) : (
                    <SunIcon className="h-4 w-4 absolute top-1 left-1 text-orange-400" />
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={handleOrderFormOpen}
                className={`border-2 px-6 py-2 rounded-full transition-all bg-transparent ${
                  theme === "light"
                    ? "border-gray-700 text-gray-700 hover:bg-gray-700 hover:text-white"
                    : "border-white text-white hover:bg-white hover:text-[#031624]"
                }`}
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 700,
                  lineHeight: "100%",
                  letterSpacing: "0",
                }}
              >
                Join the club
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`md:hidden ${isMenuOpen ? "block" : "hidden"}`}>
          <div className="px-2 pt-1 pb-2 space-y-0.5 sm:px-3">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`block px-3 py-1.5 text-sm transition-colors ${
                  theme === "light"
                    ? "text-gray-700 hover:text-orange-500"
                    : "text-gray-300 hover:text-orange-400"
                }`}
              >
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Order Form */}
      <OrderForm isOpen={isOrderFormOpen} onClose={handleOrderFormClose} />
    </>
  );
}
