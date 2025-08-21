"use client";
import { useTheme } from "next-themes";
// import Image from "next/image";
import React from "react";
import "@/style/AboutUs.css";

const AboutUs = () => {
  const { theme } = useTheme();

  return (
    <>
      <div
        id="about"
        className={`px-5 w-full py-[0px] lg:pb-[12px] md:pt-[68px] ${theme === "light" ? "bg-[#031624]" : "bg-[#031624]"
          }`}
      >
        <div className="container mx-auto  ">
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
          <div className="bg-[#031624] rounded-2xl pt-7 pb-[3px]  text-white md:mx-auto lg:hidden block relative">
            <div className="flex flex-col gap-4 items-start justify-start mb-4">
              <div className="min-w-[100px] mt-1">
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

              {/* CUSTOMER - CENTRICITY */}
              <div className="">
                <p
                  className="font-bold flex items-start gap-1 text-[14px] sm:text-sm"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> CUSTOMER -
                  CENTRICITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[12px] sm:text-sm"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  Every meal is crafted with students in mind, ensuring it’s not
                  just food, but a moment of comfort and satisfaction.
                </p>
              </div>

              {/* QUALITY FIRST */}
              <div className="">
                <p
                  className="font-bold flex items-start gap-1 text-[14px] sm:text-sm"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> QUALITY FIRST
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[12px]"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  We never compromise on the quality of our ingredients or
                  preparation, delivering meals that are safe, nutritious &
                  delicious.
                </p>
              </div>
            </div>

            {/* Second Row: 3 more values */}
            <div className="flex flex-col items-start justify-start gap-4">
              {/* AFFORDABILITY */}
              <div className="">
                <p
                  className="font-bold flex items-start gap-1 text-[14px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> AFFORDABILITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[12px]"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  Great food should be accessible. We strive to keep our meals
                  budget-friendly without sacrificing taste or value.
                </p>
              </div>

              {/* DIVERSITY & INCLUSION */}
              <div className="">
                <p
                  className="font-bold flex items-start gap-1 text-[14px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> DIVERSITY &
                  INCLUSION
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[12px]"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  Our menu celebrates the diverse cultures and cuisines of our
                  students, ensuring there’s something for everyone.
                </p>
              </div>

              {/* SUSTAINABILITY + Image aligned inside */}
              <div className=" relative">
                <p
                  className="font-bold flex items-start gap-1 text-[14px]"
                  style={{
                    fontFamily: "Typo Round Bold Demo",
                  }}
                >
                  <span className="text-[#FF7F00]">|</span> SUSTAINABILITY
                </p>
                <p
                  className="mt-1 font-light leading-snug text-[12px]"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  We aim to minimize waste and use eco-friendly practices,
                  caring for the environment as
                  much as we care for our customers
                </p>
              </div>
              {/* Icon aligned to bottom right of the section */}
            </div>
            {/* <Image
              src="/images/about3.svg"
              alt="Values Icon"
              width={76.54}
              height={60}
              className="absolute bottom-0 right-0 opacity-55 select-none"
            /> */}
          </div>
          {/* Desktop View */}
          <div className="bg-[#031624] rounded-2xl relative text-white md:max-w-[987px] md:mx-auto lg:block hidden">
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
            <div className="flex relative gap-[61px]">
              <div className="flex flex-col gap-[16px] mt-[20px]">
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
                    We aim to minimize waste and use eco-friendly practices,
                    caring for the environment as
                    much as we care for our customers
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
              <div className="flex flex-col gap-[16px]  mt-[20px]">
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
                  {/* <Image
                    src="/images/Ourvlaues.svg"
                    alt="Values Icon"
                    width={76.54}
                    height={60}
                    className="
    absolute bottom-0 right-0 opacity-55 select-none
    w-[50px] h-[40px]          
    lg:w-[200px] lg:h-[160px]    
    lg:bottom-[-48px]
    lg:right-[-50px] 
  "
                  /> */}
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
