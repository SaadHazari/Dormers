"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation"; // <--- Added this import
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import AboutUs from "../components/AboutUs";
import { useTheme } from "next-themes";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname(); // <--- Get the current URL
  const [hideNavbar, setHideNavbar] = useState(false);
  const scrollYRef = useRef(0);
  const slideSectionRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check if we are on the home page (either "/" or "/home")
  const isHomePage = pathname === "/" || pathname === "/home";

  useEffect(() => {
    // Only run scroll logic on the Home Page
    if (!isHomePage || !slideSectionRef.current) return;

    // Only run on desktop
    if (window.innerWidth < 768) return;

    const handleScroll = () => {
      scrollYRef.current = window.scrollY;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const sectionRect = slideSectionRef.current?.getBoundingClientRect();
        if (!sectionRect) return;

        const triggerPoint = window.innerHeight / 4;
        const shouldHide = sectionRect.top <= triggerPoint;

        if (shouldHide !== hideNavbar) {
          setHideNavbar(shouldHide);
        }
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [hideNavbar, isHomePage]); // <--- Added isHomePage dependency

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#1E3A4F" }}
    >
      <style jsx>{`
        .main_content {
          min-height: 100vh;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
        }
        #footer {
          position: sticky;
          bottom: 4px;
          z-index: 0;
          -webkit-user-select: none;
          flex: none;
          pointer-events: none;
          user-select: none;
          width: 100%;
        }
        .slide-in-section {
          pointer-events: auto;
        }
      `}</style>

      <div className="main_content">
        {/* Only hide navbar on Home Page; always show it on other pages */}
        {(!hideNavbar || !isHomePage) && <Navbar />}
        <main className="flex-grow">{children}</main>
      </div>

      <div
        id="footer"
        className={`${
          theme === "light"
            ? "md:mt-[600px] mt-[641px]"
            : "md:mt-[450px] mt-[588px]"
        }`}
      >
        <div ref={slideSectionRef} className="slide-in-section">
          {/* MAGIC FIX: Only show AboutUs on the Home Page */}
          {isHomePage && <AboutUs />}
          <Footer />
        </div>
      </div>
    </div>
  );
}
