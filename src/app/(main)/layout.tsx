'use client';
import { useEffect, useRef, useState } from 'react';
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import AboutUs from "../components/AboutUs";
import { useTheme } from "next-themes";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  // const slideSectionRef = useRef<any>(null);
  const [hideNavbar, setHideNavbar] = useState(false);
  const scrollYRef = useRef(0);
  const slideSectionRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);


  useEffect(() => {
    const handleScroll = () => {
      if (!slideSectionRef.current) return;

      // Only run on desktop
      if (window.innerWidth < 768) return; // adjust breakpoint for your desktop

      scrollYRef.current = window.scrollY;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        const sectionRect = slideSectionRef.current?.getBoundingClientRect();
        if (!sectionRect) return;

        // Calculate trigger point (example: 25% of viewport)
        const triggerPoint = window.innerHeight / 4;
        const shouldHide = sectionRect.top <= triggerPoint;

        if (shouldHide !== hideNavbar) {
          setHideNavbar(shouldHide);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [hideNavbar]);


  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#1E3A4F" }}>
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
        {!hideNavbar && <Navbar />}
        <main className="flex-grow">{children}</main>
      </div>

      <div id="footer" className={`${theme === "light"
        ? "md:mt-[600px] mt-[684px]"
        : "md:mt-[450px] mt-[588px]"
        }`}>
        <div ref={slideSectionRef} className="slide-in-section">
          <AboutUs />
          <Footer />
        </div>
      </div>
    </div>
  );
}