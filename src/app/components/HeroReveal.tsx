"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TextRotate } from "@/components/ui/text-rotate";
import TonightsMeal from "@/app/components/TonightsMeal";
import Preloader from "@/app/components/Preloader";

import { EASE_STANDARD as E } from "@/ui-system/tokens/motion";
import { HERO_REVEAL_CSS as CSS } from "@/app/components/HeroReveal.styles";
import { HeroProofBar } from "@/app/components/HeroProofBar";
import { HeroChecklist } from "@/app/components/HeroChecklist";
import { HeroHeadline } from "@/app/components/HeroHeadline";
import { HeroCloser } from "@/app/components/HeroCloser";

/* ─────────────────────────────────────────────────────────────────
 * Animation timing — sequential checklist
 *
 * SPEED GUIDE — tweak these constants to accelerate the sequence:
 *   W_GAP   0.13  → inter-word gap on line 1 (try 0.09)
 *   L2_D    1.15  → line 2 start       (try 0.75)
 *   L2_W_GAP 0.20 → inter-word gap L2  (try 0.13)
 *   UNDER_D 2.26  → dinner underline   (try 1.55)
 *   PP1_D   3.95  → checklist item 1   (try 2.60) ← biggest saving
 *   STR1_D  4.40  → strike 1           (try 3.05)
 *   DOT1_D  4.88  → dot 1              (try 3.45)
 *   PP2_D   5.08  → item 2             (try 3.60)
 *   … and so on keeping the same ~0.45 s gaps between items
 *   CLOSE_D 7.30  → typewriter start   (try 5.50) ← biggest saving
 *   CTA_D  10.10  → CTA buttons        (try 8.00)
 * ───────────────────────────────────────────────────────────────── */
const W_GAP = 0.13;
const L1_S  = 0.20;
const L2_D  = 1.15;
const L2_W_GAP = 0.20;
const UNDER_D  = 2.26;

// PP1_D = 3.0 — all subsequent values keep the exact original inter-step gaps
const PP1_D  = 3.00;               // was 3.95  (-0.95)
const STR1_D = PP1_D  + 0.45;     // 3.45  (was 4.40)
const DOT1_D = STR1_D + 0.48;     // 3.93  (was 4.88)
const PP2_D  = DOT1_D + 0.20;     // 4.13  (was 5.08)
const STR2_D = PP2_D  + 0.44;     // 4.57  (was 5.52)
const DOT2_D = STR2_D + 0.48;     // 5.05  (was 6.00)
const PP3_D  = DOT2_D + 0.20;     // 5.25  (was 6.20)
const STR3_D = PP3_D  + 0.44;     // 5.69  (was 6.64)

const CLOSE_D  = STR3_D + 0.66;   // 6.35  (was 7.30)
const LINE2_D  = CLOSE_D + 1.65;  // 8.00  (was 8.95)
const LINE2B_D = LINE2_D + 0.50;  // 8.50  (was 9.45)
const CTA_D    = LINE2B_D + 0.65; // 9.15  (was 10.10)
const PRICE_D  = CTA_D  + 0.65;   // 9.80  (was 10.75)
const DISH_D   = PRICE_D + 0.55;  // 10.35 (was 11.30)
const DORM_D   = DISH_D  + 0.55;  // 10.90 (was 11.85)


// Strike (the strike-through animation used inside the checklist) lives
// in HeroChecklist.tsx now — it's only used there.

import type { Dish } from '@/contexts/menu/domain/catalog-data'

export default function HeroReveal({ menuData }: { menuData?: Dish[] }) {
  const router = useRouter();

  const [isPreloading, setIsPreloading] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const skippedRef = useRef(false);

  /* ── Snap-transition helper ──────────────────────────────────────
   * When skipped=true every entry animation collapses to 0 duration,
   * snapping all motion elements to their final visible state.      */
  const st = (base: object) => skipped ? { duration: 0, delay: 0 } : base;

  /* ── Skip intro handler ───────────────────────────────────────── */
  const skipIntro = () => {
    setSkipped(true);
    setAnimDone(true);
    window.dispatchEvent(new CustomEvent("hero-ui-visible"));
    localStorage.setItem("hero_seen", "true");
  };

  /* ── Skip animation for returning visitors ───────────────────── *
   * Keep isPreloading=true so the quick splash screen still shows.  *
   * skippedRef escapes the stale-closure problem in onComplete.     */
  useLayoutEffect(() => {
    if (localStorage.getItem("hero_seen") === "true") {
      skippedRef.current = true;
      setSkipped(true);
      setAnimDone(true);
    }
  }, []);

  /* ── Navbar + chat bubble reveal ─────────────────────────────────
   * Fires right after the CTA buttons appear (CTA_D + 0.5 s),
   * not after the proof columns (old: DORM_D + 0.5 s).            */
  useEffect(() => {
    if (isPreloading || skipped) return;
    const t = setTimeout(() => {
      setAnimDone(true);
      window.dispatchEvent(new CustomEvent("hero-ui-visible"));
      localStorage.setItem("hero_seen", "true");
    }, (CTA_D + 0.5) * 1000);
    return () => {
      clearTimeout(t);
    };
  }, [isPreloading, skipped]);

  // Typewriter state + effect now live inside <HeroCloser/>.

  return (
    <>
      <style>{CSS}</style>

      {isPreloading && (
        <Preloader
          onComplete={() => {
            setIsPreloading(false);
            if (skippedRef.current) {
              window.dispatchEvent(new CustomEvent("hero-ui-visible"));
            }
          }}
        />
      )}

      <section
        id="hero"
        className="h-section"
        style={isPreloading ? { minHeight: "100vh" } : undefined}
      >

        {/* ── Grain texture ────────────────────────────────── */}
        <div aria-hidden className="h-grain">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
            <defs>
              <filter id="h-noise-filter" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
              </filter>
            </defs>
            <rect width="100%" height="100%" filter="url(#h-noise-filter)" fill="white" />
          </svg>
        </div>

        {!isPreloading && (
          <>
            {/* ── Skip Intro button ──────────────────────────── */}
            <AnimatePresence>
              {!animDone && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.8, duration: 0.35 }}
                  onClick={skipIntro}
                  className="h-skip"
                >
                  Skip intro →
                </motion.button>
              )}
            </AnimatePresence>

            {/* key forces full remount on skip → all motion elements start fresh
                with st() → duration:0, snapping every element to final state   */}
            <div key={skipped ? 1 : 0} style={{ display: "contents" }}>
            <div className="h-content">
              <div className="h-left">

                {/* 1 ── Headline */}
                <HeroHeadline
                  skipped={skipped}
                  timing={{
                    l1Start: L1_S,
                    l1WordGap: W_GAP,
                    l2Start: L2_D,
                    l2WordGap: L2_W_GAP,
                    underlineDelay: UNDER_D,
                  }}
                />

                {/* 2 ── Checklist */}
                <HeroChecklist
                  skipped={skipped}
                  items={[
                    { text: "No apps to scroll",    strRotation: -1,   delay: PP1_D, strDelay: STR1_D, dotDelay: DOT1_D },
                    { text: "No groceries to buy",  strRotation: 0.5,  delay: PP2_D, strDelay: STR2_D, dotDelay: DOT2_D },
                    { text: "No recipes to follow", strRotation: -0.8, delay: PP3_D, strDelay: STR3_D },
                  ]}
                />

                {/* 3 ── Anchor / payoff (typewriter + Delivered WARM) */}
                <HeroCloser
                  skipped={skipped}
                  isPreloading={isPreloading}
                  closeDelay={CLOSE_D}
                  l2Delay={LINE2_D}
                  l2bDelay={LINE2B_D}
                />

                {/* 4 ── CTA Buttons */}
                <div className="h-ctas">
                  <motion.button
                    className="h-btn h-btn-primary hero-cta-primary flex items-center justify-center overflow-hidden min-w-[160px] md:min-w-[185px]"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: CTA_D, duration: 0.48, ease: E })}
                    onClick={() => router.push("/maintenance")}
                  >
                    <TextRotate
                      texts={["Get Started", "View Plans"]}
                      mainClassName="font-bold !whitespace-nowrap !flex-nowrap"
                      staggerDuration={0.03}
                      staggerFrom="last"
                      rotationInterval={3500}
                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    />
                  </motion.button>
                  <motion.button
                    className="h-btn h-btn-secondary"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: CTA_D, duration: 0.48, ease: E })}
                    onClick={() => router.push("/maintenance")}
                  >
                    Try a Meal
                  </motion.button>

                  {/* Mobile-only skip intro — centred in CTA row, appears with "You" */}
                  <AnimatePresence>
                    {!animDone && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        transition={st({ delay: L1_S, duration: 0.35 })}
                        onClick={(e) => { e.stopPropagation(); skipIntro(); }}
                        className="sm:hidden h-skip-mobile"
                      >
                        Skip intro →
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

              </div>{/* end h-left */}

              {/* Right column — Tonight's Meal card */}
              <motion.div
                className="h-right"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={st({ delay: DISH_D, duration: 0.55, ease: E })}
              >
                <TonightsMeal menuData={menuData} />
              </motion.div>

            </div>

            {/* 5 ── Proof bar */}
            <HeroProofBar
              skipped={skipped}
              priceDelay={PRICE_D}
              dishDelay={DISH_D}
              dormDelay={DORM_D}
            />
            </div>{/* end key wrapper */}
          </>
        )}
      </section>
    </>
  );
}
