'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  text: string;
  isUser: boolean;
};

export default function ChatWindow({ isOpen, onClose }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStep, setChatStep] = useState<'idle' | 'awaiting_name' | 'awaiting_email' | 'awaiting_phone' | 'done'>('idle');
  const [userDetails, setUserDetails] = useState<{ name?: string; email?: string; phone?: string }>({});

  // NEW: Reference to the bottom of the chat list
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // NEW: Function to scroll to the bottom smoothly
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // NEW: Trigger scroll whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, chatStep]);

  // NEW: Lock background scrolling when chat is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Freeze background
    } else {
      document.body.style.overflow = 'unset'; // Unfreeze
    }
    // Cleanup when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setMessages([
        { text: 'Bro, I\'m tired of instant noodles. Hook me up with Dormer\'s—real food, no stress! 🍛🔥', isUser: false }
      ]);
      setChatStep('idle');
      setUserDetails({});
    }
  }, [isOpen]);

  const emojis = ['😊', '😂', '🥰', '😍', '👋', '🙌', '👍', '❤️', '🎉', '✨', '🔥', '💯'];

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { text: trimmed, isUser: true }]);

    if (chatStep === 'idle' && (/^hi$/i.test(trimmed) || /^hello$/i.test(trimmed))) {
      setTimeout(() => {
        setMessages(prev => [...prev, { text: 'Hey there! 👋 What\'s your name?', isUser: false }]);
      }, 500);
      setChatStep('awaiting_name');
    } else if (chatStep === 'awaiting_name') {
      setUserDetails(prev => ({ ...prev, name: trimmed }));
      setTimeout(() => {
        setMessages(prev => [...prev, { text: `Nice to meet you, ${trimmed}! 😎 What's your email? 📧`, isUser: false }]);
      }, 500);
      setChatStep('awaiting_email');
    } else if (chatStep === 'awaiting_email') {
      setUserDetails(prev => ({ ...prev, email: trimmed }));
      setTimeout(() => {
        setMessages(prev => [...prev, { text: 'And your phone number? 📱', isUser: false }]);
      }, 500);
      setChatStep('awaiting_phone');
    } else if (chatStep === 'awaiting_phone') {
      const name = userDetails.name || '';
      const email = userDetails.email || '';
      const phone = trimmed;
      setUserDetails(prev => ({ ...prev, phone }));
      setTimeout(() => {
        setMessages(prev => [...prev, 
          { text: 'Awesome, thanks! 🚀 We\'ll be in touch soon.', isUser: false },
          { text: 'You\'re being redirected to WhatsApp for your query. An agent will hit you up! 💬🟢', isUser: false }
        ]);
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
    <div className="fixed inset-0 bg-black/50 z-50 p-4 flex items-center justify-center">
      {/* UPDATED: Added 'relative' and removed fixed positioning to center it better 
         This helps prevent the "touch-through" scrolling issues on some mobile browsers
      */}
      <div className="bg-[#1E3A4F] rounded-2xl overflow-hidden w-[340px] md:w-[364px] relative shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="14" fill="#FFB300" />
                <ellipse cx="14" cy="11" rx="5" ry="5" fill="#fff" />
                <ellipse cx="14" cy="21" rx="7" ry="4" fill="#fff" />
                <circle cx="12" cy="11" r="1" fill="#222" />
                <circle cx="16" cy="11" r="1" fill="#222" />
                <path d="M12 15 Q14 17 16 15" stroke="#222" strokeWidth="1.2" fill="none" strokeLinecap="round" />
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
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('close-chat'));
            }}
            className="text-white hover:opacity-75"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Chat Messages Area */}
        <div className="h-[330px] overflow-y-auto p-4 bg-[#15304A] flex flex-col gap-4 scroll-smooth">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`px-4 py-2 rounded-xl max-w-[85%] w-fit ${
                msg.isUser 
                  ? "bg-[#FF7F00] text-white self-end rounded-tr-none" 
                  : "bg-[#EEE9DA] text-[#1E3A4F] self-start rounded-tl-none"
              }`}
              style={{
                fontFamily: "Montserrat, sans-serif",
                fontWeight: 700,
                lineHeight: "normal",
                letterSpacing: "0",
              }}>
              {msg.text}
            </div>
          ))}
          
          {chatStep === 'done' && (
            <div className="bg-[#FF6B00]/20 border border-[#FF6B00] text-white px-4 py-2 rounded-xl w-full mt-2 text-sm self-center">
              <div><b>Name:</b> {userDetails.name || '-'}</div>
              <div><b>Email:</b> {userDetails.email || '-'}</div>
              <div><b>Phone:</b> {userDetails.phone || '-'}</div>
            </div>
          )}
          
          {/* NEW: Invisible element to anchor the scroll to the bottom */}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-700 shrink-0">
          {showEmojis && (
            <div className="absolute bottom-[80px] left-4 bg-white rounded-lg p-2 shadow-lg z-10">
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

          <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 w-full">
            <input
              type="text"
              placeholder="Please write your message..."
              className="flex-1 w-full min-w-0 outline-none text-sm text-gray-800 placeholder-gray-500"
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
              className="text-gray-400 hover:text-gray-600 p-1 shrink-0"
            >
              <span className="text-xl">☺</span>
            </button>
            <button
              className="bg-[#2AABEE] hover:bg-[#229ED9] text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors shrink-0"
              onClick={handleSend}
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 transform rotate-45" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
