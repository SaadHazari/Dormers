import React from 'react';

interface ChiliIconProps {
  filled?: boolean;
  className?: string;
}

export default function ChiliIcon({ filled = false, className = '' }: ChiliIconProps) {
  return (
    <svg 
      className={`w-5 h-5 ${className}`} 
      viewBox="0 0 24 24" 
      fill={filled ? "#f57f20" : "none"} 
      stroke={filled ? "#f57f20" : "#9CA3AF"} 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M6.208 19.387c-1.527-1.464-2.208-4.103-2.208-4.103s4.237 3.385 7.16 1.493 8.358-8.508 8.44-8.625A1.332 1.332 0 0018.667 6c0-.736-.597-1.333-1.334-1.333a1.335 1.335 0 00-.766.242s-6.732 5.617-8.72 8.618C5.86 16.527 8.397 21 8.397 21s-.66-.146-2.189-1.613z" />
      <path d="M18.5 4.5c0 0-.8-2-3-2-1.5 0-2 1.5-2 1.5" />
    </svg>
  );
}
