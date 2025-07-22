"use client";

import Link from "next/link";
// import Image from 'next/image';
import { FaInstagram, FaFacebook } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Image from "next/image";

export default function Footer() {
  const router = useRouter();
  const { theme } = useTheme();

  const deliveryLocations = [
    "The Myriad",
    "KSK Homes",
    "Yugo",
    "DSOA Residences",
    "Study World",
  ];

  const quickLinks = [
    { name: "MENU", href: "/home#menu" },
    { name: "FAQ’S", href: "/home#faq" },
    { name: "ABOUT US", href: "/home#about" },
    { name: "TESTIMONIALS", href: "/home#testimonials" },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const isHomeHash = href.startsWith("/home#");

    if (isHomeHash) {
      const hash = href.split("#")[1];
      if (window.location.pathname === "/home") {
        // If already on home page, just scroll
        const element = document.querySelector(`#${hash}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        // If not on home page, navigate and then scroll
        router.push(href);
      }
    } else {
      router.push(href);
    }
  };

  return (
    <>
      <footer
        className={`${
          theme === "light"
            ? "bg-[#031624] text-[#1E3A4F]"
            : "bg-[#031624] text-white"
        } py-[24px] lg:hidden block`}
      >
        <div className="container mx-auto px-5 lg:max-w-[987px] ">
          <div className="flex justify-between items-center">
            <div>
              <h3
                className="font-semibold mb-4"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 700,
                  lineHeight: "100%",
                  fontSize: "13px",
                  letterSpacing: "0",
                  color: "white",
                }}
              >
                Delivery Locations
              </h3>
              <ul className="space-y-2">
                {deliveryLocations.map((location) => (
                  <li
                    key={location}
                    className={`${
                      theme === "light"
                        ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                        : "text-gray-300 hover:text-orange-400"
                    } transition-colors`}
                    style={{
                      fontFamily: "Poppins, sans-serif",
                      fontWeight: 400,
                      lineHeight: "100%",
                      fontSize: "12px",
                      letterSpacing: "0.5px",
                      color: "white",
                    }}
                  >
                    {location}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <ul className="space-y-2 lg:flex lg:gap-[52px]">
                {quickLinks.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      onClick={(e) => handleNavClick(e, link.href)}
                      className="hover:text-orange-400 transition-colors"
                      style={{
                        fontFamily: "Montserrat, sans-serif",
                        fontSize: "12px",
                        fontWeight: 700,
                        lineHeight: "2px",
                        color: "white",
                      }}
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 md:justify-start">
            <div>
              <h3
                className="text-left font-semibold mb-4"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 700,
                  lineHeight: "100%",
                  fontSize: "13px",
                  letterSpacing: "0",
                  color: "white",
                }}
              >
                Follow Us
              </h3>
              <div className="flex items-center space-x-4">
                <a
                  href="https://www.facebook.com/profile.php?id=61567276984641"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center space-x-2 ${
                    theme === "light"
                      ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                      : "text-gray-300 hover:text-orange-400"
                  } transition-colors`}
                >
                  <FaFacebook className="w-4 h-4 text-white" />
                </a>
                <a
                  href="https://www.instagram.com/dormers.ae"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center space-x-2 ${
                    theme === "light"
                      ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                      : "text-gray-300 hover:text-orange-400"
                  } transition-colors`}
                >
                  <FaInstagram className="w-4 h-4 text-white" />
                </a>
              </div>
            </div>
          </div>
          <div
            className="mt-8 pt-8 border-t border-white/30 text-sm text-center"
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 400,
              lineHeight: "100%",
              letterSpacing: "0.5px",
              fontSize: "11px",
            }}
          >
            <div className="flex flex-row justify-between items-center gap-6 flex-wrap">
              <Link
                href="/cookies-policy"
                className="hover:text-orange-400 text-white"
              >
                Cookies Policy
              </Link>
              <Link
                href="/legal-terms"
                className="hover:text-orange-400 text-white"
              >
                Legal Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-orange-400 text-white"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
      <footer
        className={`${
          theme === "light"
            ? "bg-[#031624] text-[#1E3A4F]"
            : "bg-[#031624] text-white"
        } py-10 lg:block hidden`}
      >
        <div className="container mx-auto lg:max-w-[987px] ">
          <div className="">
            <div>
              <div className="flex justify-between">
                <div className="relative w-[45px] h-[45px] md:w-[52px] md:h-[52px]">
                  <Image
                    src={
                      theme === "light" ? "/logo-light.png" : "/logo-dark.svg"
                    }
                    alt="Dormer's Logo"
                    fill
                    className="object-contain"
                  />
                </div>
                <div>
                  <ul className="space-y-2 lg:flex lg:gap-[52px]">
                    {quickLinks.map((link) => (
                      <li key={link.name}>
                        <a
                          href={link.href}
                          onClick={(e) => handleNavClick(e, link.href)}
                          className="hover:text-orange-400 transition-colors"
                          style={{
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "14px",
                            fontWeight: 700,
                            lineHeight: "2px",
                            color: "white",
                          }}
                        >
                          {link.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <h3
                    className="font-semibold mb-4 pt-[28px]"
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 700,
                      lineHeight: "100%",
                      fontSize: "16px",
                      letterSpacing: "0",
                      color: "white",
                    }}
                  >
                    Delivery Locations
                  </h3>
                  <div className="flex flex-col gap-[16px]">
                    <div className="flex gap-[28px]">
                      <p
                        className={`location_footer_desktop ${
                          theme === "light" ? " text-white" : "text-white"
                        }`}
                      >
                        The Myriad
                      </p>
                      <p className={`location_footer_desktop text-white`}>
                        DSOA Residence
                      </p>
                    </div>
                    <div className="flex gap-[28px]">
                      <p className={`location_footer_desktop text-white`}>
                        KSK Homes
                      </p>
                      <p className={`location_footer_desktop text-white`}>
                        Studo World
                      </p>
                    </div>
                    <div className="flex gap-[28px]">
                      <p className={`location_footer_desktop text-white`}>
                        Yugo
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-10 md:justify-start">
                  <div>
                    <h3
                      className="text-left font-semibold mb-4"
                      style={{
                        fontFamily: "Montserrat, sans-serif",
                        fontWeight: 700,
                        lineHeight: "100%",
                        fontSize: "13px",
                        letterSpacing: "0",
                        color: "white",
                      }}
                    >
                      Follow Us
                    </h3>
                    <div className="flex items-center space-x-4">
                      <a
                        href="https://www.facebook.com/profile.php?id=61567276984641"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center space-x-2 ${
                          theme === "light"
                            ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                            : "text-gray-300 hover:text-orange-400"
                        } transition-colors`}
                      >
                        <FaFacebook className="w-4 h-4 text-white" />
                      </a>
                      <a
                        href="https://www.instagram.com/dormers.ae"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center space-x-2 ${
                          theme === "light"
                            ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                            : "text-gray-300 hover:text-orange-400"
                        } transition-colors`}
                      >
                        <FaInstagram className="w-4 h-4 text-white" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className="mt-8 pt-8 border-t border-dashed border-white text-sm text-center"
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 400,
            lineHeight: "100%",
            letterSpacing: "0.5px",
            fontSize: "11px",
          }}
        >
          <div className="lg:max-w-[987px]  mx-auto">
            <div className="flex gap-[54px]">
              <Link
                href="/cookies-policy"
                className="hover:text-orange-400 text-white text-[14px]"
              >
                Cookies Policy
              </Link>
              <Link
                href="/legal-terms"
                className="hover:text-orange-400 text-white text-[14px]"
              >
                Legal Terms
              </Link>
              <Link
                href="/privacy"
                className="hover:text-orange-400 text-white text-[14px]"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
