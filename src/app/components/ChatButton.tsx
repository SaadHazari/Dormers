'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

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
    <div className="fixed bottom-8 right-8 z-50" style={{ width: 60, height: 60 }}>
      {/* Breathing pulse ring — subtle, single layer */}
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.55, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.6 }}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '1.5px solid rgba(255, 127, 0, 0.55)',
          pointerEvents: 'none',
        }}
      />

      {/* Main button */}
      <motion.button
        onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: '#1E3A4F',
          border: '1.5px solid rgba(255, 127, 0, 0.45)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.22), 0 0 0 0 rgba(255,127,0,0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
        }}
        aria-label="Open chat"
      >
        <MessageCircle
          size={26}
          strokeWidth={1.8}
          color="#EEE9DA"
          fill="rgba(238,233,218,0.08)"
        />
      </motion.button>
    </div>
  );
}