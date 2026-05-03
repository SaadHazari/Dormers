import { motion } from "framer-motion";
import { EASE_STANDARD as E } from "@/lib/motion";

/**
 * The "Starting from AED 17 / 48 dishes / 6 dorms" trio that fades in
 * after the main hero CTA. Was inlined in HeroReveal.tsx as 60+ lines
 * of three near-identical motion.div blocks.
 *
 * Timing comes in as props so the proof bar's place in the hero
 * sequence stays defined alongside all the other delay constants in
 * HeroReveal.tsx.
 */
export function HeroProofBar({
    skipped,
    priceDelay,
    dishDelay,
    dormDelay,
}: {
    skipped: boolean;
    priceDelay: number;
    dishDelay: number;
    dormDelay: number;
}) {
    // Mirrors the local `st` helper in HeroReveal — collapses delay/duration
    // to zero when the user has skipped the intro.
    const st = (base: object) => (skipped ? { duration: 0, delay: 0 } : base);

    return (
        <div className="h-proof-wrapper">
            <div className="h-proof">
                <motion.div
                    className="h-proof-col"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: priceDelay, duration: 0.48, ease: E })}
                >
                    <span className="h-proof-qualifier">Starting from</span>
                    <div className="h-proof-num-row">
                        <span className="h-proof-prefix">AED</span>
                        <span className="h-proof-num">17</span>
                    </div>
                    <span className="h-proof-unit">/meal</span>
                </motion.div>

                <motion.div
                    className="h-proof-divider"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={st({ delay: priceDelay, duration: 0.3 })}
                />

                <motion.div
                    className="h-proof-col"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: dishDelay, duration: 0.48, ease: E })}
                >
                    <span className="h-proof-qualifier">More than</span>
                    <div className="h-proof-num-row">
                        <span className="h-proof-num">48</span>
                    </div>
                    <span className="h-proof-unit">dishes</span>
                </motion.div>

                <motion.div
                    className="h-proof-divider"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={st({ delay: dishDelay, duration: 0.3 })}
                />

                <motion.div
                    className="h-proof-col"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={st({ delay: dormDelay, duration: 0.48, ease: E })}
                >
                    <span className="h-proof-qualifier">Delivering to</span>
                    <div className="h-proof-num-row">
                        <span className="h-proof-num">6</span>
                    </div>
                    <span className="h-proof-unit">dorms</span>
                </motion.div>
            </div>
        </div>
    );
}
