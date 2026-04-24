"use client";

import Link from "next/link";
import { Wrench, Clock, ArrowLeft, ChefHat } from "lucide-react";
import { motion } from "framer-motion";

export default function MaintenancePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "#091825" }}
    >
      {/* Subtle radial glow behind content */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,127,32,0.08) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 flex flex-col items-center text-center max-w-md w-full"
      >
        {/* Icon cluster */}
        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(245,127,32,0.18) 0%, rgba(245,127,32,0.06) 100%)",
              border: "1.5px solid rgba(245,127,32,0.25)",
              boxShadow: "0 0 40px rgba(245,127,32,0.12)",
            }}
          >
            <ChefHat size={40} strokeWidth={1.5} color="#f57f20" />
          </div>

          {/* Orbiting icons */}
          <motion.div
            className="absolute -top-1 -right-2 w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            animate={{ rotate: [0, 15, 0, -15, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Wrench size={16} strokeWidth={1.8} color="rgba(237,232,218,0.6)" />
          </motion.div>

          <motion.div
            className="absolute -bottom-1 -left-2 w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            animate={{ rotate: [0, -10, 0, 10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <Clock size={16} strokeWidth={1.8} color="rgba(237,232,218,0.6)" />
          </motion.div>
        </div>

        {/* Label */}
        <p
          className="uppercase tracking-widest mb-3"
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: "11px",
            fontWeight: 600,
            color: "#f57f20",
            letterSpacing: "0.2em",
          }}
        >
          Dashboard · Under Maintenance
        </p>

        {/* Headline */}
        <h1
          className="mb-4"
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(28px, 6vw, 40px)",
            lineHeight: 1.15,
            color: "#ede8da",
          }}
        >
          We&rsquo;re cooking<br />something up
        </h1>

        {/* Body */}
        <p
          className="mb-10"
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 300,
            fontSize: "14px",
            lineHeight: "160%",
            color: "rgba(237,232,218,0.55)",
            maxWidth: "340px",
          }}
        >
          The Dormers&rsquo; dashboard is currently undergoing maintenance.
          We&rsquo;ll be back shortly — fresher than ever.
        </p>

        {/* Divider */}
        <div
          className="w-full mb-10 rounded-full"
          style={{
            height: "1px",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(245,127,32,0.3) 50%, transparent 100%)",
          }}
        />

        {/* Back home button */}
        <Link
          href="/"
          className="flex items-center gap-2.5 px-7 py-3 rounded-full transition-all duration-300 hover:scale-105"
          style={{
            background:
              "linear-gradient(135deg, rgba(245,127,32,0.15) 0%, rgba(245,127,32,0.08) 100%)",
            border: "1.5px solid rgba(245,127,32,0.35)",
            color: "#f57f20",
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={15} strokeWidth={2.5} />
          Back to Home
        </Link>
      </motion.div>

      {/* Bottom wordmark */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="fixed bottom-8 left-0 right-0 text-center"
        style={{
          fontFamily: "Montserrat, sans-serif",
          fontWeight: 700,
          fontSize: "12px",
          letterSpacing: "0.15em",
          color: "rgba(237,232,218,0.2)",
          textTransform: "uppercase",
        }}
      >
        Dormers&rsquo;
      </motion.p>
    </div>
  );
}
