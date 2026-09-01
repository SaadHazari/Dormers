"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { rememberMarketingTheme } from "@/ui-system/theme/marketing-theme";

export default function ThemeToggleOrb({ className, size }: { className?: string; size?: number }) {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const isLightMode = theme === "light" || theme === "system" || !theme;

    // Records the choice under the marketing site's own key as well:
    // next-themes' shared preference gets overwritten by the auth funnel, so it
    // can't be trusted to remember this. See ui-system/theme/marketing-theme.ts.
    const toggle = () => {
        const next = isLightMode ? "dark" : "light";
        rememberMarketingTheme(next);
        setTheme(next);
    };

    const sizeStyle = size ? { width: size, height: size } : undefined;
    const sizeClass = className || "h-[60px] w-[60px]";

    return (
        // Plain wrapper — no transform, no backdrop-filter. Just sizing + stacking context.
        <div
            className={`flex-shrink-0 relative z-[110] rounded-full ${sizeClass}`}
            style={sizeStyle}
        >
            {/*
              Blur layer is completely isolated here: no animated children,
              no transforms ever applied to it. backdrop-filter will never
              be invalidated by sibling compositing layers.
            */}
            <span
                aria-hidden
                className="absolute inset-0 rounded-full backdrop-blur-2xl bg-[#FAF6EB]/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] pointer-events-none"
            />

            {/*
              Button lives alongside (not inside) the blur span.
              Framer Motion can freely promote this element and its children
              to GPU compositing layers without touching the span above.
            */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                onClick={toggle}
                className="absolute inset-0 flex items-center justify-center rounded-full hover:bg-[#FAF6EB]/10 transition-colors focus:outline-none"
                aria-label="Toggle Dark Mode"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {isLightMode ? (
                        <motion.div
                            key="sun"
                            initial={{ opacity: 0, y: 30, x: -10, rotate: -45 }}
                            animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                            exit={{ opacity: 0, y: 30, x: 10, rotate: 45 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            className="text-[#f57f20] drop-shadow-[0_0_12px_rgba(245,127,32,0.9)]"
                        >
                            <SunIcon className="w-8 h-8 fill-[#f57f20]" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="moon"
                            initial={{ opacity: 0, y: -30, x: 10, rotate: 45 }}
                            animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                            exit={{ opacity: 0, y: -30, x: -10, rotate: -45 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            className="text-[#ede8da] drop-shadow-[0_0_12px_rgba(237,232,218,0.7)]"
                        >
                            <MoonIcon className="w-8 h-8 fill-[#ede8da]" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>
        </div>
    );
}
