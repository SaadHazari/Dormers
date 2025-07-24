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
  console.log(isTextDark , "adil nawaz");
  

  return (
    <div
      key={faq.id}
      className="rounded-xl overflow-hidden transition-all duration-300 w-full mx-auto lg:w-[100%]"
      style={{
        backgroundColor: isOpen
          ? theme === "light"
            ? "#1E3A4F"
            : "#EEE9DA"
          : color,
      }}
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
            fontSize: "14px",
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
              : "text-white"
          }`}
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-6 pb-4"
          >
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
                lineHeight: "130%",
                letterSpacing: "0.5px",
                fontSize: "12px",
              }}
            >
              {faq.answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
