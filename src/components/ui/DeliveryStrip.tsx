"use client"

import { useState } from "react"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import { TextRotate } from "@/components/ui/text-rotate"

const DELIVERY_LOCATIONS = [
  "Yugo",
  "The Myriad",
  "KSK Homes",
  "DSOA Residence",
  "Study World",
  "& Expanding Quickly",
]

const EXPANDING_INDEX = DELIVERY_LOCATIONS.length - 1

const SPRING = { type: "spring", damping: 28, stiffness: 350 } as const

export default function DeliveryStrip({ large }: { large?: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const isExpanding = currentIndex === EXPANDING_INDEX

  if (large) {
    return (
      // Outer div is 100% wide — label is always anchored to this width,
      // completely independent of the pill's changing size below it.
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        {/* Label — static width (100%), centered. Fades when expanding. */}
        <AnimatePresence mode="wait">
          {!isExpanding && (
            <motion.span
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                fontSize: "0.65rem",
                fontWeight: 700,
                color: "rgba(30, 58, 79, 0.65)",
                whiteSpace: "nowrap",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Delivering to:
            </motion.span>
          )}
        </AnimatePresence>

        {/* Pill — no layout/LayoutGroup, snaps to content width, no jitter */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: isExpanding ? "rgba(245, 127, 32, 0.08)" : "rgba(30, 58, 79, 0.07)",
            border: isExpanding ? "1px solid rgba(245, 127, 32, 0.2)" : "1px solid rgba(30, 58, 79, 0.14)",
            borderRadius: "100px",
            padding: "8px 20px",
            transition: "background 0.4s, border-color 0.4s",
          }}
        >
          <TextRotate
            texts={DELIVERY_LOCATIONS}
            rotationInterval={2200}
            splitBy="words"
            staggerFrom="first"
            staggerDuration={0.04}
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-110%", opacity: 0 }}
            transition={SPRING}
            onNext={setCurrentIndex}
            mainClassName="font-semibold text-[1rem] tracking-[0.01em] whitespace-nowrap"
            elementLevelClassName={isExpanding ? "text-[#f57f20]" : "text-[rgba(30,58,79,0.6)]"}
            splitLevelClassName="overflow-hidden"
          />
        </span>
      </div>
    )
  }

  // ── Default (non-large) mode ──────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        fontFamily: "Montserrat, sans-serif",
        overflow: "hidden",
      }}
    >
      <AnimatePresence mode="wait">
        {!isExpanding && (
          <motion.span
            key="label"
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-110%", opacity: 0 }}
            transition={SPRING}
            style={{
              display: "inline-block",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "rgba(30, 58, 79, 0.55)",
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
              overflow: "hidden",
            }}
          >
            Delivering to:
          </motion.span>
        )}
      </AnimatePresence>

      <LayoutGroup>
        <motion.span
          layout
          style={{
            display: "inline-flex",
            alignItems: "center",
            overflow: "hidden",
            background: isExpanding ? "rgba(245, 127, 32, 0.07)" : "rgba(30, 58, 79, 0.06)",
            border: isExpanding ? "1px solid rgba(245, 127, 32, 0.15)" : "1px solid rgba(30, 58, 79, 0.1)",
            borderRadius: "100px",
            padding: "4px 12px",
          }}
          transition={SPRING}
        >
          <TextRotate
            texts={DELIVERY_LOCATIONS}
            rotationInterval={2200}
            splitBy="words"
            staggerFrom="first"
            staggerDuration={0.04}
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "-110%", opacity: 0 }}
            transition={SPRING}
            onNext={setCurrentIndex}
            mainClassName="font-semibold text-[0.75rem] tracking-[0.01em] whitespace-nowrap"
            elementLevelClassName={isExpanding ? "text-[#f57f20]" : "text-[rgba(30,58,79,0.55)]"}
            splitLevelClassName="overflow-hidden"
          />
        </motion.span>
      </LayoutGroup>
    </div>
  )
}
