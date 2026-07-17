"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ChatButton from "./ChatButton";

export default function ChatButtonWrapper() {
  const pathname = usePathname();
  const isWelcome = pathname === "/";
  const isHome    = pathname === "/home";

  const [heroReady, setHeroReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isHome) return;

    const show = () => setHeroReady(true);
    window.addEventListener("hero-ui-visible", show);
    return () => {
      window.removeEventListener("hero-ui-visible", show);
    };
  }, [isHome]);

  // On /home, fade the button out once the footer starts to take over the
  // viewport. Previously it rode UP with the foreground's bottom edge, which
  // dumped it on top of the last section (and into the footer grid). Fading it
  // out near the end is cleaner and never overlaps content.
  useEffect(() => {
    if (!isHome) {
      setHidden(false);
      return;
    }

    const update = () => {
      const fg = document.querySelector(".main_content");
      if (!fg) return;
      const fgBottom = fg.getBoundingClientRect().bottom;
      setHidden(fgBottom < window.innerHeight);
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

  return <ChatButton hidden={hidden} />;
}
