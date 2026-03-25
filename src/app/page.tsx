"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Instantly teleports the user to the actual home page, bypassing the old curtain
    router.push("/home");
  }, [router]);

  return <div className="min-h-screen bg-[#1E3A4F]" />; 
}
