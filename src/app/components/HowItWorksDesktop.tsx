"use client";

import { Fragment } from "react";
import { motion, Variants } from "framer-motion";
import { useIsLight } from "@/ui-system/hooks/useIsLight";
import { EASE_STANDARD as E } from "@/ui-system/tokens/motion";
import { CARDS } from "./HowItWorks.data";

// Original desktop CSS — injected globally via dangerouslySetInnerHTML so the
// hyphenated `hiw-*` class names work regardless of styled-jsx scoping.
const CSS = `
  .hiw-section {
    background: #091825;
    padding: 100px 0;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .hiw-bg {
    position: absolute;
    inset: 0;
    background-image: url("/images/howit'sworkbackgroundimage.svg");
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
  }

  .hiw-container {
    max-width: 72rem;
    margin: 0 auto;
    padding: 0 64px;
    position: relative;
    z-index: 1;
  }

  .hiw-label {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(237, 232, 218, 0.45);
    text-align: center;
    margin-bottom: 12px;
    display: block;
  }
  .hiw-section-title {
    font-family: Montserrat, sans-serif;
    font-weight: 700;
    font-size: 40px;
    color: #ede8da;
    text-align: center;
    margin: 0 0 80px;
    line-height: 1.15;
  }

  .hiw-cols {
    display: flex;
    align-items: stretch;
    gap: 32px;
  }
  .hiw-col {
    flex: 1;
    text-align: center;
    position: relative;
  }

  .hiw-sep {
    flex-shrink: 0;
    width: 1px;
    align-self: stretch;
    background: linear-gradient(
      180deg,
      transparent                       0%,
      rgba(237, 232, 218, 0.12)        30%,
      rgba(237, 232, 218, 0.12)        70%,
      transparent                      100%
    );
  }

  .hiw-num {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 180px;
    line-height: 1;
    text-align: center;
    display: block;
    margin: 0 0 -20px;
    pointer-events: none;
    user-select: none;
    position: relative;
    z-index: 1;
  }

  .hiw-text-block {
    position: relative;
    z-index: 2;
    padding: 24px 16px;
    box-shadow: 0 -20px 40px rgba(9, 24, 37, 0.6);
    border-radius: var(--radius-card, 16px);
  }

  .hiw-title {
    font-family: Montserrat, sans-serif;
    font-weight: 800;
    font-size: 24px;
    color: #f57f20;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 16px;
    text-align: center;
  }

  .hiw-body {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 16px;
    color: #ede8da;
    line-height: 1.6;
    max-width: 280px;
    margin: 0 auto 12px;
    text-align: center;
  }

  .hiw-subline {
    font-family: Montserrat, sans-serif;
    font-weight: 400;
    font-size: 14px;
    color: rgba(237, 232, 218, 0.4);
    font-style: italic;
    line-height: 1.5;
    margin: 0;
    text-align: center;
  }

  @media (max-width: 1024px) {
    .hiw-container     { padding: 0 48px; }
    .hiw-cols          { gap: 24px; }
    .hiw-num           { font-size: 140px; margin-bottom: -15px; }
    .hiw-section-title { font-size: 34px; }
    .hiw-title         { font-size: 22px; }
    .hiw-body          { font-size: 15px; max-width: 240px; }
  }
`;

const COL_TIMING = [
  { numDelay: 1.5, textDelay: 1.7 },
  { numDelay: 3.0, textDelay: 3.2 },
  { numDelay: 4.5, textDelay: 4.7 },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const wordVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const underlineVariants: Variants = {
  hidden: { width: "0%" },
  show: { width: "100%", transition: { duration: 0.5, ease: "easeOut", delay: 0.8 } },
};

export function HowItWorksDesktop() {
  // useIsLight (not raw useTheme) — avoids the SSR/first-render hydration
  // mismatch that leaves the server's dark classes stuck in the DOM.
  const isLight = useIsLight();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <section className="hiw-section">
        <div className="hiw-bg" aria-hidden />
        <div className="hiw-container">

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="flex flex-col items-center mb-[80px]"
          >
            <motion.span variants={wordVariants} className="hiw-label mb-4">
              HOW IT WORKS
            </motion.span>

            <h2 className="hiw-section-title flex flex-wrap justify-center gap-x-3 !mb-0">
              <motion.span variants={wordVariants} className="inline-block">From</motion.span>
              <motion.span variants={wordVariants} className="inline-block">stressed</motion.span>
              <motion.span variants={wordVariants} className="inline-block">to</motion.span>

              <motion.span variants={wordVariants} className="inline-block relative">
                sorted.
                <motion.span
                  variants={underlineVariants}
                  className="absolute left-0 bottom-[-4px] md:bottom-[-6px] h-[3px] md:h-[4px] bg-[#f57f20] rounded-full origin-left"
                />
              </motion.span>
            </h2>
          </motion.div>

          <div className="hiw-cols">
            {CARDS.map((card, i) => (
              <Fragment key={card.num}>
                {i > 0 && (
                  <motion.div
                    className="hiw-sep"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: COL_TIMING[i].numDelay - 0.2, ease: E }}
                  />
                )}

                <div className="hiw-col">
                  <motion.span
                    className="hiw-num"
                    style={{
                      backgroundImage: isLight ? card.numGradLight : card.numGrad,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                    }}
                    aria-hidden
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: COL_TIMING[i].numDelay, ease: E }}
                  >
                    {card.num}
                  </motion.span>

                  <motion.div
                    className="hiw-text-block"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: COL_TIMING[i].textDelay, ease: E }}
                  >
                    <h3 className="hiw-title">{card.title}</h3>
                    <p className="hiw-body">{card.body}</p>
                    <p className="hiw-subline">{card.subline}</p>
                  </motion.div>
                </div>
              </Fragment>
            ))}
          </div>

        </div>
      </section>
    </>
  );
}
