'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function ChatButton() {
    const [isChatOpen, setIsChatOpen] = useState(false);

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
      // UPDATED: Increased size (w-20 h-20), added hover scaling, and rounded-full
      className="fixed bottom-8 right-8 w-20 h-20 flex items-center justify-center transition-all duration-300 z-50 rounded-full hover:scale-110 active:scale-95"
      style={{
        // UPDATED: This creates the "Orange Halo" glow
        boxShadow: "0 0 25px 5px rgba(255, 127, 0, 0.6)",
        backgroundColor: "transparent"
      }}
    >
      <Image
        src="/images/chaticonnew.svg"
        alt="Chat Icon"
        // UPDATED: Increased image size to match the button
        width={80}
        height={80}
        className="drop-shadow-lg"
      />
    </button>
  );
}
