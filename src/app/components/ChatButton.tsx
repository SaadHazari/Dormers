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
      // UPDATED: Large size (w-20 h-20), Hover Zoom, NO Halo
      className="fixed bottom-8 right-8 w-20 h-20 flex items-center justify-center transition-all duration-300 z-50 hover:scale-110 active:scale-95"
    >
      <Image
        src="/images/chaticonnew.svg"
        alt="Chat Icon"
        // UPDATED: Large Image Size
        width={80}
        height={80}
        // UPDATED: Standard shadow for depth (No Orange Glow)
        className="drop-shadow-xl"
      />
    </button>
  );
}
