import React, { useState, useEffect } from 'react';
import Image, { StaticImageData } from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';

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

interface MobileMenuCardProps {
  currentDish: Dish | null;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  selectedDay: number;
  setSelectedDay: (day: number) => void;
}

export default function MobileMenuCard({
  currentDish,
  selectedWeek,
  setSelectedWeek,
  selectedDay,
  setSelectedDay,
}: MobileMenuCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [direction, setDirection] = useState(0);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    setIsExpanded(false);
  }, [currentDish?.id]);

  const swipeVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? '100%' : '-100%', scale: 0.9 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? '-100%' : '100%', scale: 0.85 }),
  };

  const weeks = [
    { id: 'week1', label: 'WEEK 1' },
    { id: 'week2', label: 'WEEK 2' },
    { id: 'week3', label: 'WEEK 3' },
    { id: 'week4', label: 'WEEK 4' },
  ];

  const dayData = [
    { index: 0, initial: 'M', full: 'MON' },
    { index: 1, initial: 'T', full: 'TUE' },
    { index: 2, initial: 'W', full: 'WED' },
    { index: 3, initial: 'T', full: 'THU' },
    { index: 4, initial: 'F', full: 'FRI' },
    { index: 5, initial: 'S', full: 'SAT' },
  ];

  const glassPanel = isLight
    ? "bg-[#1E3A4F]/10 border border-[#1E3A4F]/18 shadow-[0_8px_32px_0_rgba(9,24,37,0.10)]"
    : "bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]";

  const inactiveText = isLight ? "text-[rgba(30,58,79,0.55)]" : "text-[rgba(255,255,255,0.6)]";
  const primaryText  = isLight ? "text-[#091825]" : "text-white";
  const bodyText     = isLight ? "text-[rgba(30,58,79,0.7)]" : "text-[rgba(255,255,255,0.8)]";
  const mutedText    = isLight ? "text-[rgba(30,58,79,0.45)]" : "text-[rgba(255,255,255,0.5)]";
  const divider      = isLight ? "border-[#1E3A4F]/10" : "border-white/10";
  const macroGrid    = isLight ? "bg-[#1E3A4F]/06 rounded-xl border border-[#1E3A4F]/10" : "bg-white/5 rounded-xl border border-white/10";
  const macroLabel   = isLight ? "text-[rgba(30,58,79,0.5)] text-[8px] tracking-wider uppercase font-semibold mb-[2px]" : "text-[rgba(255,255,255,0.7)] text-[8px] tracking-wider uppercase font-semibold mb-[2px]";
  const macroValue   = isLight ? "text-[#091825] font-bold text-[13px] drop-shadow-sm" : "text-white font-bold text-[13px] drop-shadow-sm";
  const allergenTag  = isLight
    ? "bg-[#1E3A4F]/08 border border-[#1E3A4F]/15 rounded-full px-2 py-[2px] text-[10px] text-[#1E3A4F] capitalize shadow-sm"
    : "bg-white/10 border border-white/20 rounded-full px-2 py-[2px] text-[10px] text-white capitalize shadow-sm";

  return (
    <div className="w-full flex flex-col gap-4 font-montserrat">
      {/* Week Navigator */}
      <div 
        className={`flex rounded-full p-1 mx-auto w-[95%] max-w-sm font-bold text-[10px] relative ${glassPanel}`}
        style={{ WebkitBackdropFilter: isLight ? 'none' : 'blur(12px)', backdropFilter: isLight ? 'none' : 'blur(12px)' }}
      >
        {weeks.map((w) => {
          const isActive = selectedWeek === w.id;
          return (
            <button
              key={w.id}
              onClick={() => { setSelectedWeek(w.id); setSelectedDay(0); setDirection(1); }}
              className={`flex-1 py-1.5 text-center rounded-full transition-colors duration-200 relative z-10 ${
                isActive ? 'text-white' : inactiveText
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="weekBubble"
                  className="absolute inset-0 bg-gradient-to-r from-[#f57f20] to-[#ffaa00] rounded-full z-[-1] shadow-md shadow-[#f57f20]/30"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              {w.label}
            </button>
          );
        })}
      </div>

      <div className="relative grid w-full" style={{ gridTemplateAreas: '"stack"' }}>
        <AnimatePresence custom={direction} initial={false}>
          {currentDish && (
            <motion.div
              key={currentDish.id}
              custom={direction}
              variants={swipeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ gridArea: 'stack' }}
              transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              whileDrag={{ scale: 0.98, cursor: "grabbing" }}
              onDragEnd={(e, { offset, velocity }) => {
                const swipeDistance = offset.x;
                const swipeVelocity = velocity.x;
                if ((swipeDistance < -50 || swipeVelocity < -500) && selectedDay < 5) {
                  setDirection(1);
                  setSelectedDay(selectedDay + 1);
                } else if ((swipeDistance > 50 || swipeVelocity > 500) && selectedDay > 0) {
                  setDirection(-1);
                  setSelectedDay(selectedDay - 1);
                }
              }}
              className={`rounded-[24px] flex-shrink-0 relative flex flex-col mx-auto w-[95%] max-w-md touch-pan-y transition-[height] duration-300 isolate ${isExpanded ? 'h-auto' : 'h-[360px] sm:h-[410px]'}`}
            >
              {/* Isolated Safari Glass Layer Fix */}
              <div 
                className={`absolute inset-0 rounded-[24px] pointer-events-none z-0 ${glassPanel}`} 
                style={{ WebkitBackdropFilter: isLight ? 'none' : 'blur(12px)', backdropFilter: isLight ? 'none' : 'blur(12px)' }}
              />

              {/* Secure Overflow Container */}
              <div className="relative w-full h-full flex flex-col overflow-hidden rounded-[24px] z-10">
                {/* Dish Hero Image */}
                <div className="relative w-full h-[190px] sm:h-[240px] shrink-0 [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]">
                <Image
                  src={currentDish.image}
                  alt={currentDish.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 400px"
                  priority
                  draggable={false}
                />
              </div>

              <div className="px-5 pb-4 pt-3 flex flex-col z-10 w-full flex-grow">
                <div className="min-h-[44px] flex items-start">
                  <h3 className={`text-[20px] font-black leading-[1.1] tracking-tight pr-2 ${primaryText}`}>
                    {currentDish.name}
                  </h3>
                </div>

                <div className="mb-2">
                  <p className={`text-[11px] leading-snug font-light pointer-events-none select-none ${bodyText}`}>
                    {currentDish.description}
                  </p>
                </div>

                <div className="mt-auto">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`w-full flex items-center justify-center py-2 transition-colors border-t ${divider} ${isLight ? "text-[#1E3A4F]/45 hover:text-[#091825]" : "text-white/50 hover:text-white"}`}
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

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className={`pt-2 border-t ${divider} mt-1`}>
                          <div className={`flex justify-between items-center py-2.5 border-b ${divider}`}>
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase">Spice</span>
                            <div className="flex gap-1.5">
                              {[0, 1, 2].map((i) => (
                                <span key={i} style={{ filter: i < (currentDish.spiceLevel || 0) ? "none" : "grayscale(100%) opacity(25%)", transition: "all 0.3s ease" }}>🌶️</span>
                              ))}
                            </div>
                          </div>

                          <div className={`flex justify-between items-center py-2.5 border-b ${divider}`}>
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase">Allergens</span>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {currentDish.allergens.length > 0 ? (
                                currentDish.allergens.map((allergen, idx) => (
                                  <span key={idx} className={allergenTag}>{allergen}</span>
                                ))
                              ) : (
                                <span className={`text-[10px] ${mutedText}`}>None</span>
                              )}
                            </div>
                          </div>

                          <div className={`flex justify-between items-center py-2.5 border-b ${divider} min-h-[36px]`}>
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase">Calories</span>
                            <div className="text-right flex items-baseline">
                              <span className={`font-bold text-base drop-shadow-md ${primaryText}`}>
                                {currentDish.nutrients.calories.replace(/kcal/i, '').trim()}
                              </span>
                              <span className={`text-[9px] ml-1 uppercase font-semibold ${mutedText}`}>Kcal</span>
                            </div>
                          </div>

                          <div className={`grid grid-cols-3 gap-0 py-[10px] mt-3 p-3 mb-2 ${macroGrid}`}>
                            <div className={`flex flex-col text-center border-r ${divider} pr-2`}>
                              <span className={macroLabel}>Protein</span>
                              <span className={macroValue}>{currentDish.nutrients.protein}</span>
                            </div>
                            <div className={`flex flex-col text-center border-r ${divider} px-2`}>
                              <span className={macroLabel}>Carbs</span>
                              <span className={macroValue}>{currentDish.nutrients.carbs}</span>
                            </div>
                            <div className="flex flex-col text-center pl-2">
                              <span className={macroLabel}>Fat</span>
                              <span className={macroValue}>{currentDish.nutrients.fat}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Day Navigator */}
      <div 
        className={`mx-auto w-[95%] max-w-md p-1 rounded-full relative ${glassPanel} mt-1 mb-2`}
        style={{ WebkitBackdropFilter: isLight ? 'none' : 'blur(12px)', backdropFilter: isLight ? 'none' : 'blur(12px)' }}
      >
        <div className="flex justify-between items-center">
          {dayData.map((day) => {
            const isActive = selectedDay === day.index;
            return (
              <button
                key={day.index}
                onClick={() => setSelectedDay(day.index)}
                className={`flex items-center justify-center transition-colors duration-200 font-extrabold text-[11px] relative z-10 ${
                  isActive
                    ? 'text-black py-1.5 px-4 min-w-[50px] drop-shadow-sm'
                    : `${inactiveText} py-1.5 flex-1 min-w-[30px]`
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="dayBubble"
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
