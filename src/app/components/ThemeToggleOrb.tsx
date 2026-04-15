"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

export default function ThemeToggleOrb({ className, size }: { className?: string; size?: number }) {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    // Wait for hydration to avoid mismatch errors
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    // Determine actual theme (defaults to light if undefined)
    const isLightMode = theme === "light" || theme === "system" || !theme;

    return (
        <motion.button
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onClick={() => setTheme(isLightMode ? "dark" : "light")}
            className={`flex-shrink-0 flex items-center justify-center rounded-full bg-[#FAF6EB]/10 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] hover:bg-[#FAF6EB]/20 transition-colors focus:outline-none overflow-hidden relative z-[110] ${className || "h-[60px] w-[60px]"}`}
            style={size ? { width: size, height: size } : undefined}
            aria-label="Toggle Dark Mode"
        >
            {/* AnimatePresence handles the sweeping celestial transition */}
            <AnimatePresence mode="wait" initial={false}>
                {isLightMode ? (
                    <motion.div
                        key="sun"
                        // Sun rises from the bottom left
                        initial={{ opacity: 0, y: 30, x: -10, rotate: -45 }}
                        animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                        // Sun sets down to the bottom right
                        exit={{ opacity: 0, y: 30, x: 10, rotate: 45 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="text-[#f57f20] drop-shadow-[0_0_12px_rgba(245,127,32,0.9)]"
                    >
                        <SunIcon className="w-8 h-8 fill-[#f57f20]" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="moon"
                        // Moon rises from the top right
                        initial={{ opacity: 0, y: -30, x: 10, rotate: 45 }}
                        animate={{ opacity: 1, y: 0, x: 0, rotate: 0 }}
                        // Moon sets to the top left
                        exit={{ opacity: 0, y: -30, x: -10, rotate: -45 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className="text-[#ede8da] drop-shadow-[0_0_12px_rgba(237,232,218,0.7)]"
                    >
                        <MoonIcon className="w-8 h-8 fill-[#ede8da]" />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
}