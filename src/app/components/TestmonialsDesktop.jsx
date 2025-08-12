"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
// import Image from "next/image";

const messages =
  [
    {
      "id": 1,
      "from": "bot",
      "name": "Majid Almoudi",
      "city": "KSK Homes",
      "text": "The quality of the food was superb and really liked their spicy sauce as well. Definitely recommend it."
    },
    {
      "id": 2,
      "from": "user",
      "name": "Hadee Goolbar",
      "city": "Yugo",
      "text": "I tried dormers food for a week now and the food has been very good and the quality consistent over every of my dishes. The price is also affordable. I look forward to order more from Dormers."
    },
    {
      "id": 3,
      "from": "bot",
      "name": "Niaz Mukati",
      "city": "The Myriad",
      "text": "Food was absolutely phenomenal, and it lasted me 1 ½ meals for the price of half a meal from most restaurants."
    },
    {
      "id": 4,
      "from": "user",
      "name": "Rehan Khoja",
      "city": "KSK Homes",
      "text": "Just has an incredible biryani that every dormer needs to try! The rice was perfectly fluffy, full of aromatic spices, and paired with beautifully with the creamy raita. It was so good I at it way too fast definitely need a second round. Highly recommend!"
    },
    {
      "id": 5,
      "from": "bot",
      "name": "Hamzah Khodabocus",
      "city": "Yugo",
      "text": "Very good food and decent price. Good for students who don't have time to cook and want a healthy alternative."
    },
    {
      "id": 6,
      "from": "user",
      "name": "Ibrahim Khan Amjad",
      "city": "Yugo",
      "text": "The food was nice. It was flavorful. Balanced portion, balanced taste. Good job."
    },
    {
      "id": 7,
      "from": "bot",
      "name": "Mundhir Ali Said",
      "city": "The Myriad",
      "text": "It was really tasty Thank you!"
    },
    {
      "id": 8,
      "from": "user",
      "name": "Bereket Adane",
      "city": "KSK Homes",
      "text": "Bro good afternoon. The food today was WOW ! you have no clue how I love it I have never tasted a coconut before in a food but it was magical. This is my favorite of them all."
    },
    {
      "id": 9,
      "from": "bot",
      "name": "Mohmmed Saif",
      "city": "The Myriad",
      "text": "One of the tastiest meal plan I have taste so far with having a range of variety of cuisine and a very well balanced meal. Overall, value for money."
    },
    {
      "id": 10,
      "from": "user",
      "name": "Sarah Sherali",
      "city": "The Myriad",
      "text": "The service provided by dormer's is amazing, they deliver food on time and the food tastes really good which meets ur preferences. Thank you so much, hope the feedback can be helpful someday."
    },
    {
      "id": 11,
      "from": "bot",
      "name": "Jannat Kona",
      "city": "Yugo",
      "text": "Had a great dinner meal from Dormer's. It was a chicken and egg fried rice. The combination was good. The packaging was good. A bit of more salt and some veggies would have been perfect! A platter including this will be lovely."
    },
    {
      "id": 12,
      "from": "user",
      "name": "Bello Hashim",
      "city": "The Myriad",
      "text": "Amazing, filling, delicious, good food Their service is wonderful I highly recommend!"
    },
    {
      "id": 13,
      "from": "bot",
      "name": "Angela Roy",
      "city": "Yugo",
      "text": "some of the best homemade food!! both delicious and healthy"
    },
    {
      "id": 14,
      "from": "user",
      "name": "Labeeq Dawre",
      "city": "Yugo",
      "text": "Really delicious. The biryani hits the spot"
    },
    {
      "id": 15,
      "from": "bot",
      "name": "Syed Abdul Basit",
      "city": "Yugo",
      "text": "So far the best quality of food i have tasted. I loved the food. it was amazing & everything simply balanced."
    },
    {
      "id": 16,
      "from": "user",
      "name": "Hachem",
      "city": "KSK homes",
      "text": "For me the rice was cooked well, and I liked the idea of adding raisins. It added a wonderful flavor."
    },
    {
      "id": 17,
      "from": "bot",
      "name": "Suhani Khera",
      "city": "Vogo Grand",
      "text": "Love your food, I have Withdrawals."
    },
    {
      "id": 18,
      "from": "user",
      "name": "Mirza Alamdar Hussein",
      "city": "Vogo Grand",
      "text": "Boss loved the food. Quantity + Quality. Matched the level of expectations."
    },
    {
      "id": 19,
      "from": "bot",
      "name": "Rabiya Bi",
      "city": "KSK Homes",
      "text": "Alhamdulillah the food has been good. I feel like personally for me, it's a little less spice but it's good. A lot better than the other tiffin services in terms of quality. Thank you."
    },
    {
      "id": 20,
      "from": "user",
      "name": "Hafsa Ayesha",
      "city": "Yugo",
      "text": "Hey. The food is soooo good. The taste and everything is 10/10/ reminded me of my mom's food back home in Pakistan 🫶. Loved every bit of it."
    },
    {
      "id": 21,
      "from": "bot",
      "name": "Adriel Almeida",
      "city": "Yugo",
      "text": "...and Ive tried a few meal plans before but nothing compares to this..."
    }
  ]

const TestimonialsDesktop = () => {
  const { theme } = useTheme();
  const [currentGroup, setCurrentGroup] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const groupedMessages = useMemo(() => {
    const result = [];
    for (let i = 0; i < messages.length; i += 3) {
      result.push(messages.slice(i, i + 3));
    }
    return result;
  }, []);

  useEffect(() => {
    if (isHovered) return; // Don't run interval when hovered

    const interval = setInterval(() => {
      setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [groupedMessages.length, isHovered]);

  const positions = ["top-0 left-0", "top-10 right-0", "bottom-0 left-1/3"];
  const handleDotClick = (index) => setCurrentGroup(index);
  return (
    <div>
      <div className="w-full py-12 flex justify-center bg-[#031624]">
        <div className="relative max-w-[987px] w-full h-[340px] overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
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
                    className={`absolute ${position} ${isLight ? "bg-[#EEE9DA]" : "bg-[#F4F1EC]"
                      } rounded-lg p-4 shadow-lg max-w-[280px]`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-[#1e3b50] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">
                        {msg.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black">
                          {msg.name}
                        </p>
                        <p className="text-xs font-normal text-[#686766]">{msg.city}</p> </div>
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
                      className={`absolute -bottom-2 ${msg.from === "user" ? "right-4" : "left-4"
                        } w-4 h-4 transform rotate-45 ${theme === "light" ? "bg-[#EEE9DA]" : "bg-[#EEE9DA]"
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
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${index === currentGroup
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
