'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

export interface FaqAccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: FaqItem[];
  title?: string;
  description?: string;
}

/** Vengeance UI FAQ Accordion, adapted to SyncWave's accessible service-portal design. */
export function FaqAccordion({
  items,
  title = 'Frequently asked questions',
  description,
  className,
  ...props
}: FaqAccordionProps) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(0);

  return (
    <section className={cn('w-full max-w-4xl mx-auto py-8', className)} {...props}>
      {title && (
        <div className="mb-6 text-center">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-stone-950 dark:text-white">{title}</h2>
          {description && <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">{description}</p>}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/50">
        {items.map((item, index) => {
          const expanded = activeIndex === index;
          const panelId = `syncwave-faq-panel-${index}`;
          const triggerId = `syncwave-faq-trigger-${index}`;
          return (
            <div key={item.question} className="border-b border-stone-200 last:border-b-0 dark:border-stone-800">
              <h3>
                <button
                  id={triggerId}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setActiveIndex(expanded ? null : index)}
                  className={cn(
                    'flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium transition-colors sm:px-5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600',
                    expanded ? 'bg-blue-50/70 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100' : 'text-stone-800 hover:bg-stone-50 dark:text-stone-100 dark:hover:bg-stone-800/60'
                  )}
                >
                  <span>{item.question}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden="true" />
                </button>
              </h3>
              <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!expanded} className="px-4 pb-4 pt-1 text-sm leading-6 text-stone-600 dark:text-stone-300 sm:px-5">
                {item.answer}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default FaqAccordion;
