import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsLight } from '@/ui-system/hooks/useIsLight';
import { DishDetailPanel } from '@/app/components/DishDetailPanel';
import { glassTokens } from '@/ui-system/tokens/glass';
import type { Dish } from '@/contexts/menu/domain/catalog-data';

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
  // useIsLight (not raw useTheme) — avoids the SSR/first-render hydration
  // mismatch that leaves the server's dark classes stuck in the DOM.
  const isLight = useIsLight();

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

  // Glass + theme tokens — pulled from lib/glass.ts. `baseGlass` was the
  // legacy local name; kept aliased to `panel` for the JSX below.
  const tokens = glassTokens(isLight, 'desktop');
  const { panel: baseGlass, inactiveText, primaryText, bodyText, divider } = tokens;

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
                          <DishDetailPanel dish={dish} isLight={isLight} size="desktop" />
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
