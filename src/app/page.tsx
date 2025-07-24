"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FaArrowDown } from "react-icons/fa";
import Image from "next/image";
import { useEffect } from "react";

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if there's a redirect path stored
    const redirectPath = sessionStorage.getItem("redirectPath");
    if (redirectPath) {
      // Clear the stored path
      sessionStorage.removeItem("redirectPath");
      // Navigate to the stored path
      router.push(redirectPath);
    }
  }, [router]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 1,
        staggerChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
      },
    },
  };

  const arrowVariants = {
    initial: { y: 0 },
    animate: {
      y: [0, 10, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const handleContinue = () => {
    router.push("/home");
  };

  return (
    <>
      <div
        className="h-screen md:hidden block w-full relative overflow-hidden"
        style={{ backgroundColor: "#1E3A4F" }}
      >
        <motion.div
          className="w-full h-full flex flex-col items-center justify-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <motion.div
            variants={itemVariants}
            className="absolute top-10 left-3 md:relative md:top-0 md:left-0 md:-mt-32"
          >
            <div className="relative w-[195px] h-[195px] md:w-[275px] md:h-[275px]">
              <Image
                src="/logo.png"
                alt="Dormer's Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </motion.div>

          {/* Text Elements Container */}
          <div className="relative w-full md:flex md:flex-col md:items-center">
            {/* Mobile Layout */}
            <div className="md:hidden absolute top-[-170px] left-0 w-full flex flex-col gap-[1px]">
              {/* MEALS */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[77px] pl-[33px] main_page_meal"
              >
                MEALS
              </motion.p>

              {/* THAT */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[78px] pl-[33px] text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  fontSize: "55px",
                  color: "#213c4c;",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                THAT
              </motion.p>

              {/* DON'T */}
              <motion.div
                variants={itemVariants}
                className="text-[64px] leading-[78px] pl-[34px] flex text-[#213c4c]"
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

              {/* SUCK */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[78px] pl-[33px] text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  color: "#213c4c;",
                  fontSize: "55px",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                SUCK
              </motion.p>

              {/* Bottom Section for Mobile */}
              <div className="flex flex-row items-center gap-x-10 mt-10 w-full pl-[33px]">
                <div>
                  <motion.p
                    variants={itemVariants}
                    className="text-[14px] text-white font-bold tracking-normal uppercase leading-none"
                    style={{ fontFamily: "Montserrat" }}
                  >
                    WELCOME TO DORMERS&apos;
                  </motion.p>
                </div>
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
                        alt="'"
                        fill
                        className="object-contain"
                        priority
                      />
                    </span>
                  </motion.div>
                </motion.div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex md:flex-col md:items-center md:gap-8">
              {/* MEALS */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[78px] text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  color: "#213c4c;",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                MEALS
              </motion.p>

              {/* THAT */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[78px] text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  color: "#213c4c;",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                THAT
              </motion.p>

              {/* DON'T */}
              <motion.div
                variants={itemVariants}
                className="text-[64px] leading-[78px] flex justify-center text-[#213c4c]"
              >
                <span
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    color: "#213c4c;",
                    textShadow:
                      "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                  }}
                >
                  DON
                </span>
                <span
                  className="text-[#FF6B00]"
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                  }}
                >
                  &apos;
                </span>
                <span
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    WebkitTextStroke: "1px #fff",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  T
                </span>
              </motion.div>

              {/* SUCK */}
              <motion.p
                variants={itemVariants}
                className="text-[64px] leading-[78px] text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  color: "#213c4c;",
                  textShadow:
                    "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                }}
              >
                SUCK
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* Bottom Section for Desktop (fixed) */}
        <div className="hidden md:fixed md:bottom-12 md:left-0 md:right-0 md:flex md:items-center md:justify-center md:gap-3">
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
              className="relative w-8 h-8 rounded-full border border-white flex items-center justify-center"
              style={{ backgroundColor: "#EEE9DA" }}
            >
              <FaArrowDown className="w-3 h-3" style={{ color: "#1E3A4F" }} />
            </motion.div>
          </motion.div>
        </div>
      </div>
      <div className="hidden md:flex flex-col items-center justify-start min-h-screen bg-[#1E3A4F] text-white px-4">
        {/* Logo */}
        <div className="relative  md:w-[240px] md:h-[212px] mb-6">
          <Image
            src="/logo.png"
            alt="Dormer's Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Headline */}
        <div className="text-center leading-tight">
          <motion.p
            variants={itemVariants}
            className="text-[64px] leading-[78px] pl-[33px] mealsthattext_box"
          >
            MEALS THAT
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="text-[64px] leading-[78px] pl-[34px] flex text-[#213c4c]"
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
                T SUCK
              </span>
            </div>
          </motion.div>
        </div>

        {/* Bottom Text + Icon */}
        <div className="hidden md:flex items-center gap-[24px] mt-[80px]">
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
              {/* <FaArrowDown className="w-3 h-3" style={{ color: "#1E3A4F" }} /> */}
              <span className="relative w-[12px] h-[12px]">
                <Image
                  src="/images/ArrowDownmain.svg"
                  alt="'"
                  fill
                  className="object-contain"
                  priority
                />
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
