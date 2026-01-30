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
      className="fixed bottom-6 right-6 w-12 h-10 flex items-center justify-center  transition-all z-50"
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
