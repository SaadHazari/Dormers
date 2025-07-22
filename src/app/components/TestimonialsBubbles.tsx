import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";

const messages = [
  {
    id: 1,
    from: "bot",
    name: "Angela",
    rating: 5,
    text: "Some of the best homemade food! Both delicious and healthy",
  },
  {
    id: 2,
    from: "user",
    name: "You",
    rating: 5,
    text: "I got my free meal today! 🎉",
  },
  {
    id: 3,
    from: "bot",
    name: "Ramesh",
    rating: 4,
    text: "Okay so, I loved the food. It was amazing and everything simply balanced 🎉",
  },
  {
    id: 4,
    from: "user",
    name: "You",
    rating: 5,
    text: "Mann, It's Soooo Gooooodddddd. I shared it with my friends. They all loved 🎉",
  },
  {
    id: 5,
    from: "bot",
    name: "Priya",
    rating: 4,
    text: "Thanks for sharing the love! 😊",
  },
];

export default function TestimonialsBubbles() {
  const { theme } = useTheme();
  const [currentGroup, setCurrentGroup] = useState(0);

  const groupedMessages = useMemo(() => {
    const result = [];
    for (let i = 0; i < messages.length; i += 2) {
      result.push(messages.slice(i, i + 2));
    }
    return result;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [groupedMessages.length]);

  return (
    <div className="relative bg-[#031624] py-6 w-screen overflow-hidden -mx-[calc((100vw_-_100%)/2)]">
      <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center">
        <AnimatePresence mode="wait">
          {groupedMessages[currentGroup].map((msg) => (
            <motion.div
              key={`${msg.id}-${currentGroup}`}
              initial={{ opacity: 0, x: msg.from === "user" ? 100 : -100 }}
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
              {/* Name & Stars */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1E3A4F] flex items-center justify-center text-white text-xs font-bold uppercase">
                    {msg.name?.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold">{msg.name}</span>
                </div>
                <div className="flex gap-0.5">
                  {[...Array(msg.rating)].map((_, i) => (
                    <Image
                      src="/images/starticon.svg"
                      alt=""
                      width={12}
                      height={12}
                      className="w-[8px] h-[8px]"
                      style={{
                        imageRendering: "crisp-edges",
                        backgroundRepeat: "repeat",
                      }}
                      priority
                    />
                  ))}
                </div>
              </div>

              {/* Message Text */}
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

              {/* Message tail */}
              <div
                className={`absolute -bottom-2 ${
                  msg.from === "user" ? "right-4" : "left-4"
                } w-4 h-4 transform rotate-45 ${
                  theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                }`}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
