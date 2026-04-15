"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

export default function Preloader({ onComplete }: { onComplete?: () => void }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Optional: Check if user has already seen it this session (uncomment for production)
    // const hasSeen = sessionStorage.getItem("has_seen_preloader");
    // if (hasSeen) {
    //   setShow(false);
    //   onComplete?.();
    //   return;
    // }

    // Lock scroll while preloader is active
    document.body.style.overflow = "hidden";

    // Duration of the hold before sliding up
    const timer = setTimeout(() => {
      setShow(false);
      document.body.style.overflow = ""; 
      onComplete?.();
      // sessionStorage.setItem("has_seen_preloader", "true");
    }, 2200);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
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
          exit={{ opacity: 0, y: "-100%" }} // smooth slide up and fade
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        >
          
          <div className="relative text-center select-none pointer-events-none px-4 flex flex-col items-center -mt-[100px] md:mt-0">
            
            {/* Logo fade in */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-8 relative w-[200px] h-[200px] sm:w-[260px] sm:h-[260px]"
            >
               <Image 
                src="/logo.png" 
                alt="Dormers Logo" 
                fill
                className="object-contain opacity-90"
                priority
               />
            </motion.div>

            <div className="relative">
              {/* Layer 1: Hollow Text (Exact Old Style) */}
              <div 
                className="font-montserrat font-black text-[40px] sm:text-[50px] md:text-[55px] lg:text-[65px] leading-[1.05] tracking-tight uppercase"
                style={{
                  color: "#091825",
                  textShadow: "-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff",
                }}
              >
                Meals that<br />don&apos;t suck.
              </div>

              {/* Layer 2: Filled Text (Reveals bottom to top) */}
              <motion.div 
                className="absolute top-0 left-0 w-full h-full font-montserrat font-black text-[40px] sm:text-[50px] md:text-[55px] lg:text-[65px] leading-[1.05] tracking-tight uppercase text-[#f57f20]"
                style={{
                  textShadow: "-1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff", // Keeps the white outline even when filled
                }}
                initial={{ clipPath: "inset(100% 0 0 0)" }}
                animate={{ clipPath: "inset(0% 0 0 0)" }}
                transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.3 }}
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
