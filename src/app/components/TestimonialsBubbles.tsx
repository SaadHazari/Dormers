import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useSwipeable } from "react-swipeable";

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
    }, 16000);
    return () => clearInterval(interval);
  }, [groupedMessages.length]);
  const handleDotClick = (index: number) => setCurrentGroup(index);
const swipeHandlers = useSwipeable({
  onSwipedLeft: () =>
    setCurrentGroup((prev) => (prev + 1) % groupedMessages.length),
  onSwipedRight: () =>
    setCurrentGroup((prev) =>
      prev === 0 ? groupedMessages.length - 1 : prev - 1
    ),
  trackTouch: true,
  trackMouse: true, // <---- change this
  preventScrollOnSwipe: true,
  delta: 50,
});


  return (
    <div   className="relative bg-[#031624] py-6 pb-0 w-screen overflow-hidden -mx-[calc((100vw_-_100%)/2)] touch-pan-y"
  {...swipeHandlers}>
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
                      key={i}
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
}
