import * as React from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { ListMusic, PlusCircle, Sparkles } from 'lucide-react';

export function MediaQueue() {
  const { mediaQueue, currentMember } = useRoomStore();
  const [customUrlInput, setCustomUrlInput] = React.useState('');
  
  const isHost = currentMember?.is_host;

  const handleQueueMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim() || !isHost) return;
    
    // Logic extracted from page.tsx
    setCustomUrlInput('');
  };

  return (
    <div id="media-queue-container" className="order-5 lg:order-none bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3 flex flex-col shadow-sm dark:shadow-none transition-colors duration-200">
      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 dark:border-stone-850/60 font-sans">
        <div className="flex items-center space-x-2">
          <ListMusic className="w-4 h-4 text-amber-500 animate-pulse" />
          <span className="text-xs font-mono font-bold text-stone-900 dark:text-stone-200 uppercase tracking-widest">Media Queue</span>
        </div>
        <div className="text-[10px] font-mono text-stone-400 dark:text-stone-500 font-bold bg-stone-100 dark:bg-stone-800/50 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700/50 shadow-inner">
          {mediaQueue.length} items
        </div>
      </div>

      <div className="space-y-1.5 overflow-y-auto max-h-40 min-h-[60px] pr-1 scrollbar-thin">
        {mediaQueue.length === 0 ? (
          <div className="text-center text-xs text-stone-400 py-4 italic font-medium">Queue is empty</div>
        ) : (
          mediaQueue.map((url, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] sm:text-xs bg-stone-50 dark:bg-stone-900/60 p-2 rounded-lg border border-stone-200/50 dark:border-stone-800/50 truncate font-mono shadow-sm hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors">
              <span className="text-stone-400 font-bold w-4 text-right shrink-0">{i + 1}.</span>
              <span className="truncate text-stone-600 dark:text-stone-300" title={url}>{url}</span>
            </div>
          ))
        )}
      </div>

      {isHost && (
        <form onSubmit={handleQueueMedia} className="flex gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-850/50 shrink-0">
          <input
            type="url"
            placeholder="Paste YouTube or MP4 URL to queue..."
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            className="flex-1 text-[10px] sm:text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-850 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition shadow-inner font-mono"
          />
          <button
            type="submit"
            disabled={!customUrlInput.trim()}
            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-200 dark:disabled:bg-stone-800 text-stone-950 disabled:text-stone-400 rounded-lg transition-colors flex items-center gap-1 font-semibold text-[10px] sm:text-xs uppercase tracking-wider shrink-0 shadow-sm active:scale-95 disabled:shadow-none"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </form>
      )}

      {isHost && (
        <div className="pt-2 border-t border-stone-100 dark:border-stone-850/50 flex flex-wrap gap-1.5 shrink-0 justify-center">
           <button type="button" className="text-[9px] bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 px-2 py-1 rounded transition-colors flex items-center gap-1 font-bold uppercase tracking-wider active:scale-95 shadow-sm">
             <Sparkles className="w-3 h-3" />
             Demo Queue
           </button>
        </div>
      )}
    </div>
  );
}
