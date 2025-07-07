'use client';

export default function CancelPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 min-h-screen flex flex-col items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full text-center">
        <div className="text-red-500 mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Payment Cancelled
        </h1>
        <p className="text-gray-600 mb-6">
          Your payment was not completed. You haven't been charged.
        </p>

        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 text-left">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-500"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">
                If this was unexpected, please check your payment method or try
                again.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button
            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 border border-gray-300 rounded-md transition duration-150 ease-in-out"
            onClick={() => (window.location.href = "/")}
          >
            Return to Homepage
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Need help?{" "}
          <a
            href="mailto:support@example.com"
            className="text-red-600 hover:text-red-700"
          >
            Contact our support team
          </a>
        </p>
      </div>
    </div>
  );
}
