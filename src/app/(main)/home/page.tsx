"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import ChatWindow from "./ChatWindow";
import Menu from "@/app/components/Menu";
import { motion, AnimatePresence, useScroll, useTransform, MotionValue } from "framer-motion";
import FormModal from "@/app/components/FormModal";
import OrderForm from "@/app/components/OrderForm";
import { useTheme } from "next-themes";
import TestimonialsBubbles from "@/app/components/TestimonialsBubbles";
import TestmonialsDesktop from "@/app/components/TestmonialsDesktop";
import { renderFaqCard } from "@/app/(main)/home/renderFaqCard";
import CurtleAboutUs from "@/app/components/CurtleAboutUs";

interface FAQ {
  id: number;
  question: string;
  answer: React.ReactNode;
}

// ─── SCROLL-REVEAL HELPERS ───────────────────────────────────────────────────
const Char = ({
  char,
  progress,
  range,
}: {
  char: string;
  progress: MotionValue<number>;
  range: [number, number];
}) => {
  // visibility:hidden keeps the character completely invisible (no shadow,
  // no text-stroke trace) until its reveal point. Then opacity fades in.
  const opacity = useTransform(progress, range, [0, 1]);
  const visibility = useTransform(progress, (p) =>
    p < range[0] ? "hidden" : "visible"
  );
  return (
    <motion.span style={{ opacity, visibility: visibility as unknown as "hidden" | "visible", whiteSpace: char === " " ? "pre" : "normal" }}>
      {char}
    </motion.span>
  );
};

const ScrollText = ({
  text,
  progress,
  range,
}: {
  text: string;
  progress: MotionValue<number>;
  range: [number, number];
}) => {
  const chars = text.split("");
  const step = (range[1] - range[0]) / chars.length;
  return (
    <>
      {chars.map((char, i) => (
        <Char
          key={i}
          char={char}
          progress={progress}
          range={[range[0] + i * step, range[0] + (i + 1) * step]}
        />
      ))}
    </>
  );
};

interface ScrollBadgeProps {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  className?: string;
  style?: React.CSSProperties;
}

const ScrollBadge = ({ children, progress, range, className, style }: ScrollBadgeProps) => {
  const opacity = useTransform(progress, range, [0, 1]);
  return (
    <motion.span style={{ opacity, ...style }} className={className}>
      {children}
    </motion.span>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const faqRef = useRef<HTMLDivElement>(null);
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(false);
  const qualifyCardRef = useRef<HTMLDivElement>(null);
  const subscribeCardRef = useRef<HTMLDivElement>(null);
  const feastCardRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [isQualifyFlipped, setIsQualifyFlipped] = useState(false);
  const [isSubscribeFlipped, setIsSubscribeFlipped] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  // ─── LOCK SCREEN ───────────────────────────────────────────────────────────
  const [isLockScreenDismissed, setIsLockScreenDismissed] = useState(false);


  useEffect(() => {
    if (isLockScreenDismissed) return;
    document.body.style.overflow = "hidden";

    const handleInteraction = (e: Event) => {
      if (e.type === "wheel") {
        if ((e as WheelEvent).deltaY > 10) setIsLockScreenDismissed(true);
      } else if (e.type === "touchstart") {
        const startY = (e as TouchEvent).touches[0].clientY;
        const handleTouchMove = (moveEvent: TouchEvent) => {
          if (startY - moveEvent.touches[0].clientY > 20) {
            setIsLockScreenDismissed(true);
            window.removeEventListener("touchmove", handleTouchMove);
          }
        };
        window.addEventListener("touchmove", handleTouchMove, { passive: true });
      }
    };

    window.addEventListener("wheel", handleInteraction, { passive: true });
    window.addEventListener("touchstart", handleInteraction, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      document.body.style.overflow = "";
    };
  }, [isLockScreenDismissed]);

  // ─── STICKY TEXT-REVEAL SECTION ────────────────────────────────────────────
  const textRevealSectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: textRevealProgress } = useScroll({
    target: textRevealSectionRef,
    offset: ["start start", "end end"],
  });

  // ─── OTHER EFFECTS ─────────────────────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleChatOpen = () => setIsChatOpen(true);
    window.addEventListener("open-chat", handleChatOpen);
    return () => window.removeEventListener("open-chat", handleChatOpen);
  }, []);

  useEffect(() => {
    const handleScroll = () => setHasUserScrolled(true);
    window.addEventListener("scroll", handleScroll, { once: true });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasUserScrolled) setIsQualifyFlipped(true);
      },
      { threshold: 0.5 }
    );

    if (qualifyCardRef.current) observer.observe(qualifyCardRef.current);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (qualifyCardRef.current) observer.unobserve(qualifyCardRef.current);
    };
  }, [hasUserScrolled]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("section-visible");
        });
      },
      { threshold: 0.1 }
    );
    const aboutSection = document.querySelector(".about-section");
    if (aboutSection) observer.observe(aboutSection);
    return () => {
      if (aboutSection) observer.unobserve(aboutSection);
    };
  }, []);

  const faqs: FAQ[] = [
    {
      id: 1,
      question: "What is Dormer's?",
      answer:
        "Dormer's is your friendly dorm meal savior, designed to keep you alive, full, and thriving without resorting to instant noodles and regret. We deliver tasty, healthy, and affordable meals straight to your dorm so you can focus on acing exams (or just binge-watching in peace).",
    },
    {
      id: 2,
      question: "What kind of food do you serve?",
      answer:
        "Everything except disappointment. Our menu is packed with dishes from around the world—biryani, beef stroganoff, jollof rice, peri-peri chicken, butter chicken, shawarma, burrito bowls—basically, if it's good, it's on our menu. Oh, and it changes daily, so no, you won't be stuck eating the same thing every week. Food fatigue? Never heard of it.",
    },
    {
      id: 3,
      question: "Do you have vegetarian options?",
      answer:
        "Yes! We love our veggie lovers. We have a separate vegetarian meal plan, and our dishes aren't just "side salads pretending to be meals." We actually put effort into them. Paneer, lentils, chickpeas, mushrooms—you name it, we make it delicious.",
    },
    {
      id: 4,
      question: "Can I customize my meals?",
      answer:
        "We're not a "Build-a-Biryani" workshop, but we do allow some customization! Don't like spicy food? We can tone it down. Allergic to something? We've got you. Just let us know your preferences, and we'll make sure your meal won't try to assassinate you.",
    },
    {
      id: 5,
      question: "How does the subscription work?",
      answer: (
        <div>
          <p className="mb-4">It&apos;s Netflix, but for food. You can pick:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Daily Plan – One meal at a time, for the commitment-phobes.</li>
            <li>Weekly Plan – 6 days of meals.</li>
            <li>Monthly Plan – 24 meals across 4 weeks.</li>
          </ul>
          <p>Want to pause a meal? You get 3 skips per month—just let us know a day before and we&apos;ll move it forward.</p>
        </div>
      ),
    },
    {
      id: 6,
      question: "How much does it cost?",
      answer:
        "Cheaper than eating out, healthier than junk food, and saner than cooking after an 8 AM lecture. The exact price? Just slide into our WhatsApp DMs, and we'll give you the details.",
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
        "Our drivers are basically food ninjas—fast, precise, and undetected. We deliver 6 days a week, straight to your dorm, while the food is still warm. And yes, we text you when it's on the way, because ghosting is for bad relationships, not meal deliveries.",
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
        "Yep! Our meal boxes are biodegradable and recyclable. Plus, we don't drown our food in plastic like a crime scene—your sauces and gravies come in separate, spill-proof containers to keep things fresh and crispy.",
    },
    {
      id: 11,
      question: "Can I cancel my subscription?",
      answer:
        "We'd be heartbroken, but yes. If you need to cancel, just let us know at least 3 days before your subscription ends, and we won't hold any grudges (okay, maybe a tiny one).",
    },
    {
      id: 12,
      question: "How do I sign up?",
      answer: (
        <div>
          <p className="mb-4">Easy!</p>
          <p className="mb-4">Just click on the subscribe now button, &amp; you&apos;ll be onboarded before you can say &quot;Instant Ramen&quot;.</p>
          <p className="mb-4">OR</p>
          <p>Just WhatsApp us, click the link in our bio, or scan the QR code on our meal bags &amp; menus. Takes less than a minute, and you&apos;ll be on your way to better meals and a better life.</p>
        </div>
      ),
    },
  ];

  const toggleFAQ = (id: number) => setOpenFAQ(openFAQ === id ? null : id);

  return (
    <div className={`min-h-screen ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}>

      {/* ─── LOCK SCREEN ─────────────────────────────────────────────────────── */}
      <motion.div
        className="fixed inset-0 z-[200] bg-[#1E3A4F]"
        initial={{ y: 0 }}
        animate={{ y: isLockScreenDismissed ? "-100%" : "0%" }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
      >
        <motion.div
          className="w-full h-full relative"
          animate={isLockScreenDismissed ? {} : { y: [0, -12, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* MOBILE */}
          <div
            className="md:hidden w-full h-full relative flex flex-col items-start justify-center cursor-pointer"
            onClick={() => setIsLockScreenDismissed(true)}
          >
            <div className="w-full h-full flex flex-col items-center justify-center">
              {/* Logo */}
              <div className="absolute top-10 left-3">
                <div className="relative w-[195px] h-[195px]">
                  <Image src="/logo.png" alt="Dormer's Logo" fill className="object-contain" priority />
                </div>
              </div>

              {/* Headline — original classes & styles restored exactly */}
              <div className="absolute top-[170px] left-0 w-full flex flex-col gap-[1px]">
                {/* MEALS — uses main_page_meal class, NO text-white override */}
                <p className="text-[64px] leading-[77px] pl-[33px] main_page_meal">MEALS</p>

                {/* THAT */}
                <p
                  className="text-[64px] leading-[78px] pl-[33px]"
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    fontSize: "55px",
                    color: "#213c4c",
                    textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                  }}
                >
                  THAT
                </p>

                {/* DON'T */}
                <div className="text-[64px] leading-[78px] pl-[34px] flex">
                  <div className="flex items-center space-x-1">
                    <span
                      style={{
                        fontFamily: "Montserrat",
                        fontWeight: 900,
                        color: "#213c4c",
                        fontSize: "55px",
                        textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                      }}
                    >
                      DON
                    </span>
                    <span className="relative w-[20px] h-[40px] top-[-8px]">
                      <Image src="/images/main_page_icon.svg" alt="'" fill className="object-contain" priority />
                    </span>
                    <span
                      style={{
                        fontFamily: "Montserrat",
                        fontWeight: 900,
                        fontSize: "55px",
                        WebkitTextStroke: "1px #fff",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      T
                    </span>
                  </div>
                </div>

                {/* SUCK */}
                <p
                  className="text-[64px] leading-[78px] pl-[33px]"
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    color: "#213c4c",
                    fontSize: "55px",
                    textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                  }}
                >
                  SUCK
                </p>

                {/* Welcome + arrow */}
                <div className="flex flex-row items-center gap-x-10 mt-10 pl-[33px]">
                  <p
                    className="text-[14px] text-white font-bold tracking-normal uppercase leading-none"
                    style={{ fontFamily: "Montserrat" }}
                  >
                    WELCOME TO DORMERS&apos;
                  </p>
                  <motion.div
                    variants={arrowVariants}
                    initial="initial"
                    animate="animate"
                    className="relative w-7 h-7 rounded-full border border-white flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: "#EEE9DA" }}
                  >
                    <span className="relative w-[12px] h-[12px]">
                      <Image src="/images/ArrowDownmain.svg" alt="arrow" fill className="object-contain" priority />
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

          {/* DESKTOP */}
          <div
            className="hidden md:flex flex-col items-center justify-start min-h-screen text-white px-4 cursor-pointer"
            onClick={() => setIsLockScreenDismissed(true)}
          >
            {/* Logo */}
            <div className="relative md:w-[240px] md:h-[212px] mb-6 mt-10">
              <Image src="/logo.png" alt="Dormer's Logo" fill className="object-contain" priority />
            </div>

            {/* Headline — original mealsthattext_box class restored */}
            <div className="text-center leading-tight">
              <p className="text-[64px] leading-[78px] pl-[33px] mealsthattext_box">MEALS THAT</p>
              <div className="text-[64px] leading-[78px] pl-[34px] flex justify-center">
                <div className="flex items-center space-x-1">
                  <span
                    style={{
                      fontFamily: "Montserrat",
                      fontWeight: 900,
                      color: "#213c4c",
                      fontSize: "55px",
                      textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                    }}
                  >
                    DON
                  </span>
                  <span className="relative w-[20px] h-[40px] top-[-8px]">
                    <Image src="/images/main_page_icon.svg" alt="'" fill className="object-contain" priority />
                  </span>
                  <p
                    style={{
                      fontFamily: "Montserrat",
                      fontWeight: 900,
                      fontSize: "55px",
                      color: "#213c4c",
                      textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                    }}
                  >
                    T SUCK
                  </p>
                </div>
              </div>
            </div>

            {/* Welcome + bouncy arrow — restored for desktop */}
            <div className="flex items-center gap-[24px] mt-[80px]">
              <p className="WelcomtextMessage">WELCOME TO DORMERS&apos;</p>
              <motion.div
                variants={arrowVariants}
                initial="initial"
                animate="animate"
                className="relative w-8 h-8 rounded-full border border-white flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: "#EEE9DA" }}
              >
                <span className="relative w-[12px] h-[12px]">
                  <Image src="/images/ArrowDownmain.svg" alt="arrow" fill className="object-contain" priority />
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ─── STICKY SCROLL-REVEAL SECTION ────────────────────────────────────── */}
      {/*
        z-[110] sits above the navbar (z-[100]) and the chat bubble.
        The navbar and chat button are naturally hidden while this section
        occupies the viewport. Once the user scrolls past 300vh they reappear.

        Golden ratio sizing (φ ≈ 1.618):
          body    ~26px  (φ¹ × 16)
          medium  ~42px  (φ² × 16)
          large   ~68px  (φ³ × 16)
          hero   ~110px  (φ⁴ × 16)
        Section spacing follows the same φ progression.
      */}
      <div
        ref={textRevealSectionRef}
        className="relative h-[300vh] w-full bg-[#1E3A4F] z-[110]"
      >
        <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center px-4 overflow-hidden bg-[#1E3A4F]">
          <div className="max-w-5xl mx-auto w-full flex flex-col items-center justify-center">

            {/* Line 1 — hero size (φ⁴ ≈ 110px) */}
            <div className="text-center mb-[26px] md:mb-[42px] flex flex-col items-center">
              <h1
                className="text-white text-[42px] sm:text-[68px] md:text-[110px] leading-[1.1]"
                style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}
              >
                <ScrollText text="DORMERS' IS FOR" progress={textRevealProgress} range={[0.0, 0.2]} />
              </h1>
              <div className="relative inline-flex items-center mt-2">
                <h2
                  className="text-[42px] sm:text-[68px] md:text-[110px] text-[#213c4c] mt-0 leading-[1.1]"
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    textShadow: "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA",
                  }}
                >
                  <ScrollText text="STUDENTS" progress={textRevealProgress} range={[0.2, 0.35]} />
                </h2>
                <ScrollBadge
                  progress={textRevealProgress}
                  range={[0.35, 0.4]}
                  className="bg-[#EEE9DA] text-[#1E3A4F] px-3 py-1 rounded-full text-[16px] sm:text-[26px] rotate-[15.74deg] absolute -right-[42px] sm:-right-[68px]"
                  style={{ fontFamily: "Typo Round Bold Demo" }}
                >
                  ONLY
                </ScrollBadge>
              </div>
            </div>

            {/* Line 2 — large size (φ³ ≈ 68px) */}
            <div className="relative text-center mb-[26px] md:mb-[42px] flex items-center justify-center">
              <ScrollBadge
                progress={textRevealProgress}
                range={[0.4, 0.45]}
                className="bg-[#FF7F00] text-[#1E3A4F] flex items-center justify-center absolute rotate-[-11.13deg] rounded-md px-2 py-1 text-[16px] sm:text-[26px] z-10 left-[-26px] sm:left-[-42px] top-[-16px]"
              >
                NO
              </ScrollBadge>
              <h1
                className="text-white text-[26px] sm:text-[42px] md:text-[68px] leading-[1.1]"
                style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", textTransform: "uppercase" }}
              >
                <ScrollText text="Overpriced Takeouts" progress={textRevealProgress} range={[0.45, 0.65]} />
              </h1>
            </div>

            {/* Line 3 — hero size (φ⁴ ≈ 110px) */}
            <div className="relative text-center flex items-center justify-center">
              <h2
                className="text-[42px] sm:text-[68px] md:text-[110px] text-[#213c4c] leading-[1.1]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  textShadow: "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA",
                }}
              >
                <ScrollText text="NO TIME WASTED" progress={textRevealProgress} range={[0.65, 0.8]} />
              </h2>
              <ScrollBadge
                progress={textRevealProgress}
                range={[0.8, 0.85]}
                className="bg-[#031624] text-[#FFFFFF] px-3 py-1 rounded-full text-[16px] sm:text-[26px] absolute right-[-26px] sm:right-[-42px] top-[-16px] rotate-[11.13deg]"
                style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700 }}
              >
                COOKING
              </ScrollBadge>
            </div>

            {/* Tagline — medium size (φ² ≈ 42px) */}
            <p
              className="text-white text-[16px] sm:text-[26px] md:text-[42px] text-center flex justify-center flex-wrap mt-[42px] md:mt-[68px]"
              style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700 }}
            >
              <ScrollText
                text="Just good, affordable food, delivered to your dorm"
                progress={textRevealProgress}
                range={[0.85, 0.98]}
              />
            </p>
          </div>
        </div>
      </div>

      {/* ─── REST OF PAGE (below the reveal section, navbar visible again) ─── */}

      {/* Repeating Text Banner */}
      <div className={`relative w-full h-18 overflow-hidden ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"}`}>
        <div className="flex flex-col gap-2 w-full h-full py-1">
          <div className="relative flex whitespace-nowrap">
            <div className="marquee">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"} mx-2`}
                  style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "18px", fontWeight: 700, transform: "rotate(-8.84deg)", opacity: 0.54 }}
                >
                  DORMERS&apos;
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex whitespace-nowrap">
            <div className="marquee" style={{ animationDelay: "-7s" }}>
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"} mx-2`}
                  style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "18px", fontWeight: 700, transform: "rotate(-8.84deg)", opacity: 0.54 }}
                >
                  DORMERS&apos;
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className={`relative w-full lg:py-16 py-[48px] ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"} overflow-hidden`}>
        <div className="absolute inset-0 w-full h-full block md:hidden">
          <Image src="/images/sec2bg.png" alt="Background Pattern" className="w-full h-full object-cover md:object-fill opacity-[0.4] md:scale-100" style={{ imageRendering: "crisp-edges" }} fill priority />
        </div>
        <div className="absolute inset-0 w-full h-full md:block hidden">
          <Image src="/images/howit'sworkbackgroundimage.svg" alt="Background Pattern" className="w-full h-full object-cover opacity-[0.7] md:scale-100" style={{ imageRendering: "crisp-edges" }} fill priority />
        </div>
        <div className="relative container mx-auto px-4 top-[-14px]">
          <div className="flex items-center justify-center gap-4 mb-6">
            <h2
              className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} text-3xl sm:text-4xl font-bold text-center`}
              style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, fontSize: "20px", lineHeight: "100%", letterSpacing: "0", textTransform: "uppercase" }}
            >
              HOW IT WORKS
            </h2>
          </div>
          <div className="max-w-md mx-auto space-y-6 md:max-w-full">
            <div className="flex flex-col md:flex-row gap-5 md:justify-center">

              {/* Qualify Card */}
              <div ref={qualifyCardRef} className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer" onClick={() => setIsQualifyFlipped((prev) => !prev)}>
                <div className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${isQualifyFlipped ? "[transform:rotateY(180deg)]" : ""} ${!isMobile && "hover:scale-105"}`}>
                  <div className="absolute inset-0 bg-[#031624] rounded-2xl p-6 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                    <span className="bg-[#EEE9DA] text-[#1A1A1A] w-8 h-8 rounded-full flex items-center justify-center font-bold mb-3">1</span>
                    <h3 className="text-[#FFFFFF] text-2xl font-bold text-center" style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "20px" }}>QUALIFY</h3>
                    <div className="absolute bottom-4 right-[46%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none"><path d="M12 4V20M12 20L6 14M12 20L18 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-[#031624] rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg">
                    <div className="flex flex-col justify-between h-full">
                      <div className="h-[24px]" />
                      <div className="flex flex-col items-start space-y-3">
                        <Image src="/images/iconinfo1.svg" alt="Info Icon" width={47.84} height={34.28} className="object-contain" />
                        <h4 className="text-white text-[16px] font-extrabold leading-snug" style={{ fontFamily: "Montserrat", fontWeight: 900 }}>Tell us about<br />yourself</h4>
                      </div>
                      <div className="h-[24px]" />
                    </div>
                  </div>
                  {!isMobile && <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity" />}
                </div>
              </div>

              {/* Subscribe Card */}
              <div ref={subscribeCardRef} className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer" onClick={() => setIsSubscribeFlipped((prev) => !prev)}>
                <div className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${isSubscribeFlipped ? "[transform:rotateY(180deg)]" : ""} ${!isMobile && "hover:scale-105"}`}>
                  <div className={`absolute inset-0 ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"} rounded-2xl p-8 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4 ${theme === "light" ? "bg-[#EEE9DA] text-[#1E3A4F]" : "bg-[#1E3A4F] text-white"}`}>2</span>
                    <h3 className={`${theme === "light" ? "text-white" : "text-[#1E3A4F]"} text-3xl sm:text-4xl font-bold`} style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "20px" }}>SUBSCRIBE</h3>
                    <div className="absolute bottom-4 right-[46%] opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none"><path d="M12 4V20M12 20L6 14M12 20L18 14" stroke={theme === "light" ? "white" : "black"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </div>
                  <div className={`absolute inset-0 ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"} rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg`}>
                    <div className="flex flex-col justify-between h-full">
                      <div className="h-[24px]" />
                      <div className="flex flex-col items-start space-y-3">
                        <Image src="/images/iconbell.svg" alt="Info Icon" width={27.16} height={24} className={`object-contain ${theme === "light" ? "filter invert brightness-0 sepia saturate-100 hue-rotate-[10deg] contrast-105" : ""}`} />
                        <h4 className={`${theme === "light" ? "text-white" : "text-[#1E3A4F]"} text-[16px] font-extrabold leading-snug`} style={{ fontFamily: "Montserrat", fontWeight: 900 }}>Pick your perfect<br />plan</h4>
                      </div>
                      <div className="h-[24px]" />
                    </div>
                  </div>
                  {!isMobile && <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity" />}
                </div>
              </div>

              {/* Feast Card */}
              <div ref={feastCardRef} className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer" onClick={() => setFlippedCard(flippedCard === "feast" ? null : "feast")}>
                <div className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${flippedCard === "feast" ? "[transform:rotateY(180deg)]" : ""} ${!isMobile && "hover:scale-105"}`}>
                  <div className="absolute inset-0 bg-[#FF6B00] rounded-2xl p-8 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                    <span className="bg-white text-[#FF6B00] w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4">3</span>
                    <h3 className="text-white text-3xl sm:text-4xl font-bold" style={{ fontFamily: "Montserrat", fontWeight: 900, fontSize: "20px" }}>FEAST</h3>
                    <div className="absolute bottom-4 right-[46%] opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none"><path d="M12 4V20M12 20L6 14M12 20L18 14" stroke={theme === "light" ? "white" : "black"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-[#FF6B00] rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg">
                    <div className="flex flex-col justify-between h-full">
                      <div className="h-[24px]" />
                      <div className="flex flex-col items-start space-y-3">
                        <Image src="/images/iconfeast.svg" alt="Info Icon" width={27.16} height={24} className="object-contain" />
                        <h4 className="text-white text-[16px] font-extrabold leading-snug" style={{ fontFamily: "Montserrat", fontWeight: 900 }}>Enjoy stress-free<br />meals</h4>
                      </div>
                      <div className="h-[24px]" />
                    </div>
                  </div>
                  {!isMobile && <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity" />}
                </div>
              </div>

            </div>

            <div className="flex justify-center mb-[-35px] mt-2">
              <a
                href="https://vip.dormers.ae"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#031624] text-[#FFFFFF] font-bold py-1 px-3 rounded-full text-lg transition-all hover:scale-105 shadow-[1px_2px_0px_0px_#EEE9DA] text-[12px]"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500 }}
              >
                🔥 Secure My Spot
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div id="menu" className={`relative w-full py-0 px-0 ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}>
        <Menu />
      </div>

      {/* Testimonials */}
      <div id="testimonials" className="relative w-full lg:pt-[40px] py-[24px] pb-0">
        <div>
          <div className="flex items-center justify-between lg:max-w-[987px] mx-auto px-4">
            <h2
              className={`text-[20px] font-bold lg:text-[30px] pb-[24px] ${theme === "light" ? "text-[#1E3A4F]" : "text-white"}`}
              style={{ fontFamily: "Montserrat", fontWeight: 500, lineHeight: "100%", letterSpacing: "0" }}
            >
              VOICES OF DELIGHT
            </h2>
          </div>
          <div className="mx-auto bg-[#031624] py-6 lg:hidden block">
            <div className="lg:max-w-[987px] mx-auto"><TestimonialsBubbles /></div>
          </div>
          <div className="mx-auto bg-[#031624] py-6 lg:block hidden">
            <div className="lg:max-w-[987px] mx-auto"><TestmonialsDesktop /></div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section id="faq">
        <div ref={faqRef} className={`relative w-full ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"}`}>
          <div
            className={`${theme === "light" ? "curtleLightheight" : "curtleheightfaq"}`}
            style={{ bottom: 0, left: 0, width: "100%", backgroundColor: "#22394A", borderTopLeftRadius: "60px", borderTopRightRadius: "60px", borderBottomLeftRadius: "40px", borderBottomRightRadius: "40px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", zIndex: 10, position: "relative" }}
          >
            <div
              className="w-full py-[24px] px-4 sm:px-6 md:px-8 lg:pt-[40px] overflow-hidden BoxContainer_FAQBOX"
              style={{ backgroundColor: theme === "light" ? "#EEE9DA" : "#22394A", borderBottomLeftRadius: "40px", borderBottomRightRadius: "40px" }}
            >
              <div className="md:max-w-[987px] md:mx-auto">
                <h2
                  className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} text-3xl sm:text-4xl font-bold mb-8 text-left`}
                  style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 500, lineHeight: "100%", letterSpacing: "0", fontSize: "20px" }}
                >
                  FAQ&apos;S
                </h2>

                <AnimatePresence mode="wait">
                  {showAll ? (
                    <motion.div key="expanded" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="relative">
                      <button
                        onClick={() => { setShowAll(false); setTimeout(() => { faqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 200); }}
                        className="absolute top-[-66px] right-0 z-10 p-2 rounded-full hover:opacity-80 transition-opacity"
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={theme === "light" ? "black" : "white"}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <div className="max-h-[65vh] overflow-y-auto pr-2 mt-8 custom-scroll">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                          {faqs.map((faq, index) => renderFaqCard(faq, index, openFAQ, toggleFAQ, theme))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      {faqs.slice(0, 3).map((faq, index) => renderFaqCard(faq, index, openFAQ, toggleFAQ, theme))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {!showAll && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => { setShowAll(true); setTimeout(() => { faqRef.current?.scrollIntoView({ behavior: "smooth" }); }, 100); }}
                      className={`flex items-center gap-2 text-sm transition-opacity animate-pulse ${theme === "light" ? "text-[#22394A]" : "text-white/80"}`}
                    >
                      <span style={{ fontFamily: "Montserrat", fontWeight: 600, fontSize: "12px" }}>View All</span>
                      <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <CurtleAboutUs />
            </div>
          </div>
        </div>
      </section>

      {/* Modals */}
      <ChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      <FormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
      <OrderForm isOpen={isOrderFormOpen} onClose={() => setIsOrderFormOpen(false)} />

      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee { display: flex; animation: marquee 20s linear infinite; will-change: transform; }
        .marquee:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
