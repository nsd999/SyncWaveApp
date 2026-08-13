'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getOrCreateProfile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import { getUniqueGuestName, Room, RoomMember } from '@/lib/room';
import { 
  Users, 
  User as UserIcon, 
  MicOff, 
  Mic, 
  VolumeX, 
  Volume2,
  LogOut, 
  Crown, 
  Send, 
  ShieldAlert, 
  Loader2, 
  Activity, 
  Compass, 
  Plus, 
  Trash2, 
  MessageSquare,
  Copy,
  Check,
  Disc,
  Radio,
  Sliders,
  UserX,
  X,
  Play,
  Pause,
  Music,
  Tv,
  SkipForward,
  ListMusic,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Laptop,
  RotateCcw,
  RotateCw
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'motion/react';
import { PlaybackState } from '@/types/playback';
import { PlaybackSyncService } from '@/lib/playback-service';

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string; // guest_id or user_id
  sender_name: string;
  content: string;
  created_at: string;
}

const MEDIA_PRESETS = [
  { name: 'Big Buck Bunny (Video)', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', type: 'video' },
  { name: 'Sintel Dream (Video)', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', type: 'video' },
  { name: 'Chill Beats (Audio)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', type: 'audio' },
];

export const dynamic = 'force-dynamic';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  
  const roomCode = React.useMemo(() => {
    return typeof params.code === 'string' ? params.code.trim().toUpperCase() : '';
  }, [params.code]);

  // Real-time Presence tracking state (BUG 4, Phase 3 Presence System)
  const [presences, setPresences] = React.useState<Record<string, { status: string; last_seen_at: string }>>({});
  const presenceChannelRef = React.useRef<any>(null);

  // UI state managers
  const [loading, setLoading] = React.useState(true);
  const [room, setRoom] = React.useState<Room | null>(null);
  const [members, setMembers] = React.useState<RoomMember[]>([]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [typedMessage, setTypedMessage] = React.useState('');
  
  // Guest join states
  const [guestNameInput, setGuestNameInput] = React.useState('');
  const [guestSubmitting, setGuestSubmitting] = React.useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = React.useState(false);
  const [guestError, setGuestError] = React.useState<string | null>(null);

  // Active membership state
  const [currentMember, setCurrentMember] = React.useState<RoomMember | null>(null);
  
  // User status blockers
  const [isBanned, setIsBanned] = React.useState(false);
  const [isKicked, setIsKicked] = React.useState(false);
  const [initError, setInitError] = React.useState<string | null>(null);
  
  // Auxiliary visual alerts
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [chatScrolled, setChatScrolled] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Playback sync states
  const [playbackState, setPlaybackState] = React.useState<PlaybackState | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [mediaUrl, setMediaUrl] = React.useState('');
  const [mediaType, setMediaType] = React.useState<'video' | 'audio'>('video');
  const [customUrlInput, setCustomUrlInput] = React.useState('');
  
  // Volume persistence (BUG 4)
  const [videoVolume, setVideoVolume] = React.useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('syncwave-volume');
      if (saved !== null) {
        const val = parseFloat(saved);
        return isNaN(val) ? 0.8 : val;
      }
    }
    return 0.8;
  });
  
  const [isMuted, setIsMuted] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('syncwave-muted');
      return saved === 'true';
    }
    return false;
  });

  const [playbackRate, setPlaybackRate] = React.useState<number>(1);
  const [toasts, setToasts] = React.useState<any[]>([]);

  const showToast = React.useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const [syncStatusText, setSyncStatusText] = React.useState('Initializing synchronization...');

  // Media Queue & Chat Interactions States
  const [queue, setQueue] = React.useState<any[]>([]);
  const [queueUrlInput, setQueueUrlInput] = React.useState('');
  const [queueTitleInput, setQueueTitleInput] = React.useState('');
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [isTyping, setIsTyping] = React.useState(false);
  
  // UX Phase 3.2 & 3.3 Refinement States
  const [isHostToolsOpen, setIsHostToolsOpen] = React.useState(false);
  const [youtubeFailed, setYoutubeFailed] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [showEmbedToast, setShowEmbedToast] = React.useState(false);
  const [mediaStatus, setMediaStatus] = React.useState<'Playing' | 'Paused' | 'Buffering' | 'Ended' | 'Live' | 'Standby'>('Standby');

  // Theme management handled via next-themes (BUG 1)
  const { theme, setTheme, resolvedTheme = 'dark' } = useTheme();
  const [showThemeMenu, setShowThemeMenu] = React.useState(false);

  // YouTube Metadata Preview State
  const [isFetchingPreview, setIsFetchingPreview] = React.useState(false);
  const [ytPreview, setYtPreview] = React.useState<{
    videoId: string;
    title: string;
    thumbnailUrl: string;
    duration: number;
    channelName: string;
    publishedDate: string;
    embeddable: boolean;
    rawUrl: string;
  } | null>(null);

  // Drag-and-drop file upload simulation
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);

  // Theme state updates handled natively by next-themes wrapper

  React.useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleGlobalDrop = (e: DragEvent) => {
      // Prevent browser default action of loading dropped files
      e.preventDefault();
    };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYoutubeFailed(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowEmbedToast(false);
  }, [mediaUrl]);

  React.useEffect(() => {
    if (!mediaUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaStatus('Standby');
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaStatus(isPlaying ? 'Playing' : 'Paused');
    }
  }, [mediaUrl, isPlaying]);
  
  const playerRef = React.useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = React.useRef<any>(null);
  const isUpdatingFromRemote = React.useRef(false); // Guard for infinite loops

  const supabaseConnected = isSupabaseConfigured();

  // Load guest credentials from localStorage on component mount (client-safe)
  const getStoredGuestSession = React.useCallback(() => {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(`syncwave-guest-${roomCode}`);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e: any) {
        return null;
      }
    }
    return null;
  }, [roomCode]);

  // Set stored guest session (client-safe)
  const setStoredGuestSession = React.useCallback((guestId: string, name: string, sessionId: string) => {
    if (typeof window === 'undefined') return;
    const payload = { guestId, displayName: name, sessionId };
    localStorage.setItem(`syncwave-guest-${roomCode}`, JSON.stringify(payload));
  }, [roomCode]);

  // Remove guest credentials (client-safe)
  const clearStoredGuestSession = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`syncwave-guest-${roomCode}`);
  }, [roomCode]);

  const fetchRoomDetails = React.useCallback(async () => {
    if (!supabaseConnected || !roomCode) return;
    try {
      const { data: d, error } = await supabase.from('rooms').select('*').eq('slug', roomCode).single();

      if (error || !d) {
        setRoom(null);
        setLoading(false);
        return;
      }

      const roomData = d as Room;
      setRoom(roomData);
      return roomData;
    } catch (e: any) {
      console.error('[SyncWave Core] Error in fetchRoomDetails:', e);
      setInitError(e.message || 'Error occurred while loading room data.');
      setLoading(false);
    }
  }, [roomCode, supabaseConnected]);

  // Sync / join room membership
  const joinRoomAsRegisteredUser = React.useCallback(async (roomId: string, userId: string, userEmail: string) => {
    try {
      const userProfile = await getOrCreateProfile(userId, userEmail);

      const { data: existingMembers, error } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId);

      if (existingMembers && existingMembers.length > 0) {
        const memberData = existingMembers[0] as RoomMember;
        if (memberData.is_banned) {
          setIsBanned(true);
          return;
        }
        setCurrentMember(memberData);
        writeLog('info', 'Lounge synced', `Rejoining session lounge as registered user: @${userProfile.username}`);
      } else {
        const newMember = {
          room_id: roomId,
          user_id: userId,
          display_name: userProfile.display_name,
          is_muted: false,
          is_banned: false,
          joined_at: new Date().toISOString()
        };
        const { data: docRef, error: insertError } = await supabase.from('room_members').insert([newMember]).select().single();
        if (insertError) throw insertError;
        
        setCurrentMember(docRef as RoomMember);
        writeLog('success', 'Lounge synced', `Registered user @${userProfile.username} entered the room session.`);
      }
    } catch (err: any) {
      console.error('[SyncWave Join Debug] Error inside joinRoomAsRegisteredUser:', err);
      writeLog('error', 'Lounge synced', `Failed to join lounge: ${err.message}`);
      setInitError(err.message || 'Error occurred while joining room session.');
    }
  }, []);

  const handleGuestJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || guestSubmitting || !guestNameInput.trim()) return;

    setGuestSubmitting(true);
    setGuestError(null);

    try {
      const trimmedName = guestNameInput.trim();
      const safeName = await getUniqueGuestName(room.id, trimmedName);

      const { data: checkSnap, error: checkError } = await supabase
        .from('room_members')
        .select('is_banned')
        .eq('room_id', room.id)
        .eq('display_name', safeName);

      let isBannedMatch = false;
      if (checkSnap) {
        checkSnap.forEach((d: any) => {
          if (d.is_banned) isBannedMatch = true;
        });
      }

      if (isBannedMatch) {
        setIsBanned(true);
        setShowJoinPrompt(false);
        setGuestSubmitting(false);
        return;
      }

      const guestId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      const newGuest = {
        room_id: room.id,
        guest_id: guestId,
        display_name: safeName,
        session_id: sessionId,
        is_muted: false,
        is_banned: false,
        joined_at: new Date().toISOString()
      };

      const { data: docRef, error: insertError } = await supabase.from('room_members').insert([newGuest]).select().single();
      if (insertError) throw insertError;
      const row = docRef as RoomMember;

      setStoredGuestSession(guestId, safeName, sessionId);
      setCurrentMember(row);
      setShowJoinPrompt(false);
      writeLog('success', 'Lounge synced', `Guest "${safeName}" joined synced session.`);
      await fetchRoomDetails();
    } catch (err: any) {
      setGuestError(err.message || 'Operation forbidden by server constraints.');
    } finally {
      setGuestSubmitting(false);
    }
  };

  const leaveRoom = React.useCallback(async () => {
    if (!supabaseConnected || !currentMember || !room) return;

    try {
      await supabase.from('room_members').delete().eq('id', currentMember.id);
      clearStoredGuestSession();
      setCurrentMember(null);
      router.replace(user ? '/dashboard' : '/');
    } catch (err: any) {
      console.error('Failed to leave room cleanly:', err.message);
      router.replace(user ? '/dashboard' : '/');
    }
  }, [currentMember, room, router, user, supabaseConnected, clearStoredGuestSession]);

  // Send visual message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !currentMember || !room || !supabaseConnected) return;

    if (currentMember.is_muted) {
      writeLog('warn', 'Chat blocker', `Muted participant attempt to post chat dismissed.`);
      return;
    }

    const currentText = typedMessage.trim();
    setTypedMessage('');

    try {
      const senderId = currentMember.user_id || currentMember.guest_id || 'anonymous';
      await supabase.from('messages').insert([{
        room_id: room.id,
        sender_id: senderId,
        content: currentText,
        created_at: new Date().toISOString()
      }]);
    } catch (err: any) {
      console.error('[Room Chat] Message delivery failed:', err.message);
    }
  };

  const toggleMuteMember = async (memberId: string, currentMuteState: boolean) => {
    if (!room || !currentMember || !supabaseConnected) return;
    if (room.host_id !== user?.id) return;

    try {
      await supabase.from('room_members').update({ is_muted: !currentMuteState }).eq('id', memberId);
      writeLog('info', 'Security block', `Participant mute toggled to ${!currentMuteState} by Host.`);
    } catch (err: any) {
      console.error('Host control update failed:', err);
    }
  };

  const kickMember = async (memberId: string, displayName: string) => {
    if (!room || !currentMember || !supabaseConnected) return;
    if (room.host_id !== user?.id) return;

    try {
      await supabase.from('room_members').delete().eq('id', memberId);
      writeLog('success', 'Security block', `Host kicked participant "${displayName}" from the session.`);
    } catch (err: any) {
      console.error('Kick execution rejected:', err.message);
    }
  };

  const banMember = async (memberId: string, displayName: string) => {
    if (!room || !currentMember || !supabaseConnected) return;
    if (room.host_id !== user?.id) {
      writeLog('error', 'Security block', 'Unauthorized ban request received.');
      return;
    }

    try {
      await supabase.from('room_members').update({ is_banned: true }).eq('id', memberId);
      writeLog('success', 'Security block', `Host banned participant "${displayName}".`);
    } catch (err: any) {
      console.error('Ban execution rejected:', err.message);
    }
  };

  const currentIsHost = room ? room.host_id === user?.id : false;

  const handleHostPlay = async () => {
    if (!room || !currentIsHost) return;
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    
    setIsPlaying(true);
    setMediaStatus('Playing');
    let curTime = currentTime;

    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
        try {
          ytPlayerRef.current.playVideo();
          curTime = ytPlayerRef.current.getCurrentTime() || 0;
        } catch (e) {
          console.warn('Failed play call on YouTube ref:', e);
        }
      }
    } else {
      const player = playerRef.current;
      if (player) {
        try {
          await player.play();
          curTime = player.currentTime;
        } catch (e) {
          console.error('Failed to trigger HTML5 play:', e);
        }
      }
    }

    await PlaybackSyncService.play(room.id, curTime, user?.id);
  };

  const handleHostPause = async () => {
    if (!room || !currentIsHost) return;
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));

    setIsPlaying(false);
    setMediaStatus('Paused');
    let curTime = currentTime;

    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try {
          ytPlayerRef.current.pauseVideo();
          curTime = ytPlayerRef.current.getCurrentTime() || 0;
        } catch (e) {
          console.warn('Failed pause call on YouTube ref:', e);
        }
      }
    } else {
      const player = playerRef.current;
      if (player) {
        player.pause();
        curTime = player.currentTime;
      }
    }

    await PlaybackSyncService.pause(room.id, curTime, user?.id);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    
    // Smooth immediate scrubbing on active client player
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(val, true);
        } catch (error) {}
      }
    } else {
      if (playerRef.current) {
        playerRef.current.currentTime = val;
      }
    }
  };

  const handleSliderRelease = async () => {
    if (!room || !currentIsHost) return;
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    
    let curTime = currentTime;
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        curTime = ytPlayerRef.current.getCurrentTime() || 0;
      }
    } else {
      if (playerRef.current) {
        curTime = playerRef.current.currentTime;
      }
    }

    await PlaybackSyncService.seek(room.id, curTime, user?.id);
  };

  const handleTimeUpdate = () => {
    if (!playerRef.current) return;
    if (isUpdatingFromRemote.current) return;
    setCurrentTime(playerRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!playerRef.current) return;
    setDuration(playerRef.current.duration || 0);
  };

  // HELPER FOR YOUTUBE ISO duration parser
  const parseISO8601Duration = (durationStr: string): number => {
    if (!durationStr) return 180;
    const regex = /P(?:([0-9.]+)D)?T(?:([0-9.]+)H)?(?:([0-9.]+)M)?(?:([0-9.]+)S)?/;
    const matches = durationStr.match(regex);
    if (!matches) return 180;
    const days = parseFloat(matches[1] || '0');
    const hours = parseFloat(matches[2] || '0');
    const minutes = parseFloat(matches[3] || '0');
    const seconds = parseFloat(matches[4] || '0');
    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  };

  const fetchYouTubeMetadata = async (url: string) => {
    const videoId = getYouTubeId(url);
    if (!videoId) return;

    setIsFetchingPreview(true);
    setUrlError(null);
    try {
      const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || "AIzaSyDDlzue5y2v_uY6iqK05Pf948yUbmCqxsc";
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${apiKey}`);
      if (!res.ok) throw new Error("Failed to fetch YouTube metadata");
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        throw new Error("No YouTube video found with this URL or ID.");
      }
      const item = data.items[0];
      const snippet = item.snippet;
      const contentDetails = item.contentDetails;
      const status = item.status;

      const parsedDuration = parseISO8601Duration(contentDetails?.duration);
      
      setYtPreview({
        videoId,
        title: snippet.title || "Unknown YouTube Video",
        thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: parsedDuration,
        channelName: snippet.channelTitle || "Unknown Channel",
        publishedDate: snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : "",
        embeddable: status?.embeddable !== false,
        rawUrl: url
      });
    } catch (err: any) {
      console.error(err);
      setUrlError(err.message || "Failed to retrieve YouTube metadata.");
      setYtPreview(null);
    } finally {
      setIsFetchingPreview(false);
    }
  };

  // Debounced URL watch for fetching YouTube Preview
  React.useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const url = queueUrlInput.trim();
      if (!url) {
        setYtPreview(null);
        return;
      }
      const isYt = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('/embed/');
      if (isYt) {
        const videoId = getYouTubeId(url);
        if (videoId) {
          fetchYouTubeMetadata(url);
        } else {
          setYtPreview(null);
        }
      } else {
        setYtPreview(null);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [queueUrlInput]);

  // Load clean YouTube Frame API on layout ready
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  const mountYoutubePlayer = React.useCallback((videoId: string) => {
    if (typeof window === 'undefined' || !(window as any).YT || !(window as any).YT.Player) {
      setTimeout(() => mountYoutubePlayer(videoId), 300);
      return;
    }

    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch (e) {}
      ytPlayerRef.current = null;
    }

    try {
      ytPlayerRef.current = new (window as any).YT.Player('youtube-player', {
        videoId: videoId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          start: Math.floor(currentTime),
          controls: 0, // Always hide native controls
          disablekb: 1, // Disable keyboard hotkeys
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event: any) => {
            console.log("YouTube API player loaded and bound actively.");
            if (isPlaying) {
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
            event.target.seekTo(currentTime, true);
          },
          onStateChange: (event: any) => {
            const stateCode = event.data;
            if (stateCode === 1) {
              setMediaStatus('Playing');
              setIsPlaying(true);
            } else if (stateCode === 2) {
              setMediaStatus('Paused');
              setIsPlaying(false);
            } else if (stateCode === 3) {
              setMediaStatus('Buffering');
            } else if (stateCode === 0) {
              setMediaStatus('Ended');
            }

            if (!currentIsHost) return;
            if (isUpdatingFromRemote.current) return;

            // Player state tags: 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (stateCode === 1) {
              const cur = ytPlayerRef.current?.getCurrentTime() || 0;
              PlaybackSyncService.play(room?.id || '', cur, user?.id);
            } else if (stateCode === 2) {
              const cur = ytPlayerRef.current?.getCurrentTime() || 0;
              PlaybackSyncService.pause(room?.id || '', cur, user?.id);
            } else if (stateCode === 0) {
              handleMediaEnded();
            }
          },
          onError: (event: any) => {
            const code = event.data;
            console.warn("YouTube embedding handshake error:", code);
            setYoutubeFailed(true);
            if (code === 101 || code === 150) {
              setShowEmbedToast(true);
              // Auto hide toast after 8 seconds
              setTimeout(() => {
                setShowEmbedToast(false);
              }, 8000);
            } else {
              setUrlError(`YouTube playback event reported error code: ${code}`);
            }
          }
        }
      });
    } catch (e) {
      console.error("Failed to mount YouTube controller:", e);
    }
  }, [room, user, currentIsHost, isPlaying, currentTime]);

  React.useEffect(() => {
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    const ytId = isYouTube ? getYouTubeId(mediaUrl) : null;
    
    if (isYouTube && ytId) {
      mountYoutubePlayer(ytId);
    } else {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
    }
  }, [mediaUrl]);

  // Regular progress tick for YouTube player
  React.useEffect(() => {
    let tickInter: NodeJS.Timeout | null = null;
    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    
    if (isPlaying && isYouTube) {
      tickInter = setInterval(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          const cur = ytPlayerRef.current.getCurrentTime();
          setCurrentTime(cur);
          
          if (ytPlayerRef.current.getDuration) {
            setDuration(ytPlayerRef.current.getDuration() || 0);
          }

          if (currentIsHost && room) {
            // Update time in the database occasionally (throttle rate)
            PlaybackSyncService.updateTime(room.id, cur, duration || 180, user?.id);
          }
        }
      }, 1000);
    }

    return () => {
      if (tickInter) clearInterval(tickInter);
    };
  }, [isPlaying, mediaUrl, currentIsHost, room, user, duration]);

  // HELPER FOR YOUTUBE ID DETECTION
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const validateMediaUrl = (url: string): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
      return false;
    }
  };

  const syncLocalPlayerWithNewState = React.useCallback((newState: PlaybackState) => {
    if (!newState) return;
    setPlaybackState(newState);

    const isYouTube = newState.media_url && (newState.media_url.includes('youtube.com') || newState.media_url.includes('youtu.be') || newState.media_url.includes('/embed/'));

    // 1. Synchronize loaded URL and media type
    setMediaUrl((prevUrl) => {
      if (prevUrl !== newState.media_url) {
        return newState.media_url || '';
      }
      return prevUrl;
    });

    setMediaType((prevType) => {
      const nextType = (newState.media_type as 'video' | 'audio') || 'video';
      if (prevType !== nextType) {
        return nextType;
      }
      return prevType;
    });

    // 2. Synchronize playback speed/rate!
    const targetRate = Number(newState.playback_rate) || 1;
    setPlaybackRate(targetRate);

    if (isYouTube) {
      // Sync YouTube IFrame Player
      const yt = ytPlayerRef.current;
      if (yt && typeof yt.getPlayerState === 'function') {
        isUpdatingFromRemote.current = true;

        // Sync Speed Rate
        if (typeof yt.setPlaybackRate === 'function') {
          try {
            yt.setPlaybackRate(targetRate);
          } catch (e) {}
        }

        // Sync play/pause state
        const ytState = yt.getPlayerState();
        // ytState codes: 1 = playing, 2 = paused
        if (newState.is_playing) {
          if (ytState !== 1) {
            try {
              yt.playVideo();
            } catch (e) {}
            setIsPlaying(true);
          }
        } else {
          if (ytState !== 2 && ytState !== 0) { // not paused and not ended
            try {
              yt.pauseVideo();
            } catch (e) {}
            setIsPlaying(false);
          }
        }

        // Sync timeline seek
        if (typeof yt.getCurrentTime === 'function') {
          const ytTime = yt.getCurrentTime();
          const lag = Math.abs(ytTime - newState.current_time);
          if (lag > 2) {
            try {
              yt.seekTo(newState.current_time, true);
              setCurrentTime(newState.current_time);
            } catch (e) {}
          }
        }

        setSyncStatusText(`Synced • Last update ${new Date(newState.last_sync_at).toLocaleTimeString()}`);
        setTimeout(() => {
          isUpdatingFromRemote.current = false;
        }, 150);
      }
    } else {
      // Sync HTML5 Video/Audio Player
      const player = playerRef.current;
      if (player) {
        isUpdatingFromRemote.current = true;

        // Sync Speed/Rate
        player.playbackRate = targetRate;

        // Sync play/pause state
        const isCurrentlyPlaying = !player.paused;
        if (newState.is_playing && !isCurrentlyPlaying) {
          player.play().catch(e => console.log('Autoplay deferred:', e));
          setIsPlaying(true);
        } else if (!newState.is_playing && isCurrentlyPlaying) {
          player.pause();
          setIsPlaying(false);
        }

        // Sync timeline seek
        const lag = Math.abs(player.currentTime - newState.current_time);
        if (lag > 2) {
          player.currentTime = newState.current_time;
          setCurrentTime(newState.current_time);
        }

        setSyncStatusText(`Synced • Last update ${new Date(newState.last_sync_at).toLocaleTimeString()}`);
        setTimeout(() => {
          isUpdatingFromRemote.current = false;
        }, 150);
      }
    }
  }, [mediaUrl]);

  const handleHostSpeedChange = async (rate: number) => {
    if (!room || !currentIsHost) return;
    setPlaybackRate(rate);

    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === 'function') {
        try {
          ytPlayerRef.current.setPlaybackRate(rate);
        } catch (e) {
          console.warn('Failed to set YouTube playback rate:', e);
        }
      }
    } else {
      if (playerRef.current) {
        playerRef.current.playbackRate = rate;
      }
    }

    await PlaybackSyncService.updateRate(room.id, rate, user?.id);
    showToast(`Playback speed scaled to ${rate}x`, "success");
  };

  const handleHostBackward10 = async () => {
    if (!room || !currentIsHost) return;
    const target = Math.max(0, currentTime - 10);
    setCurrentTime(target);

    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(target, true);
        } catch (e) {}
      }
    } else {
      if (playerRef.current) {
        playerRef.current.currentTime = target;
      }
    }

    await PlaybackSyncService.seek(room.id, target, user?.id);
    showToast("Skipped backward 10s", "info");
  };

  const handleHostForward10 = async () => {
    if (!room || !currentIsHost) return;
    const target = Math.min(duration || 1000, currentTime + 10);
    setCurrentTime(target);

    const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
    if (isYouTube) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(target, true);
        } catch (e) {}
      }
    } else {
      if (playerRef.current) {
        playerRef.current.currentTime = target;
      }
    }

    await PlaybackSyncService.seek(room.id, target, user?.id);
    showToast("Skipped forward 10s", "info");
  };

  // QUEUE OPERATIONS
  const handleAddMediaToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !queueUrlInput.trim()) return;

    const url = queueUrlInput.trim();
    if (!validateMediaUrl(url)) {
      setUrlError("Invalid URL. Please enter a valid http/https link to queue.");
      setTimeout(() => setUrlError(null), 5000);
      return;
    }

    let finalTitle = queueTitleInput.trim();
    const isYt = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('/embed/');
    const isAudio = url.endsWith('.mp3') || url.includes('Helix') || url.includes('audio');
    const computedType = isYt ? 'youtube' : (isAudio ? 'audio' : 'video');

    let computedDuration = 180; // Default fallback (3 mins)
    let thumbnail = `https://picsum.photos/seed/${encodeURIComponent(url)}/120/90`;

    if (isYt && ytPreview && ytPreview.videoId === getYouTubeId(url)) {
      finalTitle = finalTitle || ytPreview.title;
      computedDuration = ytPreview.duration;
      thumbnail = ytPreview.thumbnailUrl;
    } else {
      if (!finalTitle) {
        if (isYt) {
          const ytId = getYouTubeId(url);
          finalTitle = ytId ? `YouTube Sync Track (${ytId})` : 'YouTube Stream';
        } else {
          finalTitle = url.substring(url.lastIndexOf('/') + 1) || 'Custom Stream';
        }
      }

      // Default duration metrics
      if (url.includes('BigBuckBunny')) computedDuration = 596;
      if (url.includes('Sintel')) computedDuration = 653;
      if (url.includes('Helix-Song-1')) computedDuration = 372;

      if (isYt) {
        thumbnail = `https://img.youtube.com/vi/${getYouTubeId(url)}/hqdefault.jpg`;
      } else {
        thumbnail = `https://picsum.photos/seed/${encodeURIComponent(finalTitle)}/120/90`;
      }
    }

    const addedByName = currentMember?.profiles?.display_name || currentMember?.display_name || 'Host';
    const addedByUserId = currentMember?.user_id || currentMember?.guest_id || null;

    writeLog('info', 'Media Queue', `Adding tracking queue index reference for ${finalTitle}`);

    const added = await PlaybackSyncService.addToQueue(
      room.id,
      url,
      computedType as any,
      finalTitle,
      computedDuration,
      thumbnail,
      addedByUserId || undefined,
      addedByName
    );

    if (added) {
      setQueueUrlInput('');
      setQueueTitleInput('');
      setYtPreview(null);
      // Refetch queue
      const items = await PlaybackSyncService.fetchQueue(room.id);
      setQueue(items);
    }
  };

  const handleRemoveFromQueue = async (id: string, title: string) => {
    if (!room || !currentIsHost) return;
    writeLog('info', 'Media Queue', `Removing item "${title}"`);
    await PlaybackSyncService.removeFromQueue(id);
    const items = await PlaybackSyncService.fetchQueue(room.id);
    setQueue(items);
  };

  const handleFileImportMock = async (file: File) => {
    if (!room) return;
    const isAudio = file.type.startsWith('audio/') || file.name.endsWith('.mp3');
    const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
    
    if (!isAudio && !isVideo) {
      setUrlError("Format not supported. Please import high-fidelity audio (MP3) or video (MP4) packets.");
      setTimeout(() => setUrlError(null), 5000);
      return;
    }

    setUploadProgress(10);
    const intervalsTimer = setInterval(() => {
      setUploadProgress((p) => {
        if (p === null) return null;
        if (p >= 100) {
          clearInterval(intervalsTimer);
          return 100;
        }
        return p + 15;
      });
    }, 150);

    setTimeout(async () => {
      setUploadProgress(null);
      setUploadedFileName(file.name);
      
      // Auto queue mock synced track
      const sampleUrl = isAudio 
        ? "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
      
      const title = file.name || (isAudio ? "Imported Local Audio" : "Imported Local Video");
      const duration = isAudio ? 372 : 596;
      const thumbnail = isAudio 
        ? `https://picsum.photos/seed/${encodeURIComponent(title)}/120/90`
        : `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.png`;
      
      const addedByName = currentMember?.profiles?.display_name || currentMember?.display_name || 'Host';
      const addedByUserId = currentMember?.user_id || currentMember?.guest_id || null;

      await PlaybackSyncService.addToQueue(
        room.id,
        sampleUrl,
        isAudio ? 'audio' : 'video',
        title,
        duration,
        thumbnail,
        addedByUserId || undefined,
        addedByName
      );

      // Refetch queue playlist
      const items = await PlaybackSyncService.fetchQueue(room.id);
      setQueue(items);

      setTimeout(() => setUploadedFileName(null), 3000);
    }, 1600);
  };

  const handlePlayNextInQueue = async (item: any) => {
    if (!room || !currentIsHost) return;
    
    writeLog('info', 'Media Queue', `Promoting to play next: "${item.title}"`);
    const currentItems = await PlaybackSyncService.fetchQueue(room.id);
    const remaining = currentItems.filter((i) => i.id !== item.id);
    const reordered = remaining.map((i, idx) => ({ id: i.id, position: idx + 1 }));

    const updates = [{ id: item.id, position: 0 }, ...reordered];
    await PlaybackSyncService.reorderQueue(updates);

    const items = await PlaybackSyncService.fetchQueue(room.id);
    setQueue(items);
  };

  const handleSkipNext = async () => {
    if (!room || !currentIsHost) return;

    if (queue.length > 0) {
      const nextItem = queue[0];
      writeLog('info', 'Sync Wave Engine', `Advancing lounge playback pipeline to next queue item: "${nextItem.title}"`);

      // Mark off playlist queue
      await PlaybackSyncService.markAsPlayed(nextItem.id);

      // Clean load active playback space
      setMediaUrl(nextItem.media_url);
      const isYt = nextItem.media_type === 'youtube' || nextItem.media_url.includes('youtube.com') || nextItem.media_url.includes('youtu.be');
      const loadedType = isYt ? 'video' : (nextItem.media_type as 'video' | 'audio');
      setMediaType(loadedType);
      setCurrentTime(0);
      setIsPlaying(true);

      await PlaybackSyncService.updateMedia(
        room.id,
        nextItem.media_url,
        loadedType,
        nextItem.duration,
        user?.id
      );

      // Force play on playback target
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.currentTime = 0;
          playerRef.current.play().catch((e) => console.log('Autoplay skipped item error:', e));
        }
      }, 300);

      const items = await PlaybackSyncService.fetchQueue(room.id);
      setQueue(items);
    } else {
      writeLog('warn', 'Sync Wave Engine', 'Cannot skip: Media Queue playlist is empty!');
    }
  };

  // TYPING INDICATORS BROADCASTER
  const handleTypingKeydown = () => {
    if (!room || !currentMember || isTyping) return;
    setIsTyping(true);
    if ((window as any).typingTimer) {
      clearTimeout((window as any).typingTimer);
    }
    (window as any).typingTimer = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  };

  async function handleMediaEnded() {
    if (!room || !currentIsHost) return;
    writeLog('info', 'Sync Wave Engine', 'Active media stream finished playback.');
    
    if (queue.length > 0) {
      const nextItem = queue[0];
      writeLog('info', 'Sync Wave Engine', `Auto-play triggered. Loading next track in line: "${nextItem.title}"`);
      
      // Advance and mark off playlist
      await PlaybackSyncService.markAsPlayed(nextItem.id);

      // Set states
      setMediaUrl(nextItem.media_url);
      const isYt = nextItem.media_type === 'youtube' || nextItem.media_url.includes('youtube.com') || nextItem.media_url.includes('youtu.be');
      const loadedType = isYt ? 'video' : (nextItem.media_type as 'video' | 'audio');
      setMediaType(loadedType);
      setCurrentTime(0);
      setIsPlaying(true);

      await PlaybackSyncService.updateMedia(
        room.id,
        nextItem.media_url,
        loadedType,
        nextItem.duration,
        user?.id
      );

      // Lazy start player
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.currentTime = 0;
          playerRef.current.play().catch((e) => console.log('Autoplay play error:', e));
        }
      }, 300);

      const items = await PlaybackSyncService.fetchQueue(room.id);
      setQueue(items);
    } else {
      writeLog('info', 'Sync Wave Engine', 'Playback ended and queue is empty, waiting in standby.');
      setIsPlaying(false);
      await PlaybackSyncService.pause(room.id, currentTime, user?.id);
    }
  };

  const handleLoadMedia = async (url: string, type: 'video' | 'audio') => {
    if (!room || !currentIsHost) return;
    if (url && !validateMediaUrl(url)) {
      setUrlError("Invalid URL. Please enter a valid http/https link to load.");
      setTimeout(() => setUrlError(null), 5000);
      return;
    }
    
    let mediaDuration = 596; 
    if (url.includes('Sintel')) mediaDuration = 653;
    if (url.includes('Helix-Song-1')) mediaDuration = 372;
    
    writeLog('info', 'Sync Wave Engine', `Loading media: ${url}`);
    
    setMediaUrl(url);
    setMediaType(type);
    setCurrentTime(0);
    setIsPlaying(false);
    
    await PlaybackSyncService.updateMedia(room.id, url, type, mediaDuration, user?.id);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Setup room core connections and fetch metadata
  React.useEffect(() => {
    if (!supabaseConnected || !roomCode) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const initRoom = async () => {
      try {
        const { data: snap, error } = await supabase.from('rooms').select('*').eq('slug', roomCode).single();

        if (error || !snap) {
          setRoom(null);
          setLoading(false);
          return;
        }

        const roomData = snap as Room;
        setRoom(roomData);

        if (user) {
          await joinRoomAsRegisteredUser(roomData.id, user.id, user.email || '');
        } else {
          const stored = getStoredGuestSession();
          if (stored) {
            const { data: memberSnap } = await supabase
              .from('room_members')
              .select('*')
              .eq('room_id', roomData.id)
              .eq('guest_id', stored.guestId);

            if (!memberSnap || memberSnap.length === 0) {
              clearStoredGuestSession();
              setShowJoinPrompt(true);
              setLoading(false);
            } else {
              const memberRow = memberSnap[0] as RoomMember;
              if (memberRow.is_banned) {
                setIsBanned(true);
                setLoading(false);
              } else {
                setCurrentMember(memberRow);
              }
            }
          } else {
            setShowJoinPrompt(true);
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.error('[SyncWave Core] Handshake error during room loading:', err);
        setInitError(err.message || 'Error occurred while establishing handshake.');
        setLoading(false);
      }
    };

    initRoom();
  }, [roomCode, user, supabaseConnected, joinRoomAsRegisteredUser, getStoredGuestSession, clearStoredGuestSession]);

  // Load room data & playback state once room & currentMember are resolved
  React.useEffect(() => {
    if (!supabaseConnected || !room || !currentMember) return;

    setLoading(true);

    const loadRoomData = async () => {
      try {
        // 1. Load full members list
        const { data: mSnap } = await supabase.from('room_members').select('*').eq('room_id', room.id);
        const membersList: RoomMember[] = (mSnap as RoomMember[]) || [];
        setMembers(membersList);

        // 2. Load playback state
        const hostCheck = room.host_id === user?.id;
        const state = await PlaybackSyncService.initializePlaybackState(room.id, hostCheck);
        
        if (state) {
          let targetTime = state.current_time;
          if (state.is_playing && state.last_sync_at) {
            const elapsed = (Date.now() - new Date(state.last_sync_at).getTime()) / 1000;
            const rate = Number(state.playback_rate) || 1;
            targetTime = state.current_time + (elapsed * rate);
            if (state.duration && targetTime > state.duration) {
              targetTime = state.duration;
            }
          }

          const restoredState = {
            ...state,
            current_time: targetTime
          };

          syncLocalPlayerWithNewState(restoredState);
          setCurrentTime(targetTime);
        }

        // 3. Load media queue
        const items = await PlaybackSyncService.fetchQueue(room.id);
        setQueue(items);

        // 4. Load messages
        const { data: msgSnap } = await supabase.from('messages').select('*').eq('room_id', room.id).order('created_at', { ascending: true }).limit(100);
        const mappedMessages: ChatMessage[] = [];
        if (msgSnap) {
          msgSnap.forEach((m: any) => {
            const senderMember = membersList.find((mem) => mem.user_id === m.sender_id || mem.guest_id === m.sender_id);
            mappedMessages.push({
              id: m.id,
              room_id: m.room_id,
              sender_id: m.sender_id,
              sender_name: senderMember?.display_name || 'Anonymous',
              content: m.content,
              created_at: m.created_at
            });
          });
        }
        setMessages(mappedMessages);

        setSyncStatusText('Real-time synchronization established.');
        setLoading(false);
      } catch (err: any) {
        console.error('[SyncWave Core] Initialization sequence failure:', err);
        setInitError(err.message || 'Error occurred while establishing synchronization.');
        setLoading(false);
      }
    };

    loadRoomData();
  }, [room, currentMember, supabaseConnected, user]);

  // Supabase Realtime Subscriptions setup
  React.useEffect(() => {
    if (!supabaseConnected || !room || !currentMember) return;

    // Room members listener
    const memberChannel = supabase.channel(`members:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` }, async (payload) => {
        const { data: mSnap } = await supabase.from('room_members').select('*').eq('room_id', room.id);
        const membersList: RoomMember[] = (mSnap as RoomMember[]) || [];
        setMembers(membersList);

        const currentInDB = membersList.find((m) => m.id === currentMember.id);
        if (!currentInDB) {
          setIsKicked(true);
        } else {
          if (currentInDB.is_banned) {
            setIsBanned(true);
          }
          setCurrentMember(currentInDB);
        }
      })
      .subscribe();

    // Messages listener
    const messageChannel = supabase.channel(`messages:${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, (payload) => {
        const m = payload.new as any;
        setMessages((prev) => {
          const senderName = m.sender_id === currentMember.user_id ? (currentMember.display_name || 'You') : 'Participant';
          return [...prev, {
            id: m.id || m.created_at,
            room_id: m.room_id,
            sender_id: m.sender_id,
            sender_name: senderName,
            content: m.content,
            created_at: m.created_at
          }];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [room, currentMember, supabaseConnected]);

  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      showToast("Lounge invite link copied to clipboard!", "success");
    }).catch(() => {
      showToast("Permission denied, please manually highlight or copy URL", "warning");
    });
  };

  const shareRoom = () => {
    setIsShareModalOpen(true);
  };  if (!supabaseConnected) {
    return (
      <div className={`min-h-screen flex items-center justify-center font-mono ${resolvedTheme === 'dark' ? 'bg-stone-950' : 'bg-stone-50'}`}>
        <p className="text-sm text-stone-400">Database configuration missing or connecting...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="room-loading" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center space-y-4 px-4 font-sans text-stone-100">
        <div className="relative">
          <Disc className="w-12 h-12 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
          <Radio className="w-5 h-5 text-amber-300 absolute top-1.5 left-1.5 animate-pulse" />
        </div>
        <p className="text-xs font-mono tracking-widest text-amber-500/80 uppercase animate-pulse">
          Establishing room handshake...
        </p>
      </div>
    );
  }

  // Connection Handshake Error Screen
  if (initError) {
    return (
      <div id="init-error-viewport" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100 font-sans">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-600"></div>
          <div className="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 font-bold" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold tracking-tight">Handshake Failure</h2>
            <p className="text-xs font-mono text-stone-400 uppercase tracking-wider">Error: REGISTRY_REGISTRATION_FAILED</p>
          </div>
          <p className="text-sm text-stone-300 leading-relaxed bg-stone-950 p-3 rounded-xl border border-stone-850 font-mono text-left break-words max-h-40 overflow-y-auto">
            {initError}
          </p>
          <button
            onClick={() => {
              router.replace('/');
            }}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition border border-stone-750 cursor-pointer font-bold"
          >
            Back to Entrance Portal
          </button>
        </div>
      </div>
    );
  }

  // Banned State Screen
  if (isBanned) {
    return (
      <div id="ban-viewport" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100 font-sans">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500"></div>
          <div className="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold tracking-tight">Access Prohibited</h2>
            <p className="text-xs font-mono text-stone-400 uppercase tracking-wider">Error: SIGNATURE_BLOCKED</p>
          </div>
          <p className="text-sm text-stone-300 leading-relaxed">
            You have been banned from this SyncWave lounge session by the host. Further attempts to participate have been restricted according to server rules.
          </p>
          <button
            onClick={() => {
              clearStoredGuestSession();
              router.replace('/');
            }}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition border border-stone-750 cursor-pointer"
          >
            Return to Entrance Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Kicked State Screen
  if (isKicked) {
    return (
      <div id="kick-viewport" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100 font-sans">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
          <div className="mx-auto w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center animate-bounce">
            <VolumeX className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold tracking-tight">Connection Severed</h2>
            <p className="text-xs font-mono text-stone-400 uppercase tracking-wider">Status: SESSION_REMOVED</p>
          </div>
          <p className="text-sm text-stone-300 leading-relaxed">
            The host has removed you from this SyncWave lounge session.
          </p>
          <button
            onClick={() => {
              clearStoredGuestSession();
              router.replace(user ? '/dashboard' : '/');
            }}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-950 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition cursor-pointer font-bold shadow-lg shadow-amber-500/10"
          >
            OK, Return Home
          </button>
        </div>
      </div>
    );
  }

  // Room Not Found State Screen
  console.log("ROOM PAGE DEBUG", {
    roomFound: !!room,
    roomData: room,
    authUser: user ? { id: user.id, email: user.email } : null,
    guestSession: getStoredGuestSession(),
    memberRecord: currentMember,
    loading,
    error: initError,
    roomCode
  });

  if (!room) {
    return (
      <div id="not-found-viewport" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-100 font-sans">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
          <div className="mx-auto w-16 h-16 bg-stone-800 border border-stone-750 text-stone-400 rounded-2xl flex items-center justify-center">
            <Compass className="w-8 h-8 animate-spin" style={{ animationDuration: '10s' }} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">Session Missing or Inactive</h2>
            <p className="text-xs font-mono text-amber-500">Lounge code: #{roomCode}</p>
          </div>
          <p className="text-sm text-stone-300 leading-relaxed">
            The requested synchronized space does not exist. Please check your spelling or ask the host for an invite link.
          </p>
          <button
            onClick={() => router.replace(user ? '/dashboard' : '/')}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Guest Join Dialog Panel Screen
  if (showJoinPrompt) {
    return (
      <div id="guest-join-viewport" className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-4 text-stone-100 font-sans relative overflow-hidden">
        {/* Dynamic background effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.04),transparent_50%)]"></div>
        
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 space-y-6 shadow-2xl relative z-10">
          <div className="text-center space-y-2">
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono font-bold uppercase py-1 px-3 rounded-full tracking-wider">
              SyncWave Guest Invitation
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">{room.name}</h2>
            <p className="text-xs text-stone-450 leading-relaxed">
              {room.description || 'You have been invited to enter this real-time music space.'}
            </p>
          </div>

          {guestError && (
            <div className="bg-rose-500/5 border border-rose-500/10 text-rose-300 p-3 rounded-lg text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{guestError}</span>
            </div>
          )}

          <form onSubmit={handleGuestJoinSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-stone-400 block uppercase mb-1">Choose your Guest Alias Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-500">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  maxLength={18}
                  placeholder="e.g. Sai"
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-3 bg-stone-950 border border-stone-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition text-stone-200"
                />
              </div>
              <p className="text-[10px] font-mono text-stone-500 mt-1">
                Display name collisions are resolved automatically with safe visual suffixes.
              </p>
            </div>

            <button
              type="submit"
              disabled={guestSubmitting || !guestNameInput.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-stone-950 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition flex items-center justify-center gap-1 cursor-pointer shadow-lg shadow-amber-500/10 disabled:bg-stone-800 disabled:text-stone-550"
            >
              {guestSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                  <span>Aligning identity...</span>
                </>
              ) : (
                <span>Join Lounge Instantly</span>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-stone-800 text-center">
            <button
              onClick={() => router.replace('/')}
              className="text-xs font-semibold text-stone-450 hover:text-stone-300 transition cursor-pointer"
            >
              Cancel & Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active user / host is resolved! Render pristine Collaborative Workspace
  const isHost = room.host_id === user?.id;
  return (
    <div id="room-viewport" className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans select-none overflow-y-auto pb-16 transition-colors duration-200 relative">
      
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.03),transparent_80%)] pointer-events-none z-0"></div>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-200 dark:via-stone-800 to-transparent"></div>

      <div className="max-w-6xl mx-auto w-full px-4 pt-6 space-y-6 relative z-10">

        {/* 1. ROOM HEADER CARD */}
        <div id="room-header-container" className="bg-white dark:bg-stone-900/40 backdrop-blur-lg rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3.5 col-span-full shadow-sm dark:shadow-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl text-stone-950 shadow-lg shadow-amber-500/10 shrink-0">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight text-stone-950 dark:text-white">{room.name}</h1>
                  <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    CODE: {room.slug}
                  </span>
                  {currentIsHost && (
                    <span className="flex items-center gap-1 text-[8px] bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                      <Crown className="w-2.5 h-2.5" /> HOST CONTROL
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed truncate max-w-sm sm:max-w-md">
                  {room.description || 'Elevated Synchronized Listening Lounge'}
                </p>
              </div>
            </div>

            {/* Header control buttons */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
                           {/* COMPACT THEME SELECTOR INSIDE HEADER (AUTO RESIZES / ALWAYS FULLY VISIBLE) */}
              <div id="theme-selector-container" className="flex items-center gap-1 bg-stone-100 dark:bg-stone-850 p-1 rounded-xl border border-stone-200 dark:border-stone-800 shrink-0 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-1.5 rounded-lg transition-all text-[9px] flex items-center gap-1 px-2 cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white dark:bg-stone-750 text-amber-600 font-bold shadow-sm'
                      : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/40 dark:hover:bg-stone-800/40'
                  }`}
                  title="Light mode"
                >
                  <Sun className="w-3 h-3 text-amber-500 font-bold" />
                  <span className="hidden xs:inline">LIGHT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-1.5 rounded-lg transition-all text-[9px] flex items-center gap-1 px-2 cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-stone-800 dark:bg-stone-750 text-indigo-400 font-bold shadow-sm'
                      : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/40 dark:hover:bg-stone-800/40'
                  }`}
                  title="Dark mode"
                >
                  <Moon className="w-3 h-3 text-indigo-400 font-bold" />
                  <span className="hidden xs:inline">DARK</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`p-1.5 rounded-lg transition-all text-[9px] flex items-center gap-1 px-2 cursor-pointer ${
                    theme === 'system'
                      ? 'bg-stone-200 dark:bg-stone-750 text-teal-400 font-bold shadow-sm'
                      : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/40 dark:hover:bg-stone-800/40'
                  }`}
                  title="System theme"
                >
                  <Laptop className="w-3 h-3 text-teal-400 font-bold" />
                  <span className="hidden xs:inline">SYSTEM</span>
                </button>
              </div>

              <button
                onClick={copyInviteLink}
                id="copy-invite-btn"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-850 rounded-xl text-xs text-stone-700 dark:text-stone-300 font-semibold transition cursor-pointer hover:border-stone-300 dark:hover:border-stone-750 active:scale-95 whitespace-nowrap"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-500 animate-bounce" />
                    <span className="text-green-600 dark:text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>

              <a
                href={`https://t.me/syncwaveapp_bot?start=link_${profile?.id || user?.id || ''}_${room?.slug || ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded-xl text-xs text-sky-600 dark:text-sky-400 font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M11.944 0C5.337 0 0 5.337 0 11.944c0 6.607 5.337 11.944 11.944 11.944 6.608 0 11.944-5.337 11.944-11.944C23.888 5.337 18.552 0 11.944 0zm5.556 8.3c-.172 1.812-.924 6.25-1.306 8.3-.162.868-.482 1.16-.792 1.188-.674.062-1.186-.445-1.838-.872-1.02-.668-1.597-1.082-2.587-1.734-1.144-.754-.402-1.168.25-1.844.17-.176 3.128-2.87 3.185-3.11.007-.031.014-.146-.055-.207-.068-.061-.169-.04-.242-.024-.104.024-1.764 1.12-5.0 3.31-.474.326-.88.487-1.218.479-.373-.008-1.089-.21-1.623-.383-.654-.213-1.174-.326-1.129-.688.023-.189.283-.382.78-.58 3.048-1.326 5.08-2.204 6.095-2.636 2.9-.1.233.1.65.114.925.1.018.232.042.483-.021.233-.062.518-.211.758-.415.24-.204.288-.475.253-.781-.035-.306-.217-.43-.45-.48z"/>
                </svg>
                <span>Telegram</span>
              </a>

              <button
                onClick={shareRoom}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Share Lounge</span>
              </button>

              <button
                onClick={leaveRoom}
                id="leave-room-btn"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 dark:bg-stone-850 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-stone-200 dark:border-stone-850 hover:border-rose-250 dark:hover:border-rose-905/30 rounded-xl text-xs text-stone-600 dark:text-stone-350 hover:text-rose-600 dark:hover:text-rose-400 font-semibold transition cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave</span>
              </button>
            </div>
          </div>

          {/* Connected state rail & stats */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-stone-500 dark:text-stone-450 border-t border-stone-205 dark:border-stone-850/60 pt-3">
            <div className="flex items-center space-x-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <span className="text-stone-600 dark:text-stone-300 font-semibold uppercase tracking-wider text-[9px]">Cluster: Sync Active</span>
            </div>
            <div className="h-3 w-px bg-stone-200 dark:bg-stone-850 hidden sm:block" />
            <div className="flex items-center space-x-1.5 text-stone-550 dark:text-stone-400">
              <Users className="w-3.5 h-3.5 text-amber-500" />
              <span>{members.length} member{members.length === 1 ? '' : 's'} connected</span>
            </div>
            <div className="h-3 w-px bg-stone-200 dark:bg-stone-850 hidden sm:block" />
            <div className="flex items-center space-x-1.5 text-stone-550 dark:text-stone-400">
              <svg className="w-3.5 h-3.5 text-sky-500 fill-current" viewBox="0 0 24 24">
                <path d="M11.944 0C5.337 0 0 5.337 0 11.944c0 6.607 5.337 11.944 11.944 11.944 6.608 0 11.944-5.337 11.944-11.944C23.888 5.337 18.552 0 11.944 0zm5.556 8.3c-.172 1.812-.924 6.25-1.306 8.3-.162.868-.482 1.16-.792 1.188-.674.062-1.186-.445-1.838-.872-1.02-.668-1.597-1.082-2.587-1.734-1.144-.754-.402-1.168.25-1.844.17-.176 3.128-2.87 3.185-3.11.007-.031.014-.146-.055-.207-.068-.061-.169-.04-.242-.024-.104.024-1.764 1.12-5.0 3.31-.474.326-.88.487-1.218.479-.373-.008-1.089-.21-1.623-.383-.654-.213-1.174-.326-1.129-.688.023-.189.283-.382.78-.58 3.048-1.326 5.08-2.204 6.095-2.636 2.9-.1.233.1.65.114.925.1.018.232.042.483-.021.233-.062.518-.211.758-.415.24-.204.288-.475.253-.781-.035-.306-.217-.43-.45-.48z"/>
              </svg>
              <span>Control this room using <a href={`https://t.me/syncwaveapp_bot?start=link_${profile?.id || user?.id || ''}_${room?.slug || ''}`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline font-bold transition">SyncWaveBot</a></span>
            </div>
          </div>
        </div>

        {/* 1.5 ALONE CTA FOR ROOM */}
        {members.length === 1 && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 text-center space-y-2 transition-all col-span-full">
            <Sparkles className="w-5 h-5 text-amber-500 mx-auto animate-pulse" />
            <p className="text-sm font-bold text-stone-900 dark:text-white">Nobody else is here yet.</p>
            <p className="text-xs text-stone-500 dark:text-stone-450 leading-relaxed max-w-md mx-auto">
              Invite friends to experience SyncWave together with real-time media sync!
            </p>
            <button
              onClick={copyInviteLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedLink ? "COPIED INVITE CODE!" : "COPY INVITE LINK"}</span>
            </button>
          </div>
        )}

        {/* GRID CONTAINER FOR WORKSPACE */}
        <div id="workspace-grid" className="flex flex-col lg:grid lg:grid-cols-3 gap-6 w-full items-start col-span-full">
          {/* LEFT SIDEBAR: MEDIA FIRST (Columns 1 & 2) */}
          <div className="contents lg:block lg:space-y-6 lg:col-span-2">

            {/* 2. ACTIVE SPACE / MEDIA PLAYER CARD */}
            {(() => {
          const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
          const ytId = isYouTube ? getYouTubeId(mediaUrl) : null;

          return (
            <div id="media-player-container" className="order-2 lg:order-none bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-850 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-stone-50/20 dark:from-stone-900/60 to-transparent pointer-events-none z-0"></div>

              {/* Playing track metadata */}
              <div className="flex items-center justify-between z-10 relative gap-3">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[9px] bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold flex items-center gap-1 w-max">
                    <Sparkles className="w-2.5 h-2.5 animate-bounce text-amber-500" /> NOW PLAYING
                  </span>
                  <h2 className="text-sm font-extrabold text-stone-950 dark:text-white truncate max-w-sm sm:max-w-md">
                    {isYouTube ? (queue.length > 0 ? queue[0].title : (ytPreview?.title || 'YouTube Video Stream')) : (mediaUrl ? mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1) : 'No Stream Loaded')}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                      mediaStatus === 'Playing' ? 'bg-emerald-500/10 text-emerald-550 dark:text-emerald-400 border border-emerald-500/20' :
                      mediaStatus === 'Paused' ? 'bg-amber-500/10 text-amber-550 dark:text-amber-400 border border-amber-500/20' :
                      mediaStatus === 'Buffering' ? 'bg-cyan-500/10 text-cyan-550 dark:text-cyan-400 border border-cyan-500/20 animate-pulse' :
                      mediaStatus === 'Ended' ? 'bg-stone-500/10 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-800' :
                      mediaStatus === 'Live' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-450 border border-rose-500/25' :
                      'bg-stone-100 dark:bg-stone-900 text-stone-500 dark:text-stone-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        mediaStatus === 'Playing' ? 'bg-emerald-500 animate-pulse' :
                        mediaStatus === 'Live' ? 'bg-rose-500 animate-pulse' :
                        mediaStatus === 'Buffering' ? 'bg-cyan-500 animate-spin' :
                        mediaStatus === 'Paused' ? 'bg-amber-500' :
                        'bg-stone-400'
                      }`} />
                      <span>{mediaStatus.toUpperCase()}</span>
                    </span>
                    {youtubeFailed && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-mono font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md" title="Embedding restricted by creator">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>EMBED RESTRICTED</span>
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="shrink-0 self-start">
                  <span className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1 rounded-lg ${currentIsHost ? 'bg-rose-500/10 text-rose-500 dark:text-rose-405 border border-rose-500/20' : 'bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-850 text-stone-600 dark:text-stone-400'}`}>
                    {currentIsHost ? 'HOST CONSOLE' : 'LISTENER'}
                  </span>
                </div>
              </div>

              {/* Actual player workspace */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-stone-200 dark:border-stone-850 z-10 select-none">
                {mediaUrl ? (
                  youtubeFailed ? (
                    /* Embed restricted fallback UI state */
                    <div id="mediacard-failed-fallback" className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-4 bg-stone-950 text-stone-200 relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.06),transparent_70%)] pointer-events-none z-0"></div>
                      
                      {/* Video design graphic wrapper */}
                      <div className="relative w-36 h-20 rounded-xl overflow-hidden border border-rose-500/20 shadow-2xl z-10 shrink-0 mx-auto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={ytPreview?.thumbnailUrl || (queue.length > 0 ? queue[0].thumbnail_url : '') || `https://img.youtube.com/vi/${getYouTubeId(mediaUrl || '')}/hqdefault.jpg`} 
                          alt="Video Thumbnail" 
                          className="w-full h-full object-cover brightness-75 filter blur-[1px]"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play className="w-6 h-6 text-rose-550 fill-rose-550/20 animate-pulse" />
                        </div>
                      </div>

                      <div className="space-y-1 z-10 relative max-w-sm px-4 shrink-0">
                        <span className="text-[10px] bg-rose-550/15 border border-rose-550/25 text-rose-455 font-mono font-bold px-1.5 py-0.5 rounded">EMBEDDING RESTRICTED</span>
                        <p className="text-xs font-extrabold text-white truncate max-w-xs">{ytPreview?.title || (queue.length > 0 ? queue[0].title : 'Restricted Content Stream')}</p>
                        <p className="text-[9px] text-stone-400 font-medium font-mono uppercase tracking-wider">Channel: {ytPreview?.channelName || 'YouTube Creator'}</p>
                      </div>

                      <div className="flex gap-2.5 z-10 relative pt-1.5 shrink-0 justify-center">
                        <a
                          href={mediaUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <span>Open on YouTube</span>
                        </a>
                        {currentIsHost && (
                          <button
                            onClick={() => setIsHostToolsOpen(true)}
                            className="px-3.5 py-1.5 bg-stone-850 hover:bg-stone-750 text-stone-200 border border-stone-805 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer shrink-0"
                          >
                            Try Another Video
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isYouTube && ytId ? (
                    <div className="w-full h-full relative">
                      <div id="youtube-player" className="w-full h-full" />
                      
                      {/* Overlay pointer blocker for Guest so they cannot click play inside YouTube directly bypassing Host alignment */}
                      {!currentIsHost && (
                        <div className="absolute inset-0 bg-transparent z-20 pointer-events-auto"></div>
                      )}
                    </div>
                  ) : (
                    mediaType === 'audio' ? (
                      /* Styled rotating turntable view */
                      <div className="w-full h-full flex flex-col items-center justify-center py-6 relative bg-stone-900">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.03),transparent_70%)] pointer-events-none"></div>
                        
                        {/* Rotating visualizer vinyl record circle */}
                        <div className={`p-6 bg-stone-950 border-[5px] border-stone-800 rounded-full flex items-center justify-center shadow-2xl relative ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '24s' }}>
                          <Disc className="w-16 h-16 text-amber-500" />
                          <div className="absolute w-4 h-4 bg-stone-950 rounded-full border-2 border-stone-800 flex items-center justify-center">
                            <div className="w-1 h-1 bg-stone-600 rounded-full"></div>
                          </div>
                        </div>

                        <div className="mt-4 text-center px-4">
                          <p className="text-xs font-semibold text-stone-300 truncate max-w-sm mt-1">
                            {mediaUrl ? mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1) : 'No track loaded'}
                          </p>
                          <span className="text-[10px] text-stone-550 font-mono uppercase tracking-wider block mt-0.5">High-Fidelity Audio Stream</span>
                        </div>

                        {/* Hidden underlying element that runs audio, retaining exact same events binding */}
                        <video
                          ref={playerRef}
                          src={mediaUrl}
                          style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
                          onTimeUpdate={handleTimeUpdate}
                          onLoadedMetadata={handleLoadedMetadata}
                          onEnded={handleMediaEnded}
                          onPlay={() => setMediaStatus('Playing')}
                          onPause={() => setMediaStatus('Paused')}
                          onWaiting={() => setMediaStatus('Buffering')}
                        />
                      </div>
                    ) : (
                      /* Direct Video file playback */
                      <video
                        ref={playerRef}
                        src={mediaUrl}
                        onClick={currentIsHost ? (isPlaying ? handleHostPause : handleHostPlay) : undefined}
                        className="w-full h-full object-contain cursor-pointer"
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleMediaEnded}
                        onPlay={() => setMediaStatus('Playing')}
                        onPause={() => setMediaStatus('Paused')}
                        onWaiting={() => setMediaStatus('Buffering')}
                      />
                    )
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4 bg-stone-950">
                    <div className="w-12 h-12 bg-stone-900 border border-stone-850 text-stone-500 rounded-xl flex items-center justify-center shadow-xl">
                      <Tv className="w-6 h-6 opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-stone-300 tracking-wide uppercase font-mono">STANDBY: Empty Play Queue</h3>
                      <p className="text-[11px] text-stone-450 leading-relaxed max-w-xs mx-auto">
                        {currentIsHost 
                          ? "Load a fast stream preset below or append items to the Media Queue playlist to start synchronization." 
                          : "The lounge host has not loaded media tracks yet. Waiting on authority..."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Time slider & media coordinates */}
              {mediaUrl && (
                <div className="space-y-2 z-10 relative">
                  <div className="flex items-center justify-between text-xs font-mono text-stone-500 dark:text-stone-450">
                    <span className="text-amber-500 font-bold">{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="relative group flex items-center">
                    <input
                      id="timeline-slider-range"
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={1}
                      value={currentTime}
                      disabled={!currentIsHost}
                      onChange={handleSliderChange}
                      onMouseUp={handleSliderRelease}
                      onTouchEnd={handleSliderRelease}
                      className="w-full accent-amber-500 h-1 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed group-hover:h-1.5 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Stage Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-stone-200 dark:border-stone-850/60 z-10 relative">
                
                <div className="flex flex-wrap items-center gap-2">
                  {currentIsHost ? (
                    <>
                      {/* Play / Pause button */}
                      {isPlaying ? (
                        <button
                          onClick={handleHostPause}
                          id="host-pause-btn"
                          className="p-2.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-800 text-amber-500 border border-stone-200 dark:border-stone-800 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95 text-xs font-bold leading-none gap-2 px-4 shadow-sm dark:shadow-lg"
                          title="Pause Stream"
                        >
                          <Pause className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>PAUSE</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleHostPlay}
                          id="host-play-btn"
                          className="p-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95 text-xs font-extrabold leading-none gap-2 px-5 shadow-lg shadow-amber-500/10"
                          title="Play Stream"
                        >
                          <Play className="w-3.5 h-3.5 text-stone-950 fill-stone-950" />
                          <span>PLAY</span>
                        </button>
                      )}

                      {/* Backward 10s */}
                      <button
                        onClick={handleHostBackward10}
                        id="host-backward-10-btn"
                        className="p-2.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95"
                        title="Rewind 10 seconds"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[10px] ml-1 font-bold">10s</span>
                      </button>

                      {/* Forward 10s */}
                      <button
                        onClick={handleHostForward10}
                        id="host-forward-10-btn"
                        className="p-2.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95"
                        title="Skip forward 10 seconds"
                      >
                        <RotateCw className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[10px] ml-1 font-bold">10s</span>
                      </button>

                      {/* Skip next button */}
                      {queue.length > 0 && (
                        <button
                          onClick={handleSkipNext}
                          id="host-skip-btn"
                          className="p-2.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-850/80 border border-stone-200 dark:border-stone-850 text-stone-700 dark:text-stone-300 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95 text-xs gap-1.5 font-bold"
                          title="Skip current media"
                        >
                          <SkipForward className="w-3.5 h-3.5 text-stone-550 dark:text-stone-400 animate-pulse" />
                          <span>SKIP TRACK</span>
                        </button>
                      )}

                      {/* Playback Speed selector */}
                      <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-850 p-1 rounded-xl border border-stone-200 dark:border-stone-800 text-[10px] font-mono font-bold shrink-0">
                        <span className="px-1 text-[9px] text-stone-500 uppercase tracking-widest">SPEED</span>
                        {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handleHostSpeedChange(rate)}
                            className={`px-2 py-1 rounded-lg cursor-pointer transition text-[9px] ${
                              playbackRate === rate
                                ? 'bg-amber-500 text-stone-950 font-extrabold shadow'
                                : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center space-x-2 bg-stone-900 border border-stone-850 px-3.5 py-2 rounded-xl text-xs font-mono text-stone-400">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                        <span>{isPlaying ? 'PLAYING • BRANDED SYNC' : 'PAUSED • IN STANDBY'}</span>
                      </div>
                      
                      {/* Read only speed indicator for non-host */}
                      <div className="bg-stone-900 border border-stone-850 px-3 py-2 rounded-xl text-xs font-mono text-stone-400">
                        <span>SPEED: {playbackRate}x</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Volume block indicator */}
                <div className="flex items-center space-x-2 text-xs text-stone-450 z-10 font-mono">
                  <button
                    onClick={() => {
                      const nextMute = !isMuted;
                      setIsMuted(nextMute);
                      localStorage.setItem('syncwave-muted', String(nextMute));
                      if (playerRef.current) {
                        playerRef.current.muted = nextMute;
                      }
                      if (ytPlayerRef.current) {
                        if (nextMute) {
                          if (typeof ytPlayerRef.current.mute === 'function') ytPlayerRef.current.mute();
                        } else {
                          if (typeof ytPlayerRef.current.unMute === 'function') {
                            ytPlayerRef.current.unMute();
                            if (typeof ytPlayerRef.current.setVolume === 'function') {
                              ytPlayerRef.current.setVolume(Math.floor(videoVolume * 100));
                            }
                          }
                        }
                      }
                    }}
                    id="mute-unmute-btn"
                    className="p-2 bg-stone-900 hover:bg-stone-850 rounded-xl border border-stone-850 cursor-pointer transition text-stone-300"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> : <Volume2 className="w-3.5 h-3.5 text-stone-400" />}
                  </button>
                  <input
                    id="volume-slider-range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={videoVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVideoVolume(v);
                      setIsMuted(false);
                      localStorage.setItem('syncwave-volume', String(v));
                      localStorage.setItem('syncwave-muted', 'false');
                      if (playerRef.current) {
                        playerRef.current.volume = v;
                        playerRef.current.muted = false;
                      }
                      if (ytPlayerRef.current) {
                        if (typeof ytPlayerRef.current.unMute === 'function') ytPlayerRef.current.unMute();
                        if (typeof ytPlayerRef.current.setVolume === 'function') {
                          ytPlayerRef.current.setVolume(Math.floor(v * 100));
                        }
                      }

                      // Emit rapid time-seek update from volume changes if host to satisfy sync table constraints immediately
                      if (currentIsHost && room) {
                        PlaybackSyncService.updateTime(room.id, currentTime, duration || 180, user?.id).catch(() => {});
                      }
                    }}
                    className="w-14 accent-amber-500 h-1 bg-stone-850 rounded appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Collapsible Host Tools underneath player on the left column */}
        {currentIsHost && (
          <div id="host-tools-container" className="order-6 lg:order-none bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-850 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl transition-colors duration-200">
            <button
              onClick={() => setIsHostToolsOpen(!isHostToolsOpen)}
              className="w-full flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-900/80 hover:bg-stone-100 dark:hover:bg-stone-850/60 transition cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-amber-500 animate-pulse" />
                <div>
                  <h3 className="text-xs font-bold text-stone-900 dark:text-white uppercase tracking-wider">Host Control Center</h3>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">Stream Overrides, Preset Channels & Playback Queue Schedulers</p>
                </div>
              </div>
              <div>
                {isHostToolsOpen ? (
                  <ChevronUp className="w-4 h-4 text-stone-500 dark:text-stone-400 font-bold" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-stone-500 dark:text-stone-400 font-bold" />
                )}
              </div>
            </button>
            <AnimatePresence>
              {isHostToolsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-stone-200 dark:border-stone-850 p-4 space-y-4 bg-stone-50/10 dark:bg-stone-950/20"
                >
                  {/* URL / input errors wrapper */}
                  {urlError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-450 font-semibold animate-pulse flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-rose-550" />
                      <span>{urlError}</span>
                    </div>
                  )}

                  {/* Direct Load override */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase font-mono tracking-widest flex items-center gap-1">
                      <span>● Quick Stream override</span>
                    </h4>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!customUrlInput.trim()) return;
                        const val = customUrlInput.trim();
                        const isAudio = val.endsWith('.mp3') || val.includes('Helix') || val.includes('audio');
                        handleLoadMedia(val, isAudio ? 'audio' : 'video');
                        setCustomUrlInput('');
                      }}
                      className="flex gap-2"
                    >
                      <input
                        id="preset-url-input"
                        type="text"
                        placeholder="Paste immediate direct stream URL or YouTube link..."
                        value={customUrlInput}
                        onChange={(e) => setCustomUrlInput(e.target.value)}
                        className="flex-1 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs px-3 py-2 rounded-lg text-stone-900 dark:text-stone-200 placeholder-stone-450 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                      />
                      <button
                        type="submit"
                        id="submit-stream-btn"
                        className="bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold px-4 rounded-lg transition cursor-pointer font-bold uppercase"
                      >
                        LOAD
                      </button>
                    </form>

                    <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
                      {MEDIA_PRESETS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleLoadMedia(p.url, p.type as any)}
                          className="px-2.5 py-1.5 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-850 hover:border-stone-300 dark:hover:border-stone-750 text-[9px] font-mono text-stone-650 dark:text-stone-400 hover:text-stone-950 dark:hover:text-stone-200 rounded-lg transition cursor-pointer shrink-0"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* YouTube Live preview container */}
                  {isFetchingPreview && (
                    <div className="flex items-center gap-2 text-xs font-mono text-amber-500 animate-pulse pt-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      <span>Retrieving YouTube API metadata...</span>
                    </div>
                  )}

                  {ytPreview && (
                    <div className="border border-amber-500/15 bg-amber-500/[0.03] dark:bg-amber-500/[0.01] p-3 rounded-xl space-y-2.5 relative overflow-hidden">
                      <div className="flex gap-3">
                        <div className="relative w-24 h-16 rounded-lg overflow-hidden shrink-0 border border-amber-500/20 shadow">
                          <img src={ytPreview.thumbnailUrl} alt="YT Preview Thumbnail" className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 right-1 bg-black/75 px-1 rounded text-[9px] font-mono text-stone-100">
                            {formatTime(ytPreview.duration)}
                          </span>
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-stone-900 dark:text-white truncate">{ytPreview.title}</h5>
                          <div className="flex flex-col gap-0.5 text-[9px] font-mono text-stone-500 dark:text-stone-450 leading-none">
                            <span>Channel: {ytPreview.channelName}</span>
                            <span>Published: {ytPreview.publishedDate}</span>
                          </div>
                        </div>
                      </div>
                      
                      {!ytPreview.embeddable && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg p-2 text-[10px] flex items-center gap-2 leading-tight">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-550 shrink-0" />
                          <span>Embedding blocked. Video will fallback inside player frame.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Queue playlist form */}
                  <div className="space-y-2 pt-3 border-t border-stone-200 dark:border-stone-850/60">
                    <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase font-mono tracking-widest">
                      <span>● Append Scheduled Stream to Playlist Queue</span>
                    </h4>
                    <form onSubmit={handleAddMediaToQueue} className="space-y-2">
                      <input
                        type="text"
                        required
                        placeholder="Paste direct audio/video streaming path or YouTube URL..."
                        value={queueUrlInput}
                        onChange={(e) => setQueueUrlInput(e.target.value)}
                        className="w-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs px-3 py-2 rounded-lg text-stone-900 dark:text-stone-200 placeholder-stone-450 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter Optional Track Custom Title..."
                          value={queueTitleInput}
                          onChange={(e) => setQueueTitleInput(e.target.value)}
                          className="flex-1 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs px-3 py-2 rounded-lg text-stone-900 dark:text-stone-200 placeholder-stone-450 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                        />
                        <button
                          type="submit"
                          className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold px-4 rounded-lg transition whitespace-nowrap cursor-pointer hover:shadow-lg active:scale-95"
                        >
                          ADD TO QUEUE
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Drag-and-drop file upload component */}
                  <div className="space-y-2 pt-3 border-t border-stone-200 dark:border-stone-850/60">
                    <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase font-mono tracking-widest">
                      <span>● Quick File Sync (MP3 / MP4 Import)</span>
                    </h4>
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileImportMock(file);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('drag-file-uploader')?.click();
                      }}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition select-none flex flex-col items-center justify-center space-y-2 relative group mt-1.5 ${
                        isDragging 
                          ? 'border-amber-500 bg-amber-500/10 text-amber-650' 
                          : 'border-stone-300 dark:border-stone-800 bg-stone-50 hover:bg-stone-100 dark:bg-stone-900 dark:hover:bg-stone-950 text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      <input
                        id="drag-file-uploader"
                        type="file"
                        accept="audio/*,video/*"
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileImportMock(file);
                        }}
                      />
                      
                      {uploadProgress !== null ? (
                        <div className="w-full space-y-2">
                          <Loader2 className="w-5 h-5 text-amber-500 animate-spin mx-auto animate-bounce" />
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider">Syncing packets: {uploadProgress}%</p>
                            <div className="w-full h-1 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 transition-all duration-100" style={{ width: `${uploadProgress}%` }} />
                            </div>
                          </div>
                        </div>
                      ) : uploadedFileName ? (
                        <div className="space-y-1 text-center">
                          <Check className="w-5 h-5 text-emerald-500 mx-auto animate-bounce" />
                          <p className="text-xs font-bold text-stone-805 dark:text-white">Import Successful!</p>
                          <p className="text-[9px] font-mono text-emerald-500">{uploadedFileName}</p>
                        </div>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-stone-700 dark:text-stone-300">Drag & Drop or Click to Upload</p>
                            <p className="text-[10px] font-mono text-stone-450 dark:text-stone-500">Supports synchronized high-fidelity MP3 or MP4 streams</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

          </div> {/* END OF LEFT SIDEBAR col-span-2 */}

          {/* RIGHT SIDEBAR: SOCIAL & SYSTEM UTILITIES (Column 3) */}
          <div className="contents lg:block lg:space-y-6">

        {/* 3. PARTICIPANTS LIST */}
        <div id="participants-container" className="order-3 lg:order-none bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3.5 shadow-sm dark:shadow-none transition-colors duration-200">
          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 dark:border-stone-850/60">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-mono font-bold text-stone-900 dark:text-stone-200 uppercase tracking-widest">Listeners ({members.length})</span>
            </div>
            <span className="text-[10px] font-mono text-stone-450 dark:text-stone-550 uppercase tracking-wide">Sync Tribe</span>
          </div>

          <div className="flex flex-wrap gap-2 py-1 items-center">
            <AnimatePresence>
              {members.map((member) => {
                const memberIsHost = member.user_id === room.host_id;
                const memberIsMe = member.id === currentMember?.id;
                const nickname = member.profiles?.display_name || member.display_name || 'Lounge Guest';
                const avatar = member.profiles?.avatar_url || `https://picsum.photos/seed/${encodeURIComponent(nickname)}/100`;

                const memberId = member.user_id || member.guest_id || '';
                const presenceInfo = presences[memberId];
                
                let statusBadge = presenceInfo?.status || (memberIsMe ? "Online" : "Offline");
                let statusDot = "bg-stone-500"; // Default Offline/Disconnected
                
                if (statusBadge === "Online") {
                  statusDot = "bg-sky-500 animate-pulse";
                } else if (statusBadge === "Listening") {
                  statusDot = "bg-emerald-500 animate-pulse";
                } else if (statusBadge === "Buffering") {
                  statusDot = "bg-pink-500 animate-bounce";
                } else if (statusBadge === "Idle") {
                  statusDot = "bg-amber-500";
                } else if (statusBadge === "In Lobby") {
                  statusDot = "bg-amber-500";
                } else if (statusBadge === "Offline" || statusBadge === "Disconnected") {
                  statusDot = "bg-stone-600";
                }

                return (
                  <motion.div
                    key={member.id}
                    layoutId={`member-card-${member.id}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`group relative flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-[11px] font-medium transition cursor-help select-none ${
                      memberIsMe 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' 
                        : 'bg-stone-100 dark:bg-stone-900/60 border-stone-200 dark:border-stone-850 hover:border-stone-300 dark:hover:border-stone-750 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    {/* Avatar & status circle */}
                    <div className="relative w-5 h-5 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={avatar} 
                        alt={nickname} 
                        className={`w-full h-full rounded-full object-cover border ${
                          memberIsHost ? 'border-amber-500/60' : 'border-stone-300 dark:border-stone-800'
                        }`}
                      />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white dark:border-stone-950 ${statusDot}`} />
                    </div>

                    {/* Nickname, Host badge */}
                    <span className="max-w-[75px] truncate font-bold text-stone-800 dark:text-stone-200">
                      {nickname}
                    </span>
                    {memberIsHost && <Crown className="w-2.5 h-2.5 text-amber-500 shrink-0" />}

                    {/* Detailed Tooltip overlay on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-300 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-50 space-y-1.5 whitespace-normal">
                      <p className="font-extrabold text-stone-900 dark:text-white text-xs flex items-center gap-1">
                        {nickname}
                        {memberIsHost && <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-mono font-extrabold px-1.5 rounded uppercase leading-none">Host</span>}
                        {memberIsMe && <span className="text-[8px] bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-450 font-mono font-extrabold px-1.5 rounded uppercase leading-none">You</span>}
                      </p>
                      <p className="text-stone-500 dark:text-stone-400 flex items-center gap-1 font-mono uppercase tracking-wider text-[8px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot.split(' ')[0]}`}></span>
                        {memberIsHost ? 'Streaming state' : 'Listening state'}: {statusBadge}
                      </p>
                      <p className="text-stone-450 dark:text-stone-550 font-mono text-[8px] border-t border-stone-100 dark:border-stone-800 pt-1">
                        Joined: {new Date(member.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>

                      {/* Quick kick/ban controls inside tooltip for Host */}
                      {currentIsHost && !memberIsHost && (
                        <div className="flex gap-1 pt-1.5 select-auto pointer-events-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMuteMember(member.id, member.is_muted);
                            }}
                            className={`flex-1 text-[8px] font-bold px-1 py-0.5 rounded flex items-center justify-center gap-0.5 ${member.is_muted ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:text-white'}`}
                          >
                            {member.is_muted ? 'UNMUTE' : 'MUTE'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              kickMember(member.id, nickname);
                            }}
                            className="flex-1 bg-stone-800 hover:bg-orange-950/20 text-stone-300 hover:text-orange-405 text-[8px] font-bold px-1 py-0.5 rounded"
                          >
                            KICK
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              banMember(member.id, nickname);
                            }}
                            className="flex-1 bg-stone-800 hover:bg-red-950/20 text-stone-300 hover:text-red-500 text-[8px] font-bold px-1 py-0.5 rounded"
                          >
                            BAN
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
              {/* 4. LIVE TEXT CHAT PANEL */}
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

          {/* typing status */}
          {typingUsers.length > 0 && (
            <div className="text-[9px] font-mono text-amber-500/95 animate-pulse flex items-center gap-1 shrink-0 bg-amber-500/[0.02] px-1.5 py-0.5 rounded-md">
              <span className="h-1 w-1 bg-amber-500 rounded-full animate-ping"></span>
              <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
            </div>
          )}

          {/* messages list - Discord-like look */}
          <div id="messages-list" className="flex-1 overflow-y-auto p-2 space-y-2 bg-stone-50 dark:bg-stone-950/40 rounded-xl border border-stone-200 dark:border-stone-850/60 scrollbar-thin max-h-48 min-h-[110px]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-3">
                <MessageSquare className="w-5 h-5 text-stone-300 dark:text-stone-700 mb-1 shrink-0" />
                <p className="text-xs text-stone-400 dark:text-stone-500 font-medium italic">No messages yet.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const matchedMember = members.find(m => m.user_id === msg.sender_id || m.guest_id === msg.sender_id);
                const nickname = msg.sender_name || 'Guest';
                const avatar = matchedMember?.profiles?.avatar_url || `https://picsum.photos/seed/${encodeURIComponent(nickname)}/100`;

                return (
                  <div key={msg.id} className="flex items-start gap-2 py-0.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-900/40 px-2 rounded transition-colors duration-150">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={avatar} 
                      alt={nickname} 
                      className="w-7 h-7 rounded-md object-cover border border-stone-200 dark:border-stone-850 mt-0.5 shrink-0" 
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-extrabold text-stone-800 dark:text-stone-200 text-[11px] truncate">{nickname}</span>
                        {matchedMember?.user_id === room.host_id && (
                          <span className="text-[7px] bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 font-mono font-extrabold px-1 py-px rounded uppercase scale-90 shrink-0">HOST</span>
                        )}
                        <span className="text-[8px] font-mono text-stone-405 dark:text-stone-500">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-stone-605 dark:text-stone-300 select-text leading-relaxed whitespace-pre-wrap mt-0.5 break-words text-[11px]">{msg.content}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Send block */}
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
        </div>    </div>

        {/* 5. MEDIA QUEUE CARD */}
        <div id="media-queue-container" className="order-5 lg:order-none bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3 flex flex-col shadow-sm dark:shadow-none transition-colors duration-200">
          <div className="flex items-center justify-between pb-1.5 border-b border-stone-200 dark:border-stone-850/60 font-sans">
            <div className="flex items-center space-x-2">
              <ListMusic className="w-4 h-4 text-amber-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-stone-900 dark:text-stone-200 uppercase tracking-widest">Queue Playlist ({queue.length})</span>
            </div>
            <span className="text-[10px] font-mono text-stone-450 dark:text-stone-550 uppercase tracking-wide">Sync Timeline</span>
          </div>

          {/* Stack of media queue items */}
          <div className="space-y-1.5 overflow-y-auto max-h-56 pr-1 scrollbar-thin">
            {queue.length === 0 ? (
              <div className="py-6 bg-stone-50 dark:bg-stone-950/30 rounded-xl border border-stone-200 dark:border-stone-850/40 text-center space-y-1.5 flex flex-col items-center justify-center">
                <ListMusic className="w-5 h-5 text-stone-300 dark:text-stone-700 font-mono" />
                <div>
                  <p className="text-xs text-stone-400 dark:text-stone-550 font-medium italic">Playback queue is empty.</p>
                  <p className="text-[9px] text-stone-500 dark:text-stone-450 max-w-[190px] mx-auto mt-0.5 font-sans leading-normal">
                    {currentIsHost 
                      ? 'Configure and schedule streams inside Host Tools control console.' 
                      : 'Lounge host configures the synchronization timeline.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((item, idx) => (
                  <div 
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-xl border gap-2.5 hover:bg-stone-100 dark:hover:bg-stone-900/10 transition duration-150 ${idx === 0 ? 'bg-amber-500/5 border-amber-500/15' : 'bg-stone-50 dark:bg-stone-950/40 border-stone-200 dark:border-stone-850'}`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {/* Thumbnail wrapper */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={item.thumbnail_url || `https://picsum.photos/seed/${encodeURIComponent(item.title || '')}/80/60`} 
                        alt={item.title || 'Queue Track'} 
                        className="w-10 h-7 rounded object-cover border border-stone-205 dark:border-stone-800 shrink-0 select-none bg-stone-1 animate-fade-in"
                      />
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-amber-500 font-extrabold shrink-0">#{idx + 1}</span>
                          <span className="text-xs font-bold text-stone-200 truncate block leading-tight">
                            {item.title || 'Untitled Stream track'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[8px] text-stone-500">
                          <span className="uppercase text-[7px] bg-stone-900 px-1 rounded border border-stone-850 text-stone-400 font-bold shrink-0">
                            {item.media_type === 'youtube' ? 'YT' : item.media_type}
                          </span>
                          <span>•</span>
                          <span>{formatTime(item.duration)}</span>
                          <span>•</span>
                          <span className="truncate max-w-[80px]">by {item.added_by_name || 'Lounge Host'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions for Host */}
                    {currentIsHost && (
                      <div className="flex items-center bg-stone-950 border border-stone-850 p-0.5 rounded-lg gap-0.5 shrink-0">
                        <button
                          onClick={() => handlePlayNextInQueue(item)}
                          className="p-1 rounded text-stone-500 hover:text-amber-400 hover:bg-stone-900 transition cursor-pointer"
                          title="Promote Track to Play Next"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        
                        <button
                          onClick={() => handleRemoveFromQueue(item.id, item.title || 'Track')}
                          className="p-1 rounded text-stone-500 hover:text-rose-500 hover:bg-stone-900 transition cursor-pointer"
                          title="Remove Track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div> {/* END OF RIGHT SIDEBAR */}
    </div> {/* END OF GRID SPLIT CONTAINER */}

      </div>

      {/* SHARING & TELEGRAM CONTROL MODAL */}
      <AnimatePresence>
        {isShareModalOpen && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShareModalOpen(false)}
              className="absolute inset-0 bg-stone-950/60 backdrop-blur-md"
            />
            
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 shadow-2xl z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800 mb-5">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg">
                    <Plus className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-extrabold text-stone-900 dark:text-white uppercase tracking-wider">
                    Share listening lounge
                  </h3>
                </div>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-850 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Copy Invite Link */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400">Invite Link</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== 'undefined' ? window.location.href : ''}
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-600 dark:text-stone-300 select-all outline-none"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold rounded-xl transition active:scale-95 flex items-center gap-1 cursor-pointer shadow-md shadow-amber-500/5 shrink-0"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Copy Room Code */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400">Lounge Code</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={room?.slug || ''}
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 text-stone-700 dark:text-stone-300 font-bold tracking-widest text-center select-all outline-none"
                    />
                    <button
                      onClick={() => {
                        if (room?.slug) {
                          navigator.clipboard.writeText(room.slug).then(() => {
                            setCopiedCode(true);
                            setTimeout(() => setCopiedCode(false), 2000);
                            showToast("Lounge code copied to clipboard!", "success");
                          });
                        }
                      }}
                      className="px-4 py-2.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold rounded-xl transition active:scale-95 flex items-center gap-1 cursor-pointer shrink-0 border border-stone-250 dark:border-stone-750"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="h-px bg-stone-150 dark:bg-stone-850 my-4" />

                {/* Companion Bot Controls */}
                <div className="space-y-2.5">
                  <h4 className="text-[11px] font-bold text-stone-700 dark:text-stone-300 uppercase tracking-widest">
                    SyncWaveBot Companion
                  </h4>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Control this lobby&apos;s media streams directly from Telegram chats or groups using <b>SyncWaveBot</b>.
                  </p>

                  <div className="grid grid-cols-2 gap-3.5 pt-1">
                    {/* Open Telegram */}
                    <a
                      href={`https://t.me/syncwaveapp_bot?start=link_${profile?.id || user?.id || ''}_${room?.slug || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer shadow-md shadow-sky-500/10 text-center"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M11.944 0C5.337 0 0 5.337 0 11.944c0 6.607 5.337 11.944 11.944 11.944 6.608 0 11.944-5.337 11.944-11.944C23.888 5.337 18.552 0 11.944 0zm5.556 8.3c-.172 1.812-.924 6.25-1.306 8.3-.162.868-.482 1.16-.792 1.188-.674.062-1.186-.445-1.838-.872-1.02-.668-1.597-1.082-2.587-1.734-1.144-.754-.402-1.168.25-1.844.17-.176 3.128-2.87 3.185-3.11.007-.031.014-.146-.055-.207-.068-.061-.169-.04-.242-.024-.104.024-1.764 1.12-5.0 3.31-.474.326-.88.487-1.218.479-.373-.008-1.089-.21-1.623-.383-.654-.213-1.174-.326-1.129-.688.023-.189.283-.382.78-.58 3.048-1.326 5.08-2.204 6.095-2.636 2.9-.1.233.1.65.114.925.1.018.232.042.483-.021.233-.062.518-.211.758-.415.24-.204.288-.475.253-.781-.035-.306-.217-.43-.45-.48z"/>
                      </svg>
                      <span>Link SyncWaveBot</span>
                    </a>

                    {/* Share via Telegram */}
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&text=${encodeURIComponent(`Join my SyncWave room "${room?.name || 'Lounge'}" and let's listen to streams together in zero lag!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-1.5 px-3 py-2.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-bold rounded-xl transition active:scale-95 cursor-pointer border border-sky-500/20 text-center"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Share on Telegram</span>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Animated Toast Notifications (BUG 6) */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-lg backdrop-blur-md ${
                t.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                t.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' :
                t.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' :
                'bg-white/95 dark:bg-stone-900/95 border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'success' && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {t.type === 'warning' && <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                {t.type === 'error' && <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                {t.type === 'info' && <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                <span className="text-[11px] font-bold tracking-tight font-sans leading-tight">{t.message}</span>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 cursor-pointer transition ml-2 shrink-0"
                title="Dismiss Alert"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
