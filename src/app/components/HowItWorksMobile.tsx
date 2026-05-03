"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useTheme } from "next-themes";
import { CARDS } from "./HowItWorks.data";

/**
 * Mobile variant — 360vh stack-slide. Three cards animate in/out as the user
 * scrolls through a pinned sticky container; a heading + dot rail track the
 * active card.
 *
 * Was inlined in HowItWorks.tsx alongside the desktop variant.
 */
export function HowItWorksMobile() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const containerRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // useScroll({ target }) relies on Framer's internal getBoundingClientRect()
  // called in useLayoutEffect. On mobile Chrome/Safari, this fires before the
  // page layout fully settles, returning a wrong offsetTop and making progress
  // start at ~0.28 instead of 0. Fix: use global scrollY + measure offsetTop
  // ourselves via the offsetParent chain (reliable, layout-independent).
  const { scrollY } = useScroll();
  const rangeRef = useRef<[number, number]>([0, 1]);

  useEffect(() => {
    function measure() {
      const h = window.innerHeight;
      if (containerRef.current) containerRef.current.style.height = `${h * 3.6}px`;
      if (stickyRef.current) stickyRef.current.style.height = `${h}px`;
      // rAF lets the DOM settle after the height write before we read position
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        let top = 0;
        let el: HTMLElement | null = containerRef.current;
        while (el) {
          top += el.offsetTop;
          el = el.offsetParent as HTMLElement | null;
        }
        // Second scaling pass: 2.76h → 2.60h (×1.0615). C3 now settles at
        // progress ~0.98, leaving only 0.02 × 2.60h ≈ 0.05vh buffer —
        // essentially no dead scroll after Card 3.
        rangeRef.current = [top, top + h * 2.6];
      });
    }
    let prevW = window.innerWidth;
    function handleResize() {
      const w = window.innerWidth;
      if (w !== prevW) { prevW = w; measure(); }
      // Height-only resize = Safari chrome show/hide — ignore to prevent layout jump
    }
    measure();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollYProgress = useTransform(scrollY, (v) => {
    const [start, end] = rangeRef.current;
    return Math.max(0, Math.min(1, (v - start) / (end - start)));
  });

  // ── Heading text ──────────────────────────────────────────────────────────
  // Text starts at progress 0.35 = 0.35 × 2.60h = 0.91vh after the section
  // is fully pinned — the user is well inside before anything appears.
  // Each word staggers by 0.03 progress. Underline follows last word.
  //
  //  Section "settling" buffer:  0.35 × 2.60h = 0.91vh  ← felt as "fully in"
  //  Full text + underline span: 0.35 → 0.55 = 0.52vh of scroll
  const eyebrowOpacity = useTransform(scrollYProgress, [0.35, 0.40], [0, 1]);
  const op1 = useTransform(scrollYProgress, [0.38, 0.43], [0, 1]);
  const y1 = useTransform(scrollYProgress, [0.38, 0.43], [20, 0]);
  const op2 = useTransform(scrollYProgress, [0.41, 0.46], [0, 1]);
  const y2 = useTransform(scrollYProgress, [0.41, 0.46], [20, 0]);
  const op3 = useTransform(scrollYProgress, [0.43, 0.48], [0, 1]);
  const y3 = useTransform(scrollYProgress, [0.43, 0.48], [20, 0]);
  const op4 = useTransform(scrollYProgress, [0.46, 0.51], [0, 1]);
  const y4 = useTransform(scrollYProgress, [0.46, 0.51], [20, 0]);
  const underlineWidth = useTransform(scrollYProgress, [0.49, 0.55], ["0%", "100%"]);

  // ── Progress dots ─────────────────────────────────────────────────────────
  const dotsOpacity = useTransform(scrollYProgress, [0.53, 0.58], [0, 1]);

  // ── Cards ─────────────────────────────────────────────────────────────────
  // All three card transitions are exactly 0.16h physical scroll. Enters and
  // exits are symmetric. C3 ends at 1.0 — zero dead scroll.
  //
  //  C1 enter:  (0.62 – 0.56) × 2.60h = 0.16vh
  //  C1 exit:   (0.75 – 0.69) × 2.60h = 0.16vh
  //  C2 enter:  (0.81 – 0.75) × 2.60h = 0.16vh
  //  C2 exit:   (0.94 – 0.88) × 2.60h = 0.16vh
  //  C3 enter:  (1.00 – 0.94) × 2.60h = 0.16vh  ← ends exactly at range end
  const c1Opacity = useTransform(scrollYProgress, [0.56, 0.62, 0.69, 0.75], [0, 1, 1, 0]);
  const c1Y = useTransform(scrollYProgress, [0.56, 0.62], [100, 0]);
  const c1Scale = useTransform(scrollYProgress, [0.56, 0.62], [0.95, 1]);
  const c1X = useTransform(scrollYProgress, [0.69, 0.75], ["0vw", "-120vw"]);

  const c2Opacity = useTransform(scrollYProgress, [0.75, 0.81, 0.88, 0.94], [0, 1, 1, 0]);
  const c2Y = useTransform(scrollYProgress, [0.75, 0.81], [100, 0]);
  const c2Scale = useTransform(scrollYProgress, [0.75, 0.81], [0.95, 1]);
  const c2X = useTransform(scrollYProgress, [0.88, 0.94], ["0vw", "-120vw"]);

  const c3Opacity = useTransform(scrollYProgress, [0.94, 1.0], [0, 1]);
  const c3Y = useTransform(scrollYProgress, [0.94, 1.0], [100, 0]);
  const c3Scale = useTransform(scrollYProgress, [0.94, 1.0], [0.95, 1]);
  const c3X = useTransform(scrollYProgress, [0.94, 1.0], ["0vw", "0vw"]);

  const cardOpacities = [c1Opacity, c2Opacity, c3Opacity];
  const cardYs = [c1Y, c2Y, c3Y];
  const cardScales = [c1Scale, c2Scale, c3Scale];
  const cardXs = [c1X, c2X, c3X];

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.69) setActiveIndex(0);
    else if (latest < 0.88) setActiveIndex(1);
    else setActiveIndex(2);
  });

  return (
    <section ref={containerRef} className={`relative ${isLight ? "bg-[#F0EBE0]" : "bg-[#091825]"}`} style={{ height: '360vh' }}>
      <div ref={stickyRef} className="sticky top-0 flex flex-col justify-center overflow-hidden pt-6" style={{ height: '100vh' }}>

        <div
          className="absolute inset-0 opacity-50 pointer-events-none z-0"
          style={{
            backgroundImage: `url("/images/howit'sworkbackgroundimage.svg")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'cover'
          }}
        />

        <div className="w-full relative z-10 flex flex-col">

          <div className="max-w-[72rem] mx-auto px-6 w-full mb-8 text-center">
            <motion.span
              initial={{ opacity: 0 }}
              style={{ opacity: eyebrowOpacity }}
              className={`font-bold text-[11px] md:text-[12px] uppercase tracking-[0.25em] text-center block mb-4 font-montserrat ${isLight ? "text-[#091825]/45" : "text-[#ede8da]/50"}`}
            >
              HOW IT WORKS
            </motion.span>

            <h2 className={`font-extrabold text-[32px] md:text-[48px] leading-[1.2] tracking-tight flex flex-wrap justify-center gap-x-2 font-montserrat ${isLight ? "text-[#091825]" : "text-[#ede8da]"}`}>
              <motion.span initial={{ opacity: 0, y: 20 }} style={{ opacity: op1, y: y1 }} className="inline-block">From</motion.span>
              <motion.span initial={{ opacity: 0, y: 20 }} style={{ opacity: op2, y: y2 }} className="inline-block">stressed</motion.span>
              <motion.span initial={{ opacity: 0, y: 20 }} style={{ opacity: op3, y: y3 }} className="inline-block">to</motion.span>

              <motion.span initial={{ opacity: 0, y: 20 }} style={{ opacity: op4, y: y4 }} className="inline-block relative">
                sorted.
                <motion.span
                  initial={{ width: "0%" }}
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
                  initial={{ opacity: 0, scale: 0.95, y: 100 }}
                  style={{
                    gridArea: 'stack',
                    opacity: cardOpacities[i],
                    x: cardXs[i],
                    y: cardYs[i],
                    scale: cardScales[i]
                  }}
                  className={`flex-shrink-0 w-[80vw] max-w-[320px] rounded-[24px] pt-4 pb-8 px-4 flex flex-col relative ${isLight ? "bg-white/60 border border-[#1E3A4F]/10 shadow-[0_-20px_40px_rgba(9,24,37,0.08)]" : "bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] shadow-[0_-20px_40px_rgba(9,24,37,0.6)]"}`}
                >
                  <span
                    className="text-[120px] font-black leading-none text-center block -mb-[28px] pointer-events-none select-none relative z-[1] font-montserrat"
                    style={{
                      backgroundImage: isLight ? card.numGradLight : card.numGrad,
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
                    <p className={`text-[15px] font-medium leading-[1.6] max-w-[240px] mb-3 font-montserrat ${isLight ? "text-[#1E3A4F]" : "text-[#ede8da]"}`}>
                      {card.body}
                    </p>
                    <p className={`text-[14px] font-normal italic leading-[1.5] font-montserrat ${isLight ? "text-[#1E3A4F]/45" : "text-[#ede8da]/40"}`}>
                      {card.subline}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Left dots */}
            <motion.div
              initial={{ opacity: 0 }}
              style={{ opacity: dotsOpacity }}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-20"
            >
              {CARDS.map((_, i) => (
                <div
                  key={i}
                  className={`w-[4px] rounded-full transition-all duration-300 ${activeIndex === i
                    ? "h-8 bg-[#f57f20] shadow-[0_0_10px_rgba(245,127,32,0.6)]"
                    : isLight ? "h-[6px] bg-[#091825]/35" : "h-[6px] bg-[#ede8da]/35"
                    }`}
                />
              ))}
            </motion.div>

            {/* Right dots */}
            <motion.div
              initial={{ opacity: 0 }}
              style={{ opacity: dotsOpacity }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-20"
            >
              {CARDS.map((_, i) => (
                <div
                  key={i}
                  className={`w-[4px] rounded-full transition-all duration-300 ${activeIndex === i
                    ? "h-8 bg-[#f57f20] shadow-[0_0_10px_rgba(245,127,32,0.6)]"
                    : isLight ? "h-[6px] bg-[#091825]/35" : "h-[6px] bg-[#ede8da]/35"
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
