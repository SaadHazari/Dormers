"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useMotionValue, useTransform, useMotionTemplate } from "framer-motion";
import { useTheme } from "next-themes";
import { MENU_DATA, Dish } from "@/app/components/Menu";

type Week = "week1" | "week2" | "week3" | "week4";
const WEEKS: Week[] = ["week1", "week2", "week3", "week4"];

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getTodayDishes(): Dish[] {
  const now = new Date();
  const jsDay = now.getDay();
  const menuDay = jsDay === 0 ? 0 : jsDay - 1;
  const week = WEEKS[(getISOWeek(now) - 1) % 4];
  return MENU_DATA.filter((d) => d.week === week && d.dayOfWeek === menuDay);
}

export default function TonightsMeal() {
  const dishes = getTodayDishes();
  const nonVeg = dishes.find((d) => !d.isVeg) ?? dishes[0];
  const veg = dishes.find((d) => d.isVeg);
  const variants = [nonVeg, veg].filter(Boolean) as Dish[];

  const [activeIndex, setActiveIndex] = useState(0);
  const directionRef = useRef(1);

  const goTo = (index: number) => {
    directionRef.current = index > activeIndex ? 1 : -1;
    setActiveIndex(index);
  };

  if (!variants.length) return null;

  const dish = variants[activeIndex];

  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isLight = mounted && currentTheme === "light";

  const colorText = isLight ? "#111827" : "white";
  const colorSubtext = isLight ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)";
  const colorLabel = isLight ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";
  const colorToggleBg = isLight ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.3)";
  const colorToggleInactive = isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.6)";

  const glareOpacityValue = isLight ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)";

  const mouseX = useMotionValue(190);
  const mouseY = useMotionValue(200);
  const isHovered = useMotionValue(0);

  // Map mouse position coordinates to subtle rotational angles
  const rotateX = useTransform(mouseY, [0, 400], ["6deg", "-6deg"]);
  const rotateY = useTransform(mouseX, [0, 380], ["-6deg", "6deg"]);

  // Opacity fade logic for the glare overlay
  const glareOpacity = useTransform(isHovered, [0, 1], [0, 1]);
  // Dynamic gradient string that rigidly follows the cursor coordinates
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${mouseX}px ${mouseY}px, ${glareOpacityValue}, transparent 80%)`;

  return (
    <div style={{ perspective: "1500px" }} className="tm-wrapper w-full flex justify-center">
      <style>{`
        @media (max-width: 1024px) {
          .tm-wrapper > div {
            transform: none !important;
          }
          .tm-card {
            width: 100% !important;
            max-width: 700px !important;
            margin: 0 auto !important;
          }
        }
        @media (max-width: 1024px) and (min-width: 600px) {
          .tm-card {
            display: flex !important;
            flex-direction: row !important;
            align-items: stretch !important;
            gap: 24px !important;
          }
          .tm-content-wrapper {
            display: flex !important;
            flex-direction: row !important;
            gap: 24px !important;
          }
          .tm-img-container {
            width: 45% !important;
            height: auto !important;
            min-height: 200px !important;
            margin-bottom: 0 !important;
          }
          .tm-text-content {
            width: 55% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
          }
          .tm-header {
            margin-bottom: 8px !important;
          }
        }
      `}</style>
      <motion.div
        className="tm-card"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseX.set(e.clientX - rect.left);
          mouseY.set(e.clientY - rect.top);
        }}
        onMouseEnter={() => {
          isHovered.set(1);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(190);
          mouseY.set(200);
        }}
        whileHover={{
          y: -6,
          boxShadow: isLight
            ? "0 40px 80px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 20px rgba(255,255,255,0.4)"
            : "0 40px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 20px rgba(255,255,255,0.1)"
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{
          width: "380px",
          position: "relative",
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          borderRadius: "20px",
          background: isLight ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.03)",
          border: isLight ? "1px solid rgba(255, 255, 255, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
          borderTop: isLight ? "1px solid rgba(255, 255, 255, 0.9)" : "1px solid rgba(255, 255, 255, 0.4)",
          borderLeft: isLight ? "1px solid rgba(255, 255, 255, 0.9)" : "1px solid rgba(255, 255, 255, 0.4)",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          boxShadow: isLight
            ? "0 30px 60px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 20px rgba(255,255,255,0.3)"
            : "0 30px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 0 20px rgba(255,255,255,0.05)",
          padding: "24px",
          boxSizing: "border-box",
          zIndex: 1
        }}
    >
      {/* Glare effect driven by framer-motion */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "18px",
          background: glareBackground,
          opacity: glareOpacity,
          pointerEvents: "none",
          zIndex: 10
        }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={dish.id}
          initial={{ opacity: 0, x: directionRef.current * 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: directionRef.current * -20 }}
          transition={{ duration: 0.38, ease: "easeInOut" }}
          style={{ width: "100%" }}
        >
          <div className="tm-content-wrapper w-full h-full">
            {/* Image Container */}
            <div className="tm-img-container" style={{
              position: "relative",
              width: "100%",
              height: "230px", // Baseline
              borderRadius: "12px",
              overflow: "hidden",
              background: "transparent",
              marginBottom: "20px"
            }}>
              <Image
                src={dish.image}
                alt={dish.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 380px"
              />
              <div style={{
                position: "absolute",
                inset: 0,
                borderRadius: "12px",
                boxShadow: "inset 0 0 16px rgba(255,255,255,0.15), inset 0 1px 1px rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.2)",
                pointerEvents: "none"
              }} />
            </div>

            <div className="tm-text-content shrink-0 grow" style={{ display: "flex", flexDirection: "column" }}>
              {/* Top Row: Title + Badge Toggle */}
              <div className="tm-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 550, fontSize: "16px", color: colorText, margin: 0 }}>
              Tonight's Meal
            </h2>
            {variants.length > 1 ? (
              <div style={{ display: "flex", gap: "2px", background: colorToggleBg, padding: "4px", borderRadius: "999px" }}>
                {variants.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => goTo(i)}
                    style={{
                      background: i === activeIndex ? (v.isVeg ? "#22c55e" : "#f97316") : "transparent",
                      color: i === activeIndex ? "white" : colorToggleInactive,
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "10px",
                      fontWeight: 700,
                      fontFamily: "Montserrat, sans-serif",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.3s ease",
                      lineHeight: "1"
                    }}
                  >
                    {v.isVeg ? "VEG" : "NON-VEG"}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                background: dish.isVeg ? "#22c55e" : "#f97316",
                color: "white",
                padding: "6px 14px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 700,
                fontFamily: "Montserrat, sans-serif",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                lineHeight: "1"
              }}>
                {dish.isVeg ? "VEG" : "NON-VEG"}
              </div>
              )}
            </div>

            {/* Title & Description */}
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <h3 style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              fontSize: "20px",
              color: colorText,
              lineHeight: 1.25,
              margin: "0 0 8px",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}>
              {dish.name}
            </h3>
            <p style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 400,
              fontSize: "13px",
              color: colorSubtext,
              lineHeight: 1.5,
              margin: "0 0 24px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}>
              {dish.description}
            </p>

            {/* Stats Row */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}>
              <div style={{ display: "flex", gap: "24px" }}>
                {/* Protein */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "9px", fontWeight: 600, color: colorLabel, textTransform: "uppercase", letterSpacing: "0.05em" }}>PROTEIN</span>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "14px", fontWeight: 700, color: colorText }}>{dish.nutrients?.protein || "0g"}</span>
                </div>
                {/* Cals */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "9px", fontWeight: 600, color: colorLabel, textTransform: "uppercase", letterSpacing: "0.05em" }}>CALS</span>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "14px", fontWeight: 700, color: colorText }}>{dish.nutrients?.calories?.replace(" kcal", "") || "0"}</span>
                </div>
                {/* Fat */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "9px", fontWeight: 600, color: colorLabel, textTransform: "uppercase", letterSpacing: "0.05em" }}>FAT</span>
                  <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "14px", fontWeight: 700, color: colorText }}>{dish.nutrients?.fat || "0g"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "2px", fontSize: "16px", paddingBottom: "2px" }}>
                {[0, 1, 2].map((i) => (
                  <span 
                    key={i} 
                    style={{ 
                      filter: i < (dish.spiceLevel || 0) ? "none" : "grayscale(100%) opacity(25%)",
                      transition: "all 0.3s ease"
                    }}
                  >
                    🌶️
                  </span>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
    </div>
  );
}
