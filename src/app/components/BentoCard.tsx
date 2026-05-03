"use client";

import { motion, type Variants } from "framer-motion";
import type { CardData } from "./USPBento.cards";

interface Props {
  card: CardData;
  index: number;
  isDesktop: boolean;
  isFlipped: boolean;
  onFlip: () => void;
  cardVariants: Variants;
}

const noGradientBorder = (bg: string) => bg === "#FF7F00" || !bg.startsWith("#");

/**
 * One bento card — handles its front face, flipped back face, and the
 * 3D flip animation. The class names (.bento-wrapper, .bento-flipper,
 * .bento-front, .bento-back, .bento-flip-icon, .bento-flip-hint) are
 * defined by FLIP_CSS injected once by the <USPBento> parent.
 */
export function BentoCard({ card, index, isDesktop, isFlipped, onFlip, cardVariants }: Props) {
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
      custom={index}
      variants={cardVariants}
      className={`flex flex-col relative ${isDesktop ? "min-h-[130px]" : `min-h-[110px] ${card.mobileClass}`}`}
      style={{ ...(isDesktop ? card.desktopStyle : {}), height: "100%" }}
    >
      <div className="bento-wrapper" onClick={onFlip}>
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
}
