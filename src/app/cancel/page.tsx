'use client';

import { useRouter } from 'next/navigation';

export default function CancelPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <h2 className="text-red-600 text-2xl font-bold mb-4">
        {"❌ Payment was cancelled."}
      </h2>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        {"If this wasn't intentional, you can try the payment again or go back to the home page."}
      </p>
      <button
        onClick={() => router.push('/')}
        className="bg-[#FF6B00] text-white font-semibold px-6 py-2 rounded-full hover:bg-[#e55f00] transition"
      >
        🔁 Go Back Home
      </button>
    </div>
  );
}
