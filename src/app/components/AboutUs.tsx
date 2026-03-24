"use client";
import { useTheme } from "next-themes";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "@/style/AboutUs.css";

const VALUES = [
  {
    id: "customer",
    title: "CUSTOMER - CENTRICITY",
    description:
      "Every meal is crafted with students in mind, ensuring it's not just food, but a moment of comfort and satisfaction.",
  },
  {
    id: "quality",
    title: "QUALITY FIRST",
    description:
      "We never compromise on the quality of our ingredients or preparation, delivering meals that are safe, nutritious & delicious.",
  },
  {
    id: "affordability",
    title: "AFFORDABILITY",
    description:
      "Great food should be accessible. We strive to keep our meals budget-friendly without sacrificing taste or value.",
  },
  {
    id: "diversity",
    title: "DIVERSITY & INCLUSION",
    description:
      "Our menu celebrates the diverse cultures and cuisines of our students, ensuring there's something for everyone.",
  },
  {
    id: "sustainability",
    title: "SUSTAINABILITY",
    description:
      "We aim to minimize waste and use eco-friendly practices, caring for the environment as much as we care for our customers.",
  },
];

const AboutUs = () => {
  const { theme } = useTheme();
  const [openValue, setOpenValue] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpenValue((prev) => (prev === id ? null : id));

  return (
    <>
      <div
        id="about"
        className={`px-5 w-full py-[0px] lg:pb-[12px] md:pt-[68px] ${
          theme === "light" ? "bg-[#031624]" : "bg-[#031624]"
        }`}
      >
        <div className="container mx-auto">
          <div className="container_aboutUs_box" />

          {/* MOBILE VIEW */}
          <div className="bg-[#031624] rounded-2xl pt-7 pb-4 text-white md:mx-auto lg:hidden block">
            <div className="mb-4">
              <h3
                className="text-[#EEE9DA] font-black leading-tight text-sm sm:text-xl"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
              >
                OUR VALUES
              </h3>
            </div>

            <div className="flex flex-col">
              {VALUES.map((v) => {
                const isOpen = openValue === v.id;
                return (
                  <div key={v.id} className="border-b border-white/10 last:border-0">
                    <button
                      onClick={() => toggle(v.id)}
                      className="w-full flex items-center justify-between text-left py-3"
                    >
                      <p
                        className="font-bold flex items-center gap-1 text-[14px]"
                        style={{ fontFamily: "Typo Round Bold Demo" }}
                      >
                        <span className="text-[#FF7F00]">|</span> {v.title}
                      </p>
                      <span className="text-white text-lg font-bold ml-3 flex-shrink-0">
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
                          className="overflow-hidden"
                        >
                          <p
                            className="pb-3 font-light leading-snug text-[12px] text-white/80"
                            style={{ fontFamily: "Poppins, sans-serif" }}
                          >
                            {v.description}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DESKTOP VIEW */}
          <div className="bg-[#031624] rounded-2xl relative text-white md:max-w-[987px] md:mx-auto lg:block hidden">
            <div className="mb-4">
              <h3
                className="text-[#EEE9DA] font-black leading-tight"
                style={{ fontFamily: "Montserrat, sans-serif", fontWeight: 900 }}
              >
                OUR VALUES
              </h3>
            </div>

            <div className="flex flex-col">
              {VALUES.map((v) => {
                const isOpen = openValue === v.id;
                return (
                  <div key={v.id} className="border-b border-white/10 last:border-0">
                    <button
                      onClick={() => toggle(v.id)}
                      className="w-full flex items-center justify-between text-left py-3"
                    >
                      <p className="flex items-center gap-2 OurValues_headingtitle">
                        <span className="text-[#FF7F00]">|</span> {v.title}
                      </p>
                      <span className="text-white text-xl font-bold ml-4 flex-shrink-0">
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
                          className="overflow-hidden"
                        >
                          <p className="pb-4 ourvalues-para_info text-white/80">
                            {v.description}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutUs;
