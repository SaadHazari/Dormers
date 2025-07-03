'use client';
import Image from 'next/image';

export default function ChatButton() {
  return (
    <button 
      onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
      className="fixed bottom-6 right-6 w-12 h-10 flex items-center justify-center  transition-all z-50"
    >
      <Image
        src="images/chaticonnew.svg"
        alt="Chat Icon"
        width={50}
        height={50}
      />
    </button>
  );
} 