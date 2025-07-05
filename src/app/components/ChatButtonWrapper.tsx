"use client";

import { usePathname } from "next/navigation";
import ChatButton from "./ChatButton";

export default function ChatButtonWrapper() {
  const pathname = usePathname();
  //  Hide ChatButton only on homepage `/`
  if (pathname === "/") return null;
  return <ChatButton />;
}
