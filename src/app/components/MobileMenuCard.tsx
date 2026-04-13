import React, { useState, useEffect } from 'react';
import Image, { StaticImageData } from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import ChiliIcon from './ChiliIcon';

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

  useEffect(() => {
    setIsExpanded(false);
  }, [currentDish?.id]);

  // UPGRADE 1: Parallax Depth scaling for a more 3D "deck of cards" feel
  const swipeVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? '100%' : '-100%',
      scale: 0.9,
    }),
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? '-100%' : '100%',
      scale: 0.85,
    }),
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

  const glassPanel = "bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]";

  return (
    <div className="w-full flex flex-col gap-4 font-montserrat">
      {/* Week Navigator */}
      <div className={`flex rounded-full p-1 mx-auto w-[95%] max-w-sm font-bold text-[10px] relative ${glassPanel}`}>
        {weeks.map((w) => {
          const isActive = selectedWeek === w.id;
          return (
            <button
              key={w.id}
              onClick={() => {
                setSelectedWeek(w.id);
                setSelectedDay(0);
                setDirection(1);
              }}
              className={`flex-1 py-1.5 text-center rounded-full transition-colors duration-200 relative z-10 ${isActive ? 'text-white' : 'text-white/60'
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
              // UPGRADE 2: Apple-tuned Spring Physics (Snappy, weighty, zero rubber-band wobble)
              transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7} // Slightly firmer drag resistance
              // UPGRADE 3: Tactile Squish when thumb presses the card
              whileDrag={{ scale: 0.98, cursor: "grabbing" }}
              onDragEnd={(e, { offset, velocity }) => {
                const swipeDistance = offset.x;
                const swipeVelocity = velocity.x;

                // UPGRADE 4: Velocity tracking. It triggers on distance OR a fast flick
                if ((swipeDistance < -50 || swipeVelocity < -500) && selectedDay < 5) {
                  setDirection(1);
                  setSelectedDay(selectedDay + 1);
                } else if ((swipeDistance > 50 || swipeVelocity > 500) && selectedDay > 0) {
                  setDirection(-1);
                  setSelectedDay(selectedDay - 1);
                }
              }}
              className={`rounded-[24px] flex-shrink-0 overflow-hidden relative flex flex-col mx-auto w-[95%] max-w-md ${glassPanel} touch-pan-y transition-[height] duration-300 ${isExpanded ? 'h-auto' : 'h-[360px]'
                }`}
            >
              {/* Dish Hero Image */}
              <div className="relative w-full h-[190px] shrink-0 [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]">
                <Image
                  src={currentDish.image}
                  alt={currentDish.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 400px"
                  priority
                  draggable={false} // Prevents native image dragging interference
                />
              </div>

              <div className="px-5 pb-4 pt-3 flex flex-col z-10 w-full flex-grow">

                <div className="min-h-[44px] flex items-start">
                  <h3 className="text-[20px] font-black text-white leading-[1.1] tracking-tight pr-2">
                    {currentDish.name}
                  </h3>
                </div>

                <div className="mb-2">
                  <p className="text-white/80 text-[11px] leading-snug font-light pointer-events-none select-none">
                    {currentDish.description}
                  </p>
                </div>

                <div className="mt-auto">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-center py-2 text-white/50 hover:text-white transition-colors border-t border-white/10"
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
                        <div className="pt-2 border-t border-white/10 mt-1">

                          <div className="flex justify-between items-center py-2.5 border-b border-white/10">
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase shadow-[#f57f20]">
                              Spice
                            </span>
                            <div className="flex gap-1.5">
                              {[1, 2, 3].map((level) => (
                                <ChiliIcon
                                  key={level}
                                  filled={level <= currentDish.spiceLevel}
                                  className="w-[18px] h-[18px]"
                                />
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-between items-center py-2.5 border-b border-white/10">
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase">
                              Allergens
                            </span>
                            <div className="flex gap-1.5 flex-wrap justify-end">
                              {currentDish.allergens.length > 0 ? (
                                currentDish.allergens.map((allergen, idx) => (
                                  <span
                                    key={idx}
                                    className="bg-white/10 border border-white/20 rounded-full px-2 py-[2px] text-[10px] text-white capitalize backdrop-blur-sm shadow-sm"
                                  >
                                    {allergen}
                                  </span>
                                ))
                              ) : (
                                <span className="text-white/50 text-[10px]">None</span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center py-2.5 border-b border-white/10 min-h-[36px]">
                            <span className="text-[#f57f20] font-bold text-[10px] tracking-widest uppercase">
                              Calories
                            </span>
                            <div className="text-right flex items-baseline">
                              <span className="font-bold text-base text-white drop-shadow-md">
                                {currentDish.nutrients.calories.replace(/kcal/i, '').trim()}
                              </span>
                              <span className="text-[9px] text-white/70 ml-1 uppercase font-semibold">
                                Kcal
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-0 py-[10px] mt-1 pl-1 bg-white/5 rounded-xl border border-white/10 mt-3 p-3 mb-2">
                            <div className="flex flex-col text-center border-r border-white/10 pr-2">
                              <span className="text-white/70 text-[8px] tracking-wider uppercase font-semibold mb-[2px]">
                                Protein
                              </span>
                              <span className="text-white font-bold text-[13px] drop-shadow-sm">
                                {currentDish.nutrients.protein}
                              </span>
                            </div>
                            <div className="flex flex-col text-center border-r border-white/10 px-2">
                              <span className="text-white/70 text-[8px] tracking-wider uppercase font-semibold mb-[2px]">
                                Carbs
                              </span>
                              <span className="text-white font-bold text-[13px] drop-shadow-sm">
                                {currentDish.nutrients.carbs}
                              </span>
                            </div>
                            <div className="flex flex-col text-center pl-2">
                              <span className="text-white/70 text-[8px] tracking-wider uppercase font-semibold mb-[2px]">
                                Fat
                              </span>
                              <span className="text-white font-bold text-[13px] drop-shadow-sm">
                                {currentDish.nutrients.fat}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Day Navigator */}
      <div className={`mx-auto w-[95%] max-w-md p-1 rounded-full relative ${glassPanel} mt-1 mb-2`}>
        <div className="flex justify-between items-center">
          {dayData.map((day) => {
            const isActive = selectedDay === day.index;
            return (
              <button
                key={day.index}
                onClick={() => setSelectedDay(day.index)}
                className={`flex items-center justify-center transition-colors duration-200 font-extrabold text-[11px] relative z-10 ${isActive ? 'text-black py-1.5 px-4 min-w-[50px] drop-shadow-sm' : 'text-white/60 py-1.5 flex-1 min-w-[30px]'
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