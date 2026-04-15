"use client";

import { useRef, useEffect, useState } from "react";
import Image, { StaticImageData } from "next/image";
import { motion, useMotionValue, useAnimate } from "framer-motion";

// Minimal dish shape needed by the gallery — mirrors Menu.tsx Dish interface
interface GalleryDish {
  id: number;
  name: string;
  image: string | StaticImageData;
  dayOfWeek: number;
  spiceLevel: 1 | 2 | 3;
}

interface DishGalleryProps {
  availableDishes: GalleryDish[];
  selectedDay: number | null;
  setSelectedDay: (day: number) => void;
}

// Module-level constants
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_INDICES = [0, 1, 2, 3, 4, 5];
const CARD_WIDTH_MOBILE = 120;
const CARD_HEIGHT_MOBILE = 168;
const CARD_GAP = 16; // md token from UI-SPEC spacing scale
const PEEK = 12; // peek token — 12px of adjacent card visible at edges
const STEP = CARD_WIDTH_MOBILE + CARD_GAP; // 136px — used for snap calculations (mobile-first)

// --- DishCard sub-component ---

interface DishCardProps {
  dish: GalleryDish;
  isSelected: boolean;
  onSelect: () => void;
}

function DishCard({ dish, isSelected, onSelect }: DishCardProps) {
  return (
    <motion.button
      onClick={onSelect}
      animate={
        isSelected
          ? { scale: 1.05, opacity: 1 }
          : { scale: 1, opacity: 0.8 }
      }
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`relative flex-shrink-0 rounded-2xl overflow-hidden bg-[#1E3A4F] ${
        isSelected ? "border-2 border-[#EEE9DA]" : "border-2 border-transparent"
      }`}
      style={{ width: CARD_WIDTH_MOBILE, height: CARD_HEIGHT_MOBILE, touchAction: "pan-y" }}
      aria-label={`${DAY_LABELS[dish.dayOfWeek]} - ${dish.name}`}
      aria-current={isSelected ? "true" : undefined}
    >
      {/* Photo section: top 60% */}
      <div className="relative w-full" style={{ height: "60%" }}>
        <Image
          src={dish.image}
          alt={dish.name}
          fill
          sizes="140px"
          className="object-cover"
        />
      </div>

      {/* Info section: bottom 40% */}
      <div
        className="flex flex-col justify-between px-2 py-1 text-[#EEE9DA]"
        style={{ height: "40%" }}
      >
        {/* Day label */}
        <span
          style={{
            fontFamily: "Montserrat",
            fontWeight: 700,
            fontSize: 10,
            lineHeight: "100%",
          }}
          className="lg:text-[12px]"
        >
          {DAY_LABELS[dish.dayOfWeek]}
        </span>

        {/* Dish name — truncated to 1 line */}
        <span
          className="truncate"
          style={{
            fontFamily: "Montserrat",
            fontWeight: 600,
            fontSize: 12,
            lineHeight: "120%",
          }}
        >
          {dish.name}
        </span>

        {/* Spice row */}
        <span
          style={{ fontSize: 10, lineHeight: "100%", display: "flex", gap: "1px" }}
          className="lg:text-[11px]"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                filter: i < dish.spiceLevel ? "none" : "grayscale(100%) opacity(25%)",
              }}
            >
              🌶️
            </span>
          ))}
        </span>
      </div>
    </motion.button>
  );
}

// --- EmptyCard sub-component ---

interface EmptyCardProps {
  dayIndex: number;
}

function EmptyCard({ dayIndex }: EmptyCardProps) {
  return (
    <div
      className="relative flex-shrink-0 rounded-2xl overflow-hidden bg-[#1E3A4F] border-2 border-transparent flex items-center justify-center"
      style={{
        width: CARD_WIDTH_MOBILE,
        height: CARD_HEIGHT_MOBILE,
        opacity: 0.5,
      }}
      aria-label={`${DAY_LABELS[dayIndex]} - No dish available`}
    >
      <span
        className="text-[#EEE9DA] text-center px-2"
        style={{ fontFamily: "Montserrat", fontWeight: 600, fontSize: 10, lineHeight: "140%" }}
      >
        No dish for this day
      </span>
    </div>
  );
}

// --- DishGallery main component ---

export default function DishGallery({
  availableDishes,
  selectedDay,
  setSelectedDay,
}: DishGalleryProps) {
  const x = useMotionValue(0);
  const [scope, animate] = useAnimate();
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a full 6-slot array — missing days become null (empty state)
  const slots = DAY_INDICES.map(
    (i) => availableDishes.find((d) => d.dayOfWeek === i) ?? null
  );

  // Drag constraints computed after mount when container dimensions are known
  const [constraints, setConstraints] = useState({ left: 0, right: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const trackW = STEP * slots.length;
    setConstraints({ left: -(trackW - containerW + PEEK), right: PEEK });
  }, [slots.length]);

  // Auto-scroll to today's card on mount (GALL-04)
  useEffect(() => {
    if (selectedDay === null) return;
    const idx = slots.findIndex((d) => d && d.dayOfWeek === selectedDay);
    if (idx < 0) return;
    const targetX = -(idx * STEP);
    animate(x, targetX, { type: "spring", stiffness: 300, damping: 30 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // Sync selectedDay state after drag-release snap (no animate call — modifyTarget handles position)
  function handleDragEnd() {
    const snappedX = x.get();
    const idx = Math.max(
      0,
      Math.min(Math.round(-snappedX / STEP), slots.length - 1)
    );
    const dish = slots[idx];
    if (dish) setSelectedDay(dish.dayOfWeek);
  }

  // Tap-to-select: also animate gallery to center the tapped card
  function handleCardSelect(dayOfWeek: number) {
    setSelectedDay(dayOfWeek);
    const idx = slots.findIndex((d) => d && d.dayOfWeek === dayOfWeek);
    if (idx < 0) return;
    const targetX = -(idx * STEP);
    const clampedX = Math.max(
      constraints.left,
      Math.min(targetX, constraints.right)
    );
    animate(x, clampedX, { type: "spring", stiffness: 300, damping: 30 });
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden relative"
      style={{ paddingLeft: PEEK, paddingRight: PEEK }}
    >
      <motion.div
        ref={scope}
        drag="x"
        style={{ x, gap: CARD_GAP }}
        dragConstraints={constraints}
        dragElastic={0.1}
        dragDirectionLock
        dragTransition={{
          bounceStiffness: 300,
          bounceDamping: 30,
          modifyTarget: (target: number) =>
            Math.round(target / STEP) * STEP,
        }}
        onDragEnd={handleDragEnd}
        className="flex"
      >
        {slots.map((dish, i) =>
          dish ? (
            <DishCard
              key={dish.id}
              dish={dish}
              isSelected={dish.dayOfWeek === selectedDay}
              onSelect={() => handleCardSelect(dish.dayOfWeek)}
            />
          ) : (
            <EmptyCard key={`empty-${i}`} dayIndex={i} />
          )
        )}
      </motion.div>
    </div>
  );
}
