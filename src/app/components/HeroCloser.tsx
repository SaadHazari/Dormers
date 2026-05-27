"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { EASE_STANDARD as E } from "@/ui-system/tokens/motion";

/**
 * The hero "closer" — a typewriter sentence ("A new dish, every night.")
 * followed by the "Delivered WARM to your DORM." stanza.
 *
 * Owns its own typewriter state machine (idle → cursor → typing → done).
 * When the parent flips `skipped=true` (returning visitor or click-skip),
 * the machine jumps directly to "done" and renders the full sentence.
 *
 * Was 60+ lines of JSX + a state machine inlined in HeroReveal.tsx.
 */

const CLOSER_FULL = "A new dish, every night.";
const TYPE_INTERVAL_MS = 42;

type CloserPhase = "idle" | "cursor" | "typing" | "done";

export function HeroCloser({
    skipped,
    isPreloading,
    closeDelay,
    l2Delay,
    l2bDelay,
}: {
    skipped: boolean;
    isPreloading: boolean;
    /** Seconds — when the typewriter begins after page mount (CLOSE_D). */
    closeDelay: number;
    /** Seconds — when "Delivered WARM" line fades in (LINE2_D). */
    l2Delay: number;
    /** Seconds — when "to your DORM" continuation fades in (LINE2B_D). */
    l2bDelay: number;
}) {
    const [closerPhase, setCloserPhase] = useState<CloserPhase>(skipped ? "done" : "idle");
    const [closerText, setCloserText] = useState(skipped ? CLOSER_FULL : "");

    const st = (base: object) => (skipped ? { duration: 0, delay: 0 } : base);

    // Skip intro at any time → jump straight to done.
    useEffect(() => {
        if (skipped) {
            setCloserPhase("done");
            setCloserText(CLOSER_FULL);
        }
    }, [skipped]);

    // Typewriter: cursor blink → typing → done. Skipped runs short-circuit
    // to "done" via the effect above.
    useEffect(() => {
        if (isPreloading || skipped) return;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const intervals: ReturnType<typeof setInterval>[] = [];

        const t1 = setTimeout(() => {
            setCloserPhase("cursor");
            const t2 = setTimeout(() => {
                setCloserPhase("typing");
                let idx = 0;
                const iv = setInterval(() => {
                    idx++;
                    setCloserText(CLOSER_FULL.slice(0, idx));
                    if (idx >= CLOSER_FULL.length) {
                        clearInterval(iv);
                        setCloserPhase("done");
                    }
                }, TYPE_INTERVAL_MS);
                intervals.push(iv);
            }, 500);
            timers.push(t2);
        }, closeDelay * 1000);
        timers.push(t1);

        return () => {
            timers.forEach((t) => clearTimeout(t));
            intervals.forEach((iv) => clearInterval(iv));
        };
    }, [isPreloading, skipped, closeDelay]);

    return (
        <div className="h-anchor">
            <p className="h-anchor-l1" style={{ minHeight: "1.25em" }}>
                {closerPhase !== "idle" && closerText}

                {(closerPhase === "cursor" || closerPhase === "typing") && (
                    <motion.span
                        animate={
                            closerPhase === "cursor" ? { opacity: [1, 0] } : { opacity: 1 }
                        }
                        transition={{
                            duration: 0.45,
                            repeat: closerPhase === "cursor" ? Infinity : 0,
                            repeatType: "reverse",
                        }}
                        style={{
                            fontFamily: "Montserrat, sans-serif",
                            fontWeight: 300,
                            color: "rgba(237,232,218,0.55)",
                        }}
                    >
                        |
                    </motion.span>
                )}

                {closerPhase === "done" && (
                    <motion.span
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ delay: 0.6, duration: 0.5 }}
                        style={{
                            fontFamily: "Montserrat, sans-serif",
                            fontWeight: 300,
                            color: "rgba(237,232,218,0.55)",
                        }}
                    >
                        |
                    </motion.span>
                )}
            </p>

            <p className="h-anchor-l2">
                <motion.span
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: l2Delay, duration: 0.45, ease: E })}
                    style={{ display: "inline" }}
                >
                    Delivered{" "}<span className="h-anchor-emph">WARM</span>
                </motion.span>
                {" "}
                <motion.span
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: l2bDelay, duration: 0.45, ease: E })}
                    style={{ display: "inline" }}
                >
                    to your{" "}<span className="h-anchor-emph">DORM</span>.
                </motion.span>
            </p>
        </div>
    );
}
