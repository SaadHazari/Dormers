import { Fragment } from "react";
import { motion } from "framer-motion";
import { EASE_STANDARD as E } from "@/lib/motion";

/**
 * The "No apps to scroll · No groceries to buy · No recipes to follow"
 * checklist with strike-through reveals on each item. Was inlined as
 * 50+ lines of three near-identical motion.span blocks plus a local
 * Strike helper.
 *
 * Items come in as a prop so the timing constants stay defined in
 * HeroReveal alongside the rest of the sequence.
 */

export type HeroChecklistItem = {
    text: string;
    /** Rotation in degrees applied to the strike-through line. */
    strRotation: number;
    /** Word entrance delay (PP*_D in HeroReveal). */
    delay: number;
    /** Strike-through reveal delay (STR*_D). */
    strDelay: number;
    /** Trailing-dot fade-in delay (DOT*_D). Omit on the last item. */
    dotDelay?: number;
};

export function HeroChecklist({
    skipped,
    items,
}: {
    skipped: boolean;
    items: HeroChecklistItem[];
}) {
    const st = (base: object) => (skipped ? { duration: 0, delay: 0 } : base);

    return (
        <div className="h-checklist">
            {items.map((item, i) => (
                <Fragment key={i}>
                    <motion.span
                        className="h-check-item"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={st({ duration: 0.4, delay: item.delay, ease: E })}
                    >
                        {item.text}
                        <Strike delay={item.strDelay} rotation={item.strRotation} skipped={skipped} />
                    </motion.span>

                    {item.dotDelay !== undefined && (
                        <motion.span
                            className="h-dot-sep"
                            aria-hidden="true"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={st({ duration: 0.18, delay: item.dotDelay, ease: E })}
                        >
                            ·
                        </motion.span>
                    )}
                </Fragment>
            ))}
        </div>
    );
}

/* ─── Strikethrough — Framer scaleX reveal ─────────────────── */
function Strike({
    delay,
    rotation,
    skipped,
}: {
    delay: number;
    rotation: number;
    skipped: boolean;
}) {
    return (
        <span
            style={{
                position: "absolute",
                left: -4,
                right: -4,
                top: "50%",
                height: "1px",
                transform: `translateY(-50%) rotate(${rotation}deg)`,
                overflow: "hidden",
            }}
        >
            <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={skipped ? { duration: 0, delay: 0 } : { delay, duration: 0.45, ease: E }}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    background: "#f57f20",
                    transformOrigin: "left",
                    borderRadius: "1px",
                }}
            />
        </span>
    );
}
