'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type AnimatedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary';
};

/** Accessible, reduced-motion-friendly animated button inspired by Vengeance UI. */
export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className, tone = 'primary', type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'group relative isolate inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3 text-sm font-semibold tracking-wide transition-[transform,background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none active:scale-[0.99] hover:-translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100',
        tone === 'primary'
          ? 'bg-stone-900 text-white shadow-sm hover:bg-stone-800 dark:bg-blue-600 dark:hover:bg-blue-500'
          : 'border border-stone-200 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 -translate-x-[120%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[120%] motion-reduce:transition-none" />
      {children}
    </button>
  )
);
AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;
