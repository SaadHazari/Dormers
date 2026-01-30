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
        className={`${theme === "light"
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
                    className={`${theme === "light"
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
                  className={`inline-flex items-center space-x-2 ${theme === "light"
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
                  className={`inline-flex items-center space-x-2 ${theme === "light"
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
            className="mt-4 pt-7 border-t border-white/30 text-sm text-center"
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
            <div className="mt-2">
              <div className="flex flex-row justify-between">
                <p className="text-white text-[10px]">
                  © {new Date().getFullYear()} Dormer&apos;s All rights reserved
                </p>
                <a className="hover:text-orange-400 text-white text-[10px]" href="https://www.Najah.io" target="_blank" rel="noopener noreferrer">Developed By @Najah media </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
      <footer
        className={`${theme === "light"
          ? "bg-[#031624] text-[#1E3A4F]"
          : "bg-[#031624] text-white"
          } py-[14px] lg:block hidden`}
      >
        <div className="container mx-auto lg:max-w-[987px] ">
          <div className="">
            <div>
              <div className="flex justify-between">
                <div className="relative w-[45px] h-[45px] md:w-[52px] md:h-[52px]">
                  <Image
                    src={
                      theme === "light" ? "/logo-dark.svg" : "/logo-dark.svg"
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
                      textTransform: "uppercase",
                    }}
                  >
                    Delivery Locations
                  </h3>
                  <div className="flex flex-col gap-[16px]">
                    <div className="flex gap-[28px]">
                      <p
                        className={`location_footer_desktop ${theme === "light" ? " text-white" : "text-white"
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
                        textTransform: "uppercase",
                      }}
                    >
                      Follow Us
                    </h3>
                    <div className="flex items-center  gap-[8px] justify-end">
                      <a
                        href="https://www.facebook.com/profile.php?id=61567276984641"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center  socialmediaiconbox ${theme === "light"
                          ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                          : "text-gray-300 hover:text-orange-400"
                          } transition-colors`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M12 6.03651C12 9.05477 9.79839 11.5619 6.91935 12V7.78905H8.32258L8.58871 6.03651H6.91935V4.91684C6.91935 4.43002 7.16129 3.96755 7.91129 3.96755H8.66129V2.48276C8.66129 2.48276 7.98387 2.36105 7.30645 2.36105C5.95161 2.36105 5.05645 3.21298 5.05645 4.72211V6.03651H3.53226V7.78905H5.05645V12C2.17742 11.5619 0 9.05477 0 6.03651C0 2.70183 2.68548 0 6 0C9.31452 0 12 2.70183 12 6.03651Z"
                            fill="#1E3A4F"
                          />
                        </svg>
                      </a>
                      <a
                        href="https://www.instagram.com/dormers.ae"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center socialmediaiconbox ${theme === "light"
                          ? "text-[#1E3A4F] hover:text-[#FF6B00]"
                          : "text-gray-300 hover:text-orange-400"
                          } transition-colors`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="11"
                          height="11"
                          viewBox="0 0 11 11"
                          fill="none"
                        >
                          <path
                            d="M5.51228 2.66406C7.05915 2.66406 8.33594 3.94085 8.33594 5.48772C8.33594 7.05915 7.05915 8.31138 5.51228 8.31138C3.94085 8.31138 2.68862 7.05915 2.68862 5.48772C2.68862 3.94085 3.94085 2.66406 5.51228 2.66406ZM5.51228 7.32924C6.51897 7.32924 7.32924 6.51897 7.32924 5.48772C7.32924 4.48103 6.51897 3.67076 5.51228 3.67076C4.48103 3.67076 3.67076 4.48103 3.67076 5.48772C3.67076 6.51897 4.50558 7.32924 5.51228 7.32924ZM9.0971 2.56585C9.0971 2.93415 8.80245 3.22879 8.43415 3.22879C8.06585 3.22879 7.77121 2.93415 7.77121 2.56585C7.77121 2.19754 8.06585 1.9029 8.43415 1.9029C8.80245 1.9029 9.0971 2.19754 9.0971 2.56585ZM10.9632 3.22879C11.0123 4.13728 11.0123 6.86272 10.9632 7.77121C10.9141 8.65513 10.7176 9.41629 10.0792 10.0792C9.44085 10.7176 8.65513 10.9141 7.77121 10.9632C6.86272 11.0123 4.13728 11.0123 3.22879 10.9632C2.34487 10.9141 1.58371 10.7176 0.920759 10.0792C0.282366 9.41629 0.0859375 8.65513 0.0368304 7.77121C-0.0122768 6.86272 -0.0122768 4.13728 0.0368304 3.22879C0.0859375 2.34487 0.282366 1.55915 0.920759 0.920759C1.58371 0.282366 2.34487 0.0859375 3.22879 0.0368304C4.13728 -0.0122768 6.86272 -0.0122768 7.77121 0.0368304C8.65513 0.0859375 9.44085 0.282366 10.0792 0.920759C10.7176 1.55915 10.9141 2.34487 10.9632 3.22879ZM9.7846 8.72879C10.0792 8.01674 10.0056 6.29799 10.0056 5.48772C10.0056 4.70201 10.0792 2.98326 9.7846 2.24665C9.58817 1.78013 9.21987 1.38728 8.75335 1.2154C8.01674 0.920759 6.29799 0.99442 5.51228 0.99442C4.70201 0.99442 2.98326 0.920759 2.27121 1.2154C1.78013 1.41183 1.41183 1.78013 1.2154 2.24665C0.920759 2.98326 0.99442 4.70201 0.99442 5.48772C0.99442 6.29799 0.920759 8.01674 1.2154 8.72879C1.41183 9.21987 1.78013 9.58817 2.27121 9.7846C2.98326 10.0792 4.70201 10.0056 5.51228 10.0056C6.29799 10.0056 8.01674 10.0792 8.75335 9.7846C9.21987 9.58817 9.61272 9.21987 9.7846 8.72879Z"
                            fill="#1E3A4F"
                          />
                        </svg>
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
            <div className="flex justify-between">
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
              <div className="">
                <p className="text-white text-[14px]">© {new Date().getFullYear()} Dormer&apos;s All rights reserved</p>
                {/* <a className="hover:text-orange-400 text-white text-[14px]" href="https://www.Najah.io" target="_blank" rel="noopener noreferrer">Developed By @Najah media </a> */}
              </div>
              <div className="">
                {/* <p className="text-white text-[14px]">© {new Date().getFullYear()} Dormer's All rights reserved</p> */}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
