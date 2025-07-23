"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import ChatWindow from "./ChatWindow";
import Menu from "@/app/components/Menu";
import { motion, AnimatePresence } from "framer-motion";
// import { IoIosArrowDown } from 'react-icons/io';
import FormModal from "@/app/components/FormModal";
import OrderForm from "@/app/components/OrderForm";
import { useTheme } from "next-themes";
import TestimonialsBubbles from "@/app/components/TestimonialsBubbles";
import TestmonialsDesktop from "@/app/components/TestmonialsDesktop";

interface FAQ {
  id: number;
  question: string;
  answer: React.ReactNode;
}

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
  // const [isFeastFlipped, setIsFeastFlipped] = useState(false);

  // const lastScrollY = useRef(0);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Add chat event listener
  useEffect(() => {
    const handleChatOpen = () => setIsChatOpen(true);
    window.addEventListener("open-chat", handleChatOpen);
    return () => window.removeEventListener("open-chat", handleChatOpen);
  }, []);

  // Handle scroll-based card flips on mobile

  //   const handleCardClick = (id: string) => {
  //   setFlippedCard(id);
  //   setTimeout(() => {
  //     setFlippedCard(null);
  //   }, 1500);
  // };
  // useEffect(() => {
  //   if (!isMobile) return;

  //   const handleScroll = () => {
  //     const currentScrollY = window.scrollY;
  //     const scrollingDown = currentScrollY > lastScrollY.current;
  //     lastScrollY.current = currentScrollY;

  //     const cards = [
  //       { ref: qualifyCardRef, id: 'qualify' },
  //       { ref: subscribeCardRef, id: 'subscribe' },
  //       { ref: feastCardRef, id: 'feast' }
  //     ];

  //     cards.forEach(({ ref, id }) => {
  //       if (!ref.current) return;
  //       const rect = ref.current.getBoundingClientRect();
  //       const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;

  //       if (isInView) {
  //         if (scrollingDown) {
  //           setFlippedCard(id);
  //           setTimeout(() => setFlippedCard(null), 1500);
  //         }
  //       }
  //     });
  //   };

  //   window.addEventListener('scroll', handleScroll);
  //   return () => window.removeEventListener('scroll', handleScroll);
  // }, [isMobile]);

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

  // Testimonial image filenames
  // const testimonialImages = [
  //   "screenshot1.jpg",
  //   "screenshot2.jpg",
  //   "screenshot3.png",
  //   "screenshot4.png",
  //   "screenshot5.png",
  //   "screenshot6.png",
  //   "screenshot7.png",
  //   "screenshot8.png",
  //   "screenshot9.png",
  //   "screenshot10.png",
  //   "screenshot11.png",
  //   "screenshot12.png",
  //   "screenshot13.png",
  //   "screenshot14.png",
  //   "screenshot15.png",
  //   "screenshot16.png",
  //   "screenshot17.png",
  //   "screenshot18.png",
  //   "screenshot19.png",
  //   "screenshot20.png",
  //   "screenshot21.png",
  //   "screenshot22.png",
  //   "screenshot23.png",
  //   "screenshot24.png",
  //   "screenshot25.png",
  //   "ss1.png",
  //   "ss2.png",
  //   "ss3.png",
  //   "ss4.png",
  // ];

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

  const renderFaqCard = (
    faq: FAQ,
    index: number,
    openFAQ: number | null,
    toggleFAQ: (id: number) => void
    // theme: string | undefined
  ) => {
 
    // const colorSet = ["#EEE9DA", "#FF8A00", "#0A1B26"];
    // const colorSet = ["#1E3A4F", "#FF8A00", "#0A1B26"];
    const colorSet =
      theme === "light"
        ? ["#1E3A4F", "#FF8A00", "#0A1B26"]
        : ["#EEE9DA", "#FF8A00", "#0A1B26"];

    const color = colorSet[index % colorSet.length];
    const isOpen = openFAQ === faq.id;
    const isLight = color === "#EEE9DA";

    return (
      <div
        key={faq.id}
        className="rounded-xl overflow-hidden transition-all duration-300 w-full mx-auto lg:w-[100%]"
        style={{ backgroundColor: isOpen ? "#EEE9DA" : color }}
      >
        <button
          onClick={() => toggleFAQ(faq.id)}
          className="w-full px-6 py-4 flex items-center justify-between text-left"
        >
          <span
            className={`font-bold text-base sm:text-lg ${
              isOpen
                ? "text-[#22394A]"
                : isLight
                ? "text-[#22394A]"
                : "text-white"
            }`}
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {faq.question}
          </span>
          <span
            className={`text-xl font-bold ${
              isOpen
                ? "text-[#22394A]"
                : isLight
                ? "text-[#22394A]"
                : "text-white"
            }`}
          >
            {isOpen ? "−" : "+"}
          </span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-6 pb-4"
            >
              <div
                className="text-[#22394A]"
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 300,
                  lineHeight: "130%",
                  letterSpacing: "0.5px",
                  fontSize: "12px",
                }}
              >
                {faq.answer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div
      className={`min-h-screen ${
        theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
      }`}
    >
      {/* Hero Section */}
      <div
        id="hero"
        className="container mx-auto px-2 sm:px-4 pt-[106px] pb-[24px] md:pt-[137px] md:pb-[40px]"
      >
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4">
            {/* First Section */}
            <div className="text-center mb-[4px]">
              <h1
                className={`${
                  theme === "light" ? "text-[#1E3A4F]" : "text-white"
                } text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2`}
                style={{
                  fontFamily: "'Typo Round Bold Demo', sans-serif",
                  lineHeight: "1",
                }}
              >
                DORMERS&apos; IS FOR
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
                  STUDENTS
                </h2>
                <span
                  className={`${
                    theme === "light"
                      ? "bg-[#1E3A4F] text-white"
                      : "bg-[#EEE9DA] text-[#1E3A4F]"
                  }  top-4 px-2 sm:px-3 py-1 sm:py-1 rounded-full text-[10px] sm:text-base transition-all duration-300 hover:scale-110 animate-bounce rotate-[15.74deg] absolute -right-15 sm:-right-12 lg:right-[-117px]`}
                  style={{ width: "33%" }}
                >
                  ONLY
                </span>
              </div>
            </div>

            {/* Second Section */}
            <div className="relative text-center mt-2 sm:mt-2 mb-[4px]">
              <span className="bg-[#FF7F00] text-[#1E3A4F] flex items-center justify-center absolute transition-all duration-300 hover:scale-110 animate-bounce rotate-[-11.13deg] badge-label lg:text-[14px]">
                NO
              </span>

              <h1
                className={`${
                  theme === "light" ? "text-[#1E3A4F]" : "text-white"
                } text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-1 sm:mb-2`}
                style={{
                  fontFamily: "'Typo Round Bold Demo', sans-serif",
                  textTransform: "uppercase",
                  lineHeight: "1",
                }}
              >
                Overpriced Takeouts
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
                NO TIME WASTED
              </h2>
              <span
                className="bg-[#031624] text-[#FFFFFF] px-3 sm:px-2 py-1 rounded-full text-[10px] sm:text-base absolute right-4 sm:right-35 top-1 transition-all duration-300 hover:scale-110 animate-bounce rotate-[11.13deg]"
                style={{
                  fontFamily: "Typo Round Bold Demo",
                  fontWeight: 700,
                }}
              >
                COOKING
              </span>
            </div>

            {/* Bottom Text */}
            <p
              className={`text-[12px] sm:text-[24px] md:text-lg lg:text-xl ${
                theme === "light" ? "text-[#1E3A4F]" : "text-white"
              } text-center`}
              style={{
                fontFamily: "Typo Round Bold Demo",
                fontWeight: 700,
              }}
            >
              Just good, affordable food, delivered to your dorm
            </p>
          </div>
        </div>
      </div>

      {/* Repeating Text Banner */}
      <div
        className={`relative w-full h-18 overflow-hidden ${
          theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
        }`}
      >
        <div className="flex flex-col gap-2 w-full h-full py-1">
          {/* Row 1 */}
          <div className="relative flex whitespace-nowrap">
            <div className="marquee">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
          <div className="relative flex whitespace-nowrap">
            <div className="marquee" style={{ animationDelay: "-3s" }}>
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
        className={`relative w-full lg:py-16 py-[48px] ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
        } overflow-hidden`}
      >
        {/* Background Image */}
        <div className="absolute inset-0 w-full h-full">
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
        {/* Content */}
        <div className="relative container mx-auto px-4 top-[-14px]">
          <div className="flex items-center justify-center gap-4 mb-6">
            <h2
              className={`${
                theme === "light" ? "text-[#1E3A4F]" : "text-white"
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
                // onClick={() =>
                //   setFlippedCard(flippedCard === "qualify" ? null : "qualify")
                // }
                onClick={() => setIsQualifyFlipped((prev) => !prev)}
              >
                <div
                  className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${
                    isQualifyFlipped ? "[transform:rotateY(180deg)]" : ""
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
                    <div className="absolute bottom-4 right-[50%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* <span>Click to flip</span> */}
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
                      {/* Top Spacer */}
                      <div className="h-[24px]"></div>

                      {/* Icon + Text Block */}
                      <div className="flex flex-col items-start space-y-3">
                        {/* Icon */}
                        <Image
                          src="/images/iconinfo1.svg"
                          alt="Info Icon"
                          width={47.84}
                          height={34.28}
                          className="object-contain"
                        />

                        {/* Text */}
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

                      {/* Bottom Spacer */}
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
                // onClick={() =>
                //   setFlippedCard(flippedCard === "subscribe" ? null : "subscribe")
                // }
                onClick={() => setIsSubscribeFlipped((prev) => !prev)}
              >
                <div
                  className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${
                    isSubscribeFlipped ? "[transform:rotateY(180deg)]" : ""
                  }
                } ${!isMobile && "hover:scale-105"}`}
                >
                  {/* Front */}
                  <div
                    className={`absolute inset-0 ${
                      theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                    } rounded-2xl p-8 flex flex-col items-center justify-center [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4 ${
                        theme === "light"
                          ? "bg-[#EEE9DA] text-[#1E3A4F]"
                          : "bg-[#1E3A4F] text-white"
                      }`}
                    >
                      2
                    </span>
                    <h3
                      className={`${
                        theme === "light" ? "text-white" : "text-[#1E3A4F]"
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
                    {/* Click indicator */}
                    <div className="absolute bottom-4 right-[50%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* <span>Click to flip</span> */}
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
                    className={`absolute inset-0 ${
                      theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                    } rounded-2xl px-5 py-4 [transform:rotateY(180deg)] [backface-visibility:hidden] shadow-lg group-hover:shadow-2xl transition-all`}
                  >
                    <div className="flex flex-col justify-between h-full">
                      {/* Top Spacer */}
                      <div className="h-[24px]"></div>

                      {/* Icon + Text Block */}
                      <div className="flex flex-col items-start space-y-3">
                        <Image
                          src="/images/iconbell.svg"
                          alt="Info Icon"
                          width={27.16}
                          height={24}
                          className={`object-contain ${
                            theme === "light"
                              ? "filter invert brightness-0 sepia saturate-100 hue-rotate-[10deg] contrast-105"
                              : ""
                          }`}
                        />

                        <h4
                          className={`${
                            theme === "light" ? "text-white" : "text-[#1E3A4F]"
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

                      {/* Bottom Spacer */}
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
                  className={`relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] ${
                    flippedCard === "feast" ? "[transform:rotateY(180deg)]" : ""
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
                    {/* Click indicator */}
                    <div className="absolute bottom-4 right-[50%] text-white/50 flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* <span>Click to flip</span> */}
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
                      {/* Top Spacer */}
                      <div className="h-[24px]"></div>

                      {/* Icon + Text Block */}
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

                      {/* Bottom Spacer */}
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
                href="https://forms.dormers.ae"
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
                SEE IF YOU QUALIFY
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Section */}
      <div
        id="menu"
        className={`relative w-full py-0 px-0 ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
        }`}
      >
        <Menu />
      </div>

      {/* Repeating Text Banner (after menu) */}
      <div
        className={`relative w-full h-18 overflow-hidden ${
          theme === "light" ? "bg-[#1E3A4F] mt-8 sm:mt-4" : "bg-[#EEE9DA]"
        }`}
      >
        <div className="flex flex-col gap-2 w-full h-full py-1">
          {/* Row 1 */}
          <div className="relative flex whitespace-nowrap">
            <div className="marquee">
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
          <div className="relative flex whitespace-nowrap">
            <div className="marquee" style={{ animationDelay: "-3s" }}>
              {[...Array(12)].map((_, i) => (
                <span
                  key={i}
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
                  className={`inline-block ${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#1E3A4F]"
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
      {/* <div id="testimonials" className="relative w-full py-8 pb-[0px]">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between max-w-4xl mx-auto mb-8">
            <h2
              className={`text-3xl sm:text-4xl font-bold ${
                theme === "light" ? "text-[1E3A4F]" : "text-white"
              }`}
              style={{
                fontFamily: "Montserrat",
                fontWeight: 500,
                lineHeight: "100%",
                letterSpacing: "0",
                fontSize: "18px",
              }}
            >
              VOICES OF DELIGHT
            </h2>
          </div>

          <div className="max-w-4xl mx-auto">
            <TestimonialsBubbles />
          </div>
        </div>
      </div> */}
      <div
        id="testimonials"
        className="relative w-full lg:pt-[40px] py-[24px] pb-0"
      >
        <div className="">
          <div className="flex items-center justify-between lg:max-w-[987px] mx-auto  px-6">
            <h2
              className={`text-[20px]  font-bold lg:text-[30px] pb-[24px] lg:pb-[24px] ${
                theme === "light" ? "text-[1E3A4F]" : "text-white"
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
      <div
        id="faq"
        ref={faqRef}
        className={`relative w-full  ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"
        }`}
      >
        <div
          className={` ${
            theme === "light" ? "curtleLightheight" : "curtleheightfaq"
          } `}
          style={{
            bottom: 0,
            left: 0,
            width: "100%",
            backgroundColor: "#22394A",
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
                className={`${
                  theme === "light" ? "text-[#1E3A4F]" : "text-white"
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
                        }, 200); // slight delay so collapse animation completes
                      }}
                      className={`absolute top-[-48px] right-0 z-10 p-2 rounded-full  hover:opacity-80 transition-opacity`}
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
                          renderFaqCard(faq, index, openFAQ, toggleFAQ)
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
                        renderFaqCard(faq, index, openFAQ, toggleFAQ)
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
                    className={`flex items-center gap-2 text-sm transition-opacity animate-pulse ${
                      theme === "light" ? "text-[#22394A]" : "text-white/80"
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
      </div>

      {/* About Us Section */}

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
