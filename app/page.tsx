'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { generateRoomCode, getUniqueGuestName } from '@/lib/room';
import { getOrCreateProfile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import Logo from '@/components/Logo';
import { 
  Plus, 
  ArrowRight, 
  ShieldAlert, 
  Loader2, 
  User, 
  LogOut, 
  LogIn, 
  Compass, 
  Users, 
  X, 
  Clock, 
  Radio, 
  Share2,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from 'next-themes';

export const dynamic = 'force-dynamic';

function getProjectRef(url: string | undefined): string {
  if (!url) return 'undefined';
  try {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.(co|net)/);
    return match ? match[1] : 'unknown';
  } catch (e) {
    return 'error-parsing';
  }
}

export default function Home() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();
  
  const { theme, setTheme, resolvedTheme = 'dark' } = useTheme();

  // Dialog / Modal triggers
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showJoinModal, setShowJoinModal] = React.useState(false);
  const [showAuthWarningModal, setShowAuthWarningModal] = React.useState(false);

  // Create Room state
  const [createName, setCreateName] = React.useState('');
  const [createDesc, setCreateDesc] = React.useState('');
  const [createIsPrivate, setCreateIsPrivate] = React.useState(false);
  const [creatingRoom, setCreatingRoom] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Join Room state
  const [joinCode, setJoinCode] = React.useState('');
  const [guestDisplayName, setGuestDisplayName] = React.useState('');
  const [joiningRoom, setJoiningRoom] = React.useState(false);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joinStep, setJoinStep] = React.useState(1); // 1 = enter code, 2 = enter display name (for guests)
  const [verifiedRoomMatch, setVerifiedRoomMatch] = React.useState<any>(null);
  const [toasts, setToasts] = React.useState<any[]>([]);

  const showToast = React.useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // Resume active pending flows on mount
  React.useEffect(() => {
    if (!loading && user) {
      const pending = localStorage.getItem('syncwave-pending-create');
      if (pending === 'true') {
        localStorage.removeItem('syncwave-pending-create');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowCreateModal(true);
        writeLog('success', 'Session restored', 'Resuming pending Sound Lounge creation after successful authorization handshake.');
      }
    }
  }, [user, loading]);

  // Click handler: Create Room
  const handleCreateRoomClick = () => {
    if (user) {
      setShowCreateModal(true);
    } else {
      setShowAuthWarningModal(true);
    }
  };

  // Click handler: Join Room
  const handleJoinRoomClick = () => {
    setJoinCode('');
    setGuestDisplayName('');
    setJoinError(null);
    setJoinStep(1);
    setVerifiedRoomMatch(null);
    setShowJoinModal(true);
  };

  // Proceed to authenticate with pending create flag
  const handleProceedToAuth = (type: 'signin' | 'signup') => {
    localStorage.setItem('syncwave-pending-create', 'true');
    setShowAuthWarningModal(false);
    if (type === 'signin') {
      router.push('/login');
    } else {
      router.push('/signup');
    }
  };

  // Submit Create Room Form
  const submitCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || creatingRoom || !createName.trim()) return;

    setCreatingRoom(true);
    setCreateError(null);

    const supabase = getSupabase() as any;
    if (!supabase) {
      setCreateError('Supabase database client could not be loaded.');
      setCreatingRoom(false);
      return;
    }

    try {
      // Rule 1: Active authenticated session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active authenticated session exists. Please sign in again.');
      }

      // Rule 2: Profile exists (using Profile Recovery system)
      const userProfile = await getOrCreateProfile(user.id, user.email || '');
      if (!userProfile) {
        throw new Error('Unresolved profile configuration. Please make sure profile initialization exists.');
      }

      const code = generateRoomCode();
      
      // Slug collision check with verification
      const { data: conflict, error: conflictError } = await supabase
        .from('rooms')
        .select('id')
        .eq('slug', code)
        .maybeSingle();

      if (conflictError) {
        throw new Error(`Database error during slug collision check: ${conflictError.message}`);
      }

      const activeCode = conflict ? generateRoomCode() : code;

      // Rule 3: Room insert succeeded
      const { data: newRoom, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: createName.trim(),
          slug: activeCode,
          description: createDesc.trim() || undefined,
          host_id: user.id,
          is_private: createIsPrivate
        } as any)
        .select()
        .single();

      // --- STEP 1 DIAGNOSTIC PRINT ---
      const supabaseUrlForTrace = process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined';
      const projectRefForTrace = getProjectRef(supabaseUrlForTrace);
      
      console.log('=== [SyncWave Step 1 Trace: Room Creation] ===');
      console.log('Room UUID:', newRoom?.id || 'undefined');
      console.log('Room Slug:', activeCode);
      console.log('Supabase URL:', supabaseUrlForTrace);
      console.log('Project Reference:', projectRefForTrace);
      console.log('Insert Response:', JSON.stringify(newRoom, null, 2));
      console.log('Insert Error:', JSON.stringify(roomError, null, 2));

      if (roomError || !newRoom) {
        throw new Error(roomError?.message || 'Host room database insertion failed.');
      }

      // Query right back immediately to verify that the room exists and is discoverable by its slug
      const { data: reQueryRow, error: reQueryError } = await supabase
        .from('rooms')
        .select('*')
        .eq('slug', activeCode)
        .maybeSingle();

      console.log('Immediate query [slug=' + activeCode + '] row count:', reQueryRow ? 1 : 0);
      console.log('Immediate query [slug=' + activeCode + '] row:', JSON.stringify(reQueryRow, null, 2));
      console.log('Immediate query [slug=' + activeCode + '] error:', JSON.stringify(reQueryError, null, 2));
      console.log('=============================================');

      if (reQueryError || !reQueryRow) {
        throw new Error('Database discovery check failed: Room was inserted, but immediately querying it by its slug returned nothing. Check RLS or database replication status.');
      }

      // Rollback guard for inner transactions
      try {
        // 1. Double verify that the room exists by its primary key (ID)
        const { data: verifiedRoom, error: verifyError } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', newRoom.id)
          .single();

        if (verifyError || !verifiedRoom) {
          throw new Error('Room existence verification by ID failed right after insertion.');
        }

        // 2. Insert the host into room_members
        const { data: newMember, error: memberError } = await supabase
          .from('room_members')
          .insert({
            room_id: newRoom.id,
            user_id: user.id,
            display_name: userProfile.display_name || user.email?.split('@')[0] || 'Host'
          } as any)
          .select()
          .single();

        if (memberError || !newMember) {
          throw new Error(memberError?.message || 'Lounge host membership registration failed in the database.');
        }

        // Verify that the host membership actually exists in the database
        const { data: verifiedMember, error: verifyMemberError } = await supabase
          .from('room_members')
          .select('*')
          .eq('id', newMember.id)
          .single();

        if (verifyMemberError || !verifiedMember) {
          throw new Error('Database verification failed: Host member row was inserted, but query returned nothing.');
        }

        // 3. Create the initial playback_state
        const defaultState = {
          room_id: newRoom.id,
          media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          media_type: 'video',
          is_playing: false,
          current_time: 0,
          duration: 596, // Approximate duration of BigBuckBunny.mp4 (596 seconds)
          playback_rate: 1,
          last_sync_at: new Date().toISOString()
        };

        const { error: playbackError } = await supabase
          .from('playback_state')
          .insert(defaultState as any);

        if (playbackError) {
          throw new Error(playbackError.message || 'Initial playback state registration failed.');
        }

        // Verify that playback_state actually exists
        const { data: verifiedState, error: verifyStateError } = await supabase
          .from('playback_state')
          .select('*')
          .eq('room_id', newRoom.id)
          .single();

        if (verifyStateError || !verifiedState) {
          throw new Error('Database verification failed: Initial playback state was inserted, but query returned nothing.');
        }

        // 4. Subscribe the room to Realtime
        const channel = supabase.channel(`syncwave-realtime-room-${newRoom.id}`);
        await channel.subscribe();

        writeLog('success', 'Lounge synced', `Successfully generated Sound Lounge "${createName}" [${activeCode}]`);
        
        // Close modal & route user to lounge screen
        setShowCreateModal(false);
        router.push(`/room/${activeCode}`);
      } catch (innerErr: any) {
        console.warn('[SyncWave Rollback] Deleting partially-created room:', newRoom.id);
        await supabase.from('rooms').delete().eq('id', newRoom.id);
        throw innerErr;
      }
    } catch (err: any) {
      console.error('Failed to instantiate room:', err);
      setCreateError(err.message || 'Error occurred while creating lounge session.');
      setCreatingRoom(false);
    }
  };

  // Submit Join Room Form - STEP 1 (verifies room code)
  const submitJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedCode = joinCode.trim().toUpperCase();
    if (!formattedCode) {
      showToast("🫠 Looks like this invite missed the vibe check.", "error");
      return;
    }
    if (joiningRoom) return;

    setJoiningRoom(true);
    setJoinError(null);

    const supabase = getSupabase() as any;
    if (!supabase) {
      showToast("⚠️ SyncWave hit a temporary glitch.", "error");
      setJoiningRoom(false);
      return;
    }

    try {
      // --- STEP 2 DIAGNOSTIC PRINT ---
      const supabaseUrlStep2 = process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined';
      const projectRefStep2 = getProjectRef(supabaseUrlStep2);
      const anonKeyPrefix = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 15) : 'undefined';

      console.log('=== [SyncWave Step 2 Trace: Pre-Join/Redirect Device Info] ===');
      console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrlStep2);
      console.log('Project Reference:', projectRefStep2);
      console.log('Anon Key prefix:', anonKeyPrefix);
      console.log('Room Code:', joinCode);
      console.log('Normalized Room Code:', formattedCode);
      console.log('===============================================================');

      // 1. Verify if room exists in active database registries using the exact requested query pattern
      const { data: roomMatch, error: selectError } = await supabase
        .from("rooms")
        .select("*")
        .eq("slug", formattedCode)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('[SyncWave Join Debug] Supabase query error:', selectError.message);
      }

      writeLog('info', 'DEBUG JOIN', `Entered: "${joinCode}", Normalized: "${formattedCode}", Column searched: "slug", Supabase query: SELECT * FROM rooms WHERE slug = '${formattedCode}', Returned count: ${roomMatch ? 1 : 0}`);

      if (selectError && selectError.code !== 'PGRST116') {
        showToast("⚠️ SyncWave hit a temporary glitch.", "error");
        throw selectError;
      }

      if (!roomMatch) {
        // --- STEP 6 DIAGNOSTIC PRINT ---
        console.log('=== [SyncWave Step 6 Trace: Room Not Found Query Result] ===');
        console.log(JSON.stringify({
          roomCode: joinCode,
          normalizedCode: formattedCode,
          supabaseUrl: supabaseUrlStep2,
          projectRef: projectRefStep2,
          query: `SELECT * FROM rooms WHERE slug = '${formattedCode}'`,
          rowsReturned: 0,
          roomObject: null,
          error: selectError ? {
            code: selectError.code,
            message: selectError.message,
            details: selectError.details,
            hint: selectError.hint
          } : null
        }, null, 2));
        console.log('============================================================');

        showToast("👀 We couldn't find that lounge.\nDouble-check the code or ask your friend for a fresh invite.", "error");
        writeLog('error', 'Lounge synced', `Lounge code "${formattedCode}" is inactive or missing.`);
        setJoiningRoom(false);
        return;
      }

      setVerifiedRoomMatch(roomMatch);

      // 2. Check if banned / route user contextually
      if (user) {
        const { data: bannedCheck } = await supabase
          .from('room_members')
          .select('*')
          .eq('room_id', roomMatch.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (bannedCheck?.is_banned) {
          showToast("You are banned from entering this room.", "error");
          setJoiningRoom(false);
          return;
        }

        // Just push to room page! The room page handles authenticated joining nicely
        writeLog('success', 'Lounge synced', `Authorized user joining lounge: "${roomMatch.name}" [${formattedCode}]`);
        setShowJoinModal(false);
        setJoiningRoom(false);
        router.push(`/room/${formattedCode}`);
      } else {
        // Unauthenticated visitor -> Ask ONLY Display Name next
        setJoinStep(2);
        setJoiningRoom(false);
      }
    } catch (err: any) {
      console.error('Failed joining session code verification:', err);
      showToast("⚠️ SyncWave hit a temporary glitch.", "error");
      setJoiningRoom(false);
    }
  };

  // Submit Join Room Form - STEP 2 (Guest Display Name insertion)
  const submitGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedRoomMatch || joiningRoom || !guestDisplayName.trim()) return;

    setJoiningRoom(true);
    setJoinError(null);

    const supabase = getSupabase() as any;
    if (!supabase) {
      setJoinError('Supabase database client could not be loaded.');
      setJoiningRoom(false);
      return;
    }

    const formattedCode = verifiedRoomMatch.slug.toUpperCase();

    try {
      // Resolve unique display name for guest
      const safeName = await getUniqueGuestName(verifiedRoomMatch.id, guestDisplayName.trim());

      // Check if display name is banned
      const { data: bannedCheck } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', verifiedRoomMatch.id)
        .eq('display_name', safeName)
        .maybeSingle();

      if (bannedCheck?.is_banned) {
        setJoinError('This name is banned from entering this room.');
        setJoiningRoom(false);
        return;
      }

      // Generate IDs
      const guestId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      // Safe insertion of guest member row
      const { error: insertError } = await supabase
        .from('room_members')
        .insert({
          room_id: verifiedRoomMatch.id,
          guest_id: guestId,
          display_name: safeName,
          session_id: sessionId
        } as any);

      if (insertError) throw insertError;

      // Persist guest credentials locally in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(`syncwave-guest-${formattedCode}`, JSON.stringify({
          guestId,
          displayName: safeName,
          sessionId
        }));
      }

      writeLog('success', 'Lounge synced', `Guest user "${safeName}" joined lounge "${verifiedRoomMatch.name}" successfully.`);
      setShowJoinModal(false);
      setJoinStep(1);
      setVerifiedRoomMatch(null);
      setJoiningRoom(false);
      router.push(`/room/${formattedCode}`);
    } catch (err: any) {
      console.error('Failed joining session as guest:', err);
      setJoinError(err.message || 'Could not join lounge. Check your connections.');
      setJoiningRoom(false);
    }
  };

  return (
    <div id="landing-container" className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col justify-between selection:bg-cyan-150 dark:selection:bg-cyan-950/40 relative overflow-hidden">
      
      {/* Visual background ripple ambient decorations */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] opacity-[0.06] pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-400 via-blue-500 to-transparent blur-3xl rounded-full scale-90"></div>
      </div>

      {/* Navigation Header bar */}
      <header id="landing-header" className="border-b border-stone-200/75 dark:border-stone-850/60 bg-white/80 dark:bg-stone-950/80 backdrop-blur-md sticky top-0 z-30 select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>

          <nav id="header-nav" className="flex items-center space-x-1.5 sm:space-x-4">
            <button
              onClick={handleCreateRoomClick}
              className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-stone-900 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg transition font-medium cursor-pointer"
            >
              Create Room
            </button>
            <button
              onClick={handleJoinRoomClick}
              className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-stone-900 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg transition font-medium cursor-pointer"
            >
              Join Room
            </button>

            {/* COMPACT THEME SELECTOR ON LANDING PAGE HEADER */}
            <div id="landing-theme-selector" className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-850 shrink-0 font-mono text-[9px] mr-1">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-1 rounded transition text-[9px] flex items-center gap-1 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-stone-800 text-amber-600 font-bold shadow-sm'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
                title="Light mode"
              >
                <Sun className="w-3 h-3 text-amber-500 font-bold" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-1 rounded transition text-[9px] flex items-center gap-1 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-stone-800 text-indigo-400 font-bold shadow-sm'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
                title="Dark mode"
              >
                <Moon className="w-3 h-3 text-indigo-400 font-bold" />
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`p-1 rounded transition text-[9px] flex items-center gap-1 cursor-pointer ${
                  theme === 'system'
                    ? 'bg-stone-200 dark:bg-stone-800 text-teal-400 font-bold shadow-sm'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                }`}
                title="System theme"
              >
                <Laptop className="w-3 h-3 text-teal-400 font-bold" />
              </button>
            </div>

            {/* Separator line */}
            <span className="h-4 w-px bg-stone-200 dark:bg-stone-800 self-center"></span>

            {user ? (
              <div className="flex items-center space-x-1 sm:space-x-3">
                <Link
                  href="/dashboard"
                  className="text-xs sm:text-sm bg-stone-900 text-stone-100 hover:bg-stone-850 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold tracking-wide transition shadow-sm cursor-pointer flex items-center"
                >
                  <Compass className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
                  <span>Dashboard</span>
                </Link>
                <button
                  onClick={() => signOut()}
                  className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs sm:text-sm bg-stone-900 text-stone-100 hover:bg-stone-850 px-3.5 py-1.5 sm:px-4.5 sm:py-2 rounded-lg font-semibold tracking-wide transition shadow-md shadow-stone-200 cursor-pointer flex items-center"
              >
                <LogIn className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
                <span>Sign In</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main Hero & Content Section */}
      <main id="landing-hero" className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center py-12 md:py-20 z-10 text-center space-y-10">
        
        {/* Animated wave audio equalizer block inside hero */}
        <div id="media-wave-mock" className="flex items-end justify-center space-x-1.5 h-16 bg-transparent px-4 py-2 relative overflow-hidden select-none">
          <div className="w-1.5 bg-gradient-to-t from-cyan-400 via-blue-500 to-purple-400 rounded-full animate-pulse h-8"></div>
          <div className="w-1.5 bg-gradient-to-t from-cyan-400 via-blue-500 to-fuchsia-500 rounded-full animate-bounce h-14" style={{ animationDelay: '0.15s' }}></div>
          <div className="w-1.5 bg-gradient-to-t from-blue-500 via-purple-500 to-fuchsia-500 rounded-full animate-bounce h-6" style={{ animationDelay: '0.4s' }}></div>
          <div className="w-1.5 bg-gradient-to-t from-cyan-400 via-blue-500 to-purple-500 rounded-full animate-pulse h-12" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-1.5 bg-gradient-to-t from-blue-500 via-fuchsia-500 to-purple-500 rounded-full animate-bounce h-4" style={{ animationDelay: '0.5s' }}></div>
          <div className="w-1.5 bg-gradient-to-t from-cyan-400 via-purple-500 to-fuchsia-500 rounded-full animate-bounce h-13" style={{ animationDelay: '0.3s' }}></div>
          <div className="w-1.5 bg-gradient-to-t from-cyan-400 via-blue-500 to-purple-400 rounded-full animate-pulse h-7" style={{ animationDelay: '0.1s' }}></div>
        </div>

        {/* Headlines */}
        <div className="space-y-4 max-w-3xl">
          <h1 id="hero-headline" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-[1.12]">
            Listen Together. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-500 bg-clip-text text-transparent">
              Perfectly Synced.
            </span>
          </h1>
          <p id="hero-subheadline" className="text-stone-500 dark:text-stone-400 max-w-xl mx-auto text-base sm:text-lg tracking-normal font-sans leading-relaxed">
            Create a room or join one instantly. Connect with your friends, share high-fidelity media, and synchronize playback perfectly in real-time.
          </p>
        </div>

        {/* Primary Action Buttons (These are the two largest buttons on the homepage) */}
        <div id="hero-actions" className="flex flex-col sm:flex-row items-stretch justify-center gap-4 w-full max-w-md mx-auto pt-4">
          <button
            onClick={handleCreateRoomClick}
            className="flex-1 bg-stone-900 text-stone-50 hover:bg-stone-850 py-4 px-6 rounded-2xl font-semibold tracking-wide text-sm sm:text-base transition-all duration-200 cursor-pointer shadow-lg hover:shadow-stone-300 hover:scale-[1.02] active:scale-[0.99] flex items-center justify-center space-x-2"
          >
            <Plus className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>Create Room</span>
          </button>
          
          <button
            onClick={handleJoinRoomClick}
            className="flex-1 bg-white border border-stone-200 hover:border-stone-400 text-stone-800 py-4 px-6 rounded-2xl font-semibold tracking-wide text-sm sm:text-base transition-all duration-200 cursor-pointer shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.99] flex items-center justify-center space-x-2"
          >
            <Users className="w-5 h-5 text-fuchsia-500 shrink-0" />
            <span>Join Room</span>
          </button>
        </div>

        {/* Underline quick value statement */}
        <p className="text-xs text-stone-400 font-mono tracking-wider uppercase z-10 flex items-center justify-center gap-1.5 selection:bg-amber-100">
          <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-500" />
          <span>Hosts require accounts • Listeners do not</span>
        </p>

        {/* Features overview section */}
        <section id="features-overview" className="w-full pt-16 border-t border-stone-200/50 mt-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-8 text-center">
            Engineered for Synced Audiences
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full max-w-4xl mx-auto">
            {/* Feature 1 */}
            <div className="bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-850/60 p-5 rounded-2xl shadow-sm hover:shadow-md transition duration-200">
              <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-3.5 border border-cyan-100 dark:border-cyan-900/40">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-50 text-sm mb-1">Perfect Synchronization</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Connect and witness zero-lag real-time media synchronization. Playback controls update immediately across all active lounge listeners.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-850/60 p-5 rounded-2xl shadow-sm hover:shadow-md transition duration-200">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3.5 border border-blue-100 dark:border-blue-900/40">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-50 text-sm mb-1">Live Participant Rooms</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Stay updated with the real-time observer list. See active listeners, and dynamic host privileges immediately without latency.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="bg-white dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-850/60 p-5 rounded-2xl shadow-sm hover:shadow-md transition duration-200">
              <div className="w-8 h-8 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-950/20 flex items-center justify-center text-fuchsia-600 dark:text-fuchsia-400 mb-3.5 border border-fuchsia-100 dark:border-fuchsia-900/40">
                <Share2 className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-50 text-sm mb-1">Frictionless Listener Entry</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Listeners can join instantly by simply specifying an intuitive temporary handle name. No account or credentials required contextually.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer bar */}
      <footer id="landing-footer-banner" className="border-t border-stone-200/60 bg-white/50 text-center py-6 select-none">
        <div className="max-w-7xl mx-auto px-4 text-xs text-stone-500 font-sans flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 SyncWave. All systems nominal.</p>
          <div className="flex space-x-4">
            <Link href="/login" className="hover:text-stone-950 transition font-medium">Terminal Login</Link>
            <Link href="/signup" className="hover:text-stone-950 transition font-medium">Register Credentials</Link>
          </div>
        </div>
      </footer>

      {/* ================= MODALS AND COMPONENT OVERLAY LAYERS ================= */}
      <AnimatePresence>
        
        {/* MODAL 1: AUTHENTICATION WARNING (Creating a room requires account) */}
        {showAuthWarningModal && (
          <div key="auth-warning-modal" id="auth-warning-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.15 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xl max-w-sm w-full flex flex-col space-y-4 text-center relative"
            >
              <button 
                onClick={() => setShowAuthWarningModal(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mx-auto w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-500">
                <ShieldAlert className="w-6 h-6" />
              </div>

              <div>
                <h3 className="font-sans font-bold text-stone-900 text-lg leading-snug">Host Authorization</h3>
                <p className="text-xs text-stone-500 mt-1.5 px-2 leading-relaxed">
                  Creating a room requires an account. <br />
                  <span className="font-medium text-stone-700">Create an account or sign in to host a SyncWave room.</span>
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => handleProceedToAuth('signin')}
                  className="w-full bg-stone-900 text-stone-50 hover:bg-stone-850 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleProceedToAuth('signup')}
                  className="w-full bg-white border border-stone-250 text-stone-700 hover:bg-stone-50 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition cursor-pointer"
                >
                  Create Account
                </button>
                <button
                  onClick={() => setShowAuthWarningModal(false)}
                  className="w-full bg-stone-50 hover:bg-stone-100 text-stone-500 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL 2: CREATE ROOM DIALOG */}
        {showCreateModal && user && (
          <div key="create-room-modal" id="create-room-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.15 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xl max-w-md w-full flex flex-col space-y-4 relative"
            >
              <button 
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center space-x-3 border-b border-stone-100 pb-3">
                <div className="p-2 bg-cyan-50 border border-cyan-100 rounded-xl text-cyan-600">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-stone-900 text-base">Build a Sound Lounge</h3>
                  <p className="text-[10px] font-mono text-stone-400">HOST AUTHORIZATION COMPLETED</p>
                </div>
              </div>

              {createError && (
                <div className="text-xs bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl leading-relaxed">
                  {createError}
                </div>
              )}

              <form onSubmit={submitCreateRoom} className="space-y-4 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Lounge Room Name</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    placeholder="Late Night Vinyl Ambient..."
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/15 focus:border-stone-900 transition text-stone-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Description (Optional)</label>
                  <textarea
                    rows={2}
                    maxLength={140}
                    placeholder="Perfecting the frequency of synced lofi and future garage beats..."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/15 focus:border-stone-900 transition text-stone-900 resize-none"
                  />
                </div>

                {/* Private/Public Toggle block */}
                <div className="space-y-1 bg-stone-50 border border-stone-200/80 p-3 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-stone-800 block">Lounge Visibility</label>
                    <span className="text-[10px] font-mono text-stone-400 bg-stone-150 px-1.5 py-0.5 rounded">
                      {createIsPrivate ? 'PRIVATE' : 'PUBLIC'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-stone-200/50 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCreateIsPrivate(false)}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        !createIsPrivate
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-550 hover:text-stone-750'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateIsPrivate(true)}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        createIsPrivate
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-550 hover:text-stone-750'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <span className="text-[10px] text-stone-500 block leading-normal mt-1">
                    {createIsPrivate 
                      ? 'Only users with the precise secret code credential can find and connect to this lounge.' 
                      : 'This lounge is public and open for anyone on the network to search and sync sound tracks.'}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={creatingRoom}
                  className="w-full bg-stone-900 text-stone-50 hover:bg-stone-850 py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition flex items-center justify-center space-x-2 mt-4 cursor-pointer disabled:bg-stone-400 disabled:cursor-not-allowed"
                >
                  {creatingRoom ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>Creating Room...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Room</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* MODAL 3: JOIN ROOM DIALOG (NO AUTH REQUIRED) */}
        {showJoinModal && (
          <div key="join-room-modal" id="join-room-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.15 }}
              className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xl max-w-sm w-full flex flex-col space-y-4 relative"
            >
              <button 
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinStep(1);
                  setVerifiedRoomMatch(null);
                }}
                className="absolute top-4 right-4 p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center space-x-3 border-b border-stone-100 pb-3">
                <div className="p-2 bg-fuchsia-50 border border-fuchsia-100 rounded-xl text-fuchsia-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-stone-900 text-base">Join Sound Lounge</h3>
                  <p className="text-[10px] font-mono text-stone-400">
                    {joinStep === 1 ? 'INSTANT CONNECTION PROTOCOL' : 'GUEST REGISTRATION PROTOCOL'}
                  </p>
                </div>
              </div>

              {joinError && (
                <div className="text-xs bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl leading-relaxed animate-fade-in">
                  {joinError}
                </div>
              )}

              {joinStep === 1 ? (
                <form onSubmit={submitJoinRoom} className="space-y-4 pt-1">
                  {/* Step 1: Room Code */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Lounge Room Code</label>
                    <input
                      type="text"
                      required
                      maxLength={8}
                      placeholder="E.G. AX93ZY"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="w-full text-center text-lg font-mono font-bold tracking-widest px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-500/15 focus:border-stone-900 transition text-stone-950 uppercase placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joiningRoom}
                    className="w-full bg-stone-900 text-stone-50 hover:bg-stone-850 py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition flex items-center justify-center space-x-2 mt-4 cursor-pointer disabled:bg-stone-400 disabled:cursor-not-allowed"
                  >
                    {joiningRoom ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                        <span>Verifying Space Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Join Lounge Session</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={submitGuestJoin} className="space-y-4 pt-1">
                  {/* Step 2: Unauthenticated Guest Display Name */}
                  <div className="bg-fuchsia-50/50 p-3 rounded-xl border border-fuchsia-100/60 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-fuchsia-700 block font-bold">Lounge Found</span>
                    <span className="text-sm font-sans font-bold text-stone-900">{verifiedRoomMatch?.name}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 block">Display Name</label>
                      <span className="text-[9px] font-mono bg-fuchsia-100 text-fuchsia-800 px-1.5 py-0.5 rounded uppercase leading-none font-bold">Guest Listener</span>
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={15}
                      placeholder="Example: Sai"
                      value={guestDisplayName}
                      onChange={(e) => setGuestDisplayName(e.target.value)}
                      className="w-full text-sm px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-500/15 focus:border-stone-900 transition text-stone-900"
                    />
                    <span className="text-[10px] font-sans text-stone-400 block pt-1">No account, email, or password required to join as a listener.</span>
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJoinStep(1);
                        setVerifiedRoomMatch(null);
                        setJoinError(null);
                      }}
                      className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-750 font-semibold rounded-xl text-xs uppercase cursor-pointer transition"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={joiningRoom}
                      className="flex-1 bg-stone-900 text-stone-50 hover:bg-stone-850 py-3 rounded-xl text-xs font-semibold tracking-wider uppercase transition flex items-center justify-center space-x-2 cursor-pointer disabled:bg-stone-400 disabled:cursor-not-allowed"
                    >
                      {joiningRoom ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <span>Enter Lounge</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
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
                <span className="text-[11px] font-bold tracking-tight font-sans leading-tight whitespace-pre-wrap">{t.message}</span>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="p-1 hover:bg-stone-100 dark:hover:bg-stone-850 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 cursor-pointer transition ml-2 shrink-0"
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
