'use client'

import { useEffect } from 'react'
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import AboutUs from "../components/AboutUs";
import CurtleAboutUs from "@/app/components/CurtleAboutUs";
import 'lenis/dist/lenis.css'
import Lenis from 'lenis'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  useEffect(() => {
    // Initialize Lenis
    const lenis = new Lenis({
      duration: 1.6, // Control the duration of the scroll
      easing: (t) => 1 - Math.pow(1 - t, 3), // Cubic easing for smooth stop
      smoothWheel: true,       // enable smooth scroll
      // smoothTouch: false, // disable smooth on touch devices if needed
    });

    // Request animation frame loop
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Cleanup on unmount
    return () => {
      lenis.destroy();
    }
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#1E3A4F" }}
    >
      <div className="main_content">
        <Navbar />
        <main className="flex-grow">{children}</main>
      </div>

      <div id="footer" className='h-screen min-h-screen max-h-screen md:mt-[600px] mt-[700px]'>
        <div className="slide-in-section">
          {/* <CurtleAboutUs /> */}
          <AboutUs />
          <Footer />
        </div>
      </div>

      {/* <div className="slide-in-section" id="sidefotter">
        
      </div> */}
    </div>
  );
}
