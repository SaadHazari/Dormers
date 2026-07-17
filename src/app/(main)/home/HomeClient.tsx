"use client";

import { useState, useEffect, useRef } from "react";
import Menu from "@/app/components/Menu";
import { AnimatePresence, motion } from "framer-motion";
import HeroReveal from "@/app/components/HeroReveal";
import { useIsLight } from "@/ui-system/hooks/useIsLight";
import TestimonialsBubbles from "@/app/components/TestimonialsBubbles";
import TestmonialsDesktop from "@/app/components/TestmonialsDesktop";
import { renderFaqCard } from "@/app/(main)/home/renderFaqCard";
import MarqueeBanner from "@/app/components/MarqueeBanner";

import USPBento from "@/app/components/USPBento";
import HowItWorks from "@/app/components/HowItWorks";
import MealSourcingComparison from "@/app/components/MealSourcingComparison";

interface FAQ {
  id: number;
  question: string;
  answer: React.ReactNode;
}

import type { Dish } from '@/contexts/menu/domain/catalog-data'

export default function Home({ menuData }: { menuData?: Dish[] }) {

  const faqRef = useRef<HTMLDivElement>(null);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const isLight = useIsLight();
  const theme = isLight ? "light" : "dark";
  const [showAll, setShowAll] = useState(false);



  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("section-visible");
          }
        });
      },
      {
        threshold: 0.1,
      }
    );

    const aboutSection = document.querySelector(".about-section");
    if (aboutSection) {
      observer.observe(aboutSection);
    }

    return () => {
      if (aboutSection) {
        observer.unobserve(aboutSection);
      }
    };
  }, []);

  const faqs: FAQ[] = [
    {
      id: 1,
      question: "What is Dormers'?",
      answer:
        "Dormers' is your friendly dorm meal savior, designed to keep you alive, full, and thriving without resorting to instant noodles and regret. We deliver tasty, healthy, and affordable meals straight to your dorm so you can focus on acing exams (or just binge-watching in peace).",
    },
    {
      id: 2,
      question: "What kind of food do you serve?",
      answer:
        "Everything except disappointment. Our menu is packed with dishes from around the world—biryani, beef stroganoff, jollof rice, peri-peri chicken, butter chicken, shawarma, burrito bowls—basically, if it’s good, it’s on our menu. Oh, and it changes daily, so no, you won’t be stuck eating the same thing every week. Food fatigue? Never heard of it.",
    },
    {
      id: 3,
      question: "Do you have vegetarian options?",
      answer:
        "Yes! We love our veggie lovers. We have a separate vegetarian meal plan, and our dishes aren’t just “side salads pretending to be meals.” We actually put effort into them. Paneer, lentils, chickpeas, mushrooms—you name it, we make it delicious.",
    },
    {
      id: 4,
      question: "Can I customize my meals?",
      answer:
        "We’re not a “Build-a-Biryani” workshop, but we do allow some customization! Don’t like spicy food? We can tone it down. Allergic to something? We’ve got you. Just let us know your preferences, and we’ll make sure your meal won’t try to assassinate you.",
    },
    {
      id: 5,
      question: "How does the subscription work?",
      answer: (
        <div>
          <p className="mb-4">It’s Netflix, but for food. You can pick:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Daily Plan – One meal at a time, for the commitment-phobes.</li>
            <li>Weekly Plan – 6 days of meals.</li>
            <li>Monthly Plan – 24 meals across 4 weeks.</li>
          </ul>
          <p>
            Want to pause a meal? You get 3 skips per month—just let us know a
            day before and we’ll move it forward.
          </p>
        </div>
      ),
    },
    {
      id: 6,
      question: "How much does it cost?",
      answer:
        "Cheaper than eating out, healthier than junk food, and saner than cooking after an 8 AM lecture. The exact price? Just slide into our WhatsApp DMs, and we’ll give you the details.",
    },
    {
      id: 7,
      question: "How do I pay?",
      answer: (
        <div>
          <p className="mb-4">We keep it simple:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Card payments (Visa/MasterCard)</li>
            <li>Apple Pay (because tapping your phone is the future)</li>
            <li>Bank Transfer (for the spreadsheet lovers)</li>
            <li>Cash on Delivery (for those who still trust paper money)</li>
          </ul>
        </div>
      ),
    },
    {
      id: 8,
      question: "How do you deliver?",
      answer:
        "Our drivers are basically food ninjas—fast, precise, and undetected. We deliver 6 days a week, straight to your dorm, while the food is still warm. And yes, we text you when it’s on the way, because ghosting is for bad relationships, not meal deliveries.",
    },
    {
      id: 9,
      question: "What if I'm not home when the food arrives?",
      answer:
        "No problem! Just let us know ahead of time where to drop it (a friend, reception, or a designated food guardian). If you ghost us, though, your meal will just… wait for you to return like a sad puppy.",
    },
    {
      id: 10,
      question: "Is your packaging eco-friendly?",
      answer:
        "Yep! Our meal boxes are biodegradable and recyclable. Plus, we don’t drown our food in plastic like a crime scene—your sauces and gravies come in separate, spill-proof containers to keep things fresh and crispy.",
    },
    {
      id: 11,
      question: "Can I cancel my subscription?",
      answer:
        "We’d be heartbroken, but yes. If you need to cancel, just let us know at least 3 days before your subscription ends, and we won’t hold any grudges (okay, maybe a tiny one).",
    },
    {
      id: 12,
      question: "How do I sign up?",
      answer: (
        <div>
          <p className="mb-4">Easy!</p>
          <p className="mb-4">
            Just click on the subscribe now button, & you’ll be onboarded before
            you can say “Instant Ramen”.
          </p>
          <p className="mb-4">OR</p>
          <p>
            Just WhatsApp us, click the link in our bio, or scan the QR code on
            our meal bags & menus. Takes less than a minute, and you’ll be on
            your way to better meals and a better life.
          </p>
        </div>
      ),
    },
  ];

  const toggleFAQ = (id: number) => {
    setOpenFAQ(openFAQ === id ? null : id);
  };

  return (
    <div
      className={`min-h-screen ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
        }`}
    >
      {/* ── Hero scroll-reveal sequence ── */}
      <HeroReveal menuData={menuData} />

      {/* ── Repeating Text Banner ── */}
      <MarqueeBanner />

      {/* USP Bento Grid - ADDED ID HERE */}
      <div id="usp">
        <USPBento />
      </div>

      {/* How It Works Section - ADDED ID HERE */}
      <div id="howitworks">
        <HowItWorks />
      </div>

      {/* Menu Section */}
      <div
        id="menu"
        className={`relative w-full py-0 px-0 ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
          }`}
      >
        <Menu menuData={menuData} />
      </div>

      {/* Repeating Text Banner (after menu) */}
      <MarqueeBanner className={theme === "light" ? "mt-8 sm:mt-4" : ""} />

      <div
        id="testimonials"
        className="relative w-full lg:pt-[40px] py-[24px] pb-0"
      >
        <div className="">
          <div className="flex items-center justify-between lg:max-w-[987px] mx-auto  px-4">
            <h2
              className={`pb-[24px] lg:pb-[24px] ${theme === "light" ? "text-[#1E3A4F]" : "text-white"}`}
              style={{
                fontFamily: "Montserrat",
                fontWeight: 500,
                fontSize: "20px",
                lineHeight: "100%",
                letterSpacing: "0",
              }}
            >
              VOICES OF DELIGHT
            </h2>
          </div>

          {/* New Testimonials Component */}
          <div className="mx-auto bg-[#031624] py-6 lg:hidden block">
            <div className="lg:max-w-[987px] mx-auto">
              <TestimonialsBubbles />
            </div>
          </div>
          <div className="mx-auto bg-[#031624] py-6 lg:block hidden">
            <div className="lg:max-w-[987px] mx-auto">
              <TestmonialsDesktop />
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <section id="faq">
        <div
          ref={faqRef}
          className={`relative w-full  ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"
            }`}
        >
          <div
            style={{
              bottom: 0,
              left: 0,
              width: "100%",
              backgroundColor: theme === "light" ? "#D5CFBF" : "#22394A",
              borderTopLeftRadius: "60px",
              borderTopRightRadius: "60px",
              zIndex: 0,
            }}
          >
            <div
              className="w-full py-[24px] px-4 sm:px-6 md:px-8  lg:pt-[40px]  overflow-hidden BoxContainer_FAQBOX"
              style={{
                backgroundColor: theme === "light" ? "#EEE9DA" : "#22394A",
              }}
            >
              <div className="md:max-w-[987px] md:mx-auto">
                <h2
                  className={`mb-8 ${theme === "light" ? "text-[#1E3A4F]" : "text-white"}`}
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 500,
                    lineHeight: "100%",
                    letterSpacing: "0",
                    fontSize: "20px",
                  }}
                >
                  FAQs
                </h2>

                <AnimatePresence mode="wait">
                  {showAll ? (
                    <motion.div
                      key="expanded"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="relative"
                    >
                      {/* Close button */}
                      <button
                        onClick={() => {
                          setShowAll(false);
                          setTimeout(() => {
                            faqRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }, 200);
                        }}
                        className={`absolute top-[-66px] right-0 z-10 p-2 rounded-full  hover:opacity-80 transition-opacity`}
                      >
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke={`${theme === "light" ? "black" : "white"}`}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>

                      {/* Scrollable FAQ list */}
                      <div className="max-h-[65vh] overflow-y-auto pr-2 mt-8 custom-scroll">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                          {faqs.map((faq, index) =>
                            renderFaqCard(faq, index, openFAQ, toggleFAQ, theme)
                          )}
                        </div>
                      </div>

                      {/* Show Less — outside scroll zone */}
                      <div className="mt-4 mb-2 flex justify-center">
                        <button
                          onClick={() => {
                            setShowAll(false);
                            setTimeout(() => {
                              faqRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }, 200);
                          }}
                          className={`flex items-center gap-2 text-sm transition-opacity hover:opacity-80 ${theme === "light" ? "text-[#22394A]" : "text-white/80"
                            }`}
                        >
                          <span
                            className="underline"
                            style={{
                              fontFamily: "Montserrat",
                              fontWeight: 600,
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              fontSize: "12px",
                            }}
                          >
                            Show Less
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="collapsed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4"
                    >
                      {faqs
                        .slice(0, 3)
                        .map((faq, index) =>
                          renderFaqCard(faq, index, openFAQ, toggleFAQ, theme)
                        )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {!showAll && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => {
                        setShowAll(true);
                        setTimeout(() => {
                          faqRef.current?.scrollIntoView({
                            behavior: "smooth",
                          });
                        }, 100);
                      }}
                      className={`flex items-center gap-2 text-sm transition-opacity hover:opacity-70 ${theme === "light" ? "text-[#22394A]" : "text-white/80"
                        }`}
                    >
                      <span
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 600,
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          marginLeft: "0.3rem",
                          fontSize: "12px",
                        }}
                      >
                        View All
                      </span>
                      <svg
                        className="w-4 h-4 animate-bounce"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Gap below the FAQ card. Light stays cream here — the beige
              close now eases in via the gradient tail around the comparison
              section, not a hard band. Dark keeps its navy-on-navy close.
              Collapsed on lg: at desktop width the compare trigger otherwise
              floats in a dead band between "View All" and the seam. ── */}
          <div
            className="h-11 lg:h-0"
            style={{
              backgroundColor: theme === "light" ? "#EEE9DA" : "#22394A",
              borderBottomLeftRadius: "60px",
              borderBottomRightRadius: "60px",
            }}
          />
        </div>
      </section>

      {/* Meal-sourcing comparison — placed after FAQ to re-engage at the
          lowest-attention point. Renders its own <section id="compare">.
          Light mode: this is the tail of .main_content, so ease the cream
          into #D5CFBF (last 15px solid) — the layout's 46px bottom clip then
          rounds beige against the same-cream grid section instead of showing
          a hard divide. Dark mode inherits the navy root untouched. */}
      <div
        style={{
          backgroundImage:
            theme === "light"
              ? "linear-gradient(to bottom, rgba(213,207,191,0) 0%, #D5CFBF calc(100% - 15px), #D5CFBF 100%)"
              : undefined,
        }}
      >
        <MealSourcingComparison />
      </div>

      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .marquee {
          display: flex;
          animation: marquee 20s linear infinite;
          will-change: transform;
        }
        .marquee:hover {
          animation-play-state: paused;
        }

        @keyframes float {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-16px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        .animate-float {
          animation: float 3.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}