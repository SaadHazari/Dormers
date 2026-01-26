"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export default function VipSuccessPage() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`min-h-[80vh] flex items-center justify-center px-4 ${
        theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
      }`}
    >
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        
        {/* Success Icon Circle */}
        <div className="relative mx-auto w-24 h-24">
          <div className={`absolute inset-0 rounded-full opacity-20 animate-pulse ${
             theme === "light" ? "bg-[#FF7F00]" : "bg-[#FF7F00]"
          }`}></div>
          <div className={`relative w-full h-full rounded-full flex items-center justify-center border-4 ${
            theme === "light" ? "bg-[#EEE9DA] border-[#1E3A4F]" : "bg-[#1E3A4F] border-[#FF7F00]"
          }`}>
            <Check 
              className={`w-12 h-12 ${
                theme === "light" ? "text-[#1E3A4F]" : "text-[#FF7F00]"
              }`} 
              strokeWidth={4}
            />
          </div>
        </div>

        {/* Main Heading - Typo Round Bold */}
        <div className="space-y-2">
          <h1
            className={`text-4xl sm:text-5xl ${
              theme === "light" ? "text-[#1E3A4F]" : "text-white"
            }`}
            style={{
              fontFamily: "'Typo Round Bold Demo', sans-serif",
              lineHeight: "1",
              textTransform: "uppercase",
            }}
          >
            YOU'RE ON <br/> THE LIST!
          </h1>
          
          {/* Subtext - Poppins */}
          <p
            className={`text-sm sm:text-base max-w-xs mx-auto ${
              theme === "light" ? "text-[#22394A]" : "text-[#EEE9DA]"
            }`}
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 300,
              opacity: 0.9,
            }}
          >
            Welcome to the inner circle. We'll text you as soon as spots open up. No spam, just food.
          </p>
        </div>

        {/* Action Button - Montserrat (Matches your 'See if you qualify' button) */}
        <div className="pt-4">
          <Link
            href="/"
            className={`inline-block font-bold py-3 px-8 rounded-full text-sm transition-transform hover:scale-105 ${
              theme === "light" 
                ? "bg-[#031624] text-white shadow-[1px_2px_0px_0px_#1E3A4F]" 
                : "bg-[#FF7F00] text-[#031624] shadow-[1px_2px_0px_0px_#EEE9DA]"
            }`}
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              letterSpacing: "0.5px",
            }}
          >
            RETURN TO HOME
          </Link>
        </div>

      </div>
    </div>
  );
}
