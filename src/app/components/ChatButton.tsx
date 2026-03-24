'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function ChatButton() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pathname = usePathname();
  const [isAtTop, setIsAtTop] = useState(true);

  // ─── MAGIC SCROLL LOGIC TO HIDE CHAT BUBBLE ON HERO ───
  useEffect(() => {
    if (pathname !== "/home" && pathname !== "/") {
      setIsAtTop(false);
      return;
    }
    const handleScroll = () => {
      setIsAtTop(window.scrollY < window.innerHeight * 0.85);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); 
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname]);
  // ──────────────────────────────────────────────────────

  useEffect(() => {
    const handleOpen = () => setIsChatOpen(true);
    const handleClose = () => setIsChatOpen(false);

    window.addEventListener('open-chat', handleOpen);
    window.addEventListener('close-chat', handleClose);

    return () => {
      window.removeEventListener('open-chat', handleOpen);
      window.removeEventListener('close-chat', handleClose);
    };
  }, []);

  if (isChatOpen) return null;
  
  return (
    <button 
      onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
      className={`fixed bottom-6 right-6 w-12 h-10 flex items-center justify-center transition-all duration-500 z-50 ${
        isAtTop ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'
      }`}
    >
      <Image
        src="/images/chaticonnew.svg"
        alt="Chat Icon"
        width={50}
        height={50}
      />
    </button>
  );
}
