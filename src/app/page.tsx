"use client";

import { motion, useAnimation } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.9, staggerChildren: 0.28 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

export default function WelcomePage() {
  const router = useRouter();
  const controls = useAnimation();
  const [dismissed, setDismissed] = useState(false);

  // Preload the home page instantly so the redirect has zero delay
  useEffect(() => {
    router.prefetch("/home");

    const redirectPath = sessionStorage.getItem("redirectPath");
    if (redirectPath) {
      sessionStorage.removeItem("redirectPath");
      router.push(redirectPath);
    }
  }, [router]);

  // Start the subtle card bob after content animates in
  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => {
      controls.start({
        y: [0, -22, 0],
        transition: {
          duration: 1.2,
          times: [0, 0.28, 1],
          ease: ["easeOut", [0.34, 1.56, 0.64, 1]],
          repeat: Infinity,
          repeatDelay: 3.0,
        },
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [controls, dismissed]);

  const exitGenie = async () => {
    if (dismissed) return;
    setDismissed(true);
    controls.stop();

    // Shrinks the ENTIRE screen (background included) to absolute zero
    await controls.start({
      scale: 0.0,
      rotateX: 45,
      rotateZ: -10,
      opacity: [1, 1, 0],
      borderBottomRightRadius: "100%",
      borderBottomLeftRadius: "100%",
      filter: "blur(12px)",
      transition: { duration: 0.65, ease: [0.5, 0, 0.1, 1] },
    });

    // Pushes to the pre-fetched home page
    router.push("/home");
  };

  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(168deg, #0A1B2A 0%, #182F42 55%, #1E3A4F 100%)",
    transformOrigin: "32px 32px", // Anchors the suck to the top left corner
    transformStyle: "preserve-3d",
  };

  return (
    <motion.div
      animate={controls}
      style={{ zIndex: 200, touchAction: "none", ...cardStyle }}
      className="fixed inset-0 overflow-hidden w-full h-full"
      onPanEnd={(_, info) => {
        if (info.offset.y < -55 || info.velocity.y < -320) {
          exitGenie();
        }
      }}
    >
      {/* ── Orange depth glow is now INSIDE the animated container ── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "60vh",
          background: "radial-gradient(ellipse 100% 110% at 50% 108%, rgba(255, 127, 0, 0.65) 0%, rgba(255, 80, 0, 0.28) 45%, transparent 72%)",
        }}
      />

      <motion.div
        className="w-full h-full flex flex-col items-center md:justify-start justify-center relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div variants={itemVariants} className="absolute top-8 left-4 md:relative md:top-0 md:left-0 md:mt-8 md:mb-6">
          <div className="relative w-[120px] h-[120px] md:w-[240px] md:h-[212px]">
            <Image src="/logo.png" alt="Dormer's Logo" fill className="object-contain" priority />
          </div>
        </motion.div>

        {/* Headline - Mobile */}
        <div className="relative w-full md:hidden">
          <div className="absolute top-[-170px] left-0 w-full flex flex-col gap-[1px]">
            <motion.p variants={itemVariants} className="text-[64px] leading-[77px] pl-[33px] main_page_meal">MEALS</motion.p>
            <motion.p variants={itemVariants} className="text-[64px] leading-[78px] pl-[33px]" style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "55px", color: "#213c4c", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>THAT</motion.p>
            <motion.div variants={itemVariants} className="text-[64px] leading-[78px] pl-[34px] flex">
              <div className="flex items-center space-x-1">
                <span style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#213c4c", fontSize: "55px", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>DON</span>
                <span className="relative w-[20px] h-[40px] top-[-8px]">
                  <Image src="/images/main_page_icon.svg" alt="'" fill className="object-contain" priority />
                </span>
                <span style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "55px", color: "#213c4c", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>T</span>
              </div>
            </motion.div>
            <motion.p variants={itemVariants} className="text-[64px] leading-[78px] pl-[33px]" style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#213c4c", fontSize: "55px", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>SUCK</motion.p>
          </div>
        </div>

        {/* Headline - Desktop */}
        <motion.div className="hidden md:block text-center leading-tight">
          <motion.p variants={itemVariants} className="text-[64px] leading-[78px] pl-[33px] mealsthattext_box">MEALS THAT</motion.p>
          <motion.div variants={itemVariants} className="text-[64px] leading-[78px] pl-[34px] flex justify-center">
            <div className="flex items-center space-x-1">
              <span style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#213c4c", fontSize: "55px", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>DON</span>
              <span className="relative w-[20px] h-[40px] top-[-8px]">
                <Image src="/images/main_page_icon.svg" alt="'" fill className="object-contain" priority />
              </span>
              <span style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "55px", color: "#213c4c", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>T SUCK</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Bottom pill */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
          <motion.div animate={{ opacity: [0.45, 0.85, 0.45] }} transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }} style={{ width: 64, height: 5, borderRadius: 9999, background: "rgba(238,233,218,0.85)" }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
