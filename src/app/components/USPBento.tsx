"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  extraInfo: string;
}

export default function USPBento() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.05 });
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  const iconStyle = { opacity: 0.65, flexShrink: 0 };

  const cards: CardData[] = [
    {
      id: 1,
      bg: "linear-gradient(135deg, #FF8C00 0%, #FF6500 100%)",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "1 / 2" },
      mobileClass: "col-span-2",
      extraInfo: "A brand new dish every single day. Our monthly rotating menu is crafted by chefs to keep your meals exciting — 48 unique options every month, never the same week twice.",
      content: (
        <div className="flex items-end justify-between h-full">
          <div className="flex flex-col gap-[13px]">
            <RotateCcw size={21} strokeWidth={2.5} style={iconStyle} />
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1 }}>48</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(18px, 2.5vw, 29px)", lineHeight: 1.15, fontWeight: 700 }}>Dishes Every Month</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>New dish daily · Monthly rotating menu</p>
          </div>
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 12vw, 123px)", lineHeight: 1, opacity: 0.07, userSelect: "none", alignSelf: "flex-end" }}>48</p>
        </div>
      ),
    },
    {
      id: 2,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "1 / 2" },
      mobileClass: "col-span-1",
      extraInfo: "Explore cuisines from around the world — Italian, Arabic, Asian, Mediterranean, Indian, and more. Something new every day.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <Globe size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1, color: "#FF7F00" }}>11+</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>International Cuisines</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.5 }}>From all over the world</p>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "1 / 2" },
      mobileClass: "col-span-1",
      extraInfo: "Cancel before your next delivery window and receive a full refund on all remaining unused meals. No questions asked, no hassle.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <ShieldCheck size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1 }}>100%</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>Refund Policy</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>On all remaining meals</p>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      extraInfo: "Don't feel like eating today? Skip up to 3 deliveries per month — no penalties, no fuss. Your plan just carries on.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <SkipForward size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3×</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.3 }}>Meal Skips</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Per month</p>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "2 / 3" },
      mobileClass: "col-span-1",
      extraInfo: "Going home for the holidays? Traveling? Pause your subscription anytime and resume the moment you're back. No charges while paused.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
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
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Pause<br />Anytime</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Going on vacation? Pause and come back.</p>
          </div>
        </div>
      ),
    },
    {
      id: 6,
      bg: "#0C1E2C",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "2 / 4" },
      mobileClass: "col-span-2",
      extraInfo: "Every single delivery is completely free — no matter where your dorm is across Dubai. No minimum order, no delivery fee, ever.",
      content: (
        <div className="flex flex-col justify-between h-full" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)", backgroundSize: "21px 21px" }}>
          <Truck size={29} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1, color: "#FF7F00" }}>FREE</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(18px, 2.5vw, 29px)", fontWeight: 700, lineHeight: 1.15 }}>Delivery</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", opacity: 0.55 }}>To all dorms across Dubai</p>
          </div>
        </div>
      ),
    },
    {
      id: 7,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "3 / 4" },
      mobileClass: "col-span-1",
      extraInfo: "All our packaging is biodegradable and sustainably sourced. We care about the planet as much as we care about your meal.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Leaf size={18} strokeWidth={1.5} style={{ ...iconStyle, color: "#4ade80" }} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Eco-Friendly<br />Packaging</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Sustainably made</p>
          </div>
        </div>
      ),
    },
    {
      id: 8,
      bg: "#FF7F00",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "3 / 4" },
      mobileClass: "col-span-1",
      extraInfo: "Every meal comes with full nutritional info — calories, protein, carbs, and fats. Eat smart without doing the math yourself.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Activity size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Calculated<br />Macros</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Know exactly what you eat</p>
          </div>
        </div>
      ),
    },
    {
      id: 9,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "4 / 5" },
      mobileClass: "col-span-2",
      extraInfo: "Pay your way — cash on delivery, card, online bank transfer, or even crypto. We've built Dormers to fit your lifestyle, not the other way around.",
      content: (
        <div className="flex items-start h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <CreditCard size={21} strokeWidth={1.5} style={iconStyle} />
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Flexible Payments</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "2px" }}>
              {["Cash", "Card", "Online", "Bank Transfer", "Crypto"].map((m) => (
                <span key={m} style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", background: "rgba(255,255,255,0.1)", color: "#ffffff", borderRadius: "999px", padding: "3px 10px" }}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 10,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "4 / 5" },
      mobileClass: "col-span-1",
      extraInfo: "Tell us your dietary requirements and we'll tailor your menu. Vegetarian, non-vegetarian, halal, or specific religious restrictions — we've got you.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Utensils size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Veg, Non-Veg<br />& Religious</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>We respect your preferences</p>
          </div>
        </div>
      ),
    },
    {
      id: 11,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "4 / 5" },
      mobileClass: "col-span-1",
      extraInfo: "Our student support team is here 7 days a week. Chat with us directly through the app — fast responses, real people, no bots.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Headphones size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Dedicated<br />Student Support</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Always here for you</p>
          </div>
        </div>
      ),
    },
    {
      id: 12,
      bg: "#FF7F00",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "5 / 6" },
      mobileClass: "col-span-1",
      extraInfo: "Monthly for regular students, Weekly for flexibility, and a Trial pack to test Dormers before committing. Pick what fits your schedule.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <LayoutGrid size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3</p>
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700 }}>Plans</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Monthly · Weekly · Trial</p>
          </div>
        </div>
      ),
    },
    {
      id: 13,
      bg: "#1E3A4F",
      textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "5 / 6" },
      mobileClass: "col-span-1",
      extraInfo: "Dormers is designed specifically for students on tight budgets. Great food at prices that genuinely don't hurt your wallet — no compromises.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Wallet size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Student<br />Budget Friendly</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Made for your wallet</p>
          </div>
        </div>
      ),
    },
    {
      id: 14,
      bg: "#EEE9DA",
      textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "5 / 6" },
      mobileClass: "col-span-2",
      extraInfo: "We source only the best quality ingredients for every meal. No hidden shortcuts, no compromises — what goes into your food matters to us.",
      content: (
        <div className="flex items-center justify-between h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <Star size={21} strokeWidth={1.5} style={iconStyle} />
            <p style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Best Quality Ingredients</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>No compromises on what goes into your meals</p>
          </div>
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 10vw, 110px)", lineHeight: 1, opacity: 0.06, userSelect: "none", flexShrink: 0 }}>★</p>
        </div>
      ),
    },
  ];

  const cardPadding = { padding: "16px" };
  const cardPaddingDesktop = { padding: "21px" };

  const renderCard = (card: CardData, i: number, isDesktop: boolean) => {
    const isOpen = openCardId === card.id;
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
        onClick={() => setOpenCardId(isOpen ? null : card.id)}
        animate={isOpen ? { scale: 1.10, rotate: 2, y: -10 } : { scale: 1, rotate: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        whileHover={!isOpen ? { scale: 1.03 } : {}}
        className={`flex flex-col justify-between rounded-2xl overflow-hidden relative cursor-pointer ${
          isDesktop ? `min-h-[130px]` : `min-h-[110px] ${card.mobileClass}`
        }`}
        style={{
          background: cardBg,
          color: card.textColor,
          border: noGradientBorder ? "none" : "1.5px solid transparent",
          ...(isDesktop ? cardPaddingDesktop : cardPadding),
          ...(isDesktop ? card.desktopStyle : {}),
          zIndex: isOpen ? 20 : 1,
          position: "relative",
        }}
      >
        {card.content}

        {/* Expanded extra info */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: 0,
                background: cardBg,
                borderRadius: "inherit",
                padding: isDesktop ? "21px" : "16px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                zIndex: 1,
              }}
            >
              {card.content}
              <p
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontSize: "clamp(10px, 1.1vw, 12px)",
                  lineHeight: 1.55,
                  opacity: 0.78,
                  marginTop: "10px",
                  borderTop: `1px solid ${card.textColor}22`,
                  paddingTop: "8px",
                  color: card.textColor,
                }}
              >
                {card.extraInfo}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <section
      ref={ref}
      className={`w-full px-4 sm:px-6 lg:px-16 ${isLight ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}
      style={{ paddingTop: "34px", paddingBottom: "55px" }}
    >
      {/* Backdrop to close open card */}
      {openCardId !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenCardId(null)}
        />
      )}

      <div className="max-w-6xl mx-auto">
        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 13 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
          style={{ marginBottom: "34px" }}
        >
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", color: "#FF7F00", marginBottom: "8px" }}>
            Exclusive to Dormers
          </p>
          <h2
            className={isLight ? "text-[#1E3A4F]" : "text-white"}
            style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "clamp(29px, 4vw, 47px)", lineHeight: 1.1 }}
          >
            Why only Dormers?
          </h2>
        </motion.div>

        {/* Desktop Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="hidden md:grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(5, auto)", gap: "13px" }}
        >
          {cards.map((card, i) => renderCard(card, i, true))}
        </motion.div>

        {/* Mobile Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid md:hidden grid-cols-2"
          style={{ gap: "13px" }}
        >
          {cards.map((card, i) => renderCard(card, i, false))}
        </motion.div>
      </div>
    </section>
  );
}
