"use client";

import { useState } from "react";
import Image from "next/image";
import { useIsLight } from "@/ui-system/hooks/useIsLight";
import MobileMenuCard from "@/app/components/MobileMenuCard";
import DesktopMenuCarousel from "@/app/components/DesktopMenuCarousel";
import { MENU_DATA, getMenuWeek, type Dish } from "@/contexts/menu/domain/catalog-data";

export default function Menu({ menuData }: { menuData?: Dish[] }) {
  // useIsLight (not raw useTheme) — avoids the SSR/first-render hydration
  // mismatch that leaves the server's dark classes stuck in the DOM.
  const isLight = useIsLight();
  const theme = isLight ? "light" : "dark";
  const [isVegOnly, setIsVegOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    // AE wall day-of-week from the shared epoch — a plain new Date().getDay()
    // reads the runtime's local zone, so the server (UTC) and the browser
    // (Asia/Dubai) pick a different day near midnight and hydration mismatches.
    const ae = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const day = ae.getUTCDay();
    return day === 0 ? 0 : day - 1;
  });

  const [selectedWeek, setSelectedWeek] = useState<string>(() => getMenuWeek(new Date()));

  const availableDishes = (menuData ?? MENU_DATA).filter(
    (dish) => dish.isVeg === isVegOnly && dish.week === selectedWeek
  );

  const currentDish =
    availableDishes.find((dish) => dish.dayOfWeek === selectedDay) ||
    availableDishes[availableDishes.length - 1] ||
    null;

  // Helper styles for the toggle labels
  const labelStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 700,
    fontSize: "10px", // Mobile size
    lineHeight: "100%",
  };

  const desktopLabelStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 700,
    fontSize: "14px", // Desktop size
    lineHeight: "100%",
  };

  return (
    <>
      <div
        className={`relative w-full py-[24px] lg:py-[40px] ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
          } overflow-hidden`}
      >
        <div className="container mx-auto px-4">

          {/* --- MENU HEADER & TOGGLES --- */}
          <div className="mb-5 mt-0 flex items-center justify-between lg:max-w-[987px] mx-auto">

            {/* Title (Mobile) */}
            <h2
              className={`text-[32px] font-medium lg:hidden block ${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                }`}
              style={{
                fontFamily: "Montserrat",
                fontWeight: 500,
                lineHeight: "100%",
                fontSize: "18px",
              }}
            >
              MENU
            </h2>

            {/* Title (Desktop) */}
            <h2
              className={`menu-heading_icon lg:block hidden ${theme === "light" ? "!text-[#1E3A4F]" : "!text-white"
                }`}
            >
              MENU
            </h2>

            {/* --- MOBILE TOGGLE WITH LABELS --- */}
            <div className="flex items-center gap-2 lg:hidden">
              <span
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-80`}
                style={labelStyle}
              >
                Non Veg
              </span>

              <button
                onClick={() => {
                  setIsVegOnly((v) => !v);
                }}
                className={`relative w-15 h-7 rounded-full flex items-center transition-colors duration-300 px-1 border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.1)] 
                ${theme === "light" ? "bg-black/5 backdrop-blur-md" : "bg-white/10 backdrop-blur-md"}`}
                aria-label="Toggle veg/non-veg"
              >
                <div
                  className={`absolute top-0.5 left-0.5 h-5 w-6 rounded-full shadow-md flex items-center justify-center transition-transform duration-300
                  ${isVegOnly ? "translate-x-7" : "translate-x-0"}
                  ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#FAF6EB]"}`}
                >
                  <span className="text-[16px]">
                    <Image
                      src={isVegOnly ? "/images/VegIcon.svg" : "/images/NonVeg.svg"}
                      width={16}
                      height={16}
                      className="w-[16px]"
                      alt=""
                    />
                  </span>
                </div>
              </button>

              <span
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-80`}
                style={labelStyle}
              >
                Veg
              </span>
            </div>

            {/* --- DESKTOP TOGGLE WITH LABELS --- */}
            <div className="hidden lg:flex items-center gap-3">
              <span
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-90`}
                style={desktopLabelStyle}
              >
                Non Veg
              </span>

              <button
                onClick={() => {
                  setIsVegOnly((v) => !v);
                }}
                className={`relative rounded-full flex items-center transition-colors duration-300 px-1 border border-white/20 shadow-[0_4px_30px_rgba(0,0,0,0.1)] 
                h-[43px] w-[90px]
                ${theme === "light" ? "bg-black/5 backdrop-blur-md" : "bg-white/10 backdrop-blur-md"}`}
                aria-label="Toggle veg/non-veg"
              >
                <div
                  className={`absolute top-[4px] left-[4px] h-8 w-8 rounded-full shadow-md flex items-center justify-center transition-transform duration-300
                  ${isVegOnly ? "translate-x-[45px]" : "translate-x-0"}
                  ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#FAF6EB]"}`}
                >
                  <Image
                    src={isVegOnly ? "/images/VegIcon.svg" : "/images/NonVeg.svg"}
                    width={20}
                    height={20}
                    className="w-[20px] h-[20px]"
                    alt=""
                  />
                </div>
              </button>

              <span
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-90`}
                style={desktopLabelStyle}
              >
                Veg
              </span>
            </div>
          </div>

          {/* --- NEW MOBILE MENU UI --- */}
          <div className="lg:hidden mx-auto mt-6 sm:mt-10 px-2">
            <MobileMenuCard
              currentDish={currentDish}
              selectedWeek={selectedWeek}
              setSelectedWeek={setSelectedWeek}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
            />
          </div>

          {/* --- NEW DESKTOP CAROUSEL UI --- */}
          <div className="hidden lg:block w-full">
            <DesktopMenuCarousel
              availableDishes={availableDishes}
              selectedWeek={selectedWeek}
              setSelectedWeek={setSelectedWeek}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
            />
          </div>
        </div>
      </div>
    </>
  );
}
