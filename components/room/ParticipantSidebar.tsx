import * as React from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { Users, Crown, MicOff, Mic, UserX, X } from 'lucide-react';

export function ParticipantSidebar() {
  const { roomMetadata, members, currentMember, user } = useRoomStore();

  const activeMembers = members.filter((m) => m.status === 'active' && !m.is_banned);
  const isHost = currentMember?.is_host;

  const handleKick = (memberId: string) => {
    // Logic extracted from page.tsx
  };

  const handleBan = (memberId: string) => {
    // Logic extracted from page.tsx
  };

  const toggleMute = (memberId: string, currentMute: boolean) => {
    // Logic extracted from page.tsx
  };

  return (
    <div id="participants-sidebar" className="order-2 lg:order-none bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-4 flex flex-col min-h-[300px] shadow-sm dark:shadow-none transition-colors duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-850/60 shrink-0">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
          <span className="text-xs font-mono font-bold text-stone-900 dark:text-stone-200 uppercase tracking-widest">Active Audience</span>
        </div>
        <div className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded-full font-mono flex items-center gap-1 shrink-0 select-none">
          <span className="relative flex h-1.5 w-1.5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1 w-1 bg-emerald-500"></span>
          </span>
          {activeMembers.length}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin max-h-64 sm:max-h-80 md:max-h-[500px] lg:max-h-[600px] xl:max-h-[700px]">
        {activeMembers.length === 0 ? (
          <div className="text-center py-4 text-stone-400 text-xs italic font-medium">No one is here yet.</div>
        ) : (
          activeMembers.map((member) => {
            const isMe = member.id === currentMember?.id;
            const isRoomHost = member.is_host;
            const nickname = member.display_name || 'Guest';
            const avatar = `https://picsum.photos/seed/${encodeURIComponent(nickname)}/100`;

            return (
              <div key={member.id} className={`flex flex-col gap-1.5 p-2 rounded-xl transition-all duration-200 ${isMe ? 'bg-amber-500/5 border border-amber-500/20' : 'hover:bg-stone-50 dark:hover:bg-stone-900/60'}`}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <img src={avatar} alt={nickname} className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-stone-200 dark:ring-stone-800" />
                      {isRoomHost && (
                        <div className="absolute -bottom-1 -right-1 bg-amber-100 dark:bg-amber-900/50 p-0.5 rounded-full border border-amber-200 dark:border-amber-700/50 z-10 shadow-sm" title="Room Host">
                          <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">{nickname}</span>
                        {isMe && <span className="text-[8px] bg-amber-500 text-stone-950 font-extrabold px-1.5 py-0.5 rounded uppercase font-mono shrink-0">You</span>}
                      </div>
                      <span className="text-[10px] text-stone-400 flex items-center gap-1 font-medium truncate">
                        <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full shrink-0"></span> Online
                      </span>
                    </div>
                  </div>
                  
                  {member.is_muted && (
                    <div className="shrink-0 text-rose-500 bg-rose-50 dark:bg-rose-500/10 p-1 rounded-md" title="Muted by Host">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {isHost && !isMe && (
                  <div className="flex items-center gap-1 pt-1 border-t border-stone-200/60 dark:border-stone-850/60 mt-1">
                    <button onClick={() => toggleMute(member.id, !!member.is_muted)} className="flex-1 text-[9px] font-mono uppercase bg-stone-100 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400 py-1 rounded transition flex items-center justify-center gap-1 active:scale-95">
                      {member.is_muted ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                      <span>{member.is_muted ? 'Unmute' : 'Mute'}</span>
                    </button>
                    <button onClick={() => handleKick(member.id)} className="flex-1 text-[9px] font-mono uppercase bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-450 py-1 rounded transition flex items-center justify-center gap-1 active:scale-95" title="Remove from room">
                      <X className="w-3 h-3" />
                      <span>Kick</span>
                    </button>
                    <button onClick={() => handleBan(member.id)} className="flex-1 text-[9px] font-mono uppercase bg-red-100 dark:bg-red-950/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 py-1 rounded transition flex items-center justify-center gap-1 active:scale-95" title="Permanently ban">
                      <UserX className="w-3 h-3" />
                      <span>Ban</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
