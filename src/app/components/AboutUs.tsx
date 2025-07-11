"use client";
import { useTheme } from "next-themes";
import Image from "next/image";
import React from "react";

const AboutUs = () => {
  const { theme } = useTheme();
  return (
    <>
      <div
        id="about"
        className={`px-5 w-full ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"
        }`}
      >
        <div className="container mx-auto  py-1">
          <h2
            className={`${
              theme === "light" ? "text-[#1E3A4F]" : "text-white"
            } text-3xl sm:text-4xl font-bold mb-5 text-left`}
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 500,
              lineHeight: "100%",
              letterSpacing: "0",
              fontSize: "20px",
            }}
          >
            ABOUT US
          </h2>

          {/* Top two cards: Vision and Mission */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8">
            {/* Vision Card */}
            <div
              className={`${
                theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
              } rounded-2xl p-6 sm:p-8 flex flex-col justify-between min-h-[200px] sm:min-h-[260px] relative`}
            >
              <div>
                <h3
                  className={`${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#22394A]"
                  } text-xl font-bold mb-4 sm:mb-5`}
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 900,
                    lineHeight: "100%",
                    // letterSpacing: "0",
                    fontSize: "16px",
                  }}
                >
                  OUR <br /> VISION
                </h3>
                <p
                  className={`${
                    theme === "light" ? "text-[#EEE9DA]" : "text-[#22394A]"
                  } text-sm leading-snug`}
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 300,
                    // letterSpacing: "0.5px",
                    fontSize: "8px",
                  }}
                >
                  To become the leading provider of student-focused meal
                  solutions, making everyday life convenient, healthy, and
                  affordable for students. We envision a world where every
                  student can enjoy nutritious meals without stress, fostering
                  community, unity, and well-being through food.
                </p>
              </div>
              <Image
                src="/images/about1.svg"
                alt="Vision Icon"
                width={80}
                height={64}
                className={`absolute bottom-4 right-4 sm:bottom-6 sm:right-6 sm:w-[120px] opacity-55 select-none transition-all duration-300 ${
                  theme === "light" ? "invert brightness-0" : ""
                }`}
              />
            </div>

            {/* Mission Card */}
            <div className="bg-[#FF7F00] rounded-2xl p-6 sm:p-8 flex flex-col justify-between min-h-[200px] sm:min-h-[260px] relative">
              <div>
                <h3
                  className="text-[#EEE9DA] font-bold mb-4 sm:mb-5"
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 900,
                    lineHeight: "100%",
                    // letterSpacing: "0",
                    fontSize: "16px",
                  }}
                >
                  OUR <br /> MISSION
                </h3>
                <p
                  className="text-white text-sm leading-snug"
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 300,
                    // letterSpacing: "0.5px",
                    fontSize: "8px",
                  }}
                >
                  To simplify & deliver tasty, healthy, and affordable meals to
                  the student community. From hassle-free ordering to on-time
                  deliveries, Dormer&rsquo;s helps students enjoy more, stress
                  less, and thrive every day.
                </p>
              </div>
              <Image
                src="/images/about2.svg"
                alt="Mission Icon"
                width={80}
                height={52}
                className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 sm:w-[100px] opacity-55 select-none"
              />

              <Image
                src="/images/about4.svg"
                alt="Mission Icon"
                width={60}
                height={35}
                className="absolute bottom-4 right-5 sm:bottom-[90px] sm:right-[120px] sm:w-[80px] opacity-55 select-none"
              />

              <Image
                src="/images/about5.svg"
                alt="Mission Icon"
                width={30}
                height={10}
                className="absolute bottom-6 right-9 sm:bottom-[120px] sm:right-[170px] sm:w-[70px] opacity-55 select-none"
              />

              <Image
                src="/images/about6.svg"
                alt="Mission Icon"
                width={50}
                height={25}
                className="absolute bottom-1 right-16 sm:bottom-[150px] sm:right-[230px] sm:w-[60px] opacity-55 select-none"
              />
            </div>
          </div>

          <div className="bg-[#031624] rounded-2xl p-4 sm:p-8 relative text-white">
            {/* First Row: Title + 2 values */}
            <div className="flex flex-wrap gap-4 items-start justify-start mb-6">
              {/* OUR VALUES title */}
              <div className="flex-shrink-0 w-[100px] mt-2">
                <h3
                  className="text-[#EEE9DA] font-black leading-tight text-sm sm:text-xl"
                  style={{
                    fontFamily: "Montserrat, sans-serif",
                    fontWeight: 900,
                  }}
                >
                  OUR <br /> VALUES
                </h3>
              </div>

              {/* CUSTOMER - CENTRICITY */}
              <div className="max-w-[200px]">
                <p
                  className="font-bold flex items-start gap-1 text-[10px] sm:text-sm"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                    fontSize: "8px",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> CUSTOMER -
                  CENTRICITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[10px] sm:text-sm"
                  style={{ fontFamily: "Poppins, sans-serif", fontSize: "8px" }}
                >
                  Every meal is crafted with students in mind, ensuring it’s not
                  just food, but a moment of comfort and satisfaction.
                </p>
              </div>

              {/* QUALITY FIRST */}
              <div className="max-w-[200px]">
                <p
                  className="font-bold flex items-start gap-1 text-[10px] sm:text-sm"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                    fontSize: "8px",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> QUALITY FIRST
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[10px] sm:text-sm"
                  style={{ fontFamily: "Poppins, sans-serif", fontSize: "8px" }}
                >
                  We never compromise on the quality of our ingredients or
                  preparation, delivering meals that are safe, nutritious &
                  delicious.
                </p>
              </div>
            </div>

            {/* Second Row: 3 more values */}
            <div className="flex flex-wrap items-start justify-start gap-4">
              {/* AFFORDABILITY */}
              <div className="w-[calc(33%-10px)] max-w-[160px]">
                <p
                  className="font-bold flex items-start gap-1 text-[10px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                    fontSize: "8px",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> AFFORDABILITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[10px]"
                  style={{ fontFamily: "Poppins, sans-serif", fontSize: "8px" }}
                >
                  Great food should be accessible. We strive to keep our meals
                  budget-friendly without sacrificing taste or value.
                </p>
              </div>

              {/* DIVERSITY & INCLUSION */}
              <div className="w-[calc(33%-10px)] max-w-[160px]">
                <p
                  className="font-bold flex items-start gap-1 text-[10px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                    fontSize: "8px",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> DIVERSITY &
                  INCLUSION
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[10px]"
                  style={{ fontFamily: "Poppins, sans-serif", fontSize: "8px" }}
                >
                  Our menu celebrates the diverse cultures and cuisines of our
                  students, ensuring there’s something for everyone.
                </p>
              </div>

              {/* SUSTAINABILITY + Image aligned inside */}
              <div className="w-[calc(33%-10px)] max-w-[160px] relative">
                <p
                  className="font-bold flex items-start gap-1 text-[10px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                    fontSize: "8px",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> SUSTAINABILITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[10px]"
                  style={{ fontFamily: "Poppins, sans-serif", fontSize: "8px" }}
                >
                  Our menu celebrates the diverse cultures and cuisines of our
                  students, ensuring there’s something for everyone.
                </p>

                {/* Icon aligned to bottom right of the section */}
                <Image
                  src="/images/about3.svg"
                  alt="Values Icon"
                  width={76.54}
                  height={60}
                  className="absolute bottom-0 right-0 opacity-55 select-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutUs;
