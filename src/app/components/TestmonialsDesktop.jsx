"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";

const messages = [
  {
    id: 1,
    from: "bot",
    name: "Majid Alamoudi",
    rating: 5,
    text: "The quality of the food was superb and I really liked their spicy sauce as well. Definitely recommend it.",
  },
  {
    id: 2,
    from: "user",
    name: "Hades Geolbar",
    rating: 5,
    text: "I tried dormers food for a week now and the food has been very good and the quality consistent over every of my dishes. The price is also affordable. I look forward to order more from DORMERS.",
  },
  {
    id: 3,
    from: "bot",
    name: "Mohmmed Saif",
    rating: 5,
    text: "One of the tastiest meal plan I have taste so far with having a range of variety of cuisine and a very well balanced meal over all value for money very inter rated.",
  },
  {
    id: 4,
    from: "user",
    name: "Niaz Mukati",
    rating: 5,
    text: "Food was absolutely phenomenal and it lasted me 1½ meals for the price of half a meal from most restaurants.",
  },
  {
    id: 5,
    from: "bot",
    name: "Rehan Khoja",
    rating: 5,
    text: "Just had an incredible biryani that every dormer needs to try! The rice was perfectly fluffy, full of aromatic spices, and paired beautifully with the creamy raita. It was so good I ate it way too fast—definitely need a second round. Highly recommend!",
  },
  {
    id: 6,
    from: "user",
    name: "Bereket Adane",
    rating: 5,
    text: "I've had a great experience with Dormer! The team is super friendly and always ensures everything goes smoothly. The food is fantastic — fresh, tasty, and generous portions. There's a good variety that suits different tastes and diets.",
  },
  {
    id: 7,
    from: "bot",
    name: "Hamzah Khodabocus",
    rating: 6,
    text: "Very good food and decent price Good for students who don't have time to cook and want a healthy alternative",
  },
  {
    id: 8,
    from: "user",
    name: "Ibrahim Khan Amjad",
    rating: 5,
    text: "The food was nice. It was flavorful, balanced portion, balanced taste. Good job.",
  },
  {
    id: 9,
    from: "bot",
    name: "Mundhir Al Said ",
    rating: 5,
    text: "It was really tasty. Thank you!",
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
 const handleDotClick = (index) => setCurrentGroup(index);
  return (
    <div>
      <div className="w-full py-12 flex justify-center bg-[#031624]">
        <div className="relative max-w-[987px] w-full h-[340px] overflow-hidden">
          <AnimatePresence mode="wait">
            {groupedMessages[currentGroup].map((msg, index) => {
              const position = positions[index % positions.length];
              const isLight = theme === "light";

              return (
                <motion.div
                  key={currentGroup}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-5"
                >
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
                      <p className="text-sm font-semibold text-black">
                        {msg.name}
                      </p>
                      <div className="flex ml-auto text-yellow-500 gap-[3px]">
                        {[...Array(msg.rating)].map((_, i) => (
                          // <FaStar key={i} className="text-sm" />
                          <Image
                            key={i}
                            src="/images/starticon.svg"
                            alt=""
                            width={16}
                            height={16}
                            className=""
                            style={{
                              imageRendering: "crisp-edges",
                              backgroundRepeat: "repeat",
                            }}
                            priority
                          />
                        ))}
                      </div>
                    </div>
                    <p
                      className="text-sm text-gray-800 font-medium"
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
                        theme === "light" ? "bg-[#EEE9DA]" : "bg-[#EEE9DA]"
                      }`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex justify-center mt-6 gap-2">
        {groupedMessages.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              index === currentGroup
                ? "bg-white scale-110 w-[60px] h-[8px]"
                : "bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default TestimonialsDesktop;
