"use client";

import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useInView } from "react-intersection-observer";
import {
  RotateCcw,
  Globe,
  ShieldCheck,
  SkipForward,
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

// ─── Golden Ratio scale (φ = 1.618) ───────────────────────────────────────────
// Base 11px → 18 → 29 → 47 → 76 → 123
// Spacing  8px → 13 → 21 → 34 → 55
// ─────────────────────────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.58, ease: [0.25, 0.46, 0.45, 0.94], delay: i * 0.10 },
  }),
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.10 } },
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

  // φ-scaled icon size — sits at the 18px tier (φ¹)
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
        // gap-[13px] = φ¹ of 8px base
        <div className="flex items-end justify-between h-full">
          <div className="flex flex-col gap-[13px]">
            <RotateCcw size={21} strokeWidth={2.5} style={iconStyle} />
            {/* φ⁴ tier: 47px mobile / 76px desktop */}
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(47px, 8vw, 76px)",
                lineHeight: 1,
              }}
            >
              48
            </p>
            {/* φ² tier: 29px */}
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(18px, 2.5vw, 29px)",
                lineHeight: 1.15,
                fontWeight: 700,
              }}
            >
              Dishes Every Month
            </p>
            {/* φ⁰ tier: 11px */}
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "11px",
                opacity: 0.6,
                marginTop: "2px",
              }}
            >
              New dish daily · Monthly rotating menu
            </p>
          </div>
          {/* Ghost watermark — φ⁵ tier */}
          <p
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(76px, 12vw, 123px)",
              lineHeight: 1,
              opacity: 0.07,
              userSelect: "none",
              alignSelf: "flex-end",
            }}
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
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <Globe size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            {/* φ³ tier: 47px */}
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(34px, 5vw, 47px)",
                lineHeight: 1,
                color: "#FF7F00",
              }}
            >
              11+
            </p>
            {/* φ¹ tier: 18px */}
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(13px, 1.5vw, 18px)",
                fontWeight: 700,
                lineHeight: 1.25,
              }}
            >
              International Cuisines
            </p>
            {/* φ⁰ tier: 11px */}
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "11px",
                opacity: 0.5,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <ShieldCheck size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(34px, 5vw, 47px)",
                lineHeight: 1,
              }}
            >
              100%
            </p>
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(13px, 1.5vw, 18px)",
                fontWeight: 700,
                lineHeight: 1.25,
              }}
            >
              Refund Policy
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "11px",
                opacity: 0.55,
              }}
            >
              On all remaining meals
            </p>
          </div>
        </div>
      ),
    },

    // 4 — Skip 3× · cream small
    {
      id: 4,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <SkipForward size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            {/* φ² tier: 29px mobile, 34px desktop */}
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(29px, 4vw, 34px)",
                lineHeight: 1,
              }}
            >
              3×
            </p>
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              Meal Skips
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.55,
              }}
            >
              Per month
            </p>
          </div>
        </div>
      ),
    },

    // 5 — Pause Anytime · navy small
    {
      id: 5,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          {/* Orange gradient pause icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="pauseIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF8C00" />
                <stop offset="100%" stopColor="#FF5000" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" stroke="url(#pauseIconGrad)" />
            <line x1="10" y1="15" x2="10" y2="9" stroke="url(#pauseIconGrad)" />
            <line x1="14" y1="15" x2="14" y2="9" stroke="url(#pauseIconGrad)" />
          </svg>
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Pause<br />Anytime
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.5,
              }}
            >
              Going on vacation? Pause and come back.
            </p>
          </div>
        </div>
      ),
    },

    // 6 — FREE Delivery · deep dark hero 2×2
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
              "radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)",
            backgroundSize: "21px 21px",
          }}
        >
          <Truck size={29} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
          <div className="flex flex-col gap-[8px]">
            {/* φ⁴: 47px mobile / 76px desktop */}
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(47px, 8vw, 76px)",
                lineHeight: 1,
                color: "#FF7F00",
              }}
            >
              FREE
            </p>
            {/* φ² tier */}
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(18px, 2.5vw, 29px)",
                fontWeight: 700,
                lineHeight: 1.15,
              }}
            >
              Delivery
            </p>
            {/* φ¹ tier */}
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                opacity: 0.55,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Leaf size={18} strokeWidth={1.5} style={{ ...iconStyle, color: "#4ade80" }} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Eco-Friendly<br />Packaging
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.5,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Activity size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Calculated<br />Macros
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.6,
              }}
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
        <div className="flex items-start h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <CreditCard size={21} strokeWidth={1.5} style={iconStyle} />
            {/* φ¹ tier */}
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(13px, 1.8vw, 18px)",
                fontWeight: 700,
              }}
            >
              Flexible Payments
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "2px" }}>
              {["Cash", "Card", "Online", "Bank Transfer", "Crypto"].map((m) => (
                <span
                  key={m}
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontSize: "10px",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    borderRadius: "999px",
                    padding: "3px 10px",
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Utensils size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Veg, Non-Veg<br />& Religious
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.55,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Headphones size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Dedicated<br />Student Support
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.55,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <LayoutGrid size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(29px, 4vw, 34px)",
                lineHeight: 1,
              }}
            >
              3
            </p>
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
              }}
            >
              Plans
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.6,
              }}
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
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Wallet size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(11px, 1.2vw, 13px)",
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              Student<br />Budget Friendly
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "10px",
                opacity: 0.5,
              }}
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
        <div className="flex items-center justify-between h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <Star size={21} strokeWidth={1.5} style={iconStyle} />
            <p
              style={{
                fontFamily: "'Typo Round Bold Demo', sans-serif",
                fontSize: "clamp(13px, 1.8vw, 18px)",
                fontWeight: 700,
              }}
            >
              Best Quality Ingredients
            </p>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontSize: "11px",
                opacity: 0.55,
              }}
            >
              No compromises on what goes into your meals
            </p>
          </div>
          {/* Ghost watermark */}
          <p
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(76px, 10vw, 110px)",
              lineHeight: 1,
              opacity: 0.06,
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            ★
          </p>
        </div>
      ),
    },
  ];

  const sharedCardClass =
    "flex flex-col justify-between rounded-2xl overflow-hidden relative hover:scale-[1.015] transition-transform duration-300 cursor-default";

  // φ-scaled padding: 16px (p-4) mobile → 21px desktop (closest: p-5 = 20px ≈ φ×12)
  const cardPadding = { padding: "16px" };
  const cardPaddingDesktop = { padding: "21px" };

  return (
    <section
      ref={ref}
      className={`w-full px-4 sm:px-6 lg:px-16 ${
        isLight ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
      }`}
      // φ spacing: 34px mobile → 55px desktop
      style={{ paddingTop: "34px", paddingBottom: "55px" }}
    >
      <div className="max-w-6xl mx-auto">
        {/* ── Section heading ── */}
        <motion.div
          initial={{ opacity: 0, y: 13 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
          // φ: mb = 34px desktop
          style={{ marginBottom: "34px" }}
        >
          {/* Eyebrow — φ⁰: 11px */}
          <p
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              fontSize: "11px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#FF7F00",
              marginBottom: "8px",
            }}
          >
            Exclusive to Dormers
          </p>
          {/* H2 — φ³ tier: 29px mobile → 47px desktop */}
          <h2
            className={isLight ? "text-[#1E3A4F]" : "text-white"}
            style={{
              fontFamily: "'Typo Round Bold Demo', sans-serif",
              fontSize: "clamp(29px, 4vw, 47px)",
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
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(5, auto)",
            gap: "13px", // φ¹ of 8px base
          }}
        >
          {cards.map((card, i) => {
            const noGradientBorder = card.bg === "#FF7F00" || !card.bg.startsWith("#");
            const isCream = card.bg === "#EEE9DA";
            const borderGrad = isCream
              ? "linear-gradient(135deg, rgba(255,140,0,0.65) 0%, rgba(255,80,0,0.3) 100%)"
              : "linear-gradient(135deg, #FF8C00 0%, #FF5000 100%)";
            const cardBg = noGradientBorder
              ? card.bg
              : `linear-gradient(${card.bg}, ${card.bg}) padding-box, ${borderGrad} border-box`;
            return (
              <motion.div
                key={card.id}
                custom={i}
                variants={cardVariants}
                className={`${sharedCardClass} min-h-[130px]`}
                style={{
                  background: cardBg,
                  color: card.textColor,
                  border: noGradientBorder ? "none" : "1.5px solid transparent",
                  ...cardPaddingDesktop,
                  ...card.desktopStyle,
                }}
              >
                {card.content}
              </motion.div>
            );
          })}
        </motion.div>

        {/* ── Mobile Grid (< md) ── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid md:hidden grid-cols-2"
          style={{ gap: "13px" }}
        >
          {cards.map((card, i) => {
            const noGradientBorder = card.bg === "#FF7F00" || !card.bg.startsWith("#");
            const isCream = card.bg === "#EEE9DA";
            const borderGrad = isCream
              ? "linear-gradient(135deg, rgba(255,140,0,0.65) 0%, rgba(255,80,0,0.3) 100%)"
              : "linear-gradient(135deg, #FF8C00 0%, #FF5000 100%)";
            const cardBg = noGradientBorder
              ? card.bg
              : `linear-gradient(${card.bg}, ${card.bg}) padding-box, ${borderGrad} border-box`;
            return (
              <motion.div
                key={card.id}
                custom={i}
                variants={cardVariants}
                className={`${sharedCardClass} min-h-[110px] ${card.mobileClass}`}
                style={{
                  background: cardBg,
                  color: card.textColor,
                  border: noGradientBorder ? "none" : "1.5px solid transparent",
                  ...cardPadding,
                }}
              >
                {card.content}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}