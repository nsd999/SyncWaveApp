'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export type AnimatedButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
  tone?: 'primary' | 'secondary';
};

/** Vengeance UI-inspired motion button, softened for SyncWave's service-portal UI. */
export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className, tone = 'primary', type = 'button', children, ...props }, ref) => {
    const reduceMotion = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        type={type}
        whileHover={reduceMotion ? undefined : { y: -1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className={cn(
          'relative isolate inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3 text-sm font-semibold tracking-wide',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          tone === 'primary'
            ? 'bg-stone-900 text-white shadow-sm hover:bg-stone-800 dark:bg-blue-600 dark:hover:bg-blue-500'
            : 'border border-stone-200 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
          className
        )}
        {...props}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 translate-x-[-120%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
        {children}
      </motion.button>
    );
  }
);
AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;
