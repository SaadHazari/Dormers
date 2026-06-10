"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import { whatsAppHref } from "@/shared/contacts";
import { useBodyScrollLock } from "@/ui-system/hooks/useBodyScrollLock";
import { closeChat as broadcastClose, subscribeChatBus } from "@/contexts/chatbot/ui/chat-bus";

function renderMd(s: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = re.exec(s)) !== null) {
        if (match.index > last) parts.push(s.slice(last, match.index));
        if (match[2]) parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{match[2]}</strong>);
        else if (match[3]) parts.push(<em key={key++} style={{ fontStyle: 'italic' }}>{match[3]}</em>);
        last = match.index + match[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts.length ? parts : s;
}

const LOADING_WORDS = [
    "prepping...", "cooking...", "heating up...", "chopping...",
    "pouring...", "mixing...", "serving...", "splashing...",
    "cracking...", "juicing...", "blending...", "sauteing"
];

function TypingLoader() {
    const [displayText, setDisplayText] = useState("");
    const [wordIndex, setWordIndex] = useState(
        () => Math.floor(Math.random() * LOADING_WORDS.length)
    );

    useEffect(() => {
        const currentWord = LOADING_WORDS[wordIndex];
        let charIndex = 0;

        const interval = setInterval(() => {
            charIndex++;
            setDisplayText(currentWord.slice(0, charIndex));
            if (charIndex === currentWord.length) {
                clearInterval(interval);
                setTimeout(() => {
                    setDisplayText("");
                    setWordIndex(prev => {
                        let next;
                        do { next = Math.floor(Math.random() * LOADING_WORDS.length); }
                        while (next === prev);
                        return next;
                    });
                }, 600);
            }
        }, 80);

        return () => clearInterval(interval);
    }, [wordIndex]);

    return (
        <span className="text-sm text-[#ede8da] font-medium italic">
            {displayText}
        </span>
    );
}

export default function AIChatbot() {
    const [input, setInput] = useState('');
    const { messages, status, sendMessage } = useChat();
    const [isOpen, setIsOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useBodyScrollLock(isOpen);

    // In v5, we check status instead of a boolean 'isLoading'
    const isLoading = status === 'submitted' || status === 'streaming';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const closeChat = () => {
        setIsOpen(false);
        broadcastClose();
    };

    useEffect(() => subscribeChatBus(setIsOpen), []);

    // Our custom submit handler for v5
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage({ text: input }); // Send to the AI
        setInput(''); // Clear the box
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-[#091825]/40 backdrop-blur-sm sm:hidden pointer-events-auto"
                            onClick={closeChat}
                        />

                        <motion.div
                            initial={{ y: "100%", scale: 0.95, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: "100%", scale: 0.95, opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full sm:w-[440px] h-[78vh] sm:h-[600px] min-h-[420px] bg-[#091825]/40 backdrop-blur-[28px] saturate-[1.5] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_1px_0_0_rgba(255,255,255,0.06),0_8px_32px_0_rgba(0,0,0,0.25)] rounded-t-[24px] sm:rounded-[24px] border border-white/20 overflow-hidden flex flex-col font-montserrat pointer-events-auto sm:fixed sm:bottom-6 sm:right-6"
                            style={{
                                WebkitBackdropFilter: "blur(28px) saturate(1.5)",
                                backdropFilter: "blur(28px) saturate(1.5)",
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 px-5 border-b border-white/10 z-20">
                                <div>
                                    <h3 className="text-[#ede8da] font-semibold text-[16px]">Dormers Concierge</h3>
                                    <p className="text-[#f57f20] text-[12px] font-medium">Online</p>
                                </div>
                                <button
                                    onClick={closeChat}
                                    className="text-white/40 hover:text-white transition-colors p-1"
                                >
                                    <X size={20} strokeWidth={2} />
                                </button>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4 custom-scrollbar">
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-70">
                                        <span className="text-4xl">👋</span>
                                        <p className="text-[#ede8da] text-[14px]">
                                            Hey! Ask me about our menu, delivery times, or how the subscription works.
                                        </p>
                                    </div>
                                )}

                                {messages.map((m) => (
                                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                        <div
                                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${m.role === "user"
                                                ? "bg-[#f57f20]/15 backdrop-blur-md border border-[#f57f20]/35 text-[#ede8da] rounded-br-sm font-medium"
                                                : "bg-[#ede8da]/15 backdrop-blur-md border border-[#ede8da]/20 text-[#ede8da] rounded-bl-sm font-light tracking-wide"
                                                }`}
                                        >
                                            {/* v5 uses message 'parts' instead of direct content */}
                                            {m.parts?.map((part, index) => {
                                                if (part.type === 'text') {
                                                    const hasEscalation = part.text.includes('[WHATSAPP_ESCALATION]');
                                                    const hasViewPlans = part.text.includes('[VIEW_PLANS]');
                                                    const hasViewMenu = part.text.includes('[VIEW_MENU]');

                                                    let cleanText = part.text.replace('[WHATSAPP_ESCALATION]', '');
                                                    cleanText = cleanText.replace('[VIEW_PLANS]', '');
                                                    cleanText = cleanText.replace('[VIEW_MENU]', '').trim();

                                                    return (
                                                        <div key={index} className="flex flex-col gap-3">
                                                            {cleanText && <span className="whitespace-pre-wrap">{m.role === 'user' ? cleanText : renderMd(cleanText)}</span>}
                                                            {hasEscalation && (
                                                                <a
                                                                    href={whatsAppHref()}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="bg-[#25D366] text-white py-2 px-4 rounded-xl flex items-center justify-center font-semibold text-[13px] hover:bg-[#20bd5a] transition-all w-fit mt-1"
                                                                >
                                                                    Chat on WhatsApp
                                                                </a>
                                                            )}
                                                            {hasViewPlans && (
                                                                <a
                                                                    href="/maintenance"
                                                                    onClick={closeChat}
                                                                    className="bg-[#f57f20]/15 backdrop-blur-sm border border-[#f57f20]/35 text-[#f57f20] py-2 px-5 rounded-full flex items-center justify-center font-black uppercase tracking-wider text-[11px] hover:bg-[#f57f20]/25 transition-all w-fit mt-1"
                                                                >
                                                                    View Plans
                                                                </a>
                                                            )}
                                                            {hasViewMenu && (
                                                                <a
                                                                    href="#menu"
                                                                    onClick={closeChat}
                                                                    className="bg-[#f57f20]/15 backdrop-blur-sm border border-[#f57f20]/35 text-[#f57f20] py-2 px-5 rounded-full flex items-center justify-center font-black uppercase tracking-wider text-[11px] hover:bg-[#f57f20]/25 transition-all w-fit mt-1"
                                                                >
                                                                    View Menu
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    </div>
                                ))}

                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-white/[0.08] backdrop-blur-md border border-white/10 text-[#ede8da] rounded-2xl rounded-bl-sm px-4 py-3 min-w-[110px]">
                                            <TypingLoader />
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <div className="p-4 bg-[#091825]/40 border-t border-white/10">
                                <form onSubmit={onSubmit} className="flex gap-2 relative">
                                    <input
                                        className="w-full bg-white/5 text-[#ede8da] pl-4 pr-12 py-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#f57f20] transition-colors text-[16px] sm:text-[14px] placeholder-white/30"
                                        value={input}
                                        placeholder="Type your question..."
                                        onChange={(e) => setInput(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!input || isLoading}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#f57f20] text-[#091825] rounded-lg hover:bg-[#ff8f36] disabled:opacity-40 disabled:hover:bg-[#f57f20] transition-all"
                                    >
                                        <Send size={16} strokeWidth={2.5} />
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}