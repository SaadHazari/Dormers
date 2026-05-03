"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { useTheme } from "next-themes";
import { useInView } from "react-intersection-observer";
import { EASE_STANDARD as cardEase } from "@/lib/motion";
import {
  RotateCcw, Globe, ShieldCheck, SkipForward, PauseCircle, Truck, Leaf,
  Activity, CreditCard, Utensils, Headphones, LayoutGrid, Wallet, Star,
} from "lucide-react";

/* ─── Flip CSS injected once ─────────────────────────────────────────────── */
const FLIP_CSS = `
  .bento-wrapper {
    perspective: 1000px;
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    cursor: pointer;
    transition: transform 0.2s ease;
    height: 100%;
  }
  .bento-wrapper:hover { transform: translateY(-4px); }
  .bento-flipper {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    transform-style: preserve-3d;
    -webkit-transform-style: preserve-3d;
    transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.3s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    border-radius: 16px;
  }
  .bento-flipper.flipped {
    transform: rotateY(180deg);
    box-shadow: 0 12px 40px rgba(0,0,0,0.30);
  }
  .bento-wrapper:hover .bento-flipper { box-shadow: 0 12px 40px rgba(0,0,0,0.30); }
  .bento-front {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: 16px;
    overflow: hidden;
    z-index: 2;
    transform: rotateY(0deg);
  }
  .bento-back {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    border-radius: 16px;
    overflow: hidden;
    transform: rotateY(180deg);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px; /* Reduced from 24px to prevent bleed on small cards */
  }
  .bento-flip-hint {
    display: none;
    margin-top: auto;
    padding-top: 8px;
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 10px;
    opacity: 0.4;
  }
  @media (hover: none) { .bento-flip-hint { display: block; } }
  .bento-flip-icon {
    position: absolute;
    top: 12px; right: 12px;
    font-size: 14px;
    line-height: 1;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 3;
  }
  .bento-wrapper:hover .bento-flip-icon { opacity: 0.5 !important; }
`;

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.58, ease: cardEase, delay: i * 0.10 },
  }),
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.10 } },
};

interface CardData {
  id: number; bg: string; textColor: string; desktopStyle: React.CSSProperties;
  mobileClass: string; backBg: string; backTextColor: string; backBodyColor: string;
  backTitle: string; backBody: string; content: React.ReactNode;
}

export default function USPBento() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.05 });
  const [flippedId, setFlippedId] = useState<number | null>(null);

  const iconStyle = { opacity: 0.65, flexShrink: 0 };

  const cards: CardData[] = [
    {
      id: 1, bg: "linear-gradient(135deg, #FF8C00 0%, #FF6500 100%)", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "1 / 2" }, mobileClass: "col-span-2",
      backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
      backTitle: "48 Dishes Every Month",
      backBody: "A new dish daily. Chef-crafted menus guarantee 48 unique options every month with zero repeats.",
      content: (
        <div className="flex items-end justify-between h-full">
          <div className="flex flex-col gap-[13px]">
            <RotateCcw size={21} strokeWidth={2.5} style={iconStyle} />
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1 }}>48</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(18px, 2.5vw, 29px)", lineHeight: 1.15, fontWeight: 700 }}>Dishes Every Month</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>New dish daily · Monthly rotating menu</p>
          </div>
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 12vw, 123px)", lineHeight: 1, opacity: 0.07, userSelect: "none", alignSelf: "flex-end" }}>48</p>
        </div>
      ),
    },
    {
      id: 2, bg: "#1E3A4F", textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "1 / 2" }, mobileClass: "col-span-1",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
      backTitle: "11+ Cuisines",
      backBody: "Explore global flavors daily: Italian, Arabic, Asian, Indian, Mediterranean, and more.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <Globe size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1, color: "#FF7F00" }}>11+</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>International Cuisines</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.5 }}>From all over the world</p>
          </div>
        </div>
      ),
    },
    {
      id: 3, bg: "#EEE9DA", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "1 / 2" }, mobileClass: "col-span-1",
      backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
      backTitle: "100% Refund",
      backBody: "Cancel anytime before your delivery window for a full refund on unused meals. No hassle.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[13px]">
          <ShieldCheck size={21} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 5vw, 47px)", lineHeight: 1 }}>100%</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(13px, 1.5vw, 18px)", fontWeight: 700, lineHeight: 1.25 }}>Refund Policy</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>On all remaining meals</p>
          </div>
        </div>
      ),
    },
    {
      id: 4, bg: "#EEE9DA", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "2 / 3" }, mobileClass: "col-span-1",
      backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
      backTitle: "3× Meal Skips",
      backBody: "Skip up to 3 deliveries per month with zero penalties. Your plan automatically adjusts.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <SkipForward size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3×</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.3 }}>Meal Skips</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Per month</p>
          </div>
        </div>
      ),
    },
    {
      id: 5, bg: "#1E3A4F", textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "2 / 3" }, mobileClass: "col-span-1",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
      backTitle: "Pause Anytime",
      backBody: "Traveling? Pause your subscription anytime and resume when you return. No hidden charges.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <PauseCircle size={21} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Pause<br />Anytime</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Going on vacation? Pause and come back.</p>
          </div>
        </div>
      ),
    },
    {
      id: 6, bg: "#0C1E2C", textColor: "#ffffff",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "2 / 4" }, mobileClass: "col-span-2",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.85)",
      backTitle: "FREE Delivery",
      backBody: "Zero delivery fees or minimums, ever. We deliver to all supported dorms across Dubai completely free of charge.",
      content: (
        <div className="flex flex-col justify-between h-full" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.065) 1px, transparent 1px)", backgroundSize: "21px 21px" }}>
          <Truck size={29} strokeWidth={1.5} style={{ ...iconStyle, color: "#FF7F00" }} />
          <div className="flex flex-col gap-[8px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(47px, 8vw, 76px)", lineHeight: 1, color: "#FF7F00" }}>FREE</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(18px, 2.5vw, 29px)", fontWeight: 700, lineHeight: 1.15 }}>Delivery</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "clamp(11px, 1.2vw, 13px)", opacity: 0.55 }}>To all dorms across Dubai</p>
          </div>
        </div>
      ),
    },
    {
      id: 10, bg: "#EEE9DA", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 4", gridRow: "4 / 5" }, mobileClass: "col-span-1",
      backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
      backTitle: "Dietary Needs",
      backBody: "We accommodate your dietary needs: veg, non-veg, halal, and religious preferences.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Utensils size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Veg, Non-Veg<br />& Religious</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>We respect your preferences</p>
          </div>
        </div>
      ),
    },
    {
      id: 12, bg: "#FF7F00", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "5 / 6" }, mobileClass: "col-span-1",
      backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
      backTitle: "3 Plans",
      backBody: "Choose from Monthly, Weekly, or a Trial pack. Flexible options to fit your schedule.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <LayoutGrid size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(29px, 4vw, 34px)", lineHeight: 1 }}>3</p>
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700 }}>Plans</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Monthly · Weekly · Trial</p>
          </div>
        </div>
      ),
    },
    {
      id: 9, bg: "#1E3A4F", textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 3", gridRow: "4 / 5" }, mobileClass: "col-span-2",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.8)",
      backTitle: "Flexible Payments",
      backBody: "Pay your way: cash, card, bank transfer, or crypto. Built specifically to fit your student lifestyle.",
      content: (
        <div className="flex items-start h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <CreditCard size={21} strokeWidth={1.5} style={iconStyle} />
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Flexible Payments</p>
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
      id: 7, bg: "#1E3A4F", textColor: "#ffffff",
      desktopStyle: { gridColumn: "1 / 2", gridRow: "3 / 4" }, mobileClass: "col-span-1",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
      backTitle: "Eco Packaging",
      backBody: "Our packaging is sustainably sourced. Good for you, good for the planet.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Leaf size={18} strokeWidth={1.5} style={{ ...iconStyle, color: "#4ade80" }} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Eco-Friendly<br />Packaging</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Sustainably made</p>
          </div>
        </div>
      ),
    },
    {
      id: 8, bg: "#FF7F00", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "3 / 4" }, mobileClass: "col-span-1",
      backBg: "#e06d10", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.9)",
      backTitle: "Macros Counted",
      backBody: "Every meal includes full nutritional info (calories, protein, carbs, fats) so you can eat smart.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Activity size={18} strokeWidth={2} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Calculated<br />Macros</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.6 }}>Know exactly what you eat</p>
          </div>
        </div>
      ),
    },
    {
      id: 11, bg: "#EEE9DA", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "4 / 5", gridRow: "4 / 5" }, mobileClass: "col-span-1",
      backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.8)",
      backTitle: "Student Support",
      backBody: "Get help 7 days a week. Chat with our real support team via the app for fast answers.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Headphones size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Dedicated<br />Student Support</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.55 }}>Always here for you</p>
          </div>
        </div>
      ),
    },
    {
      id: 13, bg: "#1E3A4F", textColor: "#ffffff",
      desktopStyle: { gridColumn: "2 / 3", gridRow: "5 / 6" }, mobileClass: "col-span-1",
      backBg: "#091825", backTextColor: "#ede8da", backBodyColor: "rgba(237,232,218,0.75)",
      backTitle: "Budget Friendly",
      backBody: "Premium quality meals crafted for students, at prices that won't hurt your wallet.",
      content: (
        <div className="flex flex-col justify-between h-full gap-[8px]">
          <Wallet size={18} strokeWidth={1.5} style={iconStyle} />
          <div className="flex flex-col gap-[5px]">
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(11px, 1.2vw, 13px)", fontWeight: 700, lineHeight: 1.35 }}>Student<br />Budget Friendly</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "10px", opacity: 0.5 }}>Made for your wallet</p>
          </div>
        </div>
      ),
    },
    {
      id: 14, bg: "#EEE9DA", textColor: "#1E3A4F",
      desktopStyle: { gridColumn: "3 / 5", gridRow: "5 / 6" }, mobileClass: "col-span-2",
      backBg: "#d9d4c5", backTextColor: "#091825", backBodyColor: "rgba(9,24,37,0.85)",
      backTitle: "Quality Ingredients",
      backBody: "We source only premium ingredients. No shortcuts or compromises on what goes into your food.",
      content: (
        <div className="flex items-center justify-between h-full gap-[21px]">
          <div className="flex flex-col gap-[13px]">
            <Star size={21} strokeWidth={1.5} style={iconStyle} />
            <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(13px, 1.8vw, 18px)", fontWeight: 700 }}>Best Quality Ingredients</p>
            <p style={{ fontFamily: "Poppins, sans-serif", fontSize: "11px", opacity: 0.55 }}>No compromises on what goes into your meals</p>
          </div>
          <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900, fontSize: "clamp(76px, 10vw, 110px)", lineHeight: 1, opacity: 0.06, userSelect: "none", flexShrink: 0 }}>★</p>
        </div>
      ),
    },
  ];

  const noGradientBorder = (bg: string) => bg === "#FF7F00" || !bg.startsWith("#");

  const renderCard = (card: CardData, i: number, isDesktop: boolean) => {
    const isFlipped = flippedId === card.id;
    const isCream = card.bg === "#EEE9DA";
    const isGradientBg = !noGradientBorder(card.bg);
    const borderGrad = isCream
      ? "linear-gradient(135deg, rgba(255,140,0,0.65) 0%, rgba(255,80,0,0.3) 100%)"
      : "linear-gradient(135deg, #FF8C00 0%, #FF5000 100%)";
    const frontBg = isGradientBg
      ? `linear-gradient(${card.bg}, ${card.bg}) padding-box, ${borderGrad} border-box`
      : card.bg;
    const flipIconColor = isCream ? "rgba(9,24,37,0.15)" : "rgba(237,232,218,0.25)";
    const padding = isDesktop ? "21px" : "16px";

    return (
      <motion.div
        key={card.id}
        custom={i}
        variants={cardVariants}
        className={`flex flex-col relative ${isDesktop ? "min-h-[130px]" : `min-h-[110px] ${card.mobileClass}`}`}
        style={{ ...(isDesktop ? card.desktopStyle : {}), height: "100%" }}
      >
        <div className="bento-wrapper" onClick={() => setFlippedId(isFlipped ? null : card.id)}>
          <div className={`bento-flipper${isFlipped ? " flipped" : ""}`}>
            <div className="bento-front" style={{ background: frontBg, color: card.textColor, border: isGradientBg ? "1.5px solid transparent" : "none", padding }}>
              <span className="bento-flip-icon" aria-hidden style={{ color: flipIconColor, opacity: 0.25 }}>↻</span>
              {card.content}
            </div>
            <div className="bento-back" style={{ background: card.backBg, color: card.backTextColor }}>
              <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 700, fontSize: "clamp(12px, 1.4vw, 16px)", lineHeight: 1.2, marginBottom: "6px", color: card.backTextColor }}>{card.backTitle}</p>
              <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 400, fontSize: "clamp(11px, 1.1vw, 13px)", lineHeight: 1.4, color: card.backBodyColor }}>{card.backBody}</p>
              <p className="bento-flip-hint" style={{ color: card.backTextColor }}>↻ Tap to flip back</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <>
      <style>{FLIP_CSS}</style>
      <section ref={ref} className={`w-full px-4 sm:px-6 lg:px-16 ${isLight ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`} style={{ paddingTop: "34px", paddingBottom: "55px" }}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 13 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-center" style={{ marginBottom: "34px" }}>
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", color: "#FF7F00", marginBottom: "8px" }}>Exclusive to Dormers</p>
            <h2 className={isLight ? "text-[#1E3A4F]" : "text-white"} style={{ fontFamily: "'Lora', Georgia, serif", fontSize: "clamp(29px, 4vw, 47px)", lineHeight: 1.1 }}>Why only Dormers?</h2>
          </motion.div>
          <motion.div variants={containerVariants} initial="hidden" animate={inView ? "visible" : "hidden"} className="hidden lg:grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(5, auto)", gap: "13px" }}>
            {cards.map((card, i) => renderCard(card, i, true))}
          </motion.div>
          <motion.div variants={containerVariants} initial="hidden" animate={inView ? "visible" : "hidden"} className="grid lg:hidden grid-cols-2" style={{ gap: "13px" }}>
            {cards.map((card, i) => renderCard(card, i, false))}
          </motion.div>
        </div>
      </section>
    </>
  );
}
