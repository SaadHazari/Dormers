"use client";

import { useRef, useState, useEffect, Fragment } from "react";
import { motion } from "framer-motion";

const E = [0.25, 0.46, 0.45, 0.94] as const;

const CSS = `
  .hiw-section {
    background: #091825;
    padding: 100px 0;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  /* ── Background decorative image ── */
  .hiw-bg {
    position: absolute;
    inset: 0;
    background-image: url("/images/howit'sworkbackgroundimage.svg");
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    opacity: 0.13;
    pointer-events: none;
    z-index: 0;
  }

  /* ── Container — matches USPBento max-w-6xl + lg:px-16 ── */
  .hiw-container {
    max-width: 72rem;
    margin: 0 auto;
    padding: 0 64px;
    position: relative;
    z-index: 1;
  }

  /* ── Header ── */
  .hiw-label {
    font-family: Montserrat, sans-serif;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(237, 232, 218, 0.45);
    text-align: center;
    margin-bottom: 12px;
    display: block;
  }
  .hiw-section-title {
    font-family: Montserrat, sans-serif;
    font-weight: 700;
    font-size: 40px;
    color: #ede8da;
    text-align: center;
    margin: 0 0 80px;
    line-height: 1.15;
  }

  /* ── Columns row ── */
  .hiw-cols {
    display: flex;
    align-items: stretch;
    gap: 32px;
  }
  .hiw-col {
    flex: 1;
    text-align: center;
    position: relative;
  }

  /* ── Vertical separator ── */
  .hiw-sep {
    flex-shrink: 0;
    width: 1px;
    align-self: stretch;
    background: linear-gradient(
      180deg,
      transparent                       0%,
      rgba(237, 232, 218, 0.12)        30%,
      rgba(237, 232, 218, 0.12)        70%,
      transparent                      100%
    );
  }

  /* ── Large number — layout only; background/clip applied via inline style ── */
  .hiw-num {
    font-family: Montserrat, sans-serif;
    font-weight: 900;
    font-size: 180px;
    line-height: 1;
    text-align: center;
    display: block;
    margin: 0 0 -20px;
    pointer-events: none;
    user-select: none;
    position: relative;
    z-index: 1;
  }

  /* ── Text block — sits visually above the number ── */
  .hiw-text-block {
    position: relative;
    z-index: 2;
    padding: 24px 16px;
    box-shadow: 0 -20px 40px rgba(9, 24, 37, 0.6);
    border-radius: var(--radius-card, 16px);
  }

  /* ── Title ── */
  .hiw-title {
    font-family: Montserrat, sans-serif;
    font-weight: 800;
    font-size: 24px;
    color: #f57f20;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 16px;
    text-align: center;
  }

  /* ── Body copy ── */
  .hiw-body {
    font-family: Montserrat, sans-serif;
    font-weight: 500;
    font-size: 16px;
    color: #ede8da;
    line-height: 1.6;
    max-width: 280px;
    margin: 0 auto 12px;
    text-align: center;
  }

  /* ── Subline ── */
  .hiw-subline {
    font-family: Montserrat, sans-serif;
    font-weight: 400;
    font-size: 14px;
    color: rgba(237, 232, 218, 0.4);
    font-style: italic;
    line-height: 1.5;
    margin: 0;
    text-align: center;
  }

  /* ── Mobile carousel ── */
  .hiw-carousel-wrap { display: none; }

  .hiw-carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    gap: 0;
    padding: 0 24px;
  }
  .hiw-carousel::-webkit-scrollbar { display: none; }

  .hiw-carousel-card {
    flex: 0 0 80vw;
    scroll-snap-align: center;
    padding: 0 12px;
    text-align: center;
  }
  .hiw-carousel-card .hiw-num {
    font-size: 120px;
    margin-bottom: -28px;
  }

  .hiw-dots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-top: 28px;
  }
  .hiw-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(237, 232, 218, 0.2);
    transition: background 200ms ease, transform 200ms ease;
    flex-shrink: 0;
    cursor: pointer;
    border: none;
    padding: 0;
  }
  .hiw-dot-active {
    background: #f57f20;
    transform: scale(1.25);
  }

  /* ── Tablet (641–1024px) ── */
  @media (max-width: 1024px) {
    .hiw-container     { padding: 0 48px; }
    .hiw-cols          { gap: 24px; }
    .hiw-num           { font-size: 140px; margin-bottom: -15px; }
    .hiw-section-title { font-size: 34px; }
    .hiw-title         { font-size: 22px; }
    .hiw-body          { font-size: 15px; max-width: 240px; }
  }

  /* ── Mobile (≤640px) ── */
  @media (max-width: 640px) {
    .hiw-section         { padding: 64px 0; }
    .hiw-container       { padding: 0; }
    .hiw-label           { padding: 0 24px; margin-bottom: 12px; }
    .hiw-section-title   { font-size: 28px; padding: 0 24px; margin-bottom: 48px; }
    .hiw-cols            { display: none; }
    .hiw-carousel-wrap   { display: block; }
  }
`;

interface CardDef {
  num: string;
  numGrad: string;
  title: string;
  body: string;
  subline: string;
}

const CARDS: CardDef[] = [
  {
    num: "01",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.30) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    title: "YOU",
    body: "One quick sign-up. That's your whole part.",
    subline: "Way quicker than deciding what to eat.",
  },
  {
    num: "02",
    numGrad: "linear-gradient(180deg, rgba(245,127,32,0.35) 0%, rgba(245,127,32,0.03) 80%, rgba(245,127,32,0) 100%)",
    title: "CHOOSE",
    body: "Pick how long you want dinner sorted.",
    subline: "A week, a month, or one meal to try us.",
  },
  {
    num: "03",
    numGrad: "linear-gradient(180deg, rgba(237,232,218,0.30) 0%, rgba(237,232,218,0.03) 80%, rgba(237,232,218,0) 100%)",
    title: "US",
    body: "We cook. We pack. We deliver. Mon – Fri.",
    subline: "New dish. Warm box. At your door. Like clockwork.",
  },
];

// Per-column animation timing from spec
const COL_TIMING = [
  { numDelay: 0.2,  textDelay: 0.4  },
  { numDelay: 0.35, textDelay: 0.55 },
  { numDelay: 0.5,  textDelay: 0.7  },
];

export default function HowItWorks() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const slideRefs   = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const observers: IntersectionObserver[] = [];
    slideRefs.current.forEach((slide, i) => {
      if (!slide) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveIndex(i); },
        { root: carousel, threshold: 0.5 }
      );
      obs.observe(slide);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <>
      <style>{CSS}</style>

      <section className="hiw-section">
        <div className="hiw-bg" aria-hidden />
        <div className="hiw-container">

          {/* ── Header ── */}
          <motion.span
            className="hiw-label"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0, ease: E }}
          >
            HOW IT WORKS
          </motion.span>
          <motion.h2
            className="hiw-section-title"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0, ease: E }}
          >
            From stressed to{" "}
            <span style={{
              textDecoration: "underline",
              textDecorationColor: "#f57f20",
              textDecorationThickness: "3px",
              textUnderlineOffset: "5px",
            }}>
              sorted.
            </span>
          </motion.h2>

          {/* ── Desktop / Tablet — three columns with separator divs ── */}
          <div className="hiw-cols">
            {CARDS.map((card, i) => (
              <Fragment key={card.num}>
                {i > 0 && (
                  <motion.div
                    className="hiw-sep"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.6, ease: E }}
                  />
                )}

                <div className="hiw-col">
                  {/* Layer A — large number, behind text content */}
                  <motion.span
                    className="hiw-num"
                    style={{
                      backgroundImage: card.numGrad,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                    }}
                    aria-hidden
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: COL_TIMING[i].numDelay, ease: E }}
                  >
                    {card.num}
                  </motion.span>

                  {/* Layer B — text content, in front of number */}
                  <motion.div
                    className="hiw-text-block"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: COL_TIMING[i].textDelay, ease: E }}
                  >
                    <h3 className="hiw-title">{card.title}</h3>
                    <p  className="hiw-body">{card.body}</p>
                    <p  className="hiw-subline">{card.subline}</p>
                  </motion.div>
                </div>
              </Fragment>
            ))}
          </div>

          {/* ── Mobile carousel ── */}
          <div className="hiw-carousel-wrap">
            <div className="hiw-carousel" ref={carouselRef}>
              {CARDS.map((card, i) => (
                <div
                  key={card.num}
                  className="hiw-carousel-card"
                  ref={(el) => { slideRefs.current[i] = el; }}
                >
                  <span
                    className="hiw-num"
                    style={{
                      backgroundImage: card.numGrad,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                    }}
                    aria-hidden
                  >
                    {card.num}
                  </span>
                  <div className="hiw-text-block">
                    <h3 className="hiw-title">{card.title}</h3>
                    <p  className="hiw-body">{card.body}</p>
                    <p  className="hiw-subline">{card.subline}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hiw-dots" aria-hidden>
              {CARDS.map((_, i) => (
                <button
                  key={i}
                  className={`hiw-dot${activeIndex === i ? " hiw-dot-active" : ""}`}
                  onClick={() => {
                    slideRefs.current[i]?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                      inline: "center",
                    });
                  }}
                />
              ))}
            </div>
          </div>

        </div>
      </section>
    </>
  );
}
