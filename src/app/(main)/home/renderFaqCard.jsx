import { motion, AnimatePresence } from "framer-motion";
import React from "react";

export const renderFaqCard = (faq, index, openFAQ, toggleFAQ, theme) => {
  const colorSet =
    theme === "light"
      ? ["#1E3A4F", "#FF8A00", "#0A1B26"]
      : ["#EEE9DA", "#FF8A00", "#0A1B26"];

  const color = colorSet[index % colorSet.length];
  const isOpen = openFAQ === faq.id;
  const isLight = color === "#EEE9DA";
  const isTextDark = !isOpen && color === "#EEE9DA";

  const isOrange = color === "#FF8A00";
  const isCream = color === "#EEE9DA";
  const borderGrad = isCream
    ? "linear-gradient(135deg, rgba(255,140,0,0.65) 0%, rgba(255,80,0,0.3) 100%)"
    : "linear-gradient(135deg, #FF8C00 0%, #FF5000 100%)";
  const openBgColor = theme === "light" ? "#1E3A4F" : "#EEE9DA";
  const cardStyle = isOpen
    ? { backgroundColor: openBgColor }
    : isOrange
    ? { backgroundColor: color }
    : {
        background: `linear-gradient(${color}, ${color}) padding-box, ${borderGrad} border-box`,
        border: "1.5px solid transparent",
      };

  return (
    <div
      key={faq.id}
      className="rounded-xl overflow-hidden w-full mx-auto lg:w-[100%]"
      style={cardStyle}
    >
      <button
        onClick={() => toggleFAQ(faq.id)}
        className="w-full px-6 py-4 flex items-center justify-between text-left md:!pb-[8px]"
      >
        <span
          className={`font-bold text-base sm:text-lg  ${
            isOpen
              ? theme === "light"
                ? "text-white"
                : "text-[#22394A]"
              : isTextDark
              ? "text-[#22394A]"
              : "text-white"
          }`}
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 600,
            fontSize: "16px",
          }}
        >
          {faq.question}
        </span>
        <span
          className={`text-xl font-bold  ${
            isOpen
              ? theme === "light"
                ? "text-white"
                : "text-[#22394A]"
              : isTextDark
              ? "text-[#22394A]"
              : "text-white"
          }`}
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.25, ease: "easeOut" },
            }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-6 pb-4">
            <div
              className={` ${
                isOpen
                  ? theme === "light"
                    ? "text-white"
                    : "text-[#22394A]"
                  : "text-white"
              }`}
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 300,
                lineHeight: "140%",
                letterSpacing: "0.3px",
                fontSize: "14px",
              }}
            >
              {faq.answer}
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
