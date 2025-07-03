'use client';

import { useEffect, useRef } from 'react';

interface MatrixTextProps {
  text: string;
  className?: string;
}

const MatrixText = ({ text, className = '' }: MatrixTextProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Matrix characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()*&^%';
    const fontSize = 16;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(1);

    // Set text style
    ctx.fillStyle = '#EEE9DA';
    ctx.font = `${fontSize}px 'Typo Round Bold Demo', sans-serif`;

    function draw() {
      if (!canvas || !ctx) return;
      // Clear canvas
      ctx.fillStyle = 'rgba(30, 58, 79, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw characters
      ctx.fillStyle = '#EEE9DA';
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        // Reset drop to top when it reaches bottom
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      <div className="relative z-10 text-center">
        <h1 className="text-[32px] sm:text-[64px] md:text-5xl lg:text-6xl mb-2" style={{ 
          fontFamily: "'Typo Round Bold Demo', sans-serif",
          lineHeight: '1.1',
          WebkitTextStroke: '1.5px #EEE9DA',
          WebkitTextFillColor: 'transparent',
        }}>
          {text}
        </h1>
      </div>
    </div>
  );
};

export default MatrixText; 