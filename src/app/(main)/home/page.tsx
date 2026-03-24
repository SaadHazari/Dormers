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

// ─── MAGIC SCROLL-REVEAL HELPERS ───
// These components listen to the user's scroll position and calculate exactly 
// which letter should be lit up based on how far down they have scrolled.

const Char = ({ char, progress, range }: { char: string, progress: MotionValue<number>, range: [number, number] }) => {
  // Starts at 15% opacity so the layout doesn't look broken, then fills to 100% as they scroll past its range.
  const opacity = useTransform(progress, range, [0.15, 1]); 
  return <motion.span style={{ opacity, whiteSpace: char === " " ? "pre" : "normal" }}>{char}</motion.span>;
};

const ScrollText = ({ text, progress, range }: { text: string, progress: MotionValue<number>, range: [number, number] }) => {
  const chars = text.split("");
  const step = (range[1] - range[0]) / chars.length;
  return (
    <>
      {chars.map((char, i) => (
        <Char key={i} char={char} progress={progress} range={[range[0] + i * step, range[0] + (i + 1) * step]} />
      ))}
    </>
  );
};

const ScrollBadge = ({ children, progress, range, className, style }: any) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span style={{ opacity, ...style }} className={className}>
      {children}
    </motion.span>
  );
};
// ────────────────────────────────────

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
  
  // ─── HERO TOP SECTION VARS ───
  const heroContainerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.8, staggerChildren: 0.25 } },
  };

  const heroItemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7 } },
  };

  const arrowVariants = {
    initial: { y: 0 },
    animate: {
      y: [0, -15, 0],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  };

  // ─── SCROLL LISTENER FOR TEXT REVEAL ───
  const textRevealSectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: textRevealProgress } = useScroll({
    target: textRevealSectionRef,
    // "start 85%" = Animation begins when the top of this container reaches 85% down the screen
    // "end 45%" = Animation finishes when the bottom of this container reaches 45% down the screen
    // This provides a massive vertical runway for a slow, comfortable read.
    offset: ["start 85%", "end 45%"], 
  });

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
        if (entry.isIntersecting && hasUserScrolled) {
          setIsQualifyFlipped(true);
        }
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
      {/* ─── NEW CURTAIN REVEAL HERO SECTION ─── */}
      <div className="relative w-full h-[105dvh] bg-[#1E3A4F] overflow-hidden rounded-b-[40px] md:rounded-b-[80px] shadow-[0_30px_60px_rgba(0,0,0,0.6)] z-20 border-b border-white/5">
        
        {/* MOBILE */}
        <div className="md:hidden w-full h-full absolute inset-0 flex flex-col items-start justify-start pt-10">
          <motion.div
            className="w-full h-full flex flex-col"
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Logo */}
            <motion.div variants={heroItemVariants} className="absolute top-10 left-3">
              <div className="relative w-[195px] h-[195px]">
                <Image
                  src="/logo.png"
                  alt="Dormer's Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </motion.div>

            {/* Headline */}
            <div className="absolute top-[220px] left-0 w-full flex flex-col gap-[1px]">
              <motion.p
                variants={heroItemVariants}
                className="text-[64px] leading-[77px] pl-[33px] main_page_meal text-white"
              >
                MEALS
              </motion.p>
              <motion.p
                variants={heroItemVariants}
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
              </motion.p>
              <motion.div variants={heroItemVariants} className="text-[64px] leading-[78px] pl-[34px] flex">
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
                    <Image
                      src="/images/main_page_icon.svg"
                      alt="'"
                      fill
                      className="object-contain"
                      priority
                    />
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
              </motion.div>
              <motion.p
                variants={heroItemVariants}
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
              </motion.p>
            </div>

            {/* Bouncing Double Up-Chevron */}
            <motion.div className="absolute top-[calc(100dvh-120px)] w-full flex justify-center" variants={heroItemVariants}>
              <motion.div
                variants={arrowVariants}
                initial="initial"
                animate="animate"
                className="flex flex-col items-center justify-center cursor-pointer opacity-80"
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mb-[-22px]">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        {/* DESKTOP */}
        <div className="hidden md:flex w-full h-full absolute inset-0 flex-col items-center justify-start pt-10 text-white px-4">
          {/* Logo */}
          <div className="absolute top-10 relative md:w-[240px] md:h-[212px] mb-6">
            <Image
              src="/logo.png"
              alt="Dormer's Logo"
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Headline */}
          <motion.div
            className="text-center leading-tight mt-12"
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.p variants={heroItemVariants} className="text-[64px] leading-[78px] pl-[33px] mealsthattext_box">
              MEALS THAT
            </motion.p>
            <motion.div variants={heroItemVariants} className="text-[64px] leading-[78px] pl-[34px] flex justify-center">
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
                <motion.p
                  variants={heroItemVariants}
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    fontSize: "55px",
                    color: "#213c4c",
                    textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
                  }}
                >
                  T SUCK
                </motion.p>
              </div>
            </motion.div>
          </motion.div>

          {/* Bouncing Double Up-Chevron */}
          <motion.div 
            className="absolute top-[calc(100dvh-120px)] w-full flex justify-center"
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={heroItemVariants}>
              <motion.div
                variants={arrowVariants}
                initial="initial"
                animate="animate"
                className="flex flex-col items-center justify-center cursor-pointer opacity-80"
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mb-[-28px]">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 -mt-[5vh] pt-[5vh]">
        
        {/* ─── SCROLL-DRIVEN TYPEWRITER SECTION ─── */}
        <div
          id="hero"
          ref={textRevealSectionRef}
          className="container mx-auto px-2 sm:px-4 pt-[106px] pb-[24px] md:pt-[137px] md:pb-[40px]"
        >
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* First Section */}
            <div className="text-center mb-[4px]">
              <h1
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                  } text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2`}
                style={{
                  fontFamily: "'Typo Round Bold Demo', sans-serif",
                  lineHeight: "1",
                }}
              >
                {/* 0 to 20% of the scroll reveals this line */}
                <ScrollText text="DORMERS' IS FOR" progress={textRevealProgress} range={[0, 0.2]} />
              </h1>

              <div className="relative inline-flex items-center gap-2 sm:gap-4">
                <h2
                  className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl text-[#213c4c] mt-0"
                  style={{
                    fontFamily: "Montserrat",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    color: "#213c4c",
                    textShadow:
                      "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA",
                    lineHeight: "1",
                    letterSpacing: "0",
                  }}
                >
                  <ScrollText text="STUDENTS" progress={textRevealProgress} range={[0.2, 0.35]} />
                </h2>
                
                {/* Notice your original Tailwind classes (bounce, rotate, color) are completely preserved! */}
                <ScrollBadge
                  progress={textRevealProgress}
                  range={[0.35, 0.4]}
                  className={`${theme === "light"
                    ? "bg-[#1E3A4F] text-white"
                    : "bg-[#EEE9DA] text-[#1E3A4F]"
                    }  top-4 px-2 sm:px-3 py-1 sm:py-1 rounded-full text-[10px] sm:text-base transition-all duration-300 hover:scale-110 animate-bounce rotate-[15.74deg] absolute -right-15 sm:-right-12 lg:right-[-117px]`}
                  style={{ width: "33%", fontFamily: "Typo Round Bold Demo" }}
                >
                  ONLY
                </ScrollBadge>
              </div>
            </div>

            {/* Second Section */}
            <div className="relative text-center mt-2 sm:mt-2 mb-[4px]">
              <ScrollBadge
                progress={textRevealProgress}
                range={[0.4, 0.45]}
                className="bg-[#FF7F00] text-[#1E3A4F] flex items-center justify-center absolute transition-all duration-300 hover:scale-110 animate-bounce rotate-[-11.13deg] badge-label lg:!text-[14px]"
              >
                NO
              </ScrollBadge>

              <h1
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                  } text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2`}
                style={{
                  fontFamily: "'Typo Round Bold Demo', sans-serif",
                  textTransform: "uppercase",
                  lineHeight: "1",
                }}
              >
                <ScrollText text="Overpriced Takeouts" progress={textRevealProgress} range={[0.45, 0.65]} />
              </h1>
            </div>

            {/* Third Section */}
            <div className="relative text-center mt-2 sm:mt-2 mb-[4px]">
              <h2
                className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl text-[#213c4c]"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#213c4c",
                  textShadow:
                    "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA",
                  lineHeight: "1",
                  letterSpacing: "0",
                }}
              >
                <ScrollText text="NO TIME WASTED" progress={textRevealProgress} range={[0.65, 0.8]} />
              </h2>
              <ScrollBadge
                progress={textRevealProgress}
                range={[0.8, 0.85]}
                className="bg-[#031624] text-[#FFFFFF] px-3 sm:px-2 py-1 rounded-full text-[10px] sm:text-base absolute right-4 sm:right-35 top-1 transition-all duration-300 hover:scale-110 animate-bounce rotate-[11.13deg]"
                style={{
                  fontFamily: "Typo Round Bold Demo",
                  fontWeight: 700,
                }}
              >
                COOKING
              </ScrollBadge>
            </div>

            {/* Bottom Text */}
            <p
              className={`text-[12px] sm:text-[24px] md:text-lg lg:text-xl ${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                } text-center flex justify-center flex-wrap`}
              style={{
                fontFamily: "Typo Round Bold Demo",
                fontWeight: 700,
              }}
            >
              <ScrollText text="Just good, affordable food, delivered to your dorm" progress={textRevealProgress} range={[0.85, 1]} />
            </p>
          </div>
        </div>
        {/* ─────────────────────────────────────────────────────────────────── */}

        {/* Repeating Text Banner */}
        <div
          className={`relative w-full h-18 overflow-hidden ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
            }`}
        >
          <div className="flex flex-col gap-2 w-full h-full py-1">
            <div className="relative flex whitespace-nowrap">
              <div className="marquee">
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
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
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
              </div>
            </div>
            <div className="relative flex whitespace-nowrap LastDomers">
              <div className="marquee" style={{ animationDelay: "-3s" }}>
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-4.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div
          className={`relative w-full lg:py-16 py-[48px] ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
            } overflow-hidden`}
        >
          {/* Background Image */}
          <div className="absolute inset-0 w-full h-full block md:hidden">
            <Image
              src="/images/sec2bg.png"
              alt="Background Pattern"
              className="w-full h-full object-cover md:object-fill opacity-[0.4] md:scale-100"
              style={{
                imageRendering: "crisp-edges",
                backgroundRepeat: "repeat",
              }}
              fill
              priority
            />
          </div>
          <div className="absolute inset-0 w-full h-full md:block hidden">
            <Image
              src="/images/howit'sworkbackgroundimage.svg"
              alt="Background Pattern"
              className="w-full h-full object-cover  opacity-[0.7] md:scale-100"
              style={{
                imageRendering: "crisp-edges",
                backgroundRepeat: "repeat",
              }}
              fill
              priority
            />
          </div>
          {/* Content */}
          <div className="relative container mx-auto px-4 top-[-14px]">
            <div className="flex items-center justify-center gap-4 mb-6">
              <h2
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                  } text-3xl sm:text-4xl font-bold text-center`}
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 500,
                  fontSize: "20px",
                  lineHeight: "100%",
                  letterSpacing: "0",
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              >
                HOW IT WORKS
              </h2>
            </div>
            <div className="max-w-md mx-auto space-y-6 md:max-w-full">
              <div className="flex flex-col md:flex-row gap-5 md:justify-center">
                {/* Qualify Card */}
                <div
                  ref={qualifyCardRef}
                  className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer"
                  onClick={() => setIsQualifyFlipped((prev) => !prev)}
                >
                  <div
                    className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${isQualifyFlipped ? "[transform:rotateY(180deg)]" : ""
                      }
                  } ${!isMobile && "hover:scale-105"}`}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 bg-[#031624] rounded-2xl p-6 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                      <span className="bg-[#EEE9DA] text-[#1A1A1A] w-8 h-8 rounded-full flex items-center justify-center font-bold mb-3">
                        1
                      </span>
                      <h3
                        className="text-[#FFFFFF] text-2xl font-bold text-center"
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 900,
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          fontSize: "20px",
                        }}
                      >
                        QUALIFY
                      </h3>
                      <div className="absolute bottom-4 right-[46%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg
                          className="w-4 h-4 animate-bounce"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 4V20M12 20L6 14M12 20L18 14"
                            stroke={`${theme === "light" ? "white" : "white"}`}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Back - Tell us about yourself card */}
                    <div className="absolute inset-0 bg-[#031624] rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                      <div className="flex flex-col justify-between h-full">
                        <div className="h-[24px]"></div>
                        <div className="flex flex-col items-start space-y-3">
                          <Image
                            src="/images/iconinfo1.svg"
                            alt="Info Icon"
                            width={47.84}
                            height={34.28}
                            className="object-contain"
                          />
                          <h4
                            className="text-white text-[16px] font-extrabold font-[Montserrat] leading-snug"
                            style={{
                              fontFamily: "Montserrat",
                              fontWeight: 900,
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              fontSize: "16px",
                            }}
                          >
                            Tell us about
                            <br />
                            yourself
                          </h4>
                        </div>
                        <div className="h-[24px]"></div>
                      </div>
                    </div>

                    {!isMobile && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity"></div>
                    )}
                  </div>
                </div>
                {/* Subscribe Card */}
                <div
                  ref={subscribeCardRef}
                  className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer"
                  onClick={() => setIsSubscribeFlipped((prev) => !prev)}
                >
                  <div
                    className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${isSubscribeFlipped ? "[transform:rotateY(180deg)]" : ""
                      }
                  } ${!isMobile && "hover:scale-105"}`}
                  >
                    {/* Front */}
                    <div
                      className={`absolute inset-0 ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                        } rounded-2xl p-8 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4 ${theme === "light"
                          ? "bg-[#EEE9DA] text-[#1E3A4F]"
                          : "bg-[#1E3A4F] text-white"
                          }`}
                      >
                        2
                      </span>
                      <h3
                        className={`${theme === "light" ? "text-white" : "text-[#1E3A4F]"
                          } text-3xl sm:text-4xl font-bold`}
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 900,
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          textAlign: "center",
                          fontSize: "20px",
                        }}
                      >
                        SUBSCRIBE
                      </h3>
                      <div className="absolute bottom-4 right-[46%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg
                          className="w-4 h-4 animate-bounce"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 4V20M12 20L6 14M12 20L18 14"
                            stroke={`${theme === "light" ? "white" : "black"}`}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                    {/* Back - Pick your perfect plan */}
                    <div
                      className={`absolute inset-0 ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                        } rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all`}
                    >
                      <div className="flex flex-col justify-between h-full">
                        <div className="h-[24px]"></div>
                        <div className="flex flex-col items-start space-y-3">
                          <Image
                            src="/images/iconbell.svg"
                            alt="Info Icon"
                            width={27.16}
                            height={24}
                            className={`object-contain ${theme === "light"
                              ? "filter invert brightness-0 sepia saturate-100 hue-rotate-[10deg] contrast-105"
                              : ""
                              }`}
                          />

                          <h4
                            className={`${theme === "light" ? "text-white" : "text-[#1E3A4F]"
                              } text-[16px] font-extrabold font-[Montserrat] leading-snug`}
                            style={{
                              fontFamily: "Montserrat",
                              fontWeight: 900,
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              fontSize: "16px",
                            }}
                          >
                            Pick your perfect
                            <br />
                            plan
                          </h4>
                        </div>
                        <div className="h-[24px]"></div>
                      </div>
                    </div>

                    {!isMobile && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity"></div>
                    )}
                  </div>
                </div>

                {/* Feast Card */}
                <div
                  ref={feastCardRef}
                  className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative HowItWorksCardContainer"
                  onClick={() =>
                    setFlippedCard(flippedCard === "feast" ? null : "feast")
                  }
                >
                  <div
                    className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${flippedCard === "feast" ? "[transform:rotateY(180deg)]" : ""
                      } ${!isMobile && "hover:scale-105"}`}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 bg-[#FF6B00] rounded-2xl p-8 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                      <span className="bg-white text-[#FF6B00] w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4">
                        3
                      </span>
                      <h3
                        className="text-white text-3xl sm:text-4xl font-bold"
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 900,
                          lineHeight: "100%",
                          letterSpacing: "0%",
                          textAlign: "center",
                          fontSize: "20px",
                        }}
                      >
                        FEAST
                      </h3>
                      <div className="absolute bottom-4 right-[46%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg
                          className="w-4 h-4 animate-bounce"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M12 4V20M12 20L6 14M12 20L18 14"
                            stroke={`${theme === "light" ? "white" : "black"}`}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                    {/* Back - Enjoy stress-free meals */}
                    <div className="absolute inset-0 bg-[#FF6B00] rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all">
                      <div className="flex flex-col justify-between h-full">
                        <div className="h-[24px]"></div>
                        <div className="flex flex-col items-start space-y-3">
                          <Image
                            src="/images/iconfeast.svg"
                            alt="Info Icon"
                            width={27.16}
                            height={24}
                            className="object-contain"
                          />
                          <h4
                            className="text-white text-[16px] font-extrabold font-[Montserrat] leading-snug"
                            style={{
                              fontFamily: "Montserrat",
                              fontWeight: 900,
                              lineHeight: "100%",
                              letterSpacing: "0%",
                              fontSize: "16px",
                            }}
                          >
                            Enjoy stress-free
                            <br />
                            meals
                          </h4>
                        </div>
                        <div className="h-[24px]"></div>
                      </div>
                    </div>

                    {!isMobile && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#FF6B00] via-white to-[#FF6B00] opacity-0 group-hover:opacity-100 animate-gradient-x -z-10 transition-opacity"></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Qualify Button */}
              <div className="flex justify-center mb-[-35px] mt-2">
                <a
                  href="https://vip.dormers.ae"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#031624] text-[#FFFFFF] font-bold py-1 px-3 rounded-full text-lg transition-all hover:scale-105"
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 500,
                    boxShadow: "1px 2px 0px 0px #EEE9DA",
                    fontSize: "12px",
                  }}
                >
                  🔥 Secure My Spot
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Section */}
        <div
          id="menu"
          className={`relative w-full py-0 px-0 ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
            }`}
        >
          <Menu />
        </div>

        {/* Repeating Text Banner (after menu) */}
        <div
          className={`relative w-full h-18 overflow-hidden ${theme === "light" ? "bg-[#1E3A4F] mt-8 sm:mt-4" : "bg-[#EEE9DA]"
            }`}
        >
          <div className="flex flex-col gap-2 w-full h-full py-1">
            {/* Row 1 */}
            <div className="relative flex whitespace-nowrap">
              <div className="marquee">
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
              </div>
            </div>

            {/* Row 2 */}
            <div className="relative flex whitespace-nowrap">
              <div className="marquee" style={{ animationDelay: "-7s" }}>
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
              </div>
            </div>

            {/* Row 3 (Half visible) */}
            <div className="relative flex whitespace-nowrap LastDomers">
              <div className="marquee" style={{ animationDelay: "-3s" }}>
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-4.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
                {[...Array(12)].map((_, i) => (
                  <span
                    key={12 + i}
                    className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
                      } mx-2`}
                    style={{
                      fontFamily: "'Typo Round Bold Demo', sans-serif",
                      fontSize: "18px",
                      fontWeight: 700,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      transform: "rotate(-8.84deg)",
                      opacity: 0.54,
                    }}
                  >
                    DORMERS&apos;
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Testimonials Section */}
        <div id="testimonials" className="relative w-full lg:pt-[40px] py-[24px] pb-0">
          <div className="">
            <div className="flex items-center justify-between lg:max-w-[987px] mx-auto  px-4">
              <h2
                className={`text-[20px]  font-bold lg:text-[30px] pb-[24px] lg:pb-[24px] ${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                  }`}
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 500,
                  lineHeight: "100%",
                  letterSpacing: "0",
                }}
              >
                VOICES OF DELIGHT
              </h2>
            </div>

            {/* Mobile Testimonials */}
            <div className="mx-auto bg-[#031624] py-6 lg:hidden block">
              <div className="lg:max-w-[987px] mx-auto">
                <TestimonialsBubbles />
              </div>
            </div>
            
            {/* Desktop Testimonials */}
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
              className={` ${theme === "light" ? "curtleLightheight" : "curtleheightfaq"
                } `}
              style={{
                bottom: 0,
                left: 0,
                width: "100%",
                backgroundColor: "#22394A",
                borderTopLeftRadius: "60px",
                borderTopRightRadius: "60px",
                borderBottomLeftRadius: "40px",
                borderBottomRightRadius: "40px",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                zIndex: 10,
                position: "relative"
              }}
            >
              <div
                className="w-full py-[24px] px-4 sm:px-6 md:px-8  lg:pt-[40px]  overflow-hidden BoxContainer_FAQBOX"
                style={{
                  backgroundColor: theme === "light" ? "#EEE9DA" : "#22394A",
                  borderBottomLeftRadius: "40px",
                  borderBottomRightRadius: "40px",
                }}
              >
                <div className="md:max-w-[987px] md:mx-auto">
                  <h2
                    className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"
                      } text-3xl sm:text-4xl font-bold mb-8 text-left`}
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 500,
                      lineHeight: "100%",
                      letterSpacing: "0",
                      fontSize: "20px",
                    }}
                  >
                    FAQ&apos;S
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
                            faqRef.current?.scrollIntoView({ behavior: "smooth" });
                          }, 100);
                        }}
                        className={`flex items-center gap-2 text-sm transition-opacity animate-pulse ${theme === "light" ? "text-[#22394A]" : "text-white/80"
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
                <CurtleAboutUs />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Chat Window */}
      <ChatWindow isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Form Modal */}
      <FormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />

      {/* Order Form */}
      <OrderForm
        isOpen={isOrderFormOpen}
        onClose={() => setIsOrderFormOpen(false)}
      />

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
