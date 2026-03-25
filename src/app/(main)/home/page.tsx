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
const Char = ({ char, progress, range }: { char: string, progress: MotionValue<number>, range: [number, number] }) => {
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

interface ScrollBadgeProps {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  className?: string;
  style?: React.CSSProperties;
}

const ScrollBadge = ({ children, progress, range, className, style }: ScrollBadgeProps) => {
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
  
  // ─── THE LOCK SCREEN STATE ───
  const [isLockScreenDismissed, setIsLockScreenDismissed] = useState(false);

  // ─── ANIMATION VARS ───
  const arrowVariants = {
    initial: { y: 0 },
    animate: {
      y: [0, -15, 0],
      transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
    },
  };

  // ─── SCROLL LISTENER FOR THE STICKY TEXT REVEAL ───
  const textRevealSectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: textRevealProgress } = useScroll({
    target: textRevealSectionRef,
    // Tracks the entire height of the 300vh container
    offset: ["start start", "end end"], 
  });

  // ─── LOCK SCREEN SWIPE/SCROLL LISTENER ───
  useEffect(() => {
    if (isLockScreenDismissed) return;

    // Lock the body scroll so they can't scroll the background while the lock screen is up
    document.body.style.overflow = "hidden";

    const handleInteraction = (e: Event) => {
      if (e.type === 'wheel') {
        if ((e as WheelEvent).deltaY > 10) setIsLockScreenDismissed(true);
      } else if (e.type === 'touchstart') {
        let startY = (e as TouchEvent).touches[0].clientY;
        const handleTouchMove = (moveEvent: TouchEvent) => {
          let currentY = moveEvent.touches[0].clientY;
          // If they swipe UP by more than 20 pixels, dismiss the screen
          if (startY - currentY > 20) {
            setIsLockScreenDismissed(true);
            window.removeEventListener('touchmove', handleTouchMove);
          }
        };
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
      }
    };

    window.addEventListener('wheel', handleInteraction, { passive: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      document.body.style.overflow = ""; // Restore scroll when dismissed
    };
  }, [isLockScreenDismissed]);


  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const faqs: FAQ[] = [
    { id: 1, question: "What is Dormer's?", answer: "Dormer's is your friendly dorm meal savior..." },
    { id: 2, question: "What kind of food do you serve?", answer: "Everything except disappointment..." },
    { id: 3, question: "Do you have vegetarian options?", answer: "Yes! We love our veggie lovers..." },
    { id: 4, question: "Can I customize my meals?", answer: "We’re not a “Build-a-Biryani” workshop..." },
    { id: 5, question: "How does the subscription work?", answer: "It’s Netflix, but for food..." },
    { id: 6, question: "How much does it cost?", answer: "Cheaper than eating out..." },
  ];

  const toggleFAQ = (id: number) => {
    setOpenFAQ(openFAQ === id ? null : id);
  };

  return (
    <div className={`min-h-screen ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}>
      
      {/* ─── THE SWIPE-UP LOCK SCREEN OVERLAY ─── */}
      <motion.div 
        className="fixed inset-0 z-[200] bg-[#1E3A4F] flex flex-col items-center justify-start pt-10 px-4"
        initial={{ y: 0 }}
        animate={{ y: isLockScreenDismissed ? "-100%" : "0%" }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }} // Super smooth heavy ease (Apple style)
      >
        <div className="absolute top-10 left-3 md:relative md:w-[240px] md:h-[212px] mb-6">
          <div className="relative w-[195px] h-[195px] md:w-full md:h-full">
            <Image src="/logo.png" alt="Dormer's Logo" fill className="object-contain" priority />
          </div>
        </div>

        <div className="absolute top-[220px] left-0 md:relative md:top-auto md:mt-12 w-full flex flex-col gap-[1px] md:items-center">
          <p className="text-[64px] leading-[77px] pl-[33px] md:pl-0 main_page_meal text-white">MEALS</p>
          <p className="text-[64px] leading-[78px] pl-[33px] md:pl-0" style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#213c4c", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>THAT</p>
          <div className="text-[64px] leading-[78px] pl-[34px] md:pl-0 flex md:justify-center">
            <div className="flex items-center space-x-1">
              <span style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#213c4c", textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff" }}>DON</span>
              <span className="relative w-[20px] h-[40px] top-[-8px]"><Image src="/images/main_page_icon.svg" alt="'" fill className="object-contain" priority /></span>
              <span style={{ fontFamily: "Montserrat", fontWeight: 900, WebkitTextStroke: "1px #fff", WebkitTextFillColor: "transparent" }}>T SUCK</span>
            </div>
          </div>
        </div>

        {/* Bouncing Double Up-Chevron */}
        <div className="absolute bottom-12 w-full flex justify-center">
          <motion.div
            variants={arrowVariants}
            initial="initial"
            animate="animate"
            className="flex flex-col items-center justify-center cursor-pointer opacity-80"
            onClick={() => setIsLockScreenDismissed(true)} // Click to dismiss
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mb-[-22px]">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            <p className="text-[#FF6B00] mt-2 font-bold text-xs uppercase tracking-widest font-[Montserrat]">Swipe Up</p>
          </motion.div>
        </div>
      </motion.div>
      {/* ──────────────────────────────────────────────────────── */}


      {/* ─── STICKY PINNED TYPEWRITER SECTION ─── */}
      {/* This parent container is 300vh tall. 
        It forces the user to scroll a long way before moving to the next section. 
      */}
      <div ref={textRevealSectionRef} className="relative h-[300vh] w-full bg-[#1E3A4F] z-10">
        
        {/* The 'sticky' class locks this child inside the screen until the 300vh parent runs out of room! */}
        <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center px-2 sm:px-4 overflow-hidden">
          
          <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12 w-full">
            {/* First Section */}
            <div className="text-center">
              <h1 className="text-white text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2 leading-none" style={{ fontFamily: "'Typo Round Bold Demo', sans-serif" }}>
                <ScrollText text="DORMERS' IS FOR" progress={textRevealProgress} range={[0.0, 0.2]} />
              </h1>
              <div className="relative inline-flex items-center gap-2 sm:gap-4 mt-2">
                <h2 className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl text-[#213c4c] mt-0 leading-none" style={{ fontFamily: "Montserrat", fontWeight: 900, textTransform: "uppercase", textShadow: "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA" }}>
                  <ScrollText text="STUDENTS" progress={textRevealProgress} range={[0.2, 0.35]} />
                </h2>
                <ScrollBadge progress={textRevealProgress} range={[0.35, 0.4]} className="bg-[#EEE9DA] text-[#1E3A4F] px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-base rotate-[15.74deg] absolute -right-15 sm:-right-12 lg:right-[-117px]" style={{ fontFamily: "Typo Round Bold Demo" }}>
                  ONLY
                </ScrollBadge>
              </div>
            </div>

            {/* Second Section */}
            <div className="relative text-center">
              <ScrollBadge progress={textRevealProgress} range={[0.4, 0.45]} className="bg-[#FF7F00] text-[#1E3A4F] flex items-center justify-center absolute rotate-[-11.13deg] badge-label lg:!text-[14px]">
                NO
              </ScrollBadge>
              <h1 className="text-white text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2 leading-none" style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", textTransform: "uppercase" }}>
                <ScrollText text="Overpriced Takeouts" progress={textRevealProgress} range={[0.45, 0.65]} />
              </h1>
            </div>

            {/* Third Section */}
            <div className="relative text-center">
              <h2 className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl text-[#213c4c] leading-none" style={{ fontFamily: "Montserrat", fontWeight: 900, textTransform: "uppercase", textShadow: "-1px -1px 0 #EEE9DA, 1px -1px 0 #EEE9DA, -1px 1px 0 #EEE9DA, 1px 1px 0 #EEE9DA" }}>
                <ScrollText text="NO TIME WASTED" progress={textRevealProgress} range={[0.65, 0.8]} />
              </h2>
              <ScrollBadge progress={textRevealProgress} range={[0.8, 0.85]} className="bg-[#031624] text-[#FFFFFF] px-3 sm:px-2 py-1 rounded-full text-[10px] sm:text-base absolute right-4 sm:right-35 top-[-10px] rotate-[11.13deg]" style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700 }}>
                COOKING
              </ScrollBadge>
            </div>

            {/* Bottom Text */}
            <p className="text-white text-[12px] sm:text-[24px] md:text-lg lg:text-xl text-center flex justify-center flex-wrap pt-8" style={{ fontFamily: "Typo Round Bold Demo", fontWeight: 700 }}>
              <ScrollText text="Just good, affordable food, delivered to your dorm" progress={textRevealProgress} range={[0.85, 0.98]} />
            </p>
          </div>
        </div>
      </div>
      {/* ─────────────────────────────────────────────────────────────────── */}


      {/* Repeating Text Banner */}
      <div className={`relative w-full h-18 overflow-hidden ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"}`}>
        <div className="flex flex-col gap-2 w-full h-full py-1">
          <div className="relative flex whitespace-nowrap">
            <div className="marquee">
              {[...Array(12)].map((_, i) => (
                <span key={i} className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"} mx-2`} style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "18px", fontWeight: 700, transform: "rotate(-8.84deg)", opacity: 0.54 }}>
                  DORMERS&apos;
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex whitespace-nowrap">
            <div className="marquee" style={{ animationDelay: "-7s" }}>
              {[...Array(12)].map((_, i) => (
                <span key={i} className={`inline-block ${theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"} mx-2`} style={{ fontFamily: "'Typo Round Bold Demo', sans-serif", fontSize: "18px", fontWeight: 700, transform: "rotate(-8.84deg)", opacity: 0.54 }}>
                  DORMERS&apos;
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className={`relative w-full lg:py-16 py-[48px] ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"} overflow-hidden`}>
        {/* Background Image */}
        <div className="absolute inset-0 w-full h-full block md:hidden">
          <Image src="/images/sec2bg.png" alt="Background Pattern" className="w-full h-full object-cover opacity-[0.4]" fill priority />
        </div>
        <div className="absolute inset-0 w-full h-full md:block hidden">
          <Image src="/images/howit'sworkbackgroundimage.svg" alt="Background Pattern" className="w-full h-full object-cover opacity-[0.7]" fill priority />
        </div>
        
        {/* Content */}
        <div className="relative container mx-auto px-4 top-[-14px]">
          <div className="flex items-center justify-center gap-4 mb-6">
            <h2 className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} text-3xl sm:text-4xl font-bold text-center`} style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, fontSize: "20px" }}>HOW IT WORKS</h2>
          </div>
          <div className="max-w-md mx-auto space-y-6 md:max-w-full">
            <div className="flex flex-col md:flex-row gap-5 md:justify-center">
              {/* Cards (Abbreviated to keep the code concise for you, just copy your normal cards in here) */}
              <div ref={qualifyCardRef} className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative">
                <div className="absolute inset-0 bg-[#031624] rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg"><h3 className="text-white font-bold">QUALIFY</h3></div>
              </div>
              <div className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative">
                 <div className="absolute inset-0 bg-[#EEE9DA] rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg"><h3 className="text-[#1E3A4F] font-bold">SUBSCRIBE</h3></div>
              </div>
              <div className="w-[72%] h-[165px] mx-auto [perspective:1000px] cursor-pointer group relative">
                 <div className="absolute inset-0 bg-[#FF6B00] rounded-2xl p-6 flex flex-col items-center justify-center shadow-lg"><h3 className="text-white font-bold">FEAST</h3></div>
              </div>
            </div>

            {/* Qualify Button */}
            <div className="flex justify-center mb-[-35px] mt-2">
              <a href="https://vip.dormers.ae" target="_blank" rel="noopener noreferrer" className="bg-[#031624] text-[#FFFFFF] font-bold py-1 px-3 rounded-full text-lg transition-all hover:scale-105 shadow-[1px_2px_0px_0px_#EEE9DA] text-[12px]">
                🔥 Secure My Spot
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Section */}
      <div id="menu" className={`relative w-full py-0 px-0 ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"}`}>
        <Menu />
      </div>

      {/* Testimonials Section */}
      <div id="testimonials" className="relative w-full lg:pt-[40px] py-[24px] pb-0">
        <div className="">
          <div className="flex items-center justify-between lg:max-w-[987px] mx-auto px-4">
            <h2 className={`text-[20px] font-bold lg:text-[30px] pb-[24px] ${theme === "light" ? "text-[#1E3A4F]" : "text-white"}`} style={{ fontFamily: "Montserrat", fontWeight: 500 }}>
              VOICES OF DELIGHT
            </h2>
          </div>
          <div className="mx-auto bg-[#031624] py-6 lg:hidden block"><div className="lg:max-w-[987px] mx-auto"><TestimonialsBubbles /></div></div>
          <div className="mx-auto bg-[#031624] py-6 lg:block hidden"><div className="lg:max-w-[987px] mx-auto"><TestmonialsDesktop /></div></div>
        </div>
      </div>

      {/* FAQ Section with Bottom Curtain Reveal */}
      <section id="faq">
        <div ref={faqRef} className={`relative w-full ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"}`}>
          <div className={` ${theme === "light" ? "curtleLightheight" : "curtleheightfaq"} `} style={{ bottom: 0, left: 0, width: "100%", backgroundColor: "#22394A", borderTopLeftRadius: "60px", borderTopRightRadius: "60px", borderBottomLeftRadius: "40px", borderBottomRightRadius: "40px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", zIndex: 10, position: "relative" }}>
            <div className="w-full py-[24px] px-4 lg:pt-[40px] overflow-hidden BoxContainer_FAQBOX" style={{ backgroundColor: theme === "light" ? "#EEE9DA" : "#22394A", borderBottomLeftRadius: "40px", borderBottomRightRadius: "40px" }}>
              <div className="md:max-w-[987px] md:mx-auto">
                <h2 className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} text-3xl sm:text-4xl font-bold mb-8 text-left`} style={{ fontFamily: "Montserrat", fontWeight: 500, fontSize: "20px" }}>FAQ&apos;S</h2>
                <AnimatePresence mode="wait">
                  {!showAll ? (
                    <motion.div key="collapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 gap-4">
                      {faqs.slice(0, 3).map((faq, index) => renderFaqCard(faq, index, openFAQ, toggleFAQ, theme))}
                    </motion.div>
                  ) : (
                    <motion.div key="expanded" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="relative">
                      {/* ... close button logic ... */}
                    </motion.div>
                  )}
                </AnimatePresence>
                {!showAll && (
                  <div className="mt-6 flex justify-center">
                    <button onClick={() => setShowAll(true)} className={`flex items-center gap-2 text-sm animate-pulse ${theme === "light" ? "text-[#22394A]" : "text-white/80"}`}>
                      <span style={{ fontFamily: "Montserrat", fontWeight: 600 }}>View All</span>
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
