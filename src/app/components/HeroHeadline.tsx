import { motion } from "framer-motion";
import { EASE_STANDARD as E } from "@/lib/motion";

/**
 * The hero headline:
 *
 *   You didn't leave home
 *   to stress about
 *   dinner.   ← underlined
 *
 * Three lines reveal word-by-word with staggered timing, capped by an
 * underline draw under "dinner". Was 87 inline lines of motion.span
 * blocks in HeroReveal.tsx.
 *
 * Timing comes in as a config so the constants stay defined alongside
 * the rest of the hero sequence.
 */
export type HeroHeadlineTiming = {
    /** Line 1 first-word delay (L1_S in HeroReveal). */
    l1Start: number;
    /** Inter-word gap on line 1 (W_GAP). */
    l1WordGap: number;
    /** Line 2 first-word delay (L2_D). */
    l2Start: number;
    /** Inter-word gap on line 2 (L2_W_GAP). Used for line 3 too (dinner appears at l2Start + 3 × l2WordGap). */
    l2WordGap: number;
    /** "dinner" underline-draw delay (UNDER_D). */
    underlineDelay: number;
};

const LINE_1_WORDS = ["You", "didn't", "leave", "home"] as const;

export function HeroHeadline({
    skipped,
    timing,
}: {
    skipped: boolean;
    timing: HeroHeadlineTiming;
}) {
    const st = (base: object) => (skipped ? { duration: 0, delay: 0 } : base);
    const { l1Start, l1WordGap, l2Start, l2WordGap, underlineDelay } = timing;

    return (
        <div className="h-headline">
            {/* Line 1 — word-by-word */}
            <div className="h-hl-l1">
                {LINE_1_WORDS.map((word, i) => (
                    <motion.span
                        key={word}
                        initial={{ opacity: 0, y: 22, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={st({ duration: 0.44, delay: l1Start + i * l1WordGap, ease: E })}
                        style={{
                            display: "inline-block",
                            marginRight: "0.24em",
                            fontFamily: "var(--font-montserrat), Arial, Helvetica, sans-serif",
                            fontWeight: 700,
                        }}
                    >
                        {word}
                    </motion.span>
                ))}
            </div>

            {/* Line 2 — word-by-word */}
            <div className="h-hl-l2">
                <motion.span
                    className="h-hl-to"
                    initial={{ opacity: 0, y: 22, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={st({ duration: 0.44, delay: l2Start, ease: E })}
                    style={{ display: "inline-block", marginRight: "0.24em" }}
                >
                    to
                </motion.span>
                <motion.span
                    className="h-hl-stress"
                    initial={{ opacity: 0, y: 22, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={st({ duration: 0.44, delay: l2Start + l2WordGap, ease: E })}
                    style={{ display: "inline-block", marginRight: "0.24em" }}
                >
                    stress
                </motion.span>
                <motion.span
                    className="h-hl-stress"
                    initial={{ opacity: 0, y: 22, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={st({ duration: 0.44, delay: l2Start + 2 * l2WordGap, ease: E })}
                    style={{ display: "inline-block", marginRight: "0.24em" }}
                >
                    about
                </motion.span>
            </div>

            {/* Line 3 — "dinner." + underline */}
            <div className="h-hl-l3">
                <motion.span
                    initial={{ opacity: 0, y: 22, scale: 0.88 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={st({ duration: 0.44, delay: l2Start + 3 * l2WordGap, ease: E })}
                    style={{ display: "inline-block" }}
                >
                    <span className="h-hl-dinner-wrap">
                        <span className="h-hl-dinner">dinner</span>
                        <motion.span
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={st({ delay: underlineDelay, duration: 0.5, ease: E })}
                            style={{
                                position: "absolute",
                                bottom: -3,
                                left: 0,
                                right: 0,
                                height: 2,
                                background: "#f57f20",
                                transformOrigin: "left center",
                                display: "block",
                                borderRadius: "1px",
                            }}
                        />
                    </span>
                    <span className="h-hl-period">.</span>
                </motion.span>
            </div>
        </div>
    );
}
