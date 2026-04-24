"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-transparent text-[#1E3A4F] w-full pb-5 pt-3">
      <div className="lg:max-w-[987px] mx-auto px-5">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-1.5">
          {/* Mobile-only ❤️ — always first on mobile */}
          <p
            className="order-1 sm:hidden text-[#1E3A4F]/50 text-[10px] sm:text-[11px] whitespace-nowrap tracking-widest uppercase"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
          >
            Made with ❤️ in Dubai
          </p>
          {/* Copyright — second on mobile, last on desktop */}
          <p
            className="order-2 sm:order-3 text-[#1E3A4F]/30 text-[11px] sm:text-[12px] whitespace-nowrap"
            style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
          >
            © {new Date().getFullYear()} Dormer&apos;s All rights reserved
          </p>
          {/* Desktop-only ❤️ — middle on desktop */}
          <p
            className="hidden sm:block sm:order-2 text-[#1E3A4F]/50 text-[10px] sm:text-[11px] whitespace-nowrap tracking-widest uppercase"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
          >
            Made with ❤️ in Dubai
          </p>
          {/* Links — last on mobile, first on desktop */}
          <div className="order-3 sm:order-1 flex gap-6 sm:gap-10">
            <Link
              href="/privacy"
              className="text-[#1E3A4F]/35 hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Cookies Policy
            </Link>
            <Link
              href="/terms"
              className="text-[#1E3A4F]/35 hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Legal Terms
            </Link>
            <Link
              href="/privacy"
              className="text-[#1E3A4F]/35 hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
