'use client';

import * as React from 'react';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export default function Logo({ className = '', iconOnly = false }: LogoProps) {
  return (
    <div id="syncwave-logo" className={`flex items-center space-x-2.5 select-none ${className}`}>
      {/* SVG Icon showing 3 stacked horizontal waves in cyan-to-purple gradient */}
      <svg
        viewBox="0 0 100 100"
        className="w-9 h-9 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        id="logo-svg"
      >
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#005aa9" /> {/* Cyan 400 */}
            <stop offset="50%" stopColor="#2476bf" /> {/* Blue 500 */}
            <stop offset="100%" stopColor="#f58220" /> {/* Fuchsia 500 */}
          </linearGradient>
        </defs>
        
        {/* Three wavy ripples custom stacked */}
        <path
          d="M 15 35 Q 32.5 24, 50 35 T 85 35"
          stroke="url(#waveGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 15 50 Q 32.5 39, 50 50 T 85 50"
          stroke="url(#waveGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 15 65 Q 32.5 54, 50 65 T 85 65"
          stroke="url(#waveGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      
      {!iconOnly && (
        <span 
          id="logo-text" 
          className="font-sans font-bold tracking-tight text-xl text-stone-900 dark:text-white"
        >
          SyncWave
        </span>
      )}
    </div>
  );
}
