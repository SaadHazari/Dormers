"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-transparent text-[#1E3A4F] w-full pb-5 pt-3">
      <div className="lg:max-w-[987px] mx-auto px-5">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <p
            className="text-[#1E3A4F]/50 text-[10px] sm:text-[11px] whitespace-nowrap tracking-widest uppercase sm:hidden"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
          >
            Made with ❤️ in Dubai
          </p>
          <div className="flex gap-6 sm:gap-10">
            <Link
              href="/cookies-policy"
              className="hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Cookies Policy
            </Link>
            <Link
              href="/legal-terms"
              className="hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Legal Terms
            </Link>
            <Link
              href="/privacy"
              className="hover:text-[#f57f20] transition-colors text-[12px] sm:text-[13px]"
              style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
            >
              Privacy Policy
            </Link>
          </div>
          <p
            className="text-[#1E3A4F]/50 text-[10px] sm:text-[11px] whitespace-nowrap tracking-widest uppercase hidden sm:block"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600 }}
          >
            Made with ❤️ in Dubai
          </p>
          <p
            className="text-[#1E3A4F]/60 text-[11px] sm:text-[12px] whitespace-nowrap"
            style={{ fontFamily: "Poppins, sans-serif", fontWeight: 400 }}
          >
            © {new Date().getFullYear()} Dormer&apos;s All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
}