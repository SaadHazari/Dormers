"use client";

import { useTheme } from "next-themes";
import Image from "next/image";

const CurtleAboutUs = () => {
  const { theme } = useTheme();
  return (
    <>
      <div
        id="about"
        className={`px-5 w-full mt-[30px] md:mt-[100px]  ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"
        }`}
      >
        <div
          className={`container mx-auto     ${
            theme === "light"
              ? "aboutUsocntianercustlelight"
              : "aboutUsocntianercustle"
          }`}
        >
          <div className="container_aboutUs_box">
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
            <div className="grid grid-cols-2 gap-4 sm:gap-6  md:flex md:justify-center md:gap-[57px]">
              {/* Vision Card */}
              <div
                className={`${
                  theme === "light" ? "bg-[#1E3A4F]" : "bg-[#EEE9DA]"
                } rounded-2xl p-6 sm:p-8 flex flex-col justify-between   relative md:max-w-[548px] `}
              >
                <div>
                  <h3
                    className={`${
                      theme === "light" ? "text-[#EEE9DA]" : "text-[#22394A]"
                    } text-xl font-bold mb-4 sm:mb-5 lg:hidden block`}
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 900,
                      lineHeight: "100%",
                      fontSize: "16px",
                    }}
                  >
                    OUR <br /> VISION
                  </h3>
                  <h3
                    className={`${
                      theme === "light" ? "text-[#EEE9DA]" : "text-[#22394A]"
                    } OurVisionAboutUs_title lg:block hidden`}
                  >
                    OUR VISION
                  </h3>
                  <p
                    className={`${
                      theme === "light" ? "!text-[#EEE9DA]" : "text-[#22394A]"
                    } OurVisionAboutUs_para`}
                  >
                    To become the leading provider of student-focused meal
                    solutions, recognized for our innovation, cultural
                    inclusivity, and unwavering commitment to quality. We
                    envision a future where every student, no matter where they
                    are, enjoys meals that are not only delicious and healthy
                    but also bring comfort and connection, creating a community
                    united through food
                  </p>
                </div>
                <Image
                  src="/images/Ourvision.svg"
                  alt="Vision Icon"
                  width={80}
                  height={64}
                  className={`absolute bottom-0 right-4 sm:w-[120px] opacity-55 select-none transition-all duration-300 lg:right-[-9px] lg:bottom-[-12px] ${
                    theme === "light" ? "invert brightness-0" : ""
                  }`}
                />
              </div>
              <div className="bg-[#FF7F00] rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative md:max-w-[548px]">
                <div>
                  <h3
                    className="text-[#EEE9DA] font-bold mb-4 sm:mb-5 lg:hidden block"
                    style={{
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 900,
                      lineHeight: "100%",
                      fontSize: "16px",
                    }}
                  >
                    OUR <br /> MISSION
                  </h3>
                  <h3 className="OurmissionAboutUs_title lg:block hidden">
                    OUR MISSION
                  </h3>
                  <p className="leading-snug OurmissionAboutUs_para">
                    To simplify & to deliver tasty, healthy and affordable meals
                    that make students feel at home and To build strong
                    connections through food, Fostering community; one dorm, one
                    meal, one happy student at a time
                  </p>
                </div>
                <Image
                  src="/images/Ourmission.svg"
                  alt="Vision Icon"
                  width={80}
                  height={64}
                  className={`absolute bottom-0 right-4 sm:w-[120px] opacity-55 select-none transition-all duration-300 lg:right-[-12px] lg:bottom-[-12px] ${
                    theme === "light" ? "invert brightness-0" : ""
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CurtleAboutUs;
