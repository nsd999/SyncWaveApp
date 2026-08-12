import * as React from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { Disc, Play, Pause, Music, Tv, Volume2, VolumeX, SkipForward, Maximize, RotateCcw, RotateCw } from 'lucide-react';
import ReactPlayer from 'react-player';

export function VideoPlayer() {
  const { roomMetadata, currentMember, playbackState, isTyping } = useRoomStore();
  const playerRef = React.useRef<any>(null);
  
  const [isPlayingLocal, setIsPlayingLocal] = React.useState(false);
  const [volume, setVolume] = React.useState(0.8);
  const [isMuted, setIsMuted] = React.useState(false);
  const [playbackRate, setPlaybackRate] = React.useState(1);

  const isHost = currentMember?.is_host;
  
  // Dummy logic for now
  const mediaUrl = roomMetadata?.media_url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  const mediaType = roomMetadata?.media_type || 'video';
  const duration = 0;
  const currentTime = 0;

  const handlePlayPause = () => {
    // Logic extracted from page.tsx
  };

  const handleSeek = (time: number) => {
    // Logic extracted from page.tsx
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  return (
    <div id="media-player-container" className="order-1 lg:order-none lg:col-span-2 row-span-2 bg-black rounded-3xl border-2 border-stone-800/80 shadow-2xl overflow-hidden relative group aspect-video min-h-[300px] sm:min-h-[400px] lg:min-h-0 flex flex-col transition-all duration-300 hover:shadow-amber-500/10 hover:border-stone-700">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent z-10 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase border border-amber-500/30 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
            <Disc className="w-3.5 h-3.5 animate-spin-slow" />
            LIVE
          </div>
          <div className="bg-stone-900/60 text-stone-300 px-3 py-1 rounded-full text-xs font-medium border border-stone-700/50 backdrop-blur-md shadow-lg truncate max-w-[150px] sm:max-w-[200px]">
            {roomMetadata?.name || 'SyncWave Room'}
          </div>
        </div>
        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-stone-800 text-stone-300 text-xs font-mono shadow-xl pointer-events-auto flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
           {isHost ? 'HOST' : 'GUEST'}
        </div>
      </div>

      <div className="flex-1 relative w-full h-full bg-stone-950 flex items-center justify-center overflow-hidden group/player">
        <ReactPlayer
          ref={playerRef}
          url={mediaUrl}
          playing={isPlayingLocal}
          volume={volume}
          muted={isMuted}
          playbackRate={playbackRate}
          width="100%"
          height="100%"
          controls={false}
          style={{ position: 'absolute', top: 0, left: 0 }}
          config={{
            youtube: { playerVars: { disablekb: 1, modestbranding: 1, rel: 0 } as any },
            file: { attributes: { crossOrigin: "anonymous" } }
          }}
        />

        {mediaType === 'audio' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gradient-to-br from-stone-900 via-black to-stone-900 pointer-events-none">
             <div className="relative">
               <div className={`absolute inset-0 bg-amber-500/20 rounded-full blur-3xl transition-opacity duration-1000 ${isPlayingLocal ? 'opacity-100 animate-pulse' : 'opacity-0'}`}></div>
               <Music className={`w-32 h-32 sm:w-48 sm:h-48 text-stone-800 drop-shadow-2xl transition-transform duration-700 ${isPlayingLocal ? 'scale-105 text-amber-500/80' : 'scale-100'}`} />
             </div>
             <p className="mt-8 text-stone-500 font-mono text-sm tracking-widest uppercase opacity-70">Audio Track Active</p>
          </div>
        )}

        <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center transition-all duration-300 ${!isPlayingLocal ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
           <button onClick={handlePlayPause} className="w-20 h-20 sm:w-24 sm:h-24 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 shadow-[0_0_40px_rgba(245,158,11,0.4)] cursor-pointer group/play">
             <Play className="w-10 h-10 sm:w-12 sm:h-12 ml-2 fill-stone-950 transition-transform group-hover/play:scale-110" />
           </button>
           <p className="mt-6 text-amber-400/90 font-mono text-sm uppercase tracking-widest font-bold shadow-black drop-shadow-md">
             {isHost ? 'Click to Broadcast' : 'Waiting for Host'}
           </p>
        </div>
      </div>

      <div className="h-16 sm:h-20 bg-gradient-to-t from-black via-stone-950 to-stone-900/95 border-t border-stone-800 px-4 sm:px-6 flex items-center justify-between gap-4 z-30 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button onClick={handlePlayPause} className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-amber-500 text-white hover:text-stone-950 rounded-full flex items-center justify-center transition-all shrink-0 hover:scale-110 active:scale-95 shadow-md">
          {isPlayingLocal ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-1 fill-current" />}
        </button>

        <div className="flex-1 flex items-center gap-3 sm:gap-4 px-2">
          <span className="text-[10px] sm:text-xs font-mono text-stone-400 w-10 sm:w-12 text-right tracking-wider select-none">
            0:00
          </span>
          <div className="flex-1 h-1.5 sm:h-2 bg-stone-800 rounded-full cursor-pointer relative group overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-amber-500 rounded-full group-hover:bg-amber-400 transition-colors shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: '0%' }}></div>
          </div>
          <span className="text-[10px] sm:text-xs font-mono text-stone-500 w-10 sm:w-12 tracking-wider select-none">
            0:00
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <div className="hidden sm:flex items-center gap-2 group/vol">
            <button onClick={() => setIsMuted(!isMuted)} className="text-stone-400 hover:text-amber-500 transition-colors">
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={isMuted ? 0 : volume} 
              onChange={handleVolumeChange}
              className="w-16 sm:w-20 accent-amber-500 opacity-50 group-hover/vol:opacity-100 transition-opacity" 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
