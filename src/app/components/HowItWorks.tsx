"use client";

import { useRef, useState, useEffect, Fragment } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent, Variants } from "framer-motion";

const E = [0.25, 0.46, 0.45, 0.94] as const;

// ==========================================
// 1. ORIGINAL DESKTOP CSS
// ==========================================
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
    opacity: 0.4;
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

interface CardDef {
  num: string;
  numGrad: string;
  title: string;
  body: string;
  subline: string;
}

const CARDS: CardDef[] = [
  {
    num: "01",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.30) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    title: "YOU",
    body: "One quick sign-up. That's your whole part.",
    subline: "Way quicker than deciding what to eat.",
  },
  {
    num: "02",
    numGrad: "linear-gradient(180deg, rgba(245,127,32,0.35) 0%, rgba(245,127,32,0.03) 80%, rgba(245,127,32,0) 100%)",
    title: "CHOOSE",
    body: "Pick how long you want dinner sorted.",
    subline: "A week, a month, or one meal to try us.",
  },
  {
    num: "03",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.30) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    title: "US",
    body: "We cook. We pack. We deliver. Mon – Sat.",
    subline: "New dish. Warm box. At your door. Like clockwork.",
  },
];

// Exact 1.5s multiplier intervals for desktop storytelling
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

// ==========================================
// 2. DESKTOP COMPONENT
// ==========================================
function DesktopHowItWorks() {
  return (
    <>
      <style>{CSS}</style>

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
                      backgroundImage: card.numGrad,
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

// ==========================================
// 3. MOBILE COMPONENT (400vh Stack Slide)
// ==========================================
function MobileHowItWorks() {
  const targetRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // On mobile Chrome/Safari, CSS `100vh` can differ from `window.innerHeight`
  // (large vs small viewport height depending on URL bar visibility). Framer
  // Motion's useScroll uses window.innerHeight for its range calculations, so
  // if the CSS height doesn't match, the animation starts mid-way and the last
  // card never appears. Setting heights via JS keeps them in sync.
  useEffect(() => {
    function syncHeights() {
      const h = window.innerHeight;
      if (targetRef.current) targetRef.current.style.height = `${h * 4}px`;
      if (stickyRef.current) stickyRef.current.style.height = `${h}px`;
    }
    syncHeights();
    window.addEventListener('resize', syncHeights, { passive: true });
    return () => window.removeEventListener('resize', syncHeights);
  }, []);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"]
  });

  // Phase 1: The Heading Sequence (0% to 25%)
  const eyebrowOpacity = useTransform(scrollYProgress, [0, 0.04], [0, 1]);
  const op1 = useTransform(scrollYProgress, [0.02, 0.07], [0, 1]);
  const y1 = useTransform(scrollYProgress, [0.02, 0.07], [20, 0]);
  const op2 = useTransform(scrollYProgress, [0.06, 0.11], [0, 1]);
  const y2 = useTransform(scrollYProgress, [0.06, 0.11], [20, 0]);
  const op3 = useTransform(scrollYProgress, [0.10, 0.15], [0, 1]);
  const y3 = useTransform(scrollYProgress, [0.10, 0.15], [20, 0]);
  const op4 = useTransform(scrollYProgress, [0.14, 0.19], [0, 1]);
  const y4 = useTransform(scrollYProgress, [0.14, 0.19], [20, 0]);
  const underlineWidth = useTransform(scrollYProgress, [0.20, 0.25], ["0%", "100%"]);

  // Phase 2, 3, 4: Center-Fade, Slide Up & Swipe Stack
  const dotsOpacity = useTransform(scrollYProgress, [0.25, 0.30], [0, 1]);

  const c1Opacity = useTransform(scrollYProgress, [0.25, 0.30, 0.47, 0.48], [0, 1, 1, 0]);
  const c1Y = useTransform(scrollYProgress, [0.25, 0.30], [100, 0]);
  const c1Scale = useTransform(scrollYProgress, [0.25, 0.30], [0.95, 1]);
  const c1X = useTransform(scrollYProgress, [0.40, 0.47], ["0vw", "-120vw"]);

  const c2Opacity = useTransform(scrollYProgress, [0.50, 0.55, 0.72, 0.73], [0, 1, 1, 0]);
  const c2Y = useTransform(scrollYProgress, [0.50, 0.55], [100, 0]);
  const c2Scale = useTransform(scrollYProgress, [0.50, 0.55], [0.95, 1]);
  const c2X = useTransform(scrollYProgress, [0.65, 0.72], ["0vw", "-120vw"]);

  const c3Opacity = useTransform(scrollYProgress, [0.75, 0.80], [0, 1]);
  const c3Y = useTransform(scrollYProgress, [0.75, 0.80], [100, 0]);
  const c3Scale = useTransform(scrollYProgress, [0.75, 0.80], [0.95, 1]);
  const c3X = useTransform(scrollYProgress, [0.75, 1], ["0vw", "0vw"]);

  const cardOpacities = [c1Opacity, c2Opacity, c3Opacity];
  const cardYs = [c1Y, c2Y, c3Y];
  const cardScales = [c1Scale, c2Scale, c3Scale];
  const cardXs = [c1X, c2X, c3X];

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.50) setActiveIndex(0);
    else if (latest < 0.75) setActiveIndex(1);
    else setActiveIndex(2);
  });

  return (
    <section ref={targetRef} className="relative h-[400dvh] bg-[#091825]">
      <div ref={stickyRef} className="sticky top-0 h-[100dvh] flex flex-col justify-center overflow-hidden">

        <div
          className="absolute inset-0 opacity-[0.4] pointer-events-none z-0"
          style={{
            backgroundImage: `url("/images/howit'sworkbackgroundimage.svg")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'cover'
          }}
        />

        <div className="w-full relative z-10 flex flex-col -mt-20">

          <div className="max-w-[72rem] mx-auto px-6 w-full mb-8 text-center">
            <motion.span
              style={{ opacity: eyebrowOpacity }}
              className="font-bold text-[11px] md:text-[12px] uppercase tracking-[0.25em] text-[#ede8da]/50 text-center block mb-4 font-montserrat"
            >
              HOW IT WORKS
            </motion.span>

            <h2 className="font-extrabold text-[32px] md:text-[48px] text-[#ede8da] leading-[1.2] tracking-tight flex flex-wrap justify-center gap-x-2 font-montserrat">
              <motion.span style={{ opacity: op1, y: y1 }} className="inline-block">From</motion.span>
              <motion.span style={{ opacity: op2, y: y2 }} className="inline-block">stressed</motion.span>
              <motion.span style={{ opacity: op3, y: y3 }} className="inline-block">to</motion.span>

              <motion.span style={{ opacity: op4, y: y4 }} className="inline-block relative">
                sorted.
                <motion.span
                  style={{ width: underlineWidth }}
                  className="absolute left-0 bottom-[-4px] h-[3px] bg-[#f57f20] rounded-full origin-left"
                />
              </motion.span>
            </h2>
          </div>

          <div className="max-w-[72rem] mx-auto w-full flex justify-center relative">
            <div className="relative grid place-items-center" style={{ gridTemplateAreas: '"stack"' }}>
              {CARDS.map((card, i) => (
                <motion.div
                  key={i}
                  style={{
                    gridArea: 'stack',
                    opacity: cardOpacities[i],
                    x: cardXs[i],
                    y: cardYs[i],
                    scale: cardScales[i]
                  }}
                  className="flex-shrink-0 w-[80vw] max-w-[320px] bg-white/[0.03] border border-white/[0.08] rounded-[24px] pt-4 pb-8 px-4 flex flex-col relative shadow-[0_-20px_40px_rgba(9,24,37,0.6)] backdrop-blur-sm"
                >
                  <span
                    className="text-[120px] font-black leading-none text-center block -mb-[28px] pointer-events-none select-none relative z-[1] font-montserrat"
                    style={{
                      backgroundImage: card.numGrad,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                    }}
                  >
                    {card.num}
                  </span>

                  <div className="relative z-[2] px-4 flex flex-col items-center text-center">
                    <h3 className="text-[22px] font-extrabold text-[#f57f20] uppercase tracking-[0.06em] mb-4 font-montserrat">
                      {card.title}
                    </h3>
                    <p className="text-[15px] font-medium text-[#ede8da] leading-[1.6] max-w-[240px] mb-3 font-montserrat">
                      {card.body}
                    </p>
                    <p className="text-[14px] font-normal text-[#ede8da]/40 italic leading-[1.5] font-montserrat">
                      {card.subline}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* VERTICAL Scroll-Synced Pagination HUD on the Right Edge */}
            <motion.div
              style={{ opacity: dotsOpacity }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-20"
            >
              {CARDS.map((_, i) => (
                <div
                  key={i}
                  className={`w-[4px] rounded-full transition-all duration-300 ${activeIndex === i
                    ? "h-8 bg-[#f57f20] shadow-[0_0_10px_rgba(245,127,32,0.6)]"
                    : "h-[4px] bg-[#ede8da]/20"
                    }`}
                />
              ))}
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}

// ==========================================
// 4. MAIN EXPORT COMPONENT
// ==========================================
export default function HowItWorks() {
  return (
    <>
      {/* Renders ONLY on screens sm (640px) and up */}
      <div className="hidden sm:block">
        <DesktopHowItWorks />
      </div>

      {/* Renders ONLY on mobile screens smaller than sm (640px) */}
      <div className="block sm:hidden">
        <MobileHowItWorks />
      </div>
    </>
  );
}