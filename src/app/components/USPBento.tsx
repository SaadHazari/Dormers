"use client";

import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useInView } from "react-intersection-observer";
import {
  RotateCcw,
  Globe,
  ShieldCheck,
  SkipForward,
  PauseCircle,
  Truck,
  Leaf,
  Activity,
  CreditCard,
  Utensils,
  Headphones,
  LayoutGrid,
  Wallet,
  Star,
} from "lucide-react";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: "easeOut", delay: i * 0.055 },
  }),
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};

interface CardData {
  id: number;
  bg: string;
  textColor: string;
  desktopStyle: React.CSSProperties;
  mobileClass: string;
  content: React.ReactNode;
}

export default function USPBento() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.05 });

  const iconStyle = { opacity: 0.65, flexShrink: 0 };

  const cards: CardData[] = [
    // 1 — 48 Dishes · wide orange hero card
    {
      id: 1,
      bg: "linear-gradient(135deg, #FF8C00 0%, #FF6500 100%)",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "1 / 2" },
      mobileClass: "col-span-2",
      content: (
        <div className="flex items-end justify-between h-full">
          <div className="flex flex-col gap-1">
            <RotateCcw size={28} strokeWidth={2.5} style={iconStyle} />
            <p
              className="text-[64px] md:text-[80px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, lineHeight: 1 }}
            >
              48
            </p>
            <p
              className="text-lg md:text-2xl font-bold leading-tight"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Dishes Every Month
            </p>
            <p
              className="text-[11px] md:text-sm opacity-60 mt-0.5"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              New dish daily · Monthly rotating menu
            </p>
          </div>
          <p
            className="text-[80px] md:text-[110px] font-black opacity-[0.07] leading-none select-none self-end"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
          >
            48
          </p>
        </div>
      ),
    },

    // 2 — 11+ Cuisines · navy
    {
      id: 2,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "1 / 2" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-3">
          <Globe size={24} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-[42px] md:text-[52px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, color: "#FF7F00" }}
            >
              11+
            </p>
            <p
              className="text-sm md:text-base font-bold leading-snug mt-1"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              International Cuisines
            </p>
            <p
              className="text-[10px] md:text-xs mt-1 opacity-50"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              From all over the world
            </p>
          </div>
        </div>
      ),
    },

    // 3 — 100% Refund · cream
    {
      id: 3,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "1 / 2" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-3">
          <ShieldCheck size={24} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-[42px] md:text-[52px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
            >
              100%
            </p>
            <p
              className="text-sm md:text-base font-bold leading-snug mt-1"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Refund Policy
            </p>
            <p
              className="text-[10px] md:text-xs mt-1 opacity-55"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              On all remaining meals
            </p>
          </div>
        </div>
      ),
    },

    // 4 — Skip 3x · cream small
    {
      id: 4,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <SkipForward size={20} strokeWidth={2} style={iconStyle} />
          <div>
            <p
              className="text-[38px] md:text-[44px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
            >
              3×
            </p>
            <p
              className="text-xs md:text-sm font-bold mt-0.5 leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Meal Skips
            </p>
            <p
              className="text-[10px] opacity-55 mt-0.5"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Per month
            </p>
          </div>
        </div>
      ),
    },

    // 5 — Pause & Resume · navy small
    {
      id: 5,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <PauseCircle size={20} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-sm md:text-base font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Pause &<br />Resume
            </p>
            <p
              className="text-[10px] opacity-50 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Going on vacation? Pause and come back.
            </p>
          </div>
        </div>
      ),
    },

    // 6 — FREE Delivery · dark hero card, 2×2
    {
      id: 6,
      bg: "#0C1E2C",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "2 / 4" },
      mobileClass: "col-span-2",
      content: (
        <div
          className="flex flex-col justify-between h-full"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <Truck size={36} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
          <div>
            <p
              className="text-[56px] md:text-[76px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, color: "#FF7F00" }}
            >
              FREE
            </p>
            <p
              className="text-2xl md:text-3xl font-bold leading-tight"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Delivery
            </p>
            <p
              className="text-sm md:text-base opacity-55 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              To all dorms across Dubai
            </p>
          </div>
        </div>
      ),
    },

    // 7 — Eco Packaging · navy small
    {
      id: 7,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "3 / 4" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <Leaf size={20} strokeWidth={1.5} style={{ ...iconStyle, color: "#4ade80" }} />
          <div>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Eco-Friendly<br />Packaging
            </p>
            <p
              className="text-[10px] opacity-50 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Sustainably made
            </p>
          </div>
        </div>
      ),
    },

    // 8 — Calculated Macros · orange small
    {
      id: 8,
      bg: "#FF7F00",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "3 / 4" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <Activity size={20} strokeWidth={2} style={iconStyle} />
          <div>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Calculated<br />Macros
            </p>
            <p
              className="text-[10px] opacity-60 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Know exactly what you eat
            </p>
          </div>
        </div>
      ),
    },

    // 9 — Flexible Payments · navy wide
    {
      id: 9,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "4 / 5" },
      mobileClass: "col-span-2",
      content: (
        <div className="flex items-start justify-between h-full gap-4">
          <div className="flex flex-col gap-2">
            <CreditCard size={24} strokeWidth={1.5} style={iconStyle} />
            <p
              className="text-base md:text-xl font-bold"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Flexible Payments
            </p>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {["Cash", "Card", "Online", "Bank Transfer", "Crypto"].map((m) => (
                <span
                  key={m}
                  className="text-[9px] md:text-[11px] rounded-full px-2 py-0.5"
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      ),
    },

    // 10 — Dietary Prefs · cream
    {
      id: 10,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "4 / 5" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <Utensils size={20} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Veg, Non-Veg<br />& Religious
            </p>
            <p
              className="text-[10px] opacity-55 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              We respect your preferences
            </p>
          </div>
        </div>
      ),
    },

    // 11 — Student Support · cream
    {
      id: 11,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "4 / 5" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <Headphones size={20} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Dedicated<br />Student Support
            </p>
            <p
              className="text-[10px] opacity-55 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Always here for you
            </p>
          </div>
        </div>
      ),
    },

    // 12 — 3 Plans · orange
    {
      id: 12,
      bg: "#FF7F00",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "5 / 6" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <LayoutGrid size={20} strokeWidth={2} style={iconStyle} />
          <div>
            <p
              className="text-[38px] md:text-[44px] font-black leading-none"
              style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
            >
              3
            </p>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Plans
            </p>
            <p
              className="text-[10px] opacity-60 mt-0.5"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Monthly · Weekly · Trial
            </p>
          </div>
        </div>
      ),
    },

    // 13 — Budget Friendly · navy
    {
      id: 13,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "5 / 6" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-2">
          <Wallet size={20} strokeWidth={1.5} style={iconStyle} />
          <div>
            <p
              className="text-xs md:text-sm font-bold leading-snug"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Student<br />Budget Friendly
            </p>
            <p
              className="text-[10px] opacity-50 mt-1"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              Made for your wallet
            </p>
          </div>
        </div>
      ),
    },

    // 14 — Best Ingredients · cream wide
    {
      id: 14,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "5 / 6" },
      mobileClass: "col-span-2",
      content: (
        <div className="flex items-center justify-between h-full gap-4">
          <div className="flex flex-col gap-2">
            <Star size={24} strokeWidth={1.5} style={iconStyle} />
            <p
              className="text-base md:text-xl font-bold"
              style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
            >
              Best Quality Ingredients
            </p>
            <p
              className="text-[10px] md:text-xs opacity-55"
              style={{ fontFamily: "Poppins, sans-serif" }}
            >
              No compromises on what goes into your meals
            </p>
          </div>
          <p
            className="text-[80px] md:text-[100px] font-black opacity-[0.06] leading-none select-none shrink-0"
            style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
          >
            ★
          </p>
        </div>
      ),
    },
  ];

  const sharedCardClass =
    "flex flex-col justify-between rounded-2xl p-4 md:p-5 overflow-hidden relative hover:scale-[1.015] transition-transform duration-300 cursor-default";

  return (
    <section
      ref={ref}
      className={`w-full px-4 sm:px-6 lg:px-16 py-12 md:py-20 ${
        isLight ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
      }`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 md:mb-12"
        >
          <p
            className="text-[11px] sm:text-sm tracking-[0.25em] uppercase mb-2"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              color: "#FF7F00",
            }}
          >
            Exclusive to Dormers
          </p>
          <h2
            className={`text-2xl sm:text-4xl md:text-5xl ${
              isLight ? "text-[#1E3A4F]" : "text-white"
            }`}
            style={{
              fontFamily: "'Typo Round Bold Demo', sans-serif",
              lineHeight: 1.1,
            }}
          >
            Why only Dormers?
          </h2>
        </motion.div>

        {/* ── Desktop Bento Grid (md+) ── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="hidden md:grid gap-3"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(5, auto)",
          }}
        >
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              custom={i}
              variants={cardVariants}
              className={`${sharedCardClass} min-h-[140px]`}
              style={{
                background: card.bg,
                color: card.textColor,
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
                ...card.desktopStyle,
              }}
            >
              {card.content}
            </motion.div>
          ))}
        </motion.div>

        {/* ── Mobile Grid (< md) ── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid md:hidden grid-cols-2 gap-3"
        >
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              custom={i}
              variants={cardVariants}
              className={`${sharedCardClass} min-h-[120px] ${card.mobileClass}`}
              style={{
                background: card.bg,
                color: card.textColor,
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
              }}
            >
              {card.content}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}