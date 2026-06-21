'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getOrCreateProfile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import { getUniqueGuestName, Room, RoomMember } from '@/lib/room';
import SupabaseSetupNeeded from '@/components/SupabaseSetupNeeded';
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
  Laptop
} from 'lucide-react';
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
    return typeof params.code === 'string' ? params.code.toUpperCase() : '';
  }, [params.code]);

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
  const [videoVolume, setVideoVolume] = React.useState(0.8);
  const [isMuted, setIsMuted] = React.useState(false);
  const [syncStatusText, setSyncStatusText] = React.useState('Initializing synchronization...');

  // Media Queue & Chat Interactions States
  const [queue, setQueue] = React.useState<any[]>([]);
  const [queueUrlInput, setQueueUrlInput] = React.useState('');
  const [queueTitleInput, setQueueTitleInput] = React.useState('');
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [isTyping, setIsTyping] = React.useState(false);
  
  // UX Phase 3.2 Refinement States
  const [isHostToolsOpen, setIsHostToolsOpen] = React.useState(false);
  const [youtubeFailed, setYoutubeFailed] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  // Theme management states
  const [theme, setTheme] = React.useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('syncwave-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
    return 'system';
  });
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('dark');
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

  // Theme Sync logic
  React.useEffect(() => {
    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedTheme(media.matches ? 'dark' : 'light');
      
      const listener = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedTheme(theme);
    }
    localStorage.setItem('syncwave-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [resolvedTheme]);

  React.useEffect(() => {
    if (youtubeFailed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setYoutubeFailed(false);
    }
  }, [mediaUrl, youtubeFailed]);
  
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
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [roomCode]);

  // Set stored guest session (client-safe)
  const setStoredGuestSession = React.useCallback((guestId: string, name: string, sessionId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`syncwave-guest-${roomCode}`, JSON.stringify({ guestId, displayName: name, sessionId }));
  }, [roomCode]);

  // Remove guest credentials (client-safe)
  const clearStoredGuestSession = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`syncwave-guest-${roomCode}`);
  }, [roomCode]);

  const fetchRoomDetails = React.useCallback(async () => {
    const supabase = getSupabase() as any;
    if (!supabase || !roomCode) return;

    try {
      // 1. Fetch Room definition
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('slug', roomCode)
        .maybeSingle();

      if (roomError) throw roomError;

      if (!roomData) {
        setRoom(null);
        setLoading(false);
        return;
      }

      const rAny = roomData as any;
      setRoom(rAny);

      // 2. Fetch Active Members in this room
      const { data: membersData, error: membersError } = await supabase
        .from('room_members')
        .select('*, profiles(display_name, username, avatar_url)')
        .eq('room_id', rAny.id);

      if (membersError) throw membersError;
      setMembers(membersData || []);

      // 3. Fetch recent messages logs
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', rAny.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (messagesError) throw messagesError;
      
      // Adapt structure to local models
      const mappedMessages: ChatMessage[] = ((messagesData as any[]) || []).map((m: any) => {
        // Resolve sender display name from members list
        const senderMember = ((membersData as any[]) || []).find(
          (member: any) => member.user_id === m.sender_id || member.guest_id === m.sender_id
        );
        const sAny = senderMember as any;
        return {
          id: m.id,
          room_id: m.room_id,
          sender_id: m.sender_id,
          sender_name: sAny?.profiles?.display_name || sAny?.display_name || 'Anonymous',
          content: m.content,
          created_at: m.created_at
        };
      });
      setMessages(mappedMessages);

      return roomData;
    } catch (e: any) {
      console.error('[Room Page] Error loading room metadata:', e.message);
      writeLog('error', 'Room connection', `Could not initialize room schema: ${e.message}`);
      setInitError(e.message || 'Error occurred while loading room data.');
      setLoading(false);
    }
  }, [roomCode]);

  // Sync / join room membership
  const joinRoomAsRegisteredUser = React.useCallback(async (roomId: string, userId: string, userEmail: string) => {
    const supabase = getSupabase() as any;
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // Make sure registered user has their profile built
      const userProfile = await getOrCreateProfile(userId, userEmail);

      // Prevent duplicate membership entries by querying existing
      const { data: existing, error: findError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();

      if (findError) throw findError;

      const extAny = existing as any;
      if (extAny) {
        // Check if banned
        if (extAny.is_banned) {
          setIsBanned(true);
          return;
        }
        
        setCurrentMember(extAny);
        writeLog('info', 'Lounge synced', `Rejoining session lounge as registered user: @${userProfile.username}`);
      } else {
        // Create new membership entry
        const { data: joinedRow, error: joinError } = await supabase
          .from('room_members')
          .insert({
            room_id: roomId,
            user_id: userId,
            display_name: userProfile.display_name
          } as any)
          .select()
          .single();

        if (joinError) throw joinError;
        setCurrentMember(joinedRow);
        writeLog('success', 'Lounge synced', `Registered user @${userProfile.username} entered the room session.`);
      }
    } catch (err: any) {
      console.error('Failed to link registered user membership:', err);
      writeLog('error', 'Lounge synced', `Failed to join lounge matching registration: ${err.message}`);
      setInitError(err.message || 'Error occurred while joining room session.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGuestJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || guestSubmitting || !guestNameInput.trim()) return;

    setGuestSubmitting(true);
    setGuestError(null);

    const supabase = getSupabase() as any;
    if (!supabase) {
      setGuestSubmitting(false);
      return;
    }

    try {
      const safeName = await getUniqueGuestName(room.id, guestNameInput.trim());
      
      // Check if this IP or display name exists with a ban in this room members list
      const { data: existingRecords, error: precheckError } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', room.id)
        .eq('display_name', safeName);

      if (precheckError) throw precheckError;

      const banMatch = ((existingRecords as any[]) || []).find((v: any) => v.is_banned);
      if (banMatch) {
         setIsBanned(true);
         setShowJoinPrompt(false);
         setGuestSubmitting(false);
         writeLog('warn', 'Security block', `Banned guest block matched display name pattern: "${safeName}"`);
         return;
      }

      // Generate pristine guest unique identifiers
      const guestId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      const { data: row, error: insertError } = await supabase
        .from('room_members')
        .insert({
          room_id: room.id,
          guest_id: guestId,
          display_name: safeName,
          session_id: sessionId
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // Persist credentials locally for recovery on refresh
      setStoredGuestSession(guestId, safeName, sessionId);
      setCurrentMember(row);
      setShowJoinPrompt(false);
      writeLog('success', 'Lounge synced', `Guest "${safeName}" joined synced session with temporary token id ${guestId.substring(0,6)}.`);
      
      // Refresh list
      await fetchRoomDetails();
    } catch (err: any) {
      setGuestError(err.message || 'Operation forbidden by server constraints.');
      writeLog('error', 'Lounge synced', `Guest configuration error: ${err.message}`);
    } finally {
      setGuestSubmitting(false);
    }
  };

  // Leave room logic
  const leaveRoom = React.useCallback(async () => {
    if (!supabaseConnected || !currentMember || !room) return;

    const supabase = getSupabase();
    if (!supabase) return;

    try {
      writeLog('info', 'Lounge synced', `Initiating orderly departure from room session code ${roomCode}...`);
      
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('id', currentMember.id);

      if (error) throw error;

      // Reset states
      clearStoredGuestSession();
      setCurrentMember(null);
      
      writeLog('success', 'Lounge synced', `Left room code ${roomCode} successfully.`);
      router.replace(user ? '/dashboard' : '/');
    } catch (err: any) {
      console.error('Failed to leave room cleanly:', err.message);
      // Fallback redirect anyway
      router.replace(user ? '/dashboard' : '/');
    }
  }, [currentMember, room, roomCode, router, user, supabaseConnected, clearStoredGuestSession]);

  // Send visual message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !currentMember || !room || !supabaseConnected) return;

    // Reject message sending if user is muted in the room
    if (currentMember.is_muted) {
      writeLog('warn', 'Chat blocker', `Muted participant attempt to post chat dismissed.`);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const currentText = typedMessage.trim();
    setTypedMessage('');

    try {
      const senderId = currentMember.user_id || currentMember.guest_id || 'anonymous';
      
      const supabaseS = getSupabase() as any;
      const { error } = await supabaseS
        .from('messages')
        .insert({
          room_id: room.id,
          sender_id: senderId,
          content: currentText
        } as any);

      if (error) throw error;
    } catch (err: any) {
      console.error('[Room Chat] Message delivery failed:', err.message);
      writeLog('error', 'Chat blocker', `Message delivery failed: ${err.message}`);
    }
  };

  // Host Controls: Mute Member
  const toggleMuteMember = async (memberId: string, currentMuteState: boolean) => {
    if (!room || !currentMember || !supabaseConnected) return;
    const supabase = getSupabase() as any;
    if (!supabase) return;

    // Check if current user is indeed the room host
    if (room.host_id !== user?.id) {
      writeLog('error', 'Security block', 'Unauthorized guest administration attempt. Operation blocked.');
      return;
    }

    try {
      const { error } = await supabase
        .from('room_members')
        .update({ is_muted: !currentMuteState } as any)
        .eq('id', memberId);

      if (error) throw error;
      writeLog('info', 'Security block', `Participant mute toggled to ${!currentMuteState} by Host.`);
    } catch (err: any) {
      console.error('Host control update failed:', err);
      writeLog('error', 'Security block', `Mute toggle action rejected: ${err.message}`);
    }
  };

  // Host Controls: Kick Member (orderly deletion)
  const kickMember = async (memberId: string, displayName: string) => {
    if (!room || !currentMember || !supabaseConnected) return;
    const supabase = getSupabase() as any;
    if (!supabase) return;

    if (room.host_id !== user?.id) {
       writeLog('error', 'Security block', 'Unauthorized kick request received.');
       return;
    }

    try {
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      writeLog('success', 'Security block', `Host kicked participant "${displayName}" from the session.`);
    } catch (err: any) {
      console.error('Kick execution rejected:', err.message);
      writeLog('error', 'Security block', `Kick execution failed: ${err.message}`);
    }
  };

  // Host Controls: Ban Member (mark is_banned column as true)
  const banMember = async (memberId: string, displayName: string) => {
    if (!room || !currentMember || !supabaseConnected) return;
    const supabase = getSupabase() as any;
    if (!supabase) return;

    if (room.host_id !== user?.id) {
       writeLog('error', 'Security block', 'Unauthorized ban request received.');
       return;
    }

    try {
      // Deleting active connection and updating ban record
      const { error } = await supabase
        .from('room_members')
        .update({ is_banned: true } as any)
        .eq('id', memberId);

      if (error) throw error;
      writeLog('success', 'Security block', `Host banned participant "${displayName}" from this session.`);
    } catch (err: any) {
      console.error('Ban operation failed:', err.message);
      writeLog('error', 'Security block', `Ban configuration failed: ${err.message}`);
    }
  };

  const currentIsHost = room ? room.host_id === user?.id : false;

  const handleHostPlay = async () => {
    if (!room || !currentIsHost || !playerRef.current) return;
    const player = playerRef.current;
    try {
      await player.play();
      setIsPlaying(true);
      await PlaybackSyncService.play(room.id, player.currentTime, user?.id);
    } catch (e) {
      console.error('Failed to trigger play:', e);
    }
  };

  const handleHostPause = async () => {
    if (!room || !currentIsHost || !playerRef.current) return;
    const player = playerRef.current;
    player.pause();
    setIsPlaying(false);
    await PlaybackSyncService.pause(room.id, player.currentTime, user?.id);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (!currentIsHost && playerRef.current) {
      return;
    }
    if (playerRef.current) {
      playerRef.current.currentTime = val;
    }
  };

  const handleSliderRelease = async () => {
    if (!room || !currentIsHost || !playerRef.current) return;
    await PlaybackSyncService.seek(room.id, currentTime, user?.id);
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
          controls: currentIsHost ? 1 : 0,
          disablekb: currentIsHost ? 0 : 1,
          modestbranding: 1,
          rel: 0,
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
            if (!currentIsHost) return;
            if (isUpdatingFromRemote.current) return;

            // Player state tags: 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (event.data === 1) {
              setIsPlaying(true);
              const cur = ytPlayerRef.current?.getCurrentTime() || 0;
              PlaybackSyncService.play(room?.id || '', cur, user?.id);
            } else if (event.data === 2) {
              setIsPlaying(false);
              const cur = ytPlayerRef.current?.getCurrentTime() || 0;
              PlaybackSyncService.pause(room?.id || '', cur, user?.id);
            } else if (event.data === 0) {
              handleMediaEnded();
            }
          },
          onError: (event: any) => {
            const code = event.data;
            console.warn("YouTube embedding handshake error:", code);
            if (code === 101 || code === 150) {
              setUrlError("Embed Allowed Blocked: YouTube video creator does not permit remote player embeds.");
              setYoutubeFailed(true);
            } else {
              setUrlError(`YouTube playback event reported error code: ${code}`);
              setYoutubeFailed(true);
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
    const supabase = getSupabase() as any;
    if (!supabase || !room || !currentMember || isTyping) return;

    setIsTyping(true);
    const channelName = `syncwave-realtime-room-${room.id}`;
    const authorName = currentMember?.profiles?.display_name || currentMember?.display_name || 'Guest';

    // Broadcast presence of typing
    supabase.channel(channelName).send({
      type: 'broadcast',
      event: 'typing',
      payload: { authorName, typingState: true }
    });

    if ((window as any).typingTimer) {
      clearTimeout((window as any).typingTimer);
    }

    (window as any).typingTimer = setTimeout(() => {
      setIsTyping(false);
      supabase.channel(channelName).send({
        type: 'broadcast',
        event: 'typing',
        payload: { authorName, typingState: false }
      });
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchRoomDetails().then((activeRoom) => {
      if (!activeRoom) {
        setLoading(false);
        return;
      }

      // Initialize room playback state and late join synchronization
      const hostCheck = activeRoom.host_id === user?.id;
      PlaybackSyncService.initializePlaybackState(activeRoom.id, hostCheck).then((state) => {
        if (state) {
          setPlaybackState(state);
          setMediaUrl(state.media_url || '');
          setMediaType((state.media_type as 'video' | 'audio') || 'video');
          
          // Late Join & Drift Recovery
          let targetTime = state.current_time;
          if (state.is_playing && state.last_sync_at) {
            const elapsed = (Date.now() - new Date(state.last_sync_at).getTime()) / 1000;
            targetTime = state.current_time + elapsed;
            if (state.duration && targetTime > state.duration) {
              targetTime = state.duration;
            }
          }
          
          setCurrentTime(targetTime);
          setIsPlaying(state.is_playing);
          
          // Apply to player element lazily
          setTimeout(() => {
            const player = playerRef.current;
            if (player) {
              player.currentTime = targetTime;
              if (state.is_playing) {
                player.play().catch(e => console.log('[Playback Engine] Late join autoplay deferred:', e));
              }
            }
          }, 300);
          
          // Fetch current media queue
          PlaybackSyncService.fetchQueue(activeRoom.id).then((items) => {
            setQueue(items);
          });

          setSyncStatusText('Real-time synchronization established.');
        }
      });

      // Check current user situation
      if (user) {
        // Authenticated user
        joinRoomAsRegisteredUser(activeRoom.id, user.id, user.email || '');
      } else {
        // Guest user - attempt resolution of local persistence session to recover
        const stored = getStoredGuestSession();
        if (stored) {
          // Verify against existing database records for recovery
          const supabase = getSupabase() as any;
          if (supabase) {
            supabase
              .from('room_members')
              .select('*')
              .eq('room_id', activeRoom.id)
              .eq('guest_id', stored.guestId)
              .maybeSingle()
              .then((res: any) => {
                const row = res?.data;
                const error = res?.error;
                if (error || !row) {
                  // DB row is missing, force re-creation
                  clearStoredGuestSession();
                  setShowJoinPrompt(true);
                  setLoading(false);
                } else if (row.is_banned) {
                  setIsBanned(true);
                  setLoading(false);
                } else {
                  // Row recovered successfully!
                  setCurrentMember(row);
                  setLoading(false);
                  writeLog('success', 'Lounge synced', `Guest recovered previous session as "${row.display_name}".`);
                }
              });
          } else {
            setLoading(false);
          }
        } else {
          // No guest session found, trigger Join Panel immediately
          setShowJoinPrompt(true);
          setLoading(false);
        }
      }
    });

  }, [roomCode, user, supabaseConnected, fetchRoomDetails, joinRoomAsRegisteredUser, getStoredGuestSession, clearStoredGuestSession]);

  // Realtime Subscriptions setup
  React.useEffect(() => {
    const supabase = getSupabase() as any;
    if (!supabase || !room) return;

    // Filter changes specifically for this room
    const channelName = `syncwave-realtime-room-${room.id}`;
    writeLog('info', 'Lounge synced', `Establishing dynamic Realtime socket channel on SyncWave publication cluster...`);

    const channel = supabase
      .channel(channelName)
      // Listen to room membership adjustments
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },
        async (payload: any) => {
          console.log('[Room Realtime Update] room_members payload:', payload);
          
          // Re-fetch all members to maintain full profile resolution joins cleanly
          const { data: updatedMembers, error } = await supabase
            .from('room_members')
            .select('*, profiles(display_name, username, avatar_url)')
            .eq('room_id', room.id);

          if (!error && updatedMembers) {
            setMembers(updatedMembers);

            // Handle deletions / bans affecting current client
            if (currentMember) {
              const currentInDB = ((updatedMembers as any[]) || []).find((m: any) => m.id === currentMember.id);
              if (!currentInDB) {
                // Deactivation or manual Host removal matched
                setIsKicked(true);
                writeLog('warn', 'Security block', `Server dismissed current occupant membership signature.`);
              } else {
                // Permission revisions
                if (currentInDB.is_banned) {
                  setIsBanned(true);
                  writeLog('error', 'Security block', `Security policy revised: current member banned.`);
                }
                setCurrentMember(currentInDB);
              }
            }
          }
        }
      )
      // Listen to new chat messages
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        (payload: any) => {
          console.log('[Room Realtime Update] messages payload:', payload);
          const newMsg = payload.new;
          
          // Increment unread count for guest / other member if they are not author
          const mAuthor = currentMember?.user_id === newMsg.sender_id || currentMember?.guest_id === newMsg.sender_id;
          if (!mAuthor) {
            setUnreadCount((c) => c + 1);
          }

          // Use members list in state to resolve display name matching sender_id quickly
          setMembers((currentMembers) => {
            const senderCell = currentMembers.find(
              (m) => m.user_id === newMsg.sender_id || m.guest_id === newMsg.sender_id
            );
            const senderNickname = senderCell?.profiles?.display_name || senderCell?.display_name || 'Anonymous';

            setMessages((prev) => {
              // Guard against double insertions (idempotency rule in real-time guidelines)
              if (prev.some((msg) => msg.id === newMsg.id)) return prev;
              
              return [
                ...prev,
                {
                  id: newMsg.id,
                  room_id: newMsg.room_id,
                  sender_id: newMsg.sender_id,
                  sender_name: senderNickname,
                  content: newMsg.content,
                  created_at: newMsg.created_at
                }
              ];
            });

            return currentMembers;
          });
        }
      )
      // Listen to room playback adjustments
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playback_state', filter: `room_id=eq.${room.id}` },
        (payload: any) => {
          console.log('[Room Realtime Update] playback_state payload:', payload);
          const newState = payload.new as PlaybackState;
          if (newState) {
            setPlaybackState(newState);

            const player = playerRef.current;
            if (player) {
              isUpdatingFromRemote.current = true;

              // Synchronize loaded URL and media type
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

              // Synchronize play/pause state
              const isCurrentlyPlaying = !player.paused;
              if (newState.is_playing && !isCurrentlyPlaying) {
                player.play().catch(e => console.log('Autoplay deferred:', e));
                setIsPlaying(true);
              } else if (!newState.is_playing && isCurrentlyPlaying) {
                player.pause();
                setIsPlaying(false);
              }

              // Synchronize timeline seek
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
        }
      )
      // Listen to media queue additions, removals or position swaps
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media_queue', filter: `room_id=eq.${room.id}` },
        async (payload: any) => {
          console.log('[Room Realtime Update] media_queue payload:', payload);
          const freshQueue = await PlaybackSyncService.fetchQueue(room.id);
          setQueue(freshQueue);
        }
      )
      // Typing Broadcast indicators
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const { authorName, typingState } = payload.payload;
        if (authorName) {
          setTypingUsers((current) => {
            if (typingState) {
              if (current.includes(authorName)) return current;
              return [...current, authorName];
            } else {
              return current.filter((u) => u !== authorName);
            }
          });
        }
      })
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          writeLog('success', 'Lounge synced', `Supabase Realtime subscription status: CONNECTED to room_members, messages, playback_state, & media_queue!`);
        }
      });

    // Cleanup subscription
    return () => {
      writeLog('info', 'Lounge synced', `Dismantling socket channel session...`);
      supabase.removeChannel(channel);
    };

  }, [room, currentMember, supabaseConnected]);

  // Keep chat scrolled automatically to bottom on new messages
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  const shareRoom = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Join SyncWave Room: ${room?.name || 'Sync Listening'}`,
          text: `Join my SyncWave real-time synchronized listening lobby!`,
          url: window.location.href,
        });
        writeLog('info', 'Share App', 'Successfully shared room via standard browser api');
      } catch (err) {
        copyInviteLink();
      }
    } else {
      copyInviteLink();
    }
  };

  // Render Supabase initialization error card if auth config is missing
  if (!supabaseConnected) {
    return <SupabaseSetupNeeded />;
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
              
              {/* THEME SELECTION BAR */}
              <div className="relative" id="theme-selector-container">
                <button
                  onClick={() => setShowThemeMenu(!showThemeMenu)}
                  className={`p-1.5 rounded-xl border flex items-center justify-center transition active:scale-95 cursor-pointer ${
                    resolvedTheme === 'dark'
                      ? 'bg-stone-850 border-stone-800 text-stone-300 hover:text-white hover:bg-stone-800'
                      : 'bg-stone-100 border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
                  }`}
                  title="Change Theme Mode"
                >
                  {theme === 'light' && <Sun className="w-3.5 h-3.5 text-amber-500" />}
                  {theme === 'dark' && <Moon className="w-3.5 h-3.5 text-purple-405" />}
                  {theme === 'system' && <Laptop className="w-3.5 h-3.5 text-cyan-505" />}
                </button>

                <AnimatePresence>
                  {showThemeMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)}></div>
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className={`absolute right-0 mt-2 w-36 rounded-xl shadow-xl z-50 p-1.5 border font-mono text-[10px] font-bold ${
                          resolvedTheme === 'dark'
                            ? 'bg-stone-900 border-stone-800 text-stone-200'
                            : 'bg-white border-stone-200 text-stone-800'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setTheme('light');
                            setShowThemeMenu(false);
                          }}
                          className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg text-left transition cursor-pointer ${
                            theme === 'light'
                              ? 'bg-amber-500/10 text-amber-500'
                              : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                          }`}
                        >
                          <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>LIGHT</span>
                        </button>

                        <button
                          onClick={() => {
                            setTheme('dark');
                            setShowThemeMenu(false);
                          }}
                          className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg text-left transition cursor-pointer ${
                            theme === 'dark'
                              ? 'bg-purple-500/10 text-purple-400'
                              : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                          }`}
                        >
                          <Moon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>DARK</span>
                        </button>

                        <button
                          onClick={() => {
                            setTheme('system');
                            setShowThemeMenu(false);
                          }}
                          className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg text-left transition cursor-pointer ${
                            theme === 'system'
                              ? 'bg-cyan-500/10 text-cyan-405'
                              : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                          }`}
                        >
                          <Laptop className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>SYSTEM</span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start col-span-full">
          {/* LEFT SIDEBAR: MEDIA FIRST (Columns 1 & 2) */}
          <div className="lg:col-span-2 space-y-6">

            {/* 2. ACTIVE SPACE / MEDIA PLAYER CARD */}
            {(() => {
          const isYouTube = mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || mediaUrl.includes('/embed/'));
          const ytId = isYouTube ? getYouTubeId(mediaUrl) : null;

          return (
            <div id="media-player-container" className="bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-850 rounded-2xl p-5 space-y-4 shadow-sm dark:shadow-xl overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-stone-50/20 dark:from-stone-900/60 to-transparent pointer-events-none z-0"></div>

              {/* Playing track metadata */}
              <div className="flex items-center justify-between z-10 relative gap-3">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[9px] bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold flex items-center gap-1 w-max">
                    <Sparkles className="w-2.5 h-2.5 animate-bounce text-amber-500" /> NOW PLAYING
                  </span>
                  <h2 className="text-sm font-extrabold text-stone-950 dark:text-white truncate max-w-sm sm:max-w-md">
                    {isYouTube ? (queue.length > 0 ? queue[0].title : 'YouTube Video Stream') : (mediaUrl ? mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1) : 'No Stream Loaded')}
                  </h2>
                </div>
                
                <div className="shrink-0">
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
                    <div id="mediacard-failed-fallback" className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-stone-900 text-stone-200">
                      <div className="w-12 h-12 bg-rose-500/15 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center animate-bounce">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-stone-205 uppercase tracking-wider font-mono">Restricted Handshake Detected</h3>
                        <p className="text-[11px] text-stone-400 leading-relaxed max-w-xs mx-auto">
                          Owner has disabled remote player embedding for this video.
                        </p>
                      </div>
                      <div className="pt-2 text-[10px] text-stone-400 text-left bg-stone-950/70 p-3 rounded-lg border border-stone-850 space-y-1 w-full max-w-xs font-mono">
                        <p className="text-amber-500 font-bold uppercase mb-1">Actions to Resolve:</p>
                        <p>1. Copy direct sample track preset below.</p>
                        <p>2. Try loading a different YouTube stream.</p>
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
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-stone-200 dark:border-stone-850/60 z-10 relative">
                
                <div className="flex items-center space-x-2">
                  {currentIsHost ? (
                    <>
                      {isPlaying ? (
                        <button
                          onClick={handleHostPause}
                          id="host-pause-btn"
                          className="p-2.5 bg-stone-100 dark:bg-stone-850 hover:bg-stone-200 dark:hover:bg-stone-800 text-amber-500 border border-stone-205 dark:border-stone-800 rounded-xl transition cursor-pointer flex items-center justify-center active:scale-95 text-xs font-bold leading-none gap-2 px-4 shadow-sm dark:shadow-lg"
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
                    </>
                  ) : (
                    <div className="flex items-center space-x-2 bg-stone-900 border border-stone-850 px-3.5 py-2 rounded-xl text-xs font-mono text-stone-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                      <span>{isPlaying ? 'PLAYING • BRANDED SYNC' : 'PAUSED • IN STANDBY'}</span>
                    </div>
                  )}
                </div>

                {/* Volume block indicator */}
                <div className="flex items-center space-x-2 text-xs text-stone-450 z-10">
                  <button
                    onClick={() => {
                      const nextMute = !isMuted;
                      setIsMuted(nextMute);
                      if (playerRef.current) {
                        playerRef.current.muted = nextMute;
                      }
                    }}
                    id="mute-unmute-btn"
                    className="p-2 bg-stone-900 hover:bg-stone-850 rounded-xl border border-stone-850 cursor-pointer transition text-stone-300"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500 animate-bounce" /> : <Volume2 className="w-3.5 h-3.5 text-stone-400" />}
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
                      if (playerRef.current) {
                        playerRef.current.volume = v;
                        playerRef.current.muted = false;
                      }
                      setIsMuted(false);
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
          <div id="host-tools-container" className="bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-850 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl transition-colors duration-200">
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
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileImportMock(file);
                      }}
                      onClick={() => document.getElementById('drag-file-uploader')?.click()}
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
          <div className="space-y-6">

        {/* 3. PARTICIPANTS LIST */}
        <div id="participants-container" className="bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3.5 shadow-sm dark:shadow-none transition-colors duration-200">
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

                let statusBadge = "Idle";
                let statusDot = "bg-stone-500"; // Idle
                
                if (isPlaying) {
                  statusBadge = "Listening";
                  statusDot = "bg-emerald-500 animate-pulse";
                } else {
                  statusBadge = "In Lobby";
                  statusDot = "bg-amber-500";
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
        <div id="live-chat-container" className="bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3 flex flex-col min-h-[224px] shadow-sm dark:shadow-none transition-colors duration-200">
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
        <div id="media-queue-container" className="bg-white dark:bg-stone-900/40 rounded-2xl border border-stone-200 dark:border-stone-850 p-4 space-y-3 flex flex-col shadow-sm dark:shadow-none transition-colors duration-200">
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

    </div>
  );
}
