import { useState, useRef, useEffect } from "react";
// import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

// interface TestimonialsBubblesProps {
//   testimonialImages: string[];
// }

export default function TestimonialsBubbles() {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [scrollPosition, setScrollPosition] = useState(0);

  // interface TestimonialsBubblesProps {
  //   testimonialImages: string[];
  // }

  const messages = [
  {
    id: 1,
    from: "bot",
    text: "Some of the best homemade food! Both delicious and healthy.",
  },
  {
    id: 2,
    from: "user",
    text: "I got my free meal today! 🎉",
  },
  {
    id: 3,
    from: "bot",
    text: "Okay so, I loved the food. It was amazing and everything simply balanced 🎉",
  },
  {
    id: 4,
    from: "user",
    text: "Mann, It's Soooo Gooooodddddd. I shared it with my friends. They all loved it 🎉",
  },
  {
    id: 5,
    from: "bot",
    text: "Thanks for sharing the love! 😊",
  },
  {
    id: 6,
    from: "user",
    text: "I was a bit skeptical, but wow—this exceeded my expectations!",
  },
  {
    id: 7,
    from: "bot",
    text: "That's great to hear! We love surprising people with quality 🥗",
  },
  {
    id: 8,
    from: "user",
    text: "My mom tried it too and she was impressed 😍",
  },
  {
    id: 9,
    from: "bot",
    text: "Mom-approved? That's the ultimate compliment! 🏆",
  },
  {
    id: 10,
    from: "user",
    text: "Is there a way to schedule meals in advance?",
  },
  {
    id: 11,
    from: "bot",
    text: "Absolutely! You can schedule up to a week ahead through the app 📅",
  },
  {
    id: 12,
    from: "user",
    text: "Perfect! That'll save me a lot of time every morning.",
  },
  {
    id: 13,
    from: "bot",
    text: "Exactly the plan — good food, no hassle 😉",
  },
  {
    id: 14,
    from: "user",
    text: "Do you offer vegan options too?",
  },
  {
    id: 15,
    from: "bot",
    text: "Yes! We have an entire section dedicated to vegan-friendly meals 🌱",
  },
  {
    id: 16,
    from: "user",
    text: "Love that. The variety is honestly impressive.",
  },
  {
    id: 17,
    from: "bot",
    text: "We're so glad you're enjoying it! More exciting dishes coming soon 🍽️",
  },
  {
    id: 18,
    from: "user",
    text: "Keep ‘em coming! My lunch breaks are happier now 😄",
  },
  {
    id: 19,
    from: "bot",
    text: "We’re here to make every meal feel like home ❤️",
  },
  {
    id: 20,
    from: "user",
    text: "Appreciate the support and service. Keep it up!",
  },
];


  // Auto-scroll effect when expanded
  useEffect(() => {
    if (!isExpanded || !scrollContainerRef.current) return;

    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        const maxScroll = scrollHeight - clientHeight;

        setScrollPosition((prev) => {
          const nextPosition = prev + 1;
          if (nextPosition >= maxScroll) return 0;
          return nextPosition;
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isExpanded]);

  // Apply scroll position
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  // Reset scroll position on collapse
  useEffect(() => {
    if (!isExpanded) {
      setScrollPosition(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isExpanded]);

  return (
    <div
      className={`relative  ${
        isExpanded ? "max-h-[400px] overflow-y-scroll" : ""
      }`}
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4 items-center cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            {/* Chat Bubble 1 */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`max-w-[200px] p-4 rounded-2xl ${
                theme === "light"
                  ? "bg-[#1E3A4F] text-white"
                  : "bg-[#EEE9DA] text-[#1E3A4F]"
              } self-start ml-8 relative animate-float`}
            >
              <p
                className="text-sm font-medium"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 600,
                  lineHeight: "100%",
                }}
              >
                I got my free meal today! 🎉
              </p>
              <div
                className={`absolute -bottom-2 left-4 w-4 h-4 transform rotate-45 ${
                  theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                }`}
              />
            </motion.div>

            {/* Chat Bubble 2 */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={`max-w-[200px] p-4 rounded-2xl ${
                theme === "light"
                  ? "bg-[#1E3A4F] text-white"
                  : "bg-[#EEE9DA] text-[#1E3A4F]"
              } self-end mr-8 relative animate-float`}
              style={{ animationDelay: "0.2s" }}
            >
              <p
                className="text-sm font-medium"
                style={{
                  fontFamily: "Montserrat",
                  fontWeight: 600,
                  lineHeight: "100%",
                }}
              >
                Very good and tasty food! 😋
              </p>
              <div
                className={`absolute -bottom-2 right-4 w-4 h-4 transform rotate-45 ${
                  theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                }`}
              />
            </motion.div>

            {/* See more indicator – smaller circle and arrow */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 0.6 }}
              className="text-center mt-4"
            >
              <div
                className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center border ${
                  theme === "light" ? "border-[#EEE9DA]" : "border-[#EEE9DA]"
                }`}
                style={{
                  lineHeight: 0, // ensures tight vertical alignment
                }}
              >
                <svg
                  className="w-4 h-4 animate-bounce"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke={theme === "light" ? "#EEE9DA" : "#EEE9DA"}
                  style={{ marginTop: "1px" }} // nudges the icon down slightly
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          isExpanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-4 items-center cursor-pointer relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsExpanded(false)}
                className={`absolute top-4 right-4 z-10 p-2 rounded-full ${
                  theme === "light"
                    ? "bg-[#1E3A4F] text-white"
                    : "bg-[#EEE9DA] text-[#1E3A4F]"
                } hover:opacity-80 transition-opacity`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>

              {/* Scrollable Testimonials */}
              {/* <div
                ref={scrollContainerRef}
                className="max-h-[70vh] overflow-y-auto rounded-3xl"
                style={{ scrollBehavior: "smooth" }}
              >
                <div className="flex flex-col gap-6">
                  {testimonialImages.map((img, i) => (
                    <motion.div
                      key={img}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex ${
                        i % 2 === 0 ? "justify-start" : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[300px] rounded-2xl overflow-hidden ${
                          theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                        } shadow-lg`}
                      >
                        <Image
                          src={`/testimonials/${img}`}
                          alt={`Testimonial ${i + 1}`}
                          width={300}
                          height={300}
                          className="w-full h-auto"
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
          
              </div> */}
              {messages.map((msg, index) => (
                <motion.div
                  key={`${index}`} // forces re-animation
                  initial={{
                    opacity: 0,
                    x: msg.from === "user" ? 100 : -100,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: msg.from === "user" ? -100 : 100 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className={`max-w-[250px] p-4 rounded-2xl ${
                    theme === "light"
                      ? "bg-[#1E3A4F] text-white"
                      : "bg-[#EEE9DA] text-[#1E3A4F]"
                  } ${
                    msg.from === "user" ? "self-end mr-8" : "self-start ml-8"
                  } relative`}
                >
                  <p
                    className="text-sm font-medium"
                    style={{
                      fontFamily: "Montserrat",
                      fontWeight: 600,
                      lineHeight: "120%",
                    }}
                  >
                    {msg.text}
                  </p>
                  <div
                    className={`absolute -bottom-2 ${
                      msg.from === "user" ? "right-4" : "left-4"
                    } w-4 h-4 transform rotate-45 ${
                      theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                    }`}
                  />
                </motion.div>
              ))}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
