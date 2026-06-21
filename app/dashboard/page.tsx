'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/components/AuthProvider';
import { updateProfile, getOrCreateProfile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase';
import { generateRoomCode } from '@/lib/room';
import Logo from '@/components/Logo';
import { 
  LogOut, 
  User, 
  Edit3, 
  Plus, 
  ArrowRight, 
  Search, 
  Users, 
  Radio, 
  Loader2, 
  X,
  Share2,
  Sparkles,
  Music,
  Headphones,
  Flame,
  MessageSquare,
  Bell,
  Link2,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle,
  Database,
  Crown
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, refreshProfile, signOut } = useAuth();
  
  const [displayName, setDisplayName] = React.useState('');
  const [updating, setUpdating] = React.useState(false);
  const [showEditProfile, setShowEditProfile] = React.useState(false);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [errorNotice, setErrorNotice] = React.useState<string | null>(null);
  
  // Room management states
  const [roomsJoined, setRoomsJoined] = React.useState<any[]>([]);
  const [roomsCount, setRoomsCount] = React.useState<{ [key: string]: number }>({});
  const [loadingRooms, setLoadingRooms] = React.useState(true);
  
  // Actions
  const [joinCodeInput, setJoinCodeInput] = React.useState('');
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createDesc, setCreateDesc] = React.useState('');
  const [createIsPrivate, setCreateIsPrivate] = React.useState(false);
  const [creatingRoom, setCreatingRoom] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // General Notification Banner
  const [showNotification, setShowNotification] = React.useState(true);

  // Copy States for Room Invites
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const supabaseConnected = React.useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return !!(
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project-id') &&
      !supabaseAnonKey.includes('your-anon-key')
    );
  }, []);

  const fetchRooms = React.useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase();
    if (!supabase) return;

    setLoadingRooms(true);
    try {
      // 1. Fetch rooms owned by user
      const { data: owned, error: ownedError } = await supabase
        .from('rooms')
        .select('*')
        .eq('host_id', user.id);

      if (ownedError) throw ownedError;

      // 2. Fetch rooms joined by user (joined table via room_members)
      const { data: joinedMembers, error: joinedError } = await supabase
        .from('room_members')
        .select('*, rooms(*)')
        .eq('user_id', user.id);

      if (joinedError) throw joinedError;

      // Compile an array of unique room metadata objects
      const roomMap = new Map<string, any>();
      
      // Add owned rooms
      const ownedList = (owned as any[]) || [];
      ownedList.forEach((r) => {
        roomMap.set(r.id, { ...r, isOwner: true });
      });

      // Add joined rooms
      const joinedList = (joinedMembers as any[]) || [];
      joinedList.forEach((m) => {
        if (m.rooms) {
          roomMap.set(m.rooms.id, { ...m.rooms, isOwner: m.rooms.host_id === user.id });
        }
      });

      const compiledRooms = Array.from(roomMap.values());
      
      // 3. For each room, fetch member counts reactively
      const counts: { [key: string]: number } = {};
      for (const r of compiledRooms) {
        const { count, error: countError } = await supabase
          .from('room_members')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', r.id);
        
        if (!countError && count !== null) {
          counts[r.id] = count;
        } else {
          counts[r.id] = 1;
        }
      }

      setRoomsCount(counts);
      setRoomsJoined(compiledRooms);
    } catch (err: any) {
      console.error('Error fetching dashboard rooms:', err.message);
    } finally {
      setLoadingRooms(false);
    }
  }, [user]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || creatingRoom || !createName.trim()) return;

    setCreatingRoom(true);
    setCreateError(null);
    writeLog('info', 'Lounge synced', `Initiating synchronization layout for room name: "${createName}"`);

    const supabase = getSupabase();
    if (!supabase) {
      setCreatingRoom(false);
      return;
    }

    try {
      // Rule 1: Active authenticated session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active authenticated session exists. Please sign in again.');
      }

      // Rule 2: Profile exists
      const userProfile = await getOrCreateProfile(user.id, user.email || '');
      if (!userProfile) {
        throw new Error('Your user profile could not be validated or created in the database.');
      }

      const code = generateRoomCode();
      
      // Guard slug uniqueness just in case
      const { data: conflict } = await supabase
        .from('rooms')
        .select('id')
        .eq('slug', code)
        .maybeSingle();

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

      if (roomError || !newRoom) {
        throw new Error(roomError?.message || 'Room database insertion failed.');
      }

      // Rule 4: room_members insert succeeded (Immediately join the room as Host)
      const { data: newMember, error: inviteError } = await supabase
        .from('room_members')
        .insert({
          room_id: (newRoom as any).id,
          user_id: user.id,
          display_name: userProfile.display_name || user.email?.split('@')[0] || 'Host'
        } as any)
        .select()
        .single();

      if (inviteError || !newMember) {
        throw new Error(inviteError?.message || 'Lounge host membership registration failed.');
      }

      writeLog('success', 'Lounge synced', `Interactive studio room "${createName}" parsed successfully under code ${activeCode}!`);
      
      setShowCreateModal(false);
      setCreateName('');
      setCreateDesc('');
      
      router.push(`/room/${activeCode}`);
    } catch (err: any) {
      console.error('Room creation failure:', err.message);
      setCreateError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim() || joining || !supabaseConnected) return;

    setJoining(true);
    setJoinError(null);
    
    const targetCode = joinCodeInput.trim().toUpperCase();
    const supabase = getSupabase();
    if (!supabase) {
      setJoining(false);
      return;
    }

    try {
      const { data: roomMatch, error: selectError } = await supabase
        .from('rooms')
        .select('*')
        .eq('slug', targetCode)
        .maybeSingle();

      if (selectError) throw selectError;

      if (!roomMatch) {
         setJoinError('Room code does not exist. Check spelling and retry.');
         setJoining(false);
         return;
      }

      const { data: bannedCheck } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', (roomMatch as any).id)
        .eq('user_id', user?.id)
        .maybeSingle();

      if ((bannedCheck as any)?.is_banned) {
        setJoinError('You are banned from entering this room.');
        setJoining(false);
        return;
      }

      router.push(`/room/${targetCode}`);
    } catch (err: any) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setUpdating(true);
    setSuccessNotice(null);
    setErrorNotice(null);

    try {
      await updateProfile(user.id, { display_name: displayName.trim() });
      await refreshProfile();
      setSuccessNotice('Your SyncWave profile was updated successfully!');
      setTimeout(() => {
        setSuccessNotice(null);
        setShowEditProfile(false);
      }, 2500);
    } catch (err: any) {
      setErrorNotice(err.message || 'Database rejected profile update.');
    } finally {
      setUpdating(false);
    }
  };

  const copyRoomInvite = (code: string) => {
    const inviteUrl = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  React.useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(profile.display_name || '');
    }
  }, [profile]);

  React.useEffect(() => {
    if (user && supabaseConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRooms();
    }
  }, [user, fetchRooms, supabaseConnected]);

  // Curated Mock Trending items
  const trendingPublicRooms = [
    { name: "Coffee & Lofi Oasis ☕", host: "@clara", listeners: 48, genre: "Lofi Beats", code: "LOFI03" },
    { name: "Midnight Techno Underground ⚡", host: "dj_neon", listeners: 142, genre: "Dark Techno", code: "TECH99" },
    { name: "Anime OST Chill Vibes 🎧", host: "otaku_wave", listeners: 89, genre: "J-Pop / Chill", code: "ANIME4" }
  ];

  const popularSongs = [
    { title: "Glimpse of Us", artist: "Joji", duration: "3:53", playCount: "124K streams" },
    { title: "Starboy", artist: "The Weeknd", duration: "3:50", playCount: "98K streams" },
    { title: "Cruel Summer", artist: "Taylor Swift", duration: "2:58", playCount: "82K streams" }
  ];

  const virtualFriends = [
    { name: "Alex Chen", handle: "@alex_wave", avatar: "https://picsum.photos/seed/alex/150/150", status: "listening to Lofi Oasis", online: true },
    { name: "Jessica Fox", handle: "@jess_fox", avatar: "https://picsum.photos/seed/jessica/150/150", status: "hosting Techno Underground", online: true },
    { name: "Liam Stone", handle: "@liam_s", avatar: "https://picsum.photos/seed/liam/150/150", status: "AFK • Vibe Checking", online: true },
    { name: "Mia Wong", handle: "@mia_lofi", avatar: "https://picsum.photos/seed/mia/150/150", status: "offline", online: false }
  ];

  const recentMediaActivities = [
    { user: "@alex_wave", action: "queued", item: "Starboy - The Weeknd", time: "2 min ago" },
    { user: "dj_neon", action: "synchronized", item: "Techno Rave Session Vol 5", time: "12 min ago" },
    { user: "system", action: "updated playlist", item: "Summer Sunset Mix", time: "1 hr ago" }
  ];

  return (
    <div id="dashboard-ambient-container" className="min-h-screen bg-stone-950 text-stone-100 select-none flex flex-col relative overflow-x-hidden font-sans">
      
      {/* Glow Backdrops */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.06),transparent_50%)] pointer-events-none" />

      {/* Aesthetic Header */}
      <nav id="dashboard-navbar" className="bg-stone-900/60 border-b border-stone-850 backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Logo className="hover:scale-[1.01] transition-all" />
          
          <div className="hidden md:flex items-center space-x-2 text-[10px] sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="font-semibold text-cyan-400 uppercase tracking-wider">Sync Active</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Subtle link to administration console */}
          <button 
            onClick={() => router.push('/admin')}
            className="hidden sm:flex items-center space-x-1.5 text-xs text-stone-400 hover:text-stone-200 transition bg-stone-800/45 px-2.5 py-1.5 rounded-lg border border-stone-800"
          >
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono text-[9px] tracking-widest font-bold">CONSOLE</span>
          </button>

          <button
            onClick={signOut}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-850 hover:text-white border border-stone-800 text-stone-300 text-xs font-semibold tracking-wider rounded-lg transition-all active:scale-95 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-stone-450" />
            <span>EXITS</span>
          </button>
        </div>
      </nav>

      {/* Main Social Board Panel */}
      <main id="main-panel-core" className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col space-y-6">
        
        {/* Banner Announcement */}
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-900/20 via-indigo-900/10 to-cyan-900/20 border border-purple-500/15 rounded-2xl p-4 flex items-center justify-between relative overflow-hidden shrink-0 shadow-lg"
          >
            <div className="absolute top-0 right-0 h-24 w-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center space-x-3 text-xs leading-relaxed z-10 pr-4">
              <Sparkles className="w-5 h-5 text-purple-400 shrink-0 animate-bounce" />
              <div>
                <span className="font-bold text-white block">Welcome back to SyncWave Social!</span>
                <span className="text-stone-300">Invite followers, queue YouTube visualizer streams, and synchronize sound loops in real time!</span>
              </div>
            </div>
            <button 
              onClick={() => setShowNotification(false)}
              className="text-stone-400 hover:text-white transition z-10"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* COLUMN LEFT (8 cols): Primary Social Dash */}
          <div className="lg:col-span-8 flex flex-col space-y-6">
            
            {/* COMPACT PROFILE CARD & ACTIONS COMBINED */}
            <div className="bg-stone-900/40 border border-stone-850/80 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 relative overflow-hidden">
              
              {/* Profile card left */}
              <div className="flex items-center space-x-4">
                <div className="relative group cursor-pointer" onClick={() => setShowEditProfile(true)}>
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-2xl blur opacity-35 group-hover:opacity-60 transition duration-300"></div>
                  {profile?.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt={profile.username} 
                      className="relative w-14 h-14 rounded-2xl border border-stone-800 object-cover bg-stone-900 shrink-0" 
                    />
                  ) : (
                    <div className="relative w-14 h-14 rounded-2xl border border-stone-800 bg-stone-950 flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-stone-500" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-stone-950 border border-stone-800 p-1 rounded-lg">
                    <Edit3 className="w-3 h-3 text-cyan-400" />
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-md font-bold text-white tracking-tight">{profile?.display_name || 'Wave User'}</h2>
                    {profile?.username === 'operator' && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-xs font-mono text-purple-400 font-bold">@{profile?.username || 'user'}</p>
                  <p className="text-[10px] text-stone-400 font-mono mt-0.5">{profile?.email}</p>
                </div>
              </div>

              {/* Stats highlights */}
              <div className="grid grid-cols-4 gap-2 text-center bg-stone-950/40 border border-stone-850 p-3 rounded-xl sm:min-w-[320px]">
                <div>
                  <span className="text-[14px] font-bold text-white block">
                    {roomsJoined.filter(r => r.isOwner).length}
                  </span>
                  <span className="text-[9px] text-stone-400 font-medium tracking-tight block">Hosted</span>
                </div>
                <div className="border-l border-stone-850/80">
                  <span className="text-[14px] font-bold text-white block">
                    {roomsJoined.length}
                  </span>
                  <span className="text-[9px] text-stone-400 font-medium tracking-tight block">Joined</span>
                </div>
                <div className="border-l border-stone-850/80">
                  <span className="text-[14px] font-bold text-cyan-400 block">
                    {virtualFriends.filter(f => f.online).length}
                  </span>
                  <span className="text-[9px] text-stone-400 font-medium tracking-tight block">Online</span>
                </div>
                <div className="border-l border-stone-850/80">
                  <span className="text-[14px] font-bold text-purple-400 block">42h</span>
                  <span className="text-[9px] text-stone-400 font-medium tracking-tight block">Synced</span>
                </div>
              </div>

            </div>

            {/* PRIMARY ACTIONS PANEL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Box 1: CREATE ROOM (Addictive Visual) */}
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 p-5 rounded-2xl shadow-xl relative overflow-hidden group justify-between flex flex-col space-y-4 min-h-[160px]"
              >
                {/* Visual gradient orb */}
                <div className="absolute top-0 right-0 h-28 w-28 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition" />
                
                <div>
                  <div className="bg-cyan-500/10 border border-cyan-500/20 h-9 w-9 rounded-xl flex items-center justify-center text-cyan-400 text-sm">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white tracking-wide mt-3">Start Syncing Audio</h3>
                  <p className="text-xs text-stone-400 leading-normal mt-1">
                    Assemble a private or public music room, stream live visual tracks, and listen in sync.
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 hover:from-cyan-350 hover:to-purple-450 text-white font-bold py-2 px-4 rounded-xl text-xs tracking-wider uppercase transition shadow-md shadow-cyan-500/5 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <span>Create New Lounge</span>
                </button>
              </motion.div>

              {/* Box 2: JOIN ROOM BY CODE (Inline, interactive input) */}
              <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between space-y-4 min-h-[160px]">
                <div>
                  <div className="bg-purple-500/10 border border-purple-500/20 h-9 w-9 rounded-xl flex items-center justify-center text-purple-400 text-sm">
                    <Search className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white tracking-wide mt-3">Enter Room Code</h3>
                  <p className="text-xs text-stone-400 leading-normal mt-1">
                    Enter the secret 6-digit lounge code supplied by a friend to connect instantly.
                  </p>
                </div>

                <form onSubmit={handleJoinByCode} className="space-y-1.5 relative">
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. SLUG99"
                      maxLength={6}
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value)}
                      className="w-full text-xs uppercase px-3 py-2.5 bg-stone-950 border border-stone-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-400 transition text-stone-100 font-mono tracking-widest font-bold pr-10"
                    />
                    <button
                      type="submit"
                      disabled={joining || !joinCodeInput.trim()}
                      className="absolute right-1.5 top-1.5 p-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-md transition cursor-pointer disabled:bg-stone-800"
                    >
                      {joining ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  </div>
                  {joinError && (
                    <p className="text-[10px] text-rose-450 font-bold leading-normal flex items-center gap-1 px-1">
                      <ShieldAlert className="w-3 h-3 shrink-0" />
                      <span>{joinError}</span>
                    </p>
                  )}
                </form>
              </div>

            </div>

            {/* MY CHANNELS / ROOMS REGISTERED */}
            <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-2xl shadow-xl">
              <div className="flex justify-between items-center pb-4 border-b border-stone-850 mb-4">
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">My Connected Rooms ({roomsJoined.length})</h3>
                </div>
                
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full font-bold">
                  Active Sync
                </span>
              </div>

              {loadingRooms ? (
                <div className="py-12 text-center flex flex-col items-center justify-center space-y-3 text-stone-400 font-mono text-xs">
                  <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                  <span>Calibrating signal...</span>
                </div>
              ) : roomsJoined.length === 0 ? (
                <div className="border border-dashed border-stone-800 rounded-2xl py-12 px-6 text-center space-y-3">
                  <span className="text-xs text-stone-400 font-mono block italic">You don&apos;t belong to any active SyncWave spaces yet.</span>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-505/20 rounded-xl px-4 py-2 hover:underline inline-flex items-center gap-1 cursor-pointer transition active:scale-95"
                  >
                    Host your first live space now <Plus className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {roomsJoined.map((r) => {
                    const count = roomsCount[r.id] || 1;
                    return (
                      <div
                        key={r.id}
                        className="p-5 bg-stone-950 hover:bg-stone-900 border border-stone-850/60 rounded-2xl transition duration-250 flex flex-col justify-between space-y-4 group relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-purple-500 opacity-30 group-hover:opacity-100 transition duration-300" />
                        
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold text-white truncate leading-tight group-hover:text-cyan-400 transition cursor-pointer" onClick={() => router.push(`/room/${r.slug}`)}>
                              {r.name}
                            </h5>
                            <span className="text-[10px] font-mono text-cyan-400 font-bold block mt-1">
                              #{r.slug}
                            </span>
                          </div>
                          
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider border border-stone-800 px-1.5 py-0.5 rounded-md shrink-0 bg-stone-900/60 text-stone-400">
                            {r.isOwner ? '👑 Host' : 'Listener'}
                          </span>
                        </div>

                        <p className="text-[11px] text-stone-400 leading-normal line-clamp-2">
                          {r.description || 'Live audio track synchronization room'}
                        </p>

                        <div className="bg-stone-900/50 p-2.5 rounded-xl border border-stone-850 flex items-center justify-between text-[11px]">
                          <span className="text-stone-300 flex items-center gap-1.5">
                            <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span className="truncate max-w-[130px] font-medium leading-none">🎵 Visualizer Stream</span>
                          </span>
                          
                          <span className="text-[10px] text-stone-400 font-semibold shrink-0">Live sync</span>
                        </div>

                        <div className="flex justify-between items-center pt-2.5 border-t border-stone-900 text-[10px] text-stone-400 font-mono">
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                            ACTIVE
                          </span>
                          
                          <div className="flex items-center space-x-3">
                            <span className="flex items-center gap-1 text-stone-400">
                              <Users className="w-3.5 h-3.5 text-stone-500" />
                              {count}
                            </span>

                            <button 
                              onClick={() => copyRoomInvite(r.slug)}
                              className="text-stone-450 hover:text-cyan-400 transition-colors p-1"
                              title="Copy Invite Link"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {copiedCode === r.slug && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute inset-0 bg-stone-950/95 backdrop-blur-sm flex items-center justify-center p-3 text-center"
                            >
                              <div className="space-y-1">
                                <CheckCircle className="w-5 h-5 text-cyan-400 mx-auto" />
                                <span className="text-xs font-bold text-white block">Invite URL Copied!</span>
                                <span className="text-[10px] text-stone-400 font-mono">Share with your listeners.</span>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TRENDING PUBLIC LOUNGES */}
            <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-2xl shadow-xl flex flex-col space-y-4">
              <div className="flex items-center space-x-2 pb-3 border-b border-stone-850">
                <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">🔥 Trending Public Lounges</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {trendingPublicRooms.map((trObj, idx) => (
                  <div 
                    key={idx}
                    className="p-4 bg-stone-950 border border-stone-850/80 rounded-xl relative overflow-hidden group flex flex-col justify-between space-y-3 min-h-[140px]"
                  >
                    <div>
                      <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-400/5 px-2 py-0.5 rounded-full uppercase">
                        {trObj.genre}
                      </span>
                      <h4 className="text-xs font-bold text-white mt-2 leading-snug group-hover:text-cyan-400 transition duration-150">
                        {trObj.name}
                      </h4>
                      <span className="text-[10px] text-stone-500 block mt-1">Host: {trObj.host}</span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-900 text-[10px] font-mono">
                      <span className="text-stone-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-stone-500" />
                        {trObj.listeners} listening
                      </span>

                      <button 
                        onClick={() => router.push(`/room/${trObj.code}`)} 
                        className="text-cyan-405 hover:text-cyan-300 font-bold flex items-center gap-0.5 group/btn"
                      >
                        Enter <ArrowUpRight className="w-3 h-3 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition duration-150" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* COLUMN RIGHT (4 cols): Profile Update, Social, Friends activity */}
          <div className="lg:col-span-4 flex flex-col space-y-6">
            
            {/* SOCIAL / ONLINE FRIENDS PANEL */}
            <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-2xl shadow-xl flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-850">
                <div className="flex items-center space-x-2">
                  <Headphones className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Social Feed</h3>
                </div>
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>

              <div className="space-y-4">
                {virtualFriends.map((f, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <img src={f.avatar} alt={f.name} className="w-9 h-9 rounded-xl border border-stone-800 object-cover" />
                        {f.online && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-500 border border-stone-950 rounded-full"></span>
                        )}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <span className="font-bold text-white truncate block">{f.name}</span>
                        <span className="text-[10px] text-stone-400 truncate block mt-0.5">{f.status}</span>
                      </div>
                    </div>

                    {f.online && (
                      <button className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase select-none cursor-pointer">
                        Vibe
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* RECENT PLAYBACK & QUEUED ITEMS */}
            <div className="bg-stone-900/30 border border-stone-850 p-6 rounded-2xl shadow-xl flex flex-col space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-850">
                <div className="flex items-center space-x-2">
                  <Music className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Playback Feed</h3>
                </div>
              </div>

              <div className="space-y-3.5 text-xs font-mono">
                {recentMediaActivities.map((act, idx) => (
                  <div key={idx} className="pb-3 border-b border-stone-900/60 last:border-b-0 last:pb-0 flex items-start space-x-2.5">
                    <div className="bg-stone-950 p-1.5 rounded-lg text-[10px] text-cyan-400 border border-stone-850">
                      Sync
                    </div>
                    <div className="min-w-0 leading-normal">
                      <p className="text-stone-300">
                        <span className="font-bold text-white font-sans">{act.user}</span> {act.action} <span className="text-cyan-400 font-semibold italic">{act.item}</span>
                      </p>
                      <span className="text-[9px] text-stone-500 block mt-0.5">{act.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* INVITE CARD */}
            <div className="bg-gradient-to-br from-indigo-950 border border-purple-500/15 p-6 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="absolute top-0 right-0 h-24 w-24 bg-cyan-400/5 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest block">
                  Spread the wave
                </span>
                <h4 className="text-sm font-bold text-white mt-1 leading-snug">Invite Friends</h4>
                <p className="text-xs text-stone-400 leading-relaxed mt-1">
                  Share SyncWave with friends to coordinate song queues and customize listening spaces together.
                </p>
              </div>

              <button 
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin);
                  alert('SyncWave Invite URL copied to clipboard!');
                }}
                className="w-full bg-stone-950 hover:bg-stone-900 text-stone-200 border border-stone-800 hover:border-stone-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition active:scale-95 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Copy Share link</span>
              </button>
            </div>

          </div>

        </div>

      </main>

      {/* EDIT PROFILE MODAL (Aesthetic glassmorphic overlay) */}
      <AnimatePresence>
        {showEditProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-900 border border-stone-850 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-stone-200 flex flex-col space-y-5 relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-stone-850">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Edit Lounge Profile</h3>
                </div>
                <button
                  onClick={() => setShowEditProfile(false)}
                  className="p-1 rounded bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {errorNotice && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorNotice}</span>
                </div>
              )}

              {successNotice && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{successNotice}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono text-stone-450 block uppercase mb-1.5 font-bold">Display Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-500">
                      <Edit3 className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      disabled={updating}
                      placeholder="e.g. Liam Stone"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2.5 bg-stone-950 border border-stone-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition text-stone-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                  <div className="bg-stone-950 p-2.5 rounded-xl border border-stone-850">
                    <span className="text-stone-500 block text-[9px] uppercase font-bold">Handle</span>
                    <span className="text-stone-300 truncate block mt-0.5">@{profile?.username}</span>
                  </div>
                  <div className="bg-stone-950 p-2.5 rounded-xl border border-stone-850">
                    <span className="text-stone-500 block text-[9px] uppercase font-bold">Status</span>
                    <span className="text-emerald-400 font-bold block mt-0.5">VERIFIED</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updating || !displayName.trim()}
                  className="w-full bg-cyan-500 hover:bg-cyan-650 text-stone-950 font-bold py-2.5 rounded-xl text-xs tracking-wider uppercase transition active:scale-98 disabled:bg-stone-800 disabled:text-stone-550"
                >
                  {updating ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE ROOM MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-900 border border-stone-850 rounded-2xl shadow-2xl max-w-md w-full p-6 text-stone-100 flex flex-col space-y-5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500"></div>
              
              <div className="flex items-center justify-between pb-3 border-b border-stone-850">
                <div className="flex items-center space-x-2">
                  <Radio className="w-5 h-5 text-cyan-400 animate-pulse shrink-0" />
                  <h3 className="text-sm font-bold text-white">Host Clean Sound Space</h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {createError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4 text-xs">
                <div>
                  <label className="text-[10px] font-mono text-stone-450 block uppercase mb-1 font-bold">Lounge Name</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    placeholder="e.g. Afternoon Lofi Chillout"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition text-stone-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-stone-450 block uppercase mb-1 font-bold">Description (Optional)</label>
                  <textarea
                    maxLength={160}
                    placeholder="e.g. Ambient chill visual tracks, coordinate queues with us."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-stone-950 border border-stone-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition text-stone-200 h-20 resize-none"
                  />
                </div>

                {/* Privacy Toggle */}
                <div className="space-y-2 bg-stone-950 p-3.5 rounded-2xl border border-stone-850/70">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-stone-400 block uppercase font-bold">Lounge Privacy</label>
                    <span className="text-[9px] font-mono text-cyan-450 bg-cyan-500/10 px-2 py-0.5 rounded font-bold uppercase">
                      {createIsPrivate ? 'PRIVATE' : 'PUBLIC'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-stone-900 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setCreateIsPrivate(false)}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        !createIsPrivate
                          ? 'bg-stone-800 text-cyan-400 shadow-sm'
                          : 'text-stone-450 hover:text-stone-300'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateIsPrivate(true)}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        createIsPrivate
                          ? 'bg-stone-800 text-cyan-400 shadow-sm'
                          : 'text-stone-450 hover:text-stone-300'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <span className="text-[10px] text-stone-500 block leading-normal mt-1">
                    {createIsPrivate 
                      ? 'Only followers with the unique code can join.' 
                      : 'Lounge is listed public. Anyone can connect and Sync.'}
                  </span>
                </div>

                <div className="flex space-x-3 pt-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-200 font-bold rounded-xl text-center transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingRoom || !createName.trim()}
                    className="flex-1 py-2.5 bg-cyan-400 hover:bg-cyan-500 text-stone-950 font-bold rounded-xl text-center transition cursor-pointer shadow-lg disabled:bg-stone-850"
                  >
                    {creatingRoom ? 'Calibrating...' : 'Create Lounge'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
