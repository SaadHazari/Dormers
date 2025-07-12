"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";

export default function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const name = searchParams.get("name") || "Guest";
  const email = searchParams.get("email") || "";
  const phone = searchParams.get("phone") || "";
  const location = searchParams.get("location") || "";
  const mealType = searchParams.get("mealType") || "";
  const duration = searchParams.get("duration") || "";
  const dietaryRestrictions = searchParams.get("dietaryRestrictions") || "";
  const startDate = searchParams.get("startDate") || "";

  const message = encodeURIComponent(
    `👋 Hey Dormer's! I just completed my payment!\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nLocation: ${location}\nMeal Type: ${mealType}\nDuration: ${duration}\nDietary Restrictions: ${dietaryRestrictions}\nStart Date: ${startDate}`
  );

  const whatsappLink = `https://wa.me/+971585556707?text=${message}`;

  return (
    <div className="h-screen bg-[#1E3A4F] flex flex-col justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm mx-auto text-center space-y-4">
        {/* Check Circle SVG */}
        <div className="flex justify-center items-center">
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="60" cy="60" r="60" fill="#CFF5D1" />
            <circle cx="60" cy="60" r="40" fill="#4CAF50" />
            <path
              d="M48 60L56 68L72 52"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Dynamic Title */}
        <h2 className="text-[#09910e] font-semibold text-[15px] font-[Montserrat]">
          Payment Successful
        </h2>
        <p className="text-gray-500 text-sm">
          Thank you {name}! We’ve received your payment
        </p>

        {/* Transaction Details */}
        <div className="space-y-3">
          <h1
            style={{
              color: "#1D1C1C",
              fontFamily: "Montserrat, sans-serif",
              fontSize: "16px",
              fontWeight: 600,
              lineHeight: "14px",
              textAlign: "left",
            }}
          >
            Transaction Details
          </h1>

          <div className="flex flex-col gap-3 mt-4">
            <div className="flex justify-between">
              <span
                style={{
                  color: "#878787",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                Plan:
              </span>
              <span
                style={{
                  color: "#1D1C1C",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                {mealType} ({duration})
              </span>
            </div>

            <div className="flex justify-between">
              <span
                style={{
                  color: "#878787",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                Start Date:
              </span>
              <span
                style={{
                  color: "#1D1C1C",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                {startDate}
              </span>
            </div>

            <div className="flex justify-between">
              <span
                style={{
                  color: "#878787",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                Location:
              </span>
              <span
                style={{
                  color: "#1D1C1C",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "12px",
                  fontWeight: 600,
                  lineHeight: "14px",
                }}
              >
                {location}
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp Button */}
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#1E3A4F] text-white rounded-full"
          style={{
            width: "153px",
            height: "31px",
            flexShrink: 0,
            margin: "0 auto",
          }}
        >
          <Image
            src="/images/whatsappicon.svg"
            alt="WhatsApp"
            width={16}
            height={16}
          />
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            Chat on WhatsApp
          </span>
        </a>
      </div>
    </div>
  );
}
