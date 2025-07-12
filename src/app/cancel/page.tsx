"use client";

import { useRouter } from "next/navigation";

export default function CancelPage() {
  const router = useRouter();
  const buttonStyle = {
    backgroundColor: "#1e3b50",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "16px",
    padding: "12px 24px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    outline: "none",
    display: "inline-block",
  };

  return (
    <div className="h-screen bg-[#1E3A4F] flex flex-col justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm mx-auto text-center space-y-4">
        <div className="flex justify-center">
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "#ff8a8a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "50%",
                backgroundColor: "#f92828",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </div>
        </div>
        <h2
          style={{
            color: "#FF2623",
            fontFamily: "Montserrat, sans-serif",
            fontSize: "16px",
            fontStyle: "normal",
            fontWeight: 600,
            lineHeight: "normal",
            marginBottom: "8px",
          }}
        >
          Payment was cancelled
        </h2>

        <p
          style={{
            color: "#878787",
            textAlign: "center",
            fontFamily: "Montserrat, sans-serif",
            fontSize: "14px",
            fontStyle: "normal",
            fontWeight: 400,
            lineHeight: "14px",
          }}
        >
          If this wasn&rsquo;t intentional, you can try
          <br />
          the payment again or go back to the
          <br />
          home page
        </p>

        <button onClick={() => router.push("/")} style={buttonStyle}>
          Go Back Home
        </button>
      </div>
    </div>
  );
}
