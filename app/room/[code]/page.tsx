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
  Tv
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
  
  const playerRef = React.useRef<HTMLVideoElement | null>(null);
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

  const handleLoadMedia = async (url: string, type: 'video' | 'audio') => {
    if (!room || !currentIsHost) return;
    
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
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          writeLog('success', 'Lounge synced', `Supabase Realtime subscription status: CONNECTED to room_members, messages, & playback_state!`);
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
    <div id="room-viewport" className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans select-none overflow-hidden h-screen">
      
      {/* Top Lounge Bar Header */}
      <header id="room-header animate-fade-in" className="bg-stone-900/90 border-b border-stone-800/60 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400/20 rounded-xl text-stone-950">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold tracking-tight text-white mb-0">{room.name}</h1>
              <span className="text-[9px] bg-stone-800 text-amber-500 font-mono px-1.5 py-0.5 rounded border border-stone-750 uppercase tracking-wider font-bold">
                Room code: {room.slug}
              </span>
            </div>
            <p className="text-[10px] text-stone-400 truncate max-w-sm">
              {room.description || 'Synchronized Collaborative Listening Room'}
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={copyInviteLink}
            id="copy-invite-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-750 border border-stone-700/60 rounded-xl text-xs text-stone-300 font-medium transition active:scale-95 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Invite Link</span>
              </>
            )}
          </button>

          <button
            onClick={leaveRoom}
            id="leave-room-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium transition active:scale-95 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Leave Space</span>
          </button>
        </div>
      </header>

      {/* Main Workspace split */}
      <div id="room-body" className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* Left Drawer component: Active Presence List (3 col equivalent for presence tracking) */}
        <aside id="participants-rail" className="w-64 bg-stone-900/40 border-r border-stone-800/60 flex flex-col overflow-hidden shrink-0">
          
          <div className="p-4 border-b border-stone-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-mono font-bold text-stone-300 uppercase tracking-wider">Active Space ({members.length})</span>
            </div>
          </div>

          {/* Members list items wrapper */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
            <AnimatePresence>
              {members.map((member) => {
                const memberIsHost = member.user_id === room.host_id;
                const memberIsMe = member.id === currentMember?.id;
                const nickname = member.profiles?.display_name || member.display_name || 'Wave Participant';
                const avatar = member.profiles?.avatar_url || `https://picsum.photos/seed/${nickname}/150`;

                return (
                  <motion.div
                    key={member.id}
                    layoutId={`member-card-${member.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      memberIsMe 
                        ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5' 
                        : 'bg-stone-900 border-stone-850'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={avatar} 
                          alt={nickname} 
                          className={`w-8 h-8 rounded-lg object-cover border ${
                            memberIsHost ? 'border-amber-500' : 'border-stone-700'
                          }`}
                        />
                        {memberIsHost && (
                          <span className="bg-amber-500 p-0.5 rounded-full absolute -top-1.5 -right-1 border border-stone-950 text-stone-950">
                            <Crown className="w-2 h-2" />
                          </span>
                        )}
                      </div>
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-stone-100 truncate block leading-tight">
                            {nickname}
                          </span>
                          {memberIsMe && <span className="text-[8px] text-amber-400 font-mono font-bold leading-normal shrink-0">(You)</span>}
                        </div>
                        <span className="text-[9px] font-mono text-stone-450 block uppercase leading-none mt-0.5">
                          {memberIsHost ? 'Host' : member.guest_id ? 'Guest' : 'Reg Member'}
                        </span>
                      </div>
                    </div>

                    {/* Mute and Host action triggers */}
                    <div className="flex items-center space-x-1 shrink-0">
                      {member.is_muted && (
                        <span className="p-1 bg-stone-950 text-rose-450 border border-stone-800 rounded-lg shrink-0" title="Muted by host">
                          <MicOff className="w-3 h-3 text-rose-500" />
                        </span>
                      )}

                      {/* Host controls for other members */}
                      {isHost && !memberIsHost && (
                        <div className="flex items-center space-x-0.5">
                          <button
                            onClick={() => toggleMuteMember(member.id, member.is_muted)}
                            className={`p-1 rounded-lg text-stone-400 hover:text-amber-400 hover:bg-stone-850 cursor-pointer ${member.is_muted ? 'text-amber-500' : ''}`}
                            title={member.is_muted ? "Unmute occupant" : "Mute occupant"}
                          >
                            {member.is_muted ? <Mic className="w-3 h-3" /> : <MicOff className="w-3.5 h-3.5" />}
                          </button>
                          
                          <button
                            onClick={() => kickMember(member.id, nickname)}
                            className="p-1 rounded-lg text-stone-400 hover:text-orange-400 hover:bg-stone-850 cursor-pointer"
                            title="Remove from Room"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => banMember(member.id, nickname)}
                            className="p-1 rounded-lg text-stone-400 hover:text-red-500 hover:bg-stone-850 cursor-pointer"
                            title="Ban from Lounge"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="p-3 bg-stone-900/60 border-t border-stone-800/60 text-[10px] font-mono text-stone-450 flex flex-col space-y-1">
            <div className="flex items-center justify-between text-stone-400">
              <span>Sync status</span>
              <span className="text-emerald-500 flex items-center gap-1">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                ONLINE
              </span>
            </div>
            <span>Transport: WS (Realtime)</span>
          </div>
        </aside>

        {/* Central Display: Stylized SyncWave active stage */}
        <main id="lounge-stage" className="flex-1 bg-stone-950 flex flex-col justify-between overflow-hidden relative">
          
          {/* Aesthetic grid overlay */}
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]"></div>

          {/* Top header status bar */}
          <div className="px-5 py-2.5 bg-stone-900/40 border-b border-stone-800/40 flex items-center justify-between text-[11px] font-mono text-stone-400 z-10 shrink-0 select-none">
            <div className="flex items-center space-x-2">
              <span className={`h-2 w-2 rounded-full ${syncStatusText.includes('Synced') ? 'bg-amber-500 animate-pulse' : 'bg-amber-600'}`}></span>
              <span className="font-semibold text-stone-300">MEDIA PIPELINE</span>
              <span className="text-stone-550 border border-stone-850 px-1 py-0 rounded text-[9px]">UTC CLUSTER</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>Class: {room.is_private ? 'Secure Space' : 'Public Lobby'}</span>
              <span>•</span>
              <span className="text-amber-500 font-bold">{mediaType.toUpperCase()} Stream</span>
            </div>
          </div>

          {/* Core Player Stage */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 relative overflow-hidden bg-stone-950/80">
            {mediaUrl ? (
              <div className="w-full h-full max-w-4xl flex flex-col items-center justify-center space-y-4">
                {/* HTML5 video preview / player */}
                <div className="relative w-full aspect-video md:max-h-[50vh] flex items-center justify-center bg-black/90 rounded-2xl border border-stone-800/80 overflow-hidden shadow-2xl">
                  {mediaType === 'video' ? (
                    <video
                      id="wave-video-player"
                      ref={playerRef}
                      src={mediaUrl}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 space-y-6">
                      <video
                        id="wave-audio-video-element"
                        ref={playerRef}
                        src={mediaUrl}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        playsInline
                        className="hidden"
                      />
                      
                      {/* Spinning vinyl visual stage indicating sync state */}
                      <div className="relative flex items-center justify-center">
                        {/* Visual waves around circle */}
                        <div className="absolute -inset-10 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-600/10 rounded-full blur-2xl animate-pulse"></div>
                        <div 
                          className="absolute -inset-1.5 bg-gradient-to-r from-amber-500 to-amber-650 opacity-20 rounded-full blur animate-spin" 
                          style={{ animationDuration: isPlaying ? '15s' : '0s' }}
                        ></div>
                        
                        <div className="w-40 h-40 rounded-full bg-stone-900 border-4 border-stone-800 flex items-center justify-center relative shadow-2xl overflow-hidden group">
                          {/* CD vinyl grooves */}
                          <div className="absolute inset-1 rounded-full border border-stone-750/30 opacity-80"></div>
                          <div className="absolute inset-3 rounded-full border border-stone-750/30 opacity-60"></div>
                          <div className="absolute inset-6 rounded-full border border-stone-750/40 opacity-50"></div>
                          <div className="absolute inset-10 rounded-full border border-stone-800/60"></div>

                          <Disc 
                            className="w-20 h-20 text-stone-800/80 absolute transform group-hover:scale-105 transition duration-500 animate-spin" 
                            style={{ animationDuration: isPlaying ? '5s' : '0s' }} 
                          />

                          {/* Dynamic cover mock art center circle */}
                          <div className="w-12 h-12 rounded-full bg-stone-950 border-2 border-stone-850 flex items-center justify-center z-20">
                            <div className={`h-3 w-3 rounded-full flex items-center justify-center ${isPlaying ? 'bg-amber-500 animate-ping' : 'bg-stone-700'}`}>
                              <div className="h-1.5 w-1.5 bg-stone-950 rounded-full"></div>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 bg-stone-900 border border-stone-850 text-amber-500 rounded-full absolute -bottom-2 -right-2 shadow-lg flex items-center justify-center">
                          <Music className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      
                      <div className="text-center space-y-1">
                        <p className="text-xs font-mono text-amber-500 uppercase tracking-widest font-bold">AUDIO BROADCAST</p>
                        <p className="text-sm font-semibold text-stone-200 truncate max-w-sm px-4">
                          {mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Custom elegant status play button overlay if needed */}
                </div>
                
                {/* Media description title */}
                <span className="text-[10px] font-mono text-stone-500 truncate max-w-lg">
                  Loaded URL: {mediaUrl}
                </span>
              </div>
            ) : (
              <div className="max-w-md space-y-6 flex flex-col items-center">
                <div className="w-16 h-16 bg-stone-900 border border-stone-800 text-stone-500 rounded-2xl flex items-center justify-center shadow-xl">
                  <Tv className="w-8 h-8 opacity-70" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-stone-200 tracking-wide uppercase font-mono">STANDBY: Empty Play Queue</h3>
                  <p className="text-xs text-stone-400 leading-relaxed max-w-xs">
                    {isHost 
                      ? "Paste a media URL stream below or select an instantaneous preset to initiate synchronization." 
                      : "The host has not launched a streams source yet. Awaiting media loop initiations..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Real-time Custom Media Controls bar */}
          <div className="p-4 bg-stone-900 border-t border-stone-800/80 flex flex-col gap-3 shrink-0 z-20">
            {/* Timeline track and timers */}
            <div className="flex items-center space-x-3 text-[10px] text-stone-400 font-mono">
              <span className="w-10 text-right">{formatTime(currentTime)}</span>
              
              <input
                id="playback-timeline-range"
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                disabled={!isHost}
                onChange={handleSliderChange}
                onMouseUp={handleSliderRelease}
                onTouchEnd={handleSliderRelease}
                className="flex-1 accent-amber-500 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              />
              
              <span className="w-10 text-left">{formatTime(duration)}</span>
            </div>

            {/* Custom Control Buttons and load field */}
            <div className="flex items-center justify-between">
              {/* Play / pause controls */}
              <div className="flex items-center space-x-3">
                {isHost ? (
                  isPlaying ? (
                    <button
                      onClick={handleHostPause}
                      id="host-pause-btn"
                      className="p-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg transition active:scale-95 cursor-pointer flex items-center justify-center font-bold"
                      title="Pause Stream"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleHostPlay}
                      id="host-play-btn"
                      className="p-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-lg transition active:scale-95 cursor-pointer flex items-center justify-center font-bold"
                      title="Play Stream"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )
                ) : (
                  <div className="flex items-center space-x-1.5 bg-stone-950/80 border border-stone-850 px-2.5 py-1.5 rounded-lg text-[9px] uppercase font-mono tracking-wider text-stone-450">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    <span>Host Syncing</span>
                  </div>
                )}

                {/* Info status badge */}
                <span className="text-[10px] font-mono text-stone-450 leading-none">
                  {syncStatusText}
                </span>
              </div>

              {/* Volume sliders and muted tags */}
              <div className="flex items-center space-x-2 text-xs text-stone-400">
                <button
                  onClick={() => {
                    const nextMute = !isMuted;
                    setIsMuted(nextMute);
                    if (playerRef.current) {
                      playerRef.current.muted = nextMute;
                    }
                  }}
                  id="mute-unmute-btn"
                  className="p-1.5 hover:bg-stone-850 rounded-lg cursor-pointer transition"
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-stone-300" />}
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
                  className="w-14 accent-stone-300 h-1 bg-stone-850 rounded appearance-none cursor-pointer"
                />
              </div>
            </div>
            
            {/* Host Load Source field: Only visible if isHost */}
            {isHost && (
              <div className="pt-2 border-t border-stone-850/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[9px] text-stone-450 font-mono select-none">
                  <span>HOST CONSOLE: STREAM LOAD ENGINE</span>
                  <span className="text-amber-500 font-bold uppercase">Authorized Manager</span>
                </div>
                
                {/* Form to submit custom url */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!customUrlInput.trim()) return;
                    const val = customUrlInput.trim();
                    const isAudio = val.endsWith('.mp3') || val.includes('Helix') || val.includes('audio');
                    handleLoadMedia(val, isAudio ? 'audio' : 'video');
                    setCustomUrlInput('');
                  }}
                  className="flex items-center space-x-2"
                >
                  <input
                    id="preset-url-input"
                    type="text"
                    placeholder="Enter absolute audio or video URL stream..."
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    className="flex-1 bg-stone-950/90 text-xs text-stone-300 px-3 py-2 rounded-lg border border-stone-850 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-stone-650"
                  />
                  <button
                    type="submit"
                    id="submit-stream-btn"
                    className="bg-stone-850 hover:bg-stone-800 text-stone-200 text-xs px-3.5 py-2 rounded-lg border border-stone-800 transition font-mono uppercase tracking-wider cursor-pointer"
                  >
                    LOAD
                  </button>
                </form>

                {/* Quick presets selections */}
                <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-none select-none">
                  {MEDIA_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      id={`media-preset-${idx}`}
                      onClick={() => handleLoadMedia(p.url, p.type as any)}
                      className="px-2.5 py-1 bg-stone-950 border border-stone-850 hover:border-stone-750 rounded text-[9px] font-mono text-stone-500 hover:text-stone-300 active:scale-95 transition cursor-pointer shrink-0"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </main>

        {/* Right Drawer component: Real-time Text Chat */}
        <aside id="chat-panel" className="w-80 bg-stone-900/40 border-l border-stone-800/60 flex flex-col overflow-hidden shrink-0">
          
          <div className="p-4 border-b border-stone-800/60 flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-mono font-bold text-stone-300 uppercase tracking-wider">Live Chat Lobby</span>
          </div>

          {/* Messages block */}
          <div id="messages-list" className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-xs text-stone-500 font-mono italic">No messages sent yet inside this space.</p>
                <p className="text-[10px] text-stone-600 font-sans leading-normal">Say hello to other participants in SyncWave!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMyMessage = msg.sender_id === currentMember?.user_id || msg.sender_id === currentMember?.guest_id;
                
                return (
                  <div key={msg.id} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-1.5 mb-1 max-w-full">
                      <span className="text-[10px] font-semibold text-stone-400 truncate max-w-[120px]">
                        {msg.sender_name}
                      </span>
                      <span className="text-[8px] font-mono text-stone-600">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className={`text-xs px-3 py-2 rounded-xl leading-relaxed max-w-[90%] break-words ${
                      isMyMessage 
                        ? 'bg-amber-500 text-stone-950 font-medium rounded-tr-none' 
                        : 'bg-stone-850 text-stone-100 rounded-tl-none border border-stone-800'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input form */}
          <div className="p-3 bg-stone-900 border-t border-stone-800/60">
            {currentMember?.is_muted ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[10px] text-rose-400 leading-normal flex items-start gap-1.5">
                <MicOff className="w-3.5 h-3.5 mt-0.5" />
                <span>You have been muted inside this chat by the room host. Sending messages is restricted.</span>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <input
                  type="text"
                  maxLength={160}
                  placeholder="Type message..."
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  className="flex-1 bg-stone-950 border border-stone-850 text-xs px-3 py-2.5 rounded-xl text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim()}
                  className="p-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl transition cursor-pointer disabled:bg-stone-800 disabled:text-stone-600 shrink-0 select-none flex items-center justify-center active:scale-95 shadow-md shadow-amber-500/5 hover:shadow-amber-500/15"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>

        </aside>

      </div>

    </div>
  );
}
