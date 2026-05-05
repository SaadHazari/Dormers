"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { EASE_DRAMATIC, EASE_SMOOTH } from "@/lib/motion";

export default function Preloader({ onComplete }: { onComplete?: () => void }) {
  const [show, setShow] = useState(true);
  const [isQuick, setIsQuick] = useState(false);

  // Locks body scroll while the preloader is showing. Re-runs on `show`
  // change → automatically unlocks once the timer flips show=false.
  useBodyScrollLock(show);

  // Runs synchronously before paint — returning visitors get the quick
  // version from the very first frame, no flash of the slow animation.
  useLayoutEffect(() => {
    if (localStorage.getItem("hero_seen") === "true") {
      setIsQuick(true);
    }
  }, []);

  useEffect(() => {
    const quick = localStorage.getItem("hero_seen") === "true";
    const exitMs = quick ? 450 : 800;
    let completeTimer: ReturnType<typeof setTimeout>;

    const timer = setTimeout(() => {
      setShow(false);
      completeTimer = setTimeout(() => onComplete?.(), exitMs + 50);
    }, quick ? 900 : 2200);

    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#091825]"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            y: "-100%",
            transition: { duration: isQuick ? 0.45 : 0.8, ease: EASE_DRAMATIC },
          }}
        >
          <div className="relative text-center select-none pointer-events-none px-4 flex flex-col items-center -mt-[100px] md:mt-0">

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: isQuick ? 0.25 : 0.6, delay: isQuick ? 0 : 0.2 }}
              className="mb-8 relative w-[200px] h-[200px] sm:w-[260px] sm:h-[260px]"
            >
              {/* logo-dark.svg = light-coloured logo for DARK surfaces. The
                  preloader is bg-[#091825] (deep navy). Convention named by
                  target surface, not own colour. */}
              <Image
                src="/logo-dark.svg"
                alt="Dormers Logo"
                fill
                className="object-contain opacity-90"
                priority
              />
            </motion.div>

            <div className="relative">
              {/* Hollow outline layer */}
              <div
                className="font-montserrat font-black text-[40px] sm:text-[50px] md:text-[55px] lg:text-[65px] leading-[1.05] tracking-tight uppercase"
                style={{
                  color: "#091825",
                  textShadow:
                    "-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff",
                }}
              >
                Meals that<br />don&apos;t suck.
              </div>

              {/* Orange fill layer — reveals bottom to top */}
              <motion.div
                className="absolute top-0 left-0 w-full h-full font-montserrat font-black text-[40px] sm:text-[50px] md:text-[55px] lg:text-[65px] leading-[1.05] tracking-tight uppercase text-[#f57f20]"
                style={{
                  textShadow:
                    "-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff",
                }}
                initial={{ clipPath: "inset(100% 0 0 0)" }}
                animate={{ clipPath: "inset(0% 0 0 0)" }}
                transition={{
                  duration: isQuick ? 0.65 : 1.4,
                  ease: EASE_SMOOTH,
                  delay: isQuick ? 0.05 : 0.3,
                }}
              >
                Meals that<br />don&apos;t suck.
              </motion.div>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
