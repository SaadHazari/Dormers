"use client";

import AIChatbot from "@/app/components/AIChatbot";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import ChatButtonWrapper from "@/app/components/ChatButtonWrapper";
import { SiteFooter } from "@/app/components/SiteFooter";
import { ArrowLeft } from "lucide-react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hideNavbar, setHideNavbar] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [footerRevealed, setFooterRevealed] = useState(false);
  const scrollYRef = useRef(0);
  const hideNavbarRef = useRef(false);
  const slideSectionRef = useRef<HTMLDivElement>(null);
  const footerSentinelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check if we are on the home page (either "/" or "/home")
  const isHomePage = pathname === "/" || pathname === "/home";
  const isLegalPage = pathname === "/privacy" || pathname === "/terms";

  // Listen for hero reveal completion on /home
  useEffect(() => {
    if (pathname !== "/home") return;
    const show = () => setHeroReady(true);
    window.addEventListener("hero-ui-visible", show);
    return () => {
      window.removeEventListener("hero-ui-visible", show);
    };
  }, [pathname]);

  // Fire footerRevealed once the bottom of main_content scrolls into view
  useEffect(() => {
    if (!footerSentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setFooterRevealed(true); },
      { threshold: 0.1 }
    );
    observer.observe(footerSentinelRef.current);
    return () => observer.disconnect();
  }, []);

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

        if (shouldHide !== hideNavbarRef.current) {
          hideNavbarRef.current = shouldHide;
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
  }, [isHomePage]);

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "100vh", backgroundColor: "#ede8da" }}
    >
      <style jsx>{`
        .main_content {
          min-height: 100vh;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          border-bottom-left-radius: 46px;
          border-bottom-right-radius: 46px;
          clip-path: inset(0 0 0 0 round 0 0 46px 46px);
          -webkit-clip-path: inset(0 0 0 0 round 0 0 46px 46px);
        }
      `}</style>

      {!isLegalPage && (pathname === "/home" ? (heroReady && !hideNavbar) : !hideNavbar) && <Navbar />}

      {isLegalPage && (
        <Link
          href="/"
          className="fixed top-6 left-6 z-50 flex items-center gap-2 transition-all duration-300 hover:scale-105"
          style={{
            background: "rgba(237,232,218,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1.5px solid rgba(30,58,79,0.15)",
            borderRadius: "999px",
            padding: "10px 18px",
            color: "#1E3A4F",
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 700,
            fontSize: "12px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            textDecoration: "none",
            boxShadow: "0 4px 20px rgba(30,58,79,0.1)",
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back to Home
        </Link>
      )}

      <div className="main_content">
        <main className="flex-grow">{children}</main>
        {/* Sentinel: fires footerRevealed when main_content bottom enters view */}
        <div ref={footerSentinelRef} style={{ height: 1 }} />
      </div>

      <AIChatbot />
      <ChatButtonWrapper />

      {!isLegalPage && (
        <SiteFooter slideSectionRef={slideSectionRef} footerRevealed={footerRevealed} />
      )}


    </div>
  );
}