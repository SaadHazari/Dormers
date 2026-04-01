"use client";

import { motion, useAnimation } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.9, staggerChildren: 0.28 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
};

export default function WelcomePage() {
  const router = useRouter();
  const controls = useAnimation();
  const [dismissed, setDismissed] = useState(false);

  // Redirect if session path is stored
  useEffect(() => {
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

  // Much Better Genie Illusion
  const exitGenie = async () => {
    if (dismissed) return;
    setDismissed(true);
    controls.stop();

    // Instead of sliding the X/Y coordinates manually, we anchor the origin to the top-left logo.
    // We combine scale, a 3D backward fold, extreme border radiuses to simulate liquid curves, and blur.
    await controls.start({
      scale: 0.01,
      rotateX: 45, // Folds it backward into the screen
      rotateZ: -10, // Slight twist as it gets sucked in
      opacity: [1, 1, 0], // Keeps it visible until the very end of the suck
      borderBottomRightRadius: "100%", // Curves the bottom to look fluid
      borderBottomLeftRadius: "100%",
      filter: "blur(12px)", // Simulates the speed/distortion of the suck
      transition: {
        duration: 0.65,
        ease: [0.5, 0, 0.1, 1] // Snappy cubic-bezier similar to Apple's easing
      },
    });

    router.push("/home");
  };

  // Shared card visual props
  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(168deg, #0A1B2A 0%, #182F42 55%, #1E3A4F 100%)",
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    boxShadow:
      "0 28px 64px 0 rgba(255, 127, 0, 0.18), 0 10px 32px rgba(0,0,0,0.45)",
    // Crucial: Set the anchor point to exactly where the top-left logo is (top-8, left-4)
    transformOrigin: "32px 32px",
    transformStyle: "preserve-3d", // Required for the 3D fold effect
  };

  return (
    <>
      {/* ── Layer 0: peek-through background ── */}
      <div
        className="fixed inset-0"
        style={{ background: "#1E3A4F", zIndex: 0 }}
      />

      {/* ── Layer 1: orange depth glow ── */}
      <div
        aria-hidden
        className="fixed bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "60vh",
          zIndex: 1,
          background:
            "radial-gradient(ellipse 100% 110% at 50% 108%, rgba(255, 127, 0, 0.65) 0%, rgba(255, 80, 0, 0.28) 45%, transparent 72%)",
        }}
      />

      {/* ── Layer 2: The Welcome Card (mobile) ── */}
      <motion.div
        animate={controls}
        style={{
          zIndex: 10,
          touchAction: "none",
        }}
        className="fixed inset-0 md:hidden"
        onPanEnd={(_, info) => {
          if (info.offset.y < -55 || info.velocity.y < -320) {
            exitGenie();
          }
        }}
      >
        <div className="w-full h-full relative overflow-hidden" style={cardStyle}>
          <motion.div
            className="w-full h-full flex flex-col items-center justify-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Logo */}
            <motion.div
              variants={itemVariants}
              className="absolute top-8 left-4"
            >
              <div className="relative w-[120px] h-[120px]">
                <Image
                  src="/logo.png"
                  alt="Dormer's Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </motion.div>

            {/* Headline */}
            <div className="relative w-full">
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
          </motion.div>

          {/* Bottom pill */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none">
            <motion.div animate={{ opacity: [0.45, 0.85, 0.45] }} transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }} style={{ width: 64, height: 5, borderRadius: 9999, background: "rgba(238,233,218,0.85)" }} />
          </div>
        </div>
      </motion.div>

      {/* ── Layer 2: The Welcome Card (desktop) ── */}
      <motion.div
        animate={controls}
        style={{
          zIndex: 10,
          touchAction: "none",
        }}
        className="fixed inset-0 hidden md:block"
        onPanEnd={(_, info) => {
          if (info.offset.y < -55 || info.velocity.y < -320) {
            exitGenie();
          }
        }}
      >
        <div className="w-full h-full flex flex-col items-center justify-start" style={cardStyle}>
          {/* Logo */}
          <div className="relative md:w-[240px] md:h-[212px] mb-6 mt-8">
            <Image src="/logo.png" alt="Dormer's Logo" fill className="object-contain" priority />
          </div>

          {/* Headline */}
          <motion.div className="text-center leading-tight" variants={containerVariants} initial="hidden" animate="visible">
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
        </div>
      </motion.div>
    </>
  );
}