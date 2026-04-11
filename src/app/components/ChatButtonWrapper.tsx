"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ChatButton from "./ChatButton";

export default function ChatButtonWrapper() {
  const pathname = usePathname();
  const isWelcome = pathname === "/";
  const isHome    = pathname === "/home";

  const [heroReady, setHeroReady] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(32);
  const rafRef = useRef<number | null>(null);

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

  // Track foreground bottom edge on /home
  useEffect(() => {
    if (!isHome) return;

    const update = () => {
      const fg = document.querySelector(".main_content");
      if (!fg) return;
      const fgBottom = fg.getBoundingClientRect().bottom;
      const vh = window.innerHeight;
      // When foreground's bottom is within the viewport, push the button upward with it
      const offset = fgBottom >= vh ? 32 : vh - fgBottom + 32;
      setBottomOffset(offset);
    };

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isHome]);

  // Never show on welcome splash
  if (isWelcome) return null;
  // On /home: only after hero sequence
  if (isHome && !heroReady) return null;

  return <ChatButton bottomOffset={bottomOffset} />;
}
