"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-[#f0fff4] to-[#e6fffb]">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10 max-w-md w-full text-center border border-green-200">
        {/* Success Icon */}
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="text-green-500" size={60} />
        </div>

        {/* Main Heading */}
        <h1 className="text-2xl sm:text-3xl font-bold text-green-700 mb-2">
          Payment Successful
        </h1>

        {/* Thank You Message */}
        <p className="text-gray-700 text-sm sm:text-base mb-6">
          Thank you <span className="font-semibold">{name}</span>. We've
          received your payment.
        </p>

        {/* Transaction Details */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Transaction Details
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg text-left text-sm text-gray-700 p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Start Date:</span>
              <span className="font-medium">{startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Meal Plan:</span>
              <span className="font-medium">{mealType?.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duration:</span>
              <span className="font-medium">{duration?.replace("-", " ")}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <a
            href={whatsappLink}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white font-medium py-3 px-4 rounded-lg transition duration-300 flex items-center justify-center gap-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Chat on WhatsApp
          </a>

          <button
            onClick={() => router.push("/")}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-3 px-4 rounded-lg transition duration-300 flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Go to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}
