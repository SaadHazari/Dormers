"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      "text": "Had a great dinner meal from Dormers'. It was a chicken and egg fried rice. The combination was good. The packaging was good. A bit of more salt and some veggies would have been perfect! A platter including this will be lovely."
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
    },
    {
      "id": 22,
      "from": "user",
      "name": "Jessica Dsouza",
      "city": "The Myriad",
      "text": "Really good, I’ve been enjoying the variety in cuisines & flavors."
    },
    {
      "id": 23,
      "from": "bot",
      "name": "Ketsia Uwayo",
      "city": "Yugo",
      "text": "Good evening, just wanted to update you that the last 3 meals have been fantastic, I really enjoyed them and it brought back my excitement about the meals again. I appreciate the consideration and thought put into the meals."
    },
    {
      "id": 24,
      "from": "user",
      "name": "Rishabh Jain",
      "city": "Yugo",
      "text": "It's been great. Hence I continued and will do so in the future too."
    },
    {
      "id": 25,
      "from": "bot",
      "name": "Anninditha Menon",
      "city": "The Myriad",
      "text": "I really loved the kebab, meatballs with mash, and the fried rice!"
    },
    {
      "id": 26,
      "from": "user",
      "name": "Shivani Vedre",
      "city": "Yugo",
      "text": "I missed dormers food so much. Can’t wait to eat dormers again 🫵👑."
    },
    {
      "id": 27,
      "from": "bot",
      "name": "Abhishek Ingale",
      "city": "Study World",
      "text": "I am athlete and you're just fascinating, believe me ❤️."
    },
    {
      "id": 28,
      "from": "user",
      "name": "Bhargav Raj",
      "city": "Yugo",
      "text": "Thanks guys for keeping track of my meal preferences. Appreciate it 🙏🏻."
    },
    {
      "id": 29,
      "from": "bot",
      "name": "Arkaydios Ali",
      "city": "Yugo",
      "text": "The food is perfect. Today was very good."
    },
    {
      "id": 30,
      "from": "user",
      "name": "Aisha Zarewa",
      "city": "Yugo",
      "text": "I got my food today, and I absolutely love it, great service so far!"
    },
    {
      "id": 31,
      "from": "bot",
      "name": "Yousaf Khan Yaldram",
      "city": "Yugo",
      "text": "Damn, you guys are way better than the other meal plans. Hats off!!!"
    }
  ]

const TestimonialsDesktop = () => {
  useTheme();
  const [currentGroup, setCurrentGroup] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef(null);
  const wheelCooldown = useRef(false);

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

  const handleWheel = useCallback((e) => {
    if (wheelCooldown.current) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 40) return;
    wheelCooldown.current = true;
    setTimeout(() => { wheelCooldown.current = false; }, 600);
    setIsHovered(true);
    setTimeout(() => setIsHovered(false), 3000);
    if (e.deltaX > 0) {
      setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
    } else {
      setCurrentGroup((prev) => (prev === 0 ? groupedMessages.length - 1 : prev - 1));
    }
  }, [groupedMessages.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const positions = ["top-0 left-0", "top-10 right-0", "bottom-0 left-1/3"];
  const handleDotClick = (index) => setCurrentGroup(index);
  const handlePrev = () => {
    setIsHovered(true);
    setTimeout(() => setIsHovered(false), 3000);
    setCurrentGroup((prev) => (prev === 0 ? groupedMessages.length - 1 : prev - 1));
  };
  const handleNext = () => {
    setIsHovered(true);
    setTimeout(() => setIsHovered(false), 3000);
    setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
  };
  return (
    <div ref={containerRef}>
      <div className="w-full py-12 flex justify-center bg-[#031624] px-10">
        <div className="relative max-w-[987px] w-full">
          <button
            onClick={handlePrev}
            className="absolute -left-19 top-1/2 -translate-y-1/2 z-30 p-2.5 transition-all rounded-full backdrop-blur-lg hover:scale-110 text-white/90 hover:text-white bg-white/20 hover:bg-white/30 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="relative w-full h-[340px] overflow-hidden"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentGroup}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-5"
              >
                {groupedMessages[currentGroup].map((msg, index) => {
                  const position = positions[index % positions.length];
                  return (
                    <div
                      key={msg.id}
                      className={`absolute ${position} rounded-2xl p-4 max-w-[280px] ${msg.from === "user"
                        ? "bg-[#1E6B8A]/20 border border-white/15 backdrop-blur-md shadow-[0_4px_24px_rgba(30,107,138,0.15)] text-white"
                        : "bg-[#FF7F00]/15 border border-[#FF7F00]/30 backdrop-blur-md shadow-[0_4px_24px_rgba(255,127,0,0.18)] text-white"
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold text-white ${msg.from === "user" ? "bg-[#1E6B8A]" : "bg-[#FF7F00]"}`}>
                          {msg.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {msg.name}
                          </p>
                          <p className="text-xs font-normal text-white/60">{msg.city}</p> </div>
                      </div>
                      <div className="flex gap-0.5 my-1.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} style={{ color: "#FF7F00", fontSize: "12px" }}>★</span>
                        ))}
                      </div>
                      <p
                        className="text-sm text-white/90 font-medium"
                        style={{
                          fontFamily: "Montserrat",
                          fontWeight: 600,
                          lineHeight: "120%",
                        }}
                      >
                        {msg.text}
                      </p>
                      <div
                        className={`absolute -bottom-2 w-4 h-4 transform rotate-45 ${msg.from === "user"
                          ? "right-4 bg-[#1E6B8A]/20 border-r border-b border-white/15"
                          : "left-4 bg-[#FF7F00]/15 border-r border-b border-[#FF7F00]/30"
                          }`}
                      />
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
          <button
            onClick={handleNext}
            className="absolute -right-19 top-1/2 -translate-y-1/2 z-30 p-2.5 transition-all rounded-full backdrop-blur-lg hover:scale-110 text-white/90 hover:text-white bg-white/20 hover:bg-white/30 border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex justify-center mt-6 gap-1.5 pb-6 flex-wrap px-4">
        {groupedMessages.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`transition-all duration-300 rounded-full ${index === currentGroup
              ? "bg-white w-[24px] h-[8px]"
              : "bg-white/30 w-[8px] h-[8px]"
              }`}
          />
        ))}
      </div>
    </div>
  );
};

export default TestimonialsDesktop;
