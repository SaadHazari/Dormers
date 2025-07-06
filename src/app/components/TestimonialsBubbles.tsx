import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";


const messages = [
  {
    id: 1,
    from: "bot",
    text: "Some of the best homemade food! Both delicious and healthy",
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
    text: "Mann, It's Soooo Gooooodddddd. I shared it with my friends. They all loved 🎉",
  },
  {
    id: 5,
    from: "bot",
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
    }, 3000);
    return () => clearInterval(interval);
  }, [groupedMessages.length]);

  return (
    <div className="relative bg-[#031624] py-6 w-screen overflow-hidden -mx-[calc((100vw_-_100%)/2)]">
      <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center">
        <AnimatePresence mode="wait">
          {groupedMessages[currentGroup].map((msg) => (
            <motion.div
              key={`${msg.id}-${currentGroup}`} // forces re-animation
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
        </AnimatePresence>
      </div>
    </div>
  );
}
