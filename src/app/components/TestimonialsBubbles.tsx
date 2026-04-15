"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
// import Image from "next/image";
import { useSwipeable } from "react-swipeable";

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

export default function TestimonialsBubbles() {
  const [currentGroup, setCurrentGroup] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const directionRef = useRef(1);

  const groupedMessages = useMemo(() => {
    const result = [];
    for (let i = 0; i < messages.length; i += 2) {
      result.push(messages.slice(i, i + 2));
    }
    return result;
  }, []);

  // Pause and resume logic
  const pauseAutoScroll = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    setIsPaused(true);
  };

  const resumeAutoScroll = () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 8000); // resume after 5 seconds of inactivity
  };

  // Auto scroll effect
  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        directionRef.current = 1;
        setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
      }, 8000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [groupedMessages.length, isPaused]);

  // Manual dot click
  const handleDotClick = (index: number) => {
    directionRef.current = index > currentGroup ? 1 : -1;
    pauseAutoScroll();
    resumeAutoScroll();
    setCurrentGroup(index);
  };

  // Swipe controls
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      directionRef.current = 1;
      pauseAutoScroll();
      resumeAutoScroll();
      setCurrentGroup((prev) => (prev + 1) % groupedMessages.length);
    },
    onSwipedRight: () => {
      directionRef.current = -1;
      pauseAutoScroll();
      resumeAutoScroll();
      setCurrentGroup((prev) =>
        prev === 0 ? groupedMessages.length - 1 : prev - 1
      );
    },
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: true,
    delta: 30,
  });

  return (
    <div
      className="relative bg-[#031624] pt-[20px] pb-0 w-screen overflow-x-hidden -mx-[calc((100vw_-_100%)/2)]"
      {...swipeHandlers}
      onTouchStart={pauseAutoScroll}
      onTouchEnd={resumeAutoScroll}
      onMouseEnter={pauseAutoScroll}
      onMouseLeave={resumeAutoScroll}
    >
      <div className="flex flex-col items-center min-h-[200px] py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentGroup}
            initial={{ opacity: 0, x: directionRef.current * 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: directionRef.current * -80 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex flex-col items-center gap-4 w-full max-w-xl mx-auto"
          >
            {groupedMessages[currentGroup].map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[250px] p-4 rounded-2xl relative ${
                  msg.from === "user"
                    ? "self-end mr-4 bg-[#1E6B8A]/20 border border-white/15 backdrop-blur-md shadow-[0_4px_24px_rgba(30,107,138,0.15)] text-white"
                    : "self-start ml-4 bg-[#FF7F00]/15 border border-[#FF7F00]/30 backdrop-blur-md shadow-[0_4px_24px_rgba(255,127,0,0.18)] text-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase ${msg.from === "user" ? "bg-[#1E6B8A]" : "bg-[#FF7F00]"}`}>
                      {msg.name?.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{msg.name}</span>
                      <span className="text-xs font-normal text-white/70">{msg.city}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} style={{ color: "#FF7F00", fontSize: "12px" }}>★</span>
                  ))}
                </div>

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
                  className={`absolute -bottom-2 w-4 h-4 transform rotate-45 ${
                    msg.from === "user"
                      ? "right-4 bg-[#1E6B8A]/20 border-r border-b border-white/15"
                      : "left-4 bg-[#FF7F00]/15 border-r border-b border-[#FF7F00]/30"
                  }`}
                />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex justify-center mt-6 gap-1.5 pb-6 flex-wrap px-4">
        {groupedMessages.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`transition-all duration-300 rounded-full ${
              index === currentGroup
                ? "bg-white w-[24px] h-[8px]"
                : "bg-white/30 w-[8px] h-[8px]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
