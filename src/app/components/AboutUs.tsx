"use client";
import { useTheme } from "next-themes";
import Image from "next/image";
import React from "react";
import "@/style/AboutUs.css";

const AboutUs = () => {
  const { theme } = useTheme();

  return (
    <>
      <div
        id="about"
        className={`px-5 w-full  ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#22394A]"
        }`}
      >
        <div className="container mx-auto  mb-[40px]">
          <div className="container_aboutUs_box">
            {/* <h2
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
            </h2> */}

         
          </div>
          {/* Mobile View */}
          <div className="bg-[#031624] rounded-2xl p-4 sm:p-8 relative text-white md:w-[1155px] md:mx-auto lg:hidden block">
            <div className="flex flex-wrap gap-4 items-start justify-start mb-6">
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
          {/* Desktop View */}
          <div className="bg-[#031624] rounded-2xl p-[48px] relative text-white md:w-[1155px] md:mx-auto lg:block hidden">
            <div className="">
              <h3
                className="text-[#EEE9DA] font-black leading-tight text-sm sm:text-xl"
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontWeight: 900,
                }}
              >
                OUR VALUES
              </h3>
            </div>
            <div className="flex relative gap-[210px]">
              <div className="flex flex-col gap-[30px] mt-[20px]">
                {/* CUSTOMER - CENTRICITY */}
                <div className="">
                  <p className="flex items-start gap-1 OurValues_headingtitle">
                    <span className="text-[#FF7F00] ">|</span> CUSTOMER -
                    CENTRICITY
                  </p>
                  <p className="mt-1 font-light leading-snug ourvalues-para_info">
                    Every meal is crafted with students in mind, ensuring it’s
                    not just food, but a moment of comfort and satisfaction.
                  </p>
                </div>
                <div>
                  <p className="OurValues_headingtitle flex items-start gap-1">
                    <span className="text-[#FF7F00]">|</span> SUSTAINABILITY
                  </p>
                  <p className="mt-1 font-light leading-snug  ourvalues-para_info">
                    Our menu celebrates the diverse cultures and cuisines of our
                    students, ensuring there’s something for everyone.
                  </p>
                </div>

                {/* DIVERSITY & INCLUSION */}
                <div className="">
                  <p className="OurValues_headingtitle flex items-start gap-1">
                    <span className="text-[#FF7F00]">|</span> DIVERSITY &
                    INCLUSION
                  </p>
                  <p className="mt-1 font-light leading-snug  ourvalues-para_info">
                    Our menu celebrates the diverse cultures and cuisines of our
                    students, ensuring there’s something for everyone.
                  </p>
                </div>
              </div>

              {/* Second Row: 3 more values */}
              <div className="flex flex-col gap-[30px]  mt-[20px]">
                {/* QUALITY FIRST */}
                <div className="">
                  <p className="flex items-start gap-1 OurValues_headingtitle">
                    <span className="text-[#FF7F00]">|</span> QUALITY FIRST
                  </p>
                  <p className="mt-1 font-light leading-snug ourvalues-para_info">
                    We never compromise on the quality of our ingredients or
                    preparation, delivering meals that are safe, nutritious &
                    delicious.
                  </p>
                </div>
                {/* AFFORDABILITY */}
                <div className="">
                  <p className="OurValues_headingtitle flex items-start gap-1">
                    <span className="text-[#FF7F00]">|</span> AFFORDABILITY
                  </p>
                  <p className="mt-1 font-light leading-snug  ourvalues-para_info">
                    Great food should be accessible. We strive to keep our meals
                    budget-friendly without sacrificing taste or value.
                  </p>
                </div>

                {/* SUSTAINABILITY + Image aligned inside */}
                <div className="">
                  {/* Icon aligned to bottom right of the section */}
                  <Image
                    src="/images/Ourvlaues.svg"
                    alt="Values Icon"
                    width={76.54}
                    height={60}
                    className="
    absolute bottom-0 right-0 opacity-55 select-none
    w-[50px] h-[40px]          
    lg:w-[200px] lg:h-[160px]    
    lg:bottom-[-60px]
    lg:right-[-50px] 
  "
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutUs;
