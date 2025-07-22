"use client";
import React, { useEffect, useMemo, useState } from "react";
import { FaStar } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

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

const TestimonialsDesktop = () => {
  const { theme } = useTheme();
  const [currentGroup, setCurrentGroup] = useState(0);

  const groupedMessages = useMemo(() => {
    const result = [];
    for (let i = 0; i < messages.length; i += 3) {
      result.push(messages.slice(i, i + 3));
    }
    return result;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [groupedMessages.length]);

  const positions = ["top-0 left-0", "top-10 right-0", "bottom-0 left-1/3"];

  return (
    <div className="w-full py-12 flex justify-center bg-[#031624]">
      <div className="relative max-w-[987px] w-full h-[340px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentGroup}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0"
          >
            {groupedMessages[currentGroup].map((msg, index) => {
              const position = positions[index % positions.length];
              const isLight = theme === "light";

              return (
                <div
                  key={msg.id}
                  className={`absolute ${position} ${
                    isLight ? "bg-[#EEE9DA]" : "bg-[#F4F1EC]"
                  } rounded-lg p-4 shadow-lg max-w-[280px]`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="bg-[#1e3b50] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">
                      {msg.name[0]}
                    </div>
                    <p className="text-sm font-semibold">{msg.name}</p>
                    <div className="flex ml-auto text-yellow-500">
                      {[...Array(msg.rating)].map((_, i) => (
                        <FaStar key={i} className="text-sm" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-800">{msg.text}</p>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TestimonialsDesktop;
