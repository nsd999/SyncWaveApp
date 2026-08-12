import * as React from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { Send, MessageSquare, MicOff } from 'lucide-react';

export function ChatBox() {
  const { messages, currentMember, roomCode, isTyping, setIsTyping } = useRoomStore();
  const [typedMessage, setTypedMessage] = React.useState('');
  const [unreadCount, setUnreadCount] = React.useState(0);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  
  // Fake typing list for now
  const typingUsers: string[] = [];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !roomCode || !currentMember) return;
    
    // Logic for sending message will be pulled from main page
    setTypedMessage('');
    setIsTyping(false);
  };

  const handleTypingKeydown = () => {
    if (!isTyping) {
      setIsTyping(true);
      // Logic for broadcasting typing
    }
  };

  return (
    <div id="live-chat-container" className="order-4 lg:order-none bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3 flex flex-col min-h-[224px] shadow-sm dark:shadow-none transition-colors duration-200">
      <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 dark:border-stone-850/60 shrink-0">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-mono font-bold text-stone-900 dark:text-stone-200 uppercase tracking-widest">Live Chat</span>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => {
              setUnreadCount(0);
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-[9px] bg-amber-500 text-stone-950 font-extrabold px-2 py-0.5 rounded-full animate-bounce"
          >
            {unreadCount} NEW
          </button>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="text-[9px] font-mono text-amber-500/95 animate-pulse flex items-center gap-1 shrink-0 bg-amber-500/[0.02] px-1.5 py-0.5 rounded-md">
          <span className="h-1 w-1 bg-amber-500 rounded-full animate-ping"></span>
          <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
        </div>
      )}

      <div id="messages-list" className="flex-1 overflow-y-auto p-2 space-y-2 bg-stone-50 dark:bg-stone-950/40 rounded-xl border border-stone-200 dark:border-stone-850/60 scrollbar-thin max-h-48 min-h-[110px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3">
            <MessageSquare className="w-5 h-5 text-stone-300 dark:text-stone-700 mb-1 shrink-0" />
            <p className="text-xs text-stone-400 dark:text-stone-500 font-medium italic">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const nickname = msg.sender_name || 'Guest';
            const avatar = `https://picsum.photos/seed/${encodeURIComponent(nickname)}/100`;

            return (
              <div key={msg.id} className="flex items-start gap-2 py-0.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-900/40 px-2 rounded transition-colors duration-150">
                <img 
                  src={avatar} 
                  alt={nickname} 
                  className="w-7 h-7 rounded-md object-cover border border-stone-200 dark:border-stone-850 mt-0.5 shrink-0" 
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-extrabold text-stone-800 dark:text-stone-200 text-[11px] truncate">{nickname}</span>
                    <span className="text-[8px] font-mono text-stone-405 dark:text-stone-500">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-stone-605 dark:text-stone-300 select-text leading-relaxed whitespace-pre-wrap mt-0.5 break-words text-[11px]">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="shrink-0">
        {currentMember?.is_muted ? (
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-2 text-[10px] text-rose-500 dark:text-rose-450 leading-snug flex items-center gap-1.5 select-none">
            <MicOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Muted by the room host.</span>
          </div>
        ) : (
          <form 
            onSubmit={(e) => {
              handleSendMessage(e);
              setUnreadCount(0);
            }} 
            className="flex gap-1.5 animate-fade-in"
          >
            <input
              type="text"
              maxLength={160}
              placeholder="Type a message..."
              value={typedMessage}
              onChange={(e) => {
                setTypedMessage(e.target.value);
                handleTypingKeydown();
              }}
              className="flex-1 bg-stone-100 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 text-xs px-3 py-1.5 rounded-lg text-stone-900 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={!typedMessage.trim()}
              className="p-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition cursor-pointer disabled:bg-stone-200 dark:disabled:bg-stone-910 disabled:text-stone-400 dark:disabled:text-stone-700 shrink-0 select-none flex items-center justify-center active:scale-95"
            >
              <Send className="w-3.5 h-3.5 text-stone-950 fill-stone-950" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
