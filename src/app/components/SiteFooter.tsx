"use client";

import { motion } from "framer-motion";
import Footer from "@/app/components/Footer";
import DeliveryStrip from "@/components/ui/DeliveryStrip";
import type { Ref } from "react";

/**
 * The big "Built by people who know..." narrative footer that sits at
 * the bottom of every non-legal marketing page. Was inlined as ~360
 * LOC of JSX + scoped CSS inside (main)/layout.tsx, which made the
 * layout file 542 LOC and unscannable.
 *
 * The slideSectionRef and footerRevealed flag are owned by the parent
 * layout — the layout reads slideSectionRef in its scroll effect (to
 * decide when to hide the navbar) and computes footerRevealed via an
 * IntersectionObserver on a sentinel inside main_content. Both are
 * passed in as props so this component stays presentational.
 */
export function SiteFooter({
    slideSectionRef,
    footerRevealed,
}: {
    slideSectionRef: Ref<HTMLDivElement>;
    footerRevealed: boolean;
}) {
    return (
        <div
            id="footer"
            className="w-full"
            style={{
                height: "85vh",
                backgroundColor: "#ede8da",
                backgroundImage: `linear-gradient(rgba(245,127,32,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(245,127,32,0.25) 1px, transparent 1px)`,
                backgroundSize: "50px 50px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                overflow: "hidden",
            }}
        >
            <style>{`
                #footer {
                    z-index: 0;
                    -webkit-user-select: none;
                    flex: none;
                    pointer-events: none;
                    user-select: none;
                    width: 100%;
                }
                @media (min-width: 640px) and (max-width: 900px) {
                    #footer {
                        height: auto !important;
                        min-height: 82vh;
                        overflow: visible !important;
                    }
                }
                @media (max-width: 639px) {
                    #footer {
                        height: 85dvh !important;
                        min-height: unset !important;
                        overflow: hidden !important;
                        justify-content: flex-start !important;
                    }
                    .au-row {
                        flex: 0 0 auto !important;
                        padding-bottom: env(safe-area-inset-bottom) !important;
                    }
                    .slide-in-section {
                        margin-top: auto;
                    }
                }
                .slide-in-section {
                    pointer-events: auto;
                }
                .au-row {
                    display: grid;
                    grid-template-columns: minmax(0, 680px) auto;
                    gap: 10.42vw;
                    align-items: center;
                    width: 100%;
                    flex: 1;
                    padding-left: 6.25vw;
                    padding-right: 7.29vw;
                    padding-top: 44px;
                    padding-bottom: 52px;
                    box-sizing: border-box;
                }
                .au-section {
                    width: 100%;
                }
                @media (max-width: 900px) {
                    .au-row {
                        grid-template-columns: 1fr;
                        gap: 0;
                        padding-left: 40px;
                        padding-right: 40px;
                        padding-top: 44px;
                        padding-bottom: 52px;
                    }
                }
                @media (max-width: 639px) {
                    .au-row {
                        padding-left: 24px;
                        padding-right: 24px;
                        padding-top: 22px;
                        padding-bottom: 20px;
                    }
                }
                .au-headline {
                    font-family: Montserrat, sans-serif;
                    font-size: clamp(1.75rem, 3.8vw, 2.25rem);
                    font-weight: 700;
                    color: #091825;
                    line-height: 1.25;
                    letter-spacing: -0.02em;
                    text-align: left;
                    margin: 0 0 28px 0;
                }
                @media (max-width: 639px) {
                    .au-headline {
                        font-size: clamp(2rem, 8vw, 2.6rem);
                        line-height: 1.08;
                        letter-spacing: -0.03em;
                        margin-bottom: 20px;
                        text-align: center;
                    }
                }
                .au-headline em {
                    font-weight: 700;
                    font-style: italic;
                    color: #1e3a4f;
                }
                @media (max-width: 639px) {
                    .au-headline em {
                        color: #f57f20;
                    }
                    .au-emotional,
                    .au-credential-wrap,
                    .au-closer {
                        display: none;
                    }
                    .au-row {
                        display: flex;
                        flex-direction: column;
                        justify-content: flex-start;
                        padding-left: 32px;
                        padding-right: 32px;
                        padding-top: 100px;
                    }
                    .au-section {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                    }
                    .au-delivery-strip {
                        margin-top: auto;
                        margin-bottom: auto;
                    }
                }
                .au-headline-black {
                    font-size: clamp(1.75rem, 3.8vw, 2.25rem);
                }
                .au-headline-orange {
                    font-size: clamp(2rem, 4.2vw, 2.6rem);
                }
                @media (max-width: 639px) {
                    .au-headline-black {
                        font-size: 9.5vw;
                        display: block;
                    }
                    .au-headline-orange {
                        font-size: 8.5vw;
                        margin-top: 0.18em;
                    }
                }
                .br-desk { display: block; }
                .au-emotional {
                    font-family: Montserrat, sans-serif;
                    font-size: clamp(1.0625rem, 2.2vw, 1.1875rem);
                    font-weight: 400;
                    color: #1e3a4f;
                    line-height: 1.75;
                    letter-spacing: 0.005em;
                    text-align: left;
                    max-width: 560px;
                    margin: 0 0 22px 0;
                }
                @media (max-width: 639px) {
                    .au-emotional {
                        font-size: 0.9375rem;
                        line-height: 1.55;
                        margin-bottom: 10px;
                    }
                }
                .au-emotional em { font-weight: 500; font-style: italic; }
                .au-credential-wrap {
                    max-width: 560px;
                    padding: 20px 24px;
                    background: rgba(245, 127, 32, 0.18);
                    border-left: 3px solid #f57f20;
                    border-radius: 0 12px 12px 0;
                    margin: 0 0 14px 0;
                }
                @media (max-width: 639px) {
                    .au-credential-wrap { padding: 10px 14px; margin-bottom: 8px; }
                    .au-credential { font-size: 0.6875rem; line-height: 1.35; }
                    .au-closer { font-size: 0.9375rem; line-height: 1.5; }
                }
                .au-credential {
                    font-family: Montserrat, sans-serif;
                    font-size: clamp(0.9375rem, 1.9vw, 1rem);
                    font-weight: 400;
                    color: #1e3a4f;
                    line-height: 1.75;
                    letter-spacing: 0.005em;
                    text-align: left;
                    margin: 0;
                }
                .au-credential .brand { font-weight: 600; }
                .au-credential .stat  { font-weight: 700; color: #f57f20; }
                .au-closer {
                    font-family: Montserrat, sans-serif;
                    font-size: clamp(0.9375rem, 1.9vw, 1rem);
                    font-weight: 500;
                    color: #1e3a4f;
                    line-height: 1.7;
                    letter-spacing: 0.005em;
                    text-align: left;
                    max-width: 560px;
                    margin: 0;
                }
                .au-closer .mic-drop { font-weight: 700; color: #091825; display: block; }
                .au-delivery-strip {
                    display: flex;
                    justify-content: center;
                    width: 100%;
                    margin-top: 16px;
                }
                @media (min-width: 901px) {
                    .au-delivery-strip { display: none; }
                }
                .deliver-sidebar {
                    display: none;
                }
                @media (min-width: 901px) {
                    .deliver-sidebar {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                    }
                }
                .deliver-label {
                    font-family: Montserrat, sans-serif;
                    font-size: 0.625rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.18em;
                    color: rgba(30, 58, 79, 0.5);
                    margin: 0 0 14px 0;
                }
                .deliver-rows {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .deliver-row {
                    display: flex;
                    flex-direction: row;
                    gap: 10px;
                }
                .deliver-pill {
                    font-family: Montserrat, sans-serif;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: rgba(30, 58, 79, 0.55);
                    letter-spacing: 0.01em;
                    background: rgba(30, 58, 79, 0.06);
                    border: 1px solid rgba(30, 58, 79, 0.1);
                    border-radius: 100px;
                    padding: 6px 14px;
                    white-space: nowrap;
                }
                .deliver-pill-expanding {
                    font-family: Montserrat, sans-serif;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: rgba(245, 127, 32, 0.6);
                    letter-spacing: 0.01em;
                    background: rgba(245, 127, 32, 0.07);
                    border: 1px solid rgba(245, 127, 32, 0.15);
                    border-radius: 100px;
                    padding: 6px 14px;
                    white-space: nowrap;
                }
            `}</style>

            <div className="au-row">
                <div className="au-section">
                    {/* Desktop headline — original, untouched */}
                    <h2 className="au-headline hidden sm:block">
                        Built by people who know{" "}
                        <br className="br-desk" />
                        what it&apos;s like to miss{" "}
                        <br className="br-desk" />
                        <em>a home-cooked meal.</em>
                    </h2>

                    {/* Mobile headline — animated, 4-line typographic block */}
                    <motion.h2
                        className="sm:hidden flex flex-col text-left mb-7"
                        initial="hidden"
                        animate={footerRevealed ? "visible" : "hidden"}
                        variants={{ hidden: {}, visible: {} }}
                    >
                        {/* THE TENSE SETUP — word-by-word stagger, 2s initial delay */}
                        <motion.div
                            variants={{
                                hidden: {},
                                visible: { transition: { staggerChildren: 0.18, delayChildren: 2 } },
                            }}
                            className="au-headline-black font-montserrat font-black text-[#091825]"
                            style={{
                                lineHeight: 1.1,
                                letterSpacing: "-0.033em",
                                fontWeight: 900,
                                willChange: "transform",
                                transform: "translateZ(0)",
                            }}
                        >
                            {["Built", "by", "People", "BREAK", "who", "know", "what", "BREAK", "it’s", "like", "to", "miss", "a"].map((w, i) =>
                                w === "BREAK" ? <br key={i} /> : (
                                    <motion.span
                                        key={i}
                                        variants={{
                                            hidden: { opacity: 0, y: 22 },
                                            visible: {
                                                opacity: 1,
                                                y: 0,
                                                transition: { type: "spring", stiffness: 100, damping: 30, mass: 1.8 },
                                            },
                                        }}
                                        style={{ display: "inline-block", marginRight: "0.22em", willChange: "transform, opacity" }}
                                    >
                                        {w}
                                    </motion.span>
                                )
                            )}
                        </motion.div>

                        {/* THE WARM RESOLVE — 2s initial + 11 words × 0.18s + ~1s settle + 0.4s breath */}
                        <motion.span
                            variants={{
                                hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
                                visible: {
                                    opacity: 1,
                                    y: 0,
                                    filter: "blur(0px)",
                                    transition: { duration: 1.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 5.4 },
                                },
                            }}
                            className="au-headline-orange font-serif italic font-medium text-[#f57f20] drop-shadow-sm"
                            style={{
                                lineHeight: 1.13,
                                letterSpacing: "0.021em",
                                willChange: "transform, opacity, filter",
                                transform: "translateZ(0)",
                                isolation: "isolate",
                            }}
                        >
                            home-cooked meal.
                        </motion.span>
                    </motion.h2>

                    <p className="au-emotional">
                        Moving abroad is a lot. New city, new campus, new everything
                        — and somewhere between unpacking and orientation, you realise
                        no one&apos;s making <em>dinner.</em>
                    </p>

                    <div className="au-credential-wrap">
                        <p className="au-credential">
                            <span className="brand">Dormers&apos;</span> has prepared and delivered over{" "}
                            <span className="stat">4,000 meals</span> across Dubai&apos;s dorms since 2024.
                        </p>
                    </div>

                    <p className="au-closer">
                        And if it&apos;s not for you, you walk away.
                        <span className="mic-drop">Simple.</span>
                    </p>

                    <div className="au-delivery-strip">
                        <DeliveryStrip large />
                    </div>
                </div>

                <aside className="deliver-sidebar">
                    <p className="deliver-label">We deliver to</p>
                    <div className="deliver-rows">
                        <div className="deliver-row">
                            <span className="deliver-pill">The Myriad</span>
                            <span className="deliver-pill">DSOA Residence</span>
                        </div>
                        <div className="deliver-row">
                            <span className="deliver-pill">KSK Homes</span>
                            <span className="deliver-pill">Study World</span>
                        </div>
                        <div className="deliver-row">
                            <span className="deliver-pill">Yugo</span>
                        </div>
                        <div className="deliver-row">
                            <span className="deliver-pill-expanding">&amp; Expanding</span>
                        </div>
                    </div>
                </aside>
            </div>

            <div ref={slideSectionRef} className="slide-in-section w-full pb-2">
                <Footer />
            </div>
        </div>
    );
}
