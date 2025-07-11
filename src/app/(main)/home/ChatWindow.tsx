'use client';

import { useState, useEffect } from 'react';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatWindow({ isOpen, onClose }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [chatStep, setChatStep] = useState<'idle' | 'awaiting_name' | 'awaiting_email' | 'awaiting_phone' | 'done'>('idle');
  const [userDetails, setUserDetails] = useState<{ name?: string; email?: string; phone?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setMessages([
        'Bro, I\'m tired of instant noodles. Hook me up with Dormer\'s—real food, no stress! 🍛🔥'
      ]);
      setChatStep('idle');
      setUserDetails({});
    }
  }, [isOpen]);

  const emojis = ['😊', '😂', '🥰', '😍', '👋', '🙌', '👍', '❤️', '🎉', '✨', '🔥', '💯'];

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessages(prev => [...prev, trimmed]);

    // Chatbot logic
    if (chatStep === 'idle' && (/^hi$/i.test(trimmed) || /^hello$/i.test(trimmed))) {
      setTimeout(() => {
        setMessages(prev => [...prev, 'Hey there! 👋 What\'s your name?']);
      }, 500);
      setChatStep('awaiting_name');
    } else if (chatStep === 'awaiting_name') {
      setUserDetails(prev => ({ ...prev, name: trimmed }));
      setTimeout(() => {
        setMessages(prev => [...prev, `Nice to meet you, ${trimmed}! 😎 What\'s your email? 📧`]);
      }, 500);
      setChatStep('awaiting_email');
    } else if (chatStep === 'awaiting_email') {
      setUserDetails(prev => ({ ...prev, email: trimmed }));
      setTimeout(() => {
        setMessages(prev => [...prev, 'And your phone number? 📱']);
      }, 500);
      setChatStep('awaiting_phone');
    } else if (chatStep === 'awaiting_phone') {
      const name = userDetails.name || '';
      const email = userDetails.email || '';
      const phone = trimmed;
      setUserDetails(prev => ({ ...prev, phone }));
      setTimeout(() => {
        setMessages(prev => [...prev, 'Awesome, thanks! 🚀 We\'ll be in touch soon.', 'You\'re being redirected to WhatsApp for your query. An agent will hit you up! 💬🟢']);
        setTimeout(() => {
          const text = encodeURIComponent(
            `👋 Hey Dormer's! I want real food, no stress! 🍛🔥\nName: ${name}\nEmail: ${email}\nPhone: ${phone}`
          );
          window.open(`https://wa.me/971504619384?text=${text}`, '_blank');
        }, 1500);
      }, 500);
      setChatStep('done');
    }
    setMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 p-4">
      <div className="absolute top-[56%] left-1/2  transform -translate-x-1/2 -translate-y-1/2 bg-[#1E3A4F] rounded-2xl overflow-hidden w-[364px]">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
              {/* Simple SVG Avatar */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="14" fill="#FFB300"/>
                <ellipse cx="14" cy="11" rx="5" ry="5" fill="#fff"/>
                <ellipse cx="14" cy="21" rx="7" ry="4" fill="#fff"/>
                <circle cx="12" cy="11" r="1" fill="#222"/>
                <circle cx="16" cy="11" r="1" fill="#222"/>
                <path d="M12 15 Q14 17 16 15" stroke="#222" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-white font-medium"
            style={{
      fontFamily: "Typo Round Bold Demo , sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Welcome to Live chat!</span>
          </div>
          <button 
            onClick={onClose}
            className="text-white hover:opacity-75"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Chat Messages Area */}
        <div className="h-[400px] overflow-y-auto p-4 bg-[#15304A] flex flex-col gap-4">
          {messages.map((msg, idx) => (
            <div key={idx} className="bg-[#EEE9DA] text-[#1E3A4F] px-4 py-2 rounded-xl w-fit max-w-full"
            style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}>
              {msg}
            </div>
          ))}
          {chatStep === 'done' && (
            <div className="bg-[#FF6B00] text-white px-4 py-2 rounded-xl w-fit max-w-full mt-2 text-sm">
              <div><b>Name:</b> {userDetails.name || '-'}</div>
              <div><b>Email:</b> {userDetails.email || '-'}</div>
              <div><b>Phone:</b> {userDetails.phone || '-'}</div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-700">
          {/* Emoji Panel */}
          {showEmojis && (
            <div className="absolute bottom-[80px] left-4 bg-white rounded-lg p-2 shadow-lg">
              <div className="grid grid-cols-6 gap-2">
                {emojis.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setMessage(prev => prev + emoji);
                      setShowEmojis(false);
                    }}
                    className="text-xl hover:bg-gray-100 p-1 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2">
            <input
              type="text"
              placeholder="Please write your message and press the send button"
              className="flex-1 outline-none text-sm text-gray-800 placeholder-gray-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}
            />
            <button 
              onClick={() => setShowEmojis(!showEmojis)}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <span className="text-xl">☺</span>
            </button>
            <button 
              className="bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={handleSend}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 transform rotate-45" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 