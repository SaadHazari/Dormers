"use client";

import { motion, useAnimation } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function WelcomePage() {
  const router = useRouter();
  const controls = useAnimation();
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const redirectPath = sessionStorage.getItem("redirectPath");
    if (redirectPath) {
      sessionStorage.removeItem("redirectPath");
      router.push(redirectPath);
    }
  }, [router]);

  // Entrance: content fades + slides up
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.8, staggerChildren: 0.25 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
  };

  const arrowVariants = {
    initial: { y: 0 },
    animate: {
      y: [0, 10, 0],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  };

  const handleContinue = async () => {
    if (dismissing) return;
    setDismissing(true);

    // True macOS Genie Effect
    // Instead of cropping, we aggressively scale it down, curve the borders, 
    // and pull it up towards the logo using a custom physics curve.
    await controls.start({
      scale: 0.02, // Shrinks the entire page to 2% of its size
      y: "-35vh", // Pulls it aggressively towards the top of the screen (the logo)
      opacity: [1, 1, 0], // Keeps it visible during the warp, then fades out at the end
      borderRadius: ["0%", "30%", "50%"], // Fakes the round "water droplet" genie funnel
      transition: {
        duration: 0.7,
        ease: [0.25, 1, 0.5, 1], // This is the exact cubic-bezier curve Apple uses for the swoosh
        times: [0, 0.6, 1],
      },
    });

    router.push("/home");
  };

  return (
    <motion.div
      className="fixed inset-0 z-[999] overflow-hidden"
      style={{
        backgroundColor: "#1E3A4F",
        originX: 0.5, // Sets the "anchor point" to the top center so it sucks upwards
        originY: 0.1,
      }}
      animate={controls}
    >
      {/* ── MOBILE ── */}
      <div className="md:hidden w-full h-full relative flex flex-col items-start justify-center">
        <motion.div
          className="w-full h-full flex flex-col items-center justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <motion.div
            variants={itemVariants}
            className="absolute top-10 left-3"
          >
            <div className="relative w-[195px] h-[195px]">
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
          <div className="absolute top-[170px] left-0 w-full flex flex-col gap-[1px]">
            <motion.p
              variants={itemVariants}
              className="text-[64px] leading-[77px] pl-[33px] main_page_meal"
            >
              MEALS
            </motion.p>
            <motion.p
              variants={itemVariants}
              className="text-[64px] leading-[78px] pl-[33px]"
              style={{
                fontFamily: "Montserrat",
                fontWeight: 900,
                fontSize: "55px",
                color: "#213c4c",
                textShadow:
                  "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
              }}
            >
              THAT
            </motion.p>
            <motion.div
              variants={itemVariants}
              className="text-[64px] leading-[78px] pl-[34px] flex"
            >
              <div className="flex items-center space-x-1">
                <span
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    color: "#213c4c",
                    fontSize: "55px",
                    textShadow:
                      "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                  }}
                >
                  DON
                </span>
                <span className="relative w-[20px] h-[40px] top-[-8px]">
                  <Image
                    src="/images/main_page_icon.svg"
                    alt="'"
                    fill
                    className="object-contain"
                    priority
                  />
                </span>
                <span
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    fontSize: "55px",
                    WebkitTextStroke: "1px #fff",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  T
                </span>
              </div>
            </motion.div>
            <motion.p
              variants={itemVariants}
              className="text-[64px] leading-[78px] pl-[33px]"
              style={{
                fontFamily: "Montserrat",
                fontWeight: 900,
                color: "#213c4c",
                fontSize: "55px",
                textShadow:
                  "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
              }}
            >
              SUCK
            </motion.p>

            {/* Welcome + arrow */}
            <div className="flex flex-row items-center gap-x-10 mt-10 pl-[33px]">
              <motion.p
                variants={itemVariants}
                className="text-[14px] text-white font-bold tracking-normal uppercase leading-none"
                style={{ fontFamily: "Montserrat" }}
              >
                WELCOME TO DORMERS&apos;
              </motion.p>
              <motion.div
                variants={itemVariants}
                className="cursor-pointer"
                onClick={handleContinue}
              >
                <motion.div
                  variants={arrowVariants}
                  initial="initial"
                  animate="animate"
                  className="relative w-7 h-7 rounded-full border border-white flex items-center justify-center"
                  style={{ backgroundColor: "#EEE9DA" }}
                >
                  <span className="relative w-[12px] h-[12px]">
                    <Image
                      src="/images/ArrowDownmain.svg"
                      alt="arrow"
                      fill
                      className="object-contain"
                      priority
                    />
                  </span>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex flex-col items-center justify-start min-h-screen text-white px-4">
        {/* Logo */}
        <div className="relative md:w-[240px] md:h-[212px] mb-6 mt-10">
          <Image
            src="/logo.png"
            alt="Dormer's Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Headline */}
        <motion.div
          className="text-center leading-tight"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.p
            variants={itemVariants}
            className="text-[64px] leading-[78px] pl-[33px] mealsthattext_box"
          >
            MEALS THAT
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="text-[64px] leading-[78px] pl-[34px] flex justify-center"
          >
            <div className="flex items-center space-x-1">
              <span
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  color: "#213c4c",
                  fontSize: "55px",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                DON
              </span>
              <span className="relative w-[20px] h-[40px] top-[-8px]">
                <Image
                  src="/images/main_page_icon.svg"
                  alt="'"
                  fill
                  className="object-contain"
                  priority
                />
              </span>
              <motion.p
                variants={itemVariants}
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  fontSize: "55px",
                  color: "#213c4c",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                T SUCK
              </motion.p>
            </div>
          </motion.div>

          {/* Welcome + arrow */}
          <div className="flex items-center gap-[24px] mt-[80px] justify-center">
            <motion.p variants={itemVariants} className="WelcomtextMessage">
              WELCOME TO DORMERS&apos;
            </motion.p>
            <motion.div
              variants={itemVariants}
              className="cursor-pointer"
              onClick={handleContinue}
            >
              <motion.div
                variants={arrowVariants}
                initial="initial"
                animate="animate"
                className="relative w-8 h-8 rounded-full border border-white flex items-center justify-center"
                style={{ backgroundColor: "#EEE9DA" }}
              >
                <span className="relative w-[12px] h-[12px]">
                  <Image
                    src="/images/ArrowDownmain.svg"
                    alt="arrow"
                    fill
                    className="object-contain"
                    priority
                  />
                </span>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
