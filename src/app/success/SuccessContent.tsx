'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export default function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const name = searchParams.get('name') || 'Guest';
  const email = searchParams.get('email') || '';
  const phone = searchParams.get('phone') || '';
  const location = searchParams.get('location') || '';
  const mealType = searchParams.get('mealType') || '';
  const duration = searchParams.get('duration') || '';
  const dietaryRestrictions = searchParams.get('dietaryRestrictions') || '';
  const startDate = searchParams.get('startDate') || '';

  const message = encodeURIComponent(
    `👋 Hey Dormer's! I just completed my payment!\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nLocation: ${location}\nMeal Type: ${mealType}\nDuration: ${duration}\nDietary Restrictions: ${dietaryRestrictions}\nStart Date: ${startDate}`
  );

  const whatsappLink = `https://wa.me/+971585556707?text=${message}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-[#f0fff4] to-[#e6fffb]">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-10 max-w-md w-full text-center border border-green-200">
        <div className="flex justify-center mb-4">
          <CheckCircle2 className="text-green-500" size={60} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-green-700 mb-2">
          Payment Successful!
        </h1>

        <p className="text-gray-700 text-sm sm:text-base mb-4">
          Thank you <strong>{name}</strong>!{" We've"} received your payment.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg text-left text-sm text-gray-700 p-4 mb-6">
          <p><strong>📦 Plan:</strong> {mealType?.toUpperCase()} ({duration?.replace('-', ' ')})</p>
          <p><strong>📅 Start Date:</strong> {startDate}</p>
          <p><strong>📍 Location:</strong> {location}</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <a
            href={whatsappLink}
            className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-full transition duration-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Chat on WhatsApp
          </a>

          <button
            onClick={() => router.push('/')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-full transition duration-300"
          >
            🏠 Go to Homepage
          </button>
        </div>
      </div>
    </div>
  );
}