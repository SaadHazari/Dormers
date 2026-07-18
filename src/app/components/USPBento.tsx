"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { useIsLight } from "@/ui-system/hooks/useIsLight";
import { useInView } from "react-intersection-observer";
import { EASE_STANDARD as cardEase } from "@/ui-system/tokens/motion";
import { BentoCard } from "./BentoCard";
import { cards } from "./USPBento.cards";

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

export default function USPBento() {
  // useIsLight (not raw useTheme) — SSR renders dark, so reading the resolved
  // theme on the first client render is a hydration mismatch that leaves the
  // server's dark classes stuck in the DOM on dev/light.
  const isLight = useIsLight();
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.05 });
  const [flippedId, setFlippedId] = useState<number | null>(null);

  return (
    <>
      <style>{FLIP_CSS}</style>
      <section ref={ref} className={`w-full px-4 sm:px-6 lg:px-16 ${isLight ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`} style={{ paddingTop: "34px", paddingBottom: "55px" }}>
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 13 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-center" style={{ marginBottom: "34px" }}>
            <p style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 600, fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", color: "#FF7F00", marginBottom: "8px" }}>Exclusive to Dormers</p>
            <h2 className={isLight ? "text-[#1E3A4F]" : "text-white"} style={{ fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif", fontSize: "clamp(29px, 4vw, 47px)", lineHeight: 1.1, fontWeight: 800 }}>Why only Dormers?</h2>
          </motion.div>
          <motion.div variants={containerVariants} initial="hidden" animate={inView ? "visible" : "hidden"} className="hidden lg:grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(5, auto)", gap: "13px" }}>
            {cards.map((card, i) => (
              <BentoCard
                key={card.id}
                card={card}
                index={i}
                isDesktop
                isFlipped={flippedId === card.id}
                onFlip={() => setFlippedId(flippedId === card.id ? null : card.id)}
                cardVariants={cardVariants}
              />
            ))}
          </motion.div>
          <motion.div variants={containerVariants} initial="hidden" animate={inView ? "visible" : "hidden"} className="grid lg:hidden grid-cols-2" style={{ gap: "13px" }}>
            {cards.map((card, i) => (
              <BentoCard
                key={card.id}
                card={card}
                index={i}
                isDesktop={false}
                isFlipped={flippedId === card.id}
                onFlip={() => setFlippedId(flippedId === card.id ? null : card.id)}
                cardVariants={cardVariants}
              />
            ))}
          </motion.div>
        </div>
      </section>
    </>
  );
}
