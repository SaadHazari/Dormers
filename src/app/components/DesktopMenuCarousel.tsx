import React, { useState, useEffect } from 'react';
import Image, { StaticImageData } from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { SpiceMeter } from '@/app/components/SpiceMeter';

interface MicroNutrient {
  name: string;
  amount: string;
  percentage: string;
}

interface Dish {
  id: number;
  name: string;
  week: string;
  description: string;
  image: string | StaticImageData;
  isVeg: boolean;
  dayOfWeek: number;
  spiceLevel: number;
  allergens: string[];
  nutrients: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    microNutrients: MicroNutrient[];
  };
}

interface DesktopMenuCarouselProps {
  availableDishes: Dish[];
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  selectedDay: number;
  setSelectedDay: (day: number) => void;
}

export default function DesktopMenuCarousel({
  availableDishes,
  selectedWeek,
  setSelectedWeek,
  selectedDay,
  setSelectedDay,
}: DesktopMenuCarouselProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    setIsExpanded(false);
    setIsDescExpanded(false);
  }, [selectedDay]);

  const weeks = [
    { id: 'week1', label: 'WEEK 1' },
    { id: 'week2', label: 'WEEK 2' },
    { id: 'week3', label: 'WEEK 3' },
    { id: 'week4', label: 'WEEK 4' },
  ];

  const dayData = [
    { index: 0, initial: 'MON', full: 'MONDAY' },
    { index: 1, initial: 'TUE', full: 'TUESDAY' },
    { index: 2, initial: 'WED', full: 'WEDNESDAY' },
    { index: 3, initial: 'THU', full: 'THURSDAY' },
    { index: 4, initial: 'FRI', full: 'FRIDAY' },
    { index: 5, initial: 'SAT', full: 'SATURDAY' },
  ];

  // Common glassmorphism styles — dark navy tint in light mode, white tint in dark
  const baseGlass = isLight
    ? "bg-[#1E3A4F]/10 border border-[#1E3A4F]/18 shadow-[0_8px_32px_0_rgba(9,24,37,0.10)]"
    : "bg-white/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]";

  const inactiveText = isLight ? "text-[#1E3A4F]/55 hover:text-[#1E3A4F]/80" : "text-white/60 hover:text-white/80";
  const primaryText = isLight ? "text-[#091825]" : "text-white";
  const bodyText = isLight ? "text-[#1E3A4F]/70" : "text-white/80";
  const mutedText = isLight ? "text-[#1E3A4F]/45" : "text-white/50";
  const divider = isLight ? "border-[#1E3A4F]/10" : "border-white/10";
  const macroGrid = isLight ? "bg-[#1E3A4F]/06 rounded-xl border border-[#1E3A4F]/10" : "bg-white/5 rounded-xl border border-white/10";
  const macroLabel = isLight ? "text-[#1E3A4F]/50 text-[9px] tracking-wider uppercase font-semibold mb-1" : "text-white/60 text-[9px] tracking-wider uppercase font-semibold mb-1";
  const macroValue = isLight ? "text-[#091825] font-bold text-[14px]" : "text-white font-bold text-[14px]";
  const allergenTag = isLight
    ? "bg-[#1E3A4F]/08 border border-[#1E3A4F]/15 rounded-full px-2.5 py-0.5 text-[10px] text-[#1E3A4F] capitalize backdrop-blur-sm shadow-sm"
    : "bg-white/10 border border-white/20 rounded-full px-2.5 py-0.5 text-[10px] text-white capitalize backdrop-blur-sm shadow-sm";

  // Framer Motion variants for carousel positioning
  const getVariants = (index: number, activeIndex: number) => {
    const diff = index - activeIndex;
    if (diff === 0) return { x: 0, scale: 1, opacity: 1, zIndex: 10, filter: "blur(0px)" };
    if (diff === -1) return { x: '-80%', scale: 0.85, opacity: 0.4, zIndex: 5, filter: "blur(4px)" };
    if (diff === 1) return { x: '80%', scale: 0.85, opacity: 0.4, zIndex: 5, filter: "blur(4px)" };
    if (diff < -1) return { x: '-100%', scale: 0.6, opacity: 0, zIndex: 0, filter: "blur(8px)" };
    if (diff > 1) return { x: '100%', scale: 0.6, opacity: 0, zIndex: 0, filter: "blur(8px)" };
    return { x: 0, scale: 0, opacity: 0, zIndex: 0, filter: "blur(0px)" };
  };

  const handleNext = () => { if (selectedDay < 5) setSelectedDay(selectedDay + 1); };
  const handlePrev = () => { if (selectedDay > 0) setSelectedDay(selectedDay - 1); };

  const isScrolling = React.useRef(false);
  const handleWheel = (e: React.WheelEvent) => {
    if (isScrolling.current) return;
    if (Math.abs(e.deltaX) > 20) {
      isScrolling.current = true;
      if (e.deltaX > 0) handleNext(); else handlePrev();
      setTimeout(() => { isScrolling.current = false; }, 500);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 font-montserrat min-h-[400px] items-center pt-4 transition-all duration-500">
      {/* Week Navigator (Glass) */}
      <div className={`flex rounded-full p-1.5 mx-auto w-full max-w-lg font-bold text-[12px] relative ${baseGlass} backdrop-blur-md z-20`}>
        {weeks.map((w) => {
          const isActive = selectedWeek === w.id;
          return (
            <button
              key={w.id}
              onClick={() => setSelectedWeek(w.id)}
              className={`flex-1 py-2 text-center rounded-full transition-colors duration-200 relative z-10 ${isActive ? 'text-white' : inactiveText
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="desktopWeekBubble"
                  className="absolute inset-0 bg-gradient-to-r from-[#f57f20] to-[#ffaa00] rounded-full z-[-1] shadow-md shadow-[#f57f20]/30"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              {w.label}
            </button>
          );
        })}
      </div>

      {/* 3D Carousel Area */}
      <div
        className={`relative w-full max-w-[1200px] flex items-center justify-center overflow-visible group transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'min-h-[610px] mt-4 mb-2' : 'min-h-[380px] mt-2 mb-2'}`}
        onWheel={handleWheel}
      >
        {/* Left Carousel Arrow */}
        <button
          onClick={handlePrev}
          className={`absolute -left-6 z-30 p-2.5 transition-all rounded-full backdrop-blur-lg hover:scale-110 ${isLight
              ? "text-[#1E3A4F] hover:text-[#091825] bg-[#1E3A4F]/08 hover:bg-[#1E3A4F]/14 border border-[#1E3A4F]/15 shadow-[0_0_15px_rgba(30,58,79,0.10)]"
              : "text-white/90 hover:text-white bg-white/20 hover:bg-white/30 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Right Carousel Arrow */}
        <button
          onClick={handleNext}
          className={`absolute -right-6 z-30 p-2.5 transition-all rounded-full backdrop-blur-lg hover:scale-110 ${isLight
              ? "text-[#1E3A4F] hover:text-[#091825] bg-[#1E3A4F]/08 hover:bg-[#1E3A4F]/14 border border-[#1E3A4F]/15 shadow-[0_0_15px_rgba(30,58,79,0.10)]"
              : "text-white/90 hover:text-white bg-white/20 hover:bg-white/30 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {availableDishes.map((dish) => {
            const dayIndex = dish.dayOfWeek;
            const pos = getVariants(dayIndex, selectedDay);
            const isActive = dayIndex === selectedDay;

            return (
              <motion.div
                key={dish.name + dayIndex}
                animate={pos}
                transition={{ type: "spring", stiffness: 220, damping: 25 }}
                className="absolute origin-center cursor-grab active:cursor-grabbing w-[380px]"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(_e, { offset }) => {
                  if (offset.x < -50) handleNext();
                  else if (offset.x > 50) handlePrev();
                }}
                onClick={() => { if (!isActive) setSelectedDay(dayIndex); }}
              >
                {/* Desktop Dish Card Core */}
                <div className={`rounded-[24px] overflow-hidden flex flex-col w-full h-full ${baseGlass} ${isActive ? 'backdrop-blur-[40px]' : 'backdrop-blur-md'} transition-all duration-500`}>
                  {/* Dish Hero Image */}
                  <div className="relative w-full h-[220px] [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] pointer-events-none">
                    <Image
                      src={dish.image}
                      alt={dish.name}
                      fill
                      className="object-cover transition-transform duration-300"
                      style={(dish.name.includes('Chicken Fried Rice') || dish.name.includes('Veg Fried Rice')) ? { objectPosition: 'center 30%' } : undefined}
                      sizes="(max-width: 768px) 100vw, 400px"
                      priority
                    />
                  </div>

                  <div className="px-6 pb-6 pt-1 flex flex-col z-10 w-full relative flex-grow justify-between">
                    <div>
                      <h3 className={`text-[24px] font-black leading-[1.1] tracking-tight mb-2 ${primaryText}`}>
                        {dish.name}
                      </h3>

                      <div className="relative mb-4 w-full">
                        <p className={`text-[12px] leading-snug font-light transition-all duration-300 ${bodyText} ${!isDescExpanded ? 'line-clamp-2' : ''}`}>
                          {dish.description}
                        </p>

                        {!isDescExpanded && dish.description.length > 101 && (
                          <div
                            className="absolute bottom-0 right-0 z-10 flex items-center justify-end pl-10 pr-0.5"
                            style={{
                              background: isLight
                                ? (dayIndex === 5
                                  ? 'linear-gradient(to right, transparent, rgba(237,232,218,0.95) 45%, rgba(237,232,218,1))'
                                  : 'linear-gradient(to right, transparent, #EEE9DA 45%, #EEE9DA)')
                                : (dayIndex === 5
                                  ? 'linear-gradient(to right, transparent, rgba(53, 78, 97, 0.95) 45%, rgba(53, 78, 97, 1))'
                                  : 'linear-gradient(to right, transparent, #364E61 45%, #3C5364)')
                            }}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); setIsDescExpanded(true); }}
                              className="text-[#f57f20] font-bold text-[11px] hover:underline cursor-pointer"
                            >
                              ...more
                            </button>
                          </div>
                        )}
                        {isDescExpanded && dish.description.length > 101 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setIsDescExpanded(false); }}
                            className="text-[#f57f20] font-bold text-[11px] hover:underline mt-1 block"
                          >
                            Show Less
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Collapsible Details */}
                    <AnimatePresence>
                      {isExpanded && isActive && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className={`flex flex-col gap-0 border-t ${divider} pt-3 mt-1`}>
                            {/* Spice Info */}
                            <div className={`flex justify-between items-center py-2.5 border-b ${divider} relative z-20`}>
                              <span className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase">Spice</span>
                              <SpiceMeter level={dish.spiceLevel} />
                            </div>

                            {/* Allergens Info */}
                            <div className={`flex justify-between items-center py-2.5 border-b ${divider} relative z-20`}>
                              <span className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase">Allergens</span>
                              <div className="flex gap-1.5 flex-wrap justify-end">
                                {dish.allergens.length > 0 ? (
                                  dish.allergens.map((allergen, idx) => (
                                    <span key={idx} className={allergenTag}>{allergen}</span>
                                  ))
                                ) : (
                                  <span className={`text-[10px] ${mutedText}`}>None</span>
                                )}
                              </div>
                            </div>

                            {/* Calories Info */}
                            <div className={`flex justify-between items-center py-2.5 min-h-[36px] relative z-20`}>
                              <span className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase">Calories</span>
                              <div className="text-right flex items-baseline">
                                <span className={`font-bold text-[15px] drop-shadow-md ${primaryText}`}>
                                  {dish.nutrients.calories.replace(/kcal/i, '').trim()}
                                </span>
                                <span className={`text-[10px] ml-1 uppercase font-semibold ${mutedText}`}>Kcal</span>
                              </div>
                            </div>

                            {/* Macros Subfooter */}
                            <div className={`grid grid-cols-3 gap-0 mt-1 mb-1 p-2.5 relative z-20 ${macroGrid}`}>
                              <div className={`flex flex-col text-center border-r ${divider} pr-2`}>
                                <span className={macroLabel}>Protein</span>
                                <span className={macroValue}>{dish.nutrients.protein}</span>
                              </div>
                              <div className={`flex flex-col text-center border-r ${divider} px-2`}>
                                <span className={macroLabel}>Carbs</span>
                                <span className={macroValue}>{dish.nutrients.carbs}</span>
                              </div>
                              <div className="flex flex-col text-center pl-2">
                                <span className={macroLabel}>Fat</span>
                                <span className={macroValue}>{dish.nutrients.fat}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Expand / Collapse Button */}
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className={`mt-1 border-t ${divider} pt-3 w-full flex items-center justify-center p-2 transition-colors ${isLight ? "text-[#1E3A4F]/45 hover:text-[#091825]" : "text-white/50 hover:text-white"}`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-widest mr-2">
                        {isExpanded ? 'Less Info' : 'More Info'}
                      </span>
                      <motion.svg
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </motion.svg>
                    </button>
                  </div>

                  {!isActive && (
                    <div className="absolute inset-0 bg-black/10 rounded-[24px] pointer-events-none transition-opacity duration-300" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Day Navigator (Glass) */}
      <div className={`mx-auto w-full max-w-2xl p-1.5 rounded-full relative ${baseGlass} backdrop-blur-md mt-2 mb-8`}>
        <div className="flex justify-between items-center">
          {dayData.map((day) => {
            const isActive = selectedDay === day.index;
            return (
              <button
                key={day.index}
                onClick={() => setSelectedDay(day.index)}
                className={`flex items-center justify-center transition-colors duration-200 font-extrabold text-[12px] relative z-10 ${isActive
                    ? 'text-black py-2.5 px-6 min-w-[70px] drop-shadow-sm'
                    : `${inactiveText} py-2.5 flex-1 min-w-[50px]`
                  }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="desktopDayBubble"
                    className="absolute inset-0 bg-gradient-to-r from-[#f57f20] to-[#ffaa00] rounded-full z-[-1] shadow-lg shadow-[#f57f20]/40"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                {isActive ? day.full : day.initial}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
