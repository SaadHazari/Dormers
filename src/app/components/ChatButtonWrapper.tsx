"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ChatButton from "./ChatButton";

export default function ChatButtonWrapper() {
  const pathname = usePathname();
  const isWelcome = pathname === "/";
  const isHome    = pathname === "/home";

  const [heroReady, setHeroReady] = useState(true);

  useEffect(() => {
    if (!isHome) return;

    const show = () => setHeroReady(true);
    const hide = () => setHeroReady(false);

    window.addEventListener("hero-ui-visible", show);
    window.addEventListener("hero-ui-hidden",  hide);
    return () => {
      window.removeEventListener("hero-ui-visible", show);
      window.removeEventListener("hero-ui-hidden",  hide);
    };
  }, [isHome]);

  // Never show on welcome splash
  if (isWelcome) return null;
  // On /home: only after hero sequence
  if (isHome && !heroReady) return null;

  return <ChatButton />;
}
