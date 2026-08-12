'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/components/AuthProvider';
import { updateProfile, getOrCreateProfile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, setDoc, orderBy, limit } from 'firebase/firestore';
import { generateRoomCode } from '@/lib/room';
import Logo from '@/components/Logo';
import { useTheme } from 'next-themes';
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
  Link2,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle,
  Database,
  Crown,
  Sun,
  Moon,
  Laptop,
  MessageSquare,
  Volume2,
  UserPlus
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
  
  // Theme management states from next-themes
  const { theme, setTheme, resolvedTheme = 'dark' } = useTheme();
  const [showThemeMenu, setShowThemeMenu] = React.useState(false);

  // Room management states
  const [roomsJoined, setRoomsJoined] = React.useState<any[]>([]);
  const [roomsCount, setRoomsCount] = React.useState<{ [key: string]: number }>({});
  const [publicRooms, setPublicRooms] = React.useState<any[]>([]);
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

  // Copy States / Alerts
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const [copiedShare, setCopiedShare] = React.useState(false);

  const [toasts, setToasts] = React.useState<any[]>([]);

  const showToast = React.useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const firebaseConnected = React.useMemo(() => {
    return isFirebaseConfigured();
  }, []);

  // Resolved theme effects handled by next-themes natively

  const fetchRoomsDetails = React.useCallback(async () => {
    if (!user) return;
    setLoadingRooms(true);
    try {
      // 1. Fetch rooms owned by user
      const ownedQ = query(collection(db, 'rooms'), where('host_id', '==', user.uid));
      const ownedSnap = await getDocs(ownedQ);

      // 2. Fetch rooms joined by user
      const joinedQ = query(collection(db, 'room_members'), where('user_id', '==', user.uid));
      const joinedSnap = await getDocs(joinedQ);

      const roomMap = new Map<string, any>();

      ownedSnap.forEach((d) => {
        roomMap.set(d.id, { id: d.id, ...d.data(), isOwner: true });
      });

      for (const mDoc of joinedSnap.docs) {
        const rId = mDoc.data().room_id;
        if (rId && !roomMap.has(rId)) {
          const rQ = query(collection(db, 'rooms'), where('__name__', '==', rId));
          const rSnap = await getDocs(rQ);
          if (!rSnap.empty) {
            const rData = rSnap.docs[0].data();
            roomMap.set(rId, { id: rId, ...rData, isOwner: rData.host_id === user.uid });
          }
        }
      }

      const compiledRooms = Array.from(roomMap.values());
      const counts: { [key: string]: number } = {};

      for (const r of compiledRooms) {
        const countQ = query(collection(db, 'room_members'), where('room_id', '==', r.id));
        const countSnap = await getDocs(countQ);
        counts[r.id] = countSnap.size || 1;
      }

      setRoomsCount(counts);
      setRoomsJoined(compiledRooms);

      // 4. Fetch trending public rooms
      const pubsQ = query(collection(db, 'rooms'), where('is_private', '==', false), orderBy('created_at', 'desc'), limit(6));
      const pubsSnap = await getDocs(pubsQ);
      const pubsList: any[] = [];
      pubsSnap.forEach((d) => pubsList.push({ id: d.id, ...d.data() }));
      setPublicRooms(pubsList);
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

    try {
      const userProfile = await getOrCreateProfile(user.uid, user.email || '');
      if (!userProfile) {
        throw new Error('Your user profile could not be validated or created in the database.');
      }

      const code = generateRoomCode();
      const activeCode = code;

      const roomData = {
        name: createName.trim(),
        slug: activeCode,
        description: createDesc.trim() || null,
        host_id: user.uid,
        is_private: createIsPrivate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const roomDocRef = await addDoc(collection(db, 'rooms'), roomData);
      const roomId = roomDocRef.id;

      await addDoc(collection(db, 'room_members'), {
        room_id: roomId,
        user_id: user.uid,
        display_name: userProfile.display_name || user.email?.split('@')[0] || 'Host',
        is_muted: false,
        is_banned: false,
        joined_at: new Date().toISOString(),
      });

      const defaultState = {
        room_id: roomId,
        media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        media_type: 'video',
        is_playing: false,
        current_time: 0,
        duration: 596,
        playback_rate: 1,
        last_sync_at: new Date().toISOString()
      };

      await setDoc(doc(db, 'playback_state', roomId), defaultState);

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
    const targetCode = joinCodeInput.trim().toUpperCase();
    if (!targetCode) {
      showToast("🫠 Looks like this invite missed the vibe check.", "error");
      return;
    }
    if (joining || !firebaseConnected) return;

    setJoining(true);
    setJoinError(null);

    try {
      const q = query(collection(db, "rooms"), where("slug", "==", targetCode));
      const snap = await getDocs(q);

      if (snap.empty) {
        showToast("👀 We couldn't find that lounge.\nDouble-check the code or ask your friend for a fresh invite.", "error");
        setJoining(false);
        return;
      }

      const roomMatch = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;

      if (user) {
        const memberQ = query(
          collection(db, 'room_members'),
          where('room_id', '==', roomMatch.id),
          where('user_id', '==', user.uid)
        );
        const memberSnap = await getDocs(memberQ);
        let isBanned = false;
        memberSnap.forEach((d) => {
          if (d.data().is_banned) isBanned = true;
        });

        if (isBanned) {
          showToast("You are banned from entering this room.", "error");
          setJoining(false);
          return;
        }
      }

      router.push(`/room/${targetCode}`);
    } catch (err: any) {
      showToast("⚠️ SyncWave hit a temporary glitch.", "error");
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
      await updateProfile(user.uid, { display_name: displayName.trim() });
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

  const triggerGlobalInviteCopy = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  React.useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayName(profile.display_name || '');
    }
  }, [profile]);

  React.useEffect(() => {
    if (user && firebaseConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRoomsDetails();
    }
  }, [user, fetchRoomsDetails, firebaseConnected]);

  // Handle auto-focus of join input on interaction with "Join Room" button in empty state
  const focusJoinInput = () => {
    const el = document.getElementById('join-code-input-field');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div 
      id="dashboard-root-element" 
      className={`min-h-screen select-none flex flex-col relative overflow-x-hidden font-sans transition-colors duration-300 ${
        resolvedTheme === 'dark' 
          ? 'bg-stone-950 text-stone-100' 
          : 'bg-stone-50 text-stone-900'
      }`}
    >
      
      {/* Decorative Glow Backdrops */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.06),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.04),transparent_50%)] pointer-events-none" />

      {/* Aesthetic Header */}
      <nav 
        id="dashboard-header-bar" 
        className={`border-b backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-8 py-4 flex items-center justify-between transition-colors duration-350 ${
          resolvedTheme === 'dark' 
            ? 'bg-stone-900/60 border-stone-850/80' 
            : 'bg-white/80 border-stone-200'
        }`}
      >
        <div className="flex items-center space-x-6">
          <Logo className="hover:scale-[1.01] transition-all" />
          
          <div className="hidden md:flex items-center space-x-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="font-semibold text-cyan-400 uppercase tracking-widest text-[10px]">Sync Active</span>
          </div>
        </div>

        {/* Global Nav Options */}
        <div className="flex items-center space-x-3.5">
          
          {/* THEME SELECTOR DROPDOWN */}
          <div className="relative" id="theme-selector-container">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className={`p-2.5 rounded-xl border flex items-center justify-center transition active:scale-95 cursor-pointer ${
                resolvedTheme === 'dark'
                  ? 'bg-stone-900 border-stone-800 text-stone-300 hover:text-white hover:bg-stone-850'
                  : 'bg-white border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title="Change Theme Mode"
            >
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
              {theme === 'dark' && <Moon className="w-4 h-4 text-purple-400" />}
              {theme === 'system' && <Laptop className="w-4 h-4 text-cyan-400" />}
            </button>

            <AnimatePresence>
              {showThemeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)}></div>
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className={`absolute right-0 mt-2 w-40 rounded-xl shadow-xl z-50 p-1.5 border font-mono text-[11px] font-bold ${
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
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                        theme === 'light'
                          ? 'bg-purple-500/10 text-purple-400'
                          : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                      }`}
                    >
                      <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>LIGHT</span>
                    </button>

                    <button
                      onClick={() => {
                        setTheme('dark');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-purple-500/10 text-purple-400'
                          : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                      }`}
                    >
                      <Moon className="w-4 h-4 text-purple-450 shrink-0 border-none outline-none" />
                      <span>DARK</span>
                    </button>

                    <button
                      onClick={() => {
                        setTheme('system');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                        theme === 'system'
                          ? 'bg-purple-500/10 text-purple-400'
                          : resolvedTheme === 'dark' ? 'hover:bg-stone-800' : 'hover:bg-stone-100'
                      }`}
                    >
                      <Laptop className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>SYSTEM</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Admin Command Console port */}
          <button 
            onClick={() => router.push('/admin')}
            className={`hidden sm:flex items-center space-x-1.5 px-3 py-2 rounded-xl transition border text-xs cursor-pointer ${
              resolvedTheme === 'dark'
                ? 'bg-stone-900 border-stone-800 hover:bg-stone-850 text-stone-305'
                : 'bg-white border-stone-200 hover:bg-stone-100 text-stone-700'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-mono text-[9px] tracking-widest font-bold">CONSOLE</span>
          </button>

          <button
            onClick={signOut}
            className={`flex items-center space-x-1.5 px-3.5 py-2 border text-xs font-semibold tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer ${
              resolvedTheme === 'dark'
                ? 'bg-stone-900 border-stone-800 text-stone-305 hover:bg-stone-850'
                : 'bg-white border-stone-200 text-stone-750 hover:bg-stone-100'
            }`}
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500/80" />
            <span>EXITS</span>
          </button>
        </div>
      </nav>

      {/* Main Social Board Panel */}
      <main id="main-panel-core" className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-8 flex flex-col space-y-8">
        
        {/* Banner Announcement */}
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`border rounded-2xl p-4.5 flex items-center justify-between relative overflow-hidden shrink-0 shadow-md ${
              resolvedTheme === 'dark'
                ? 'bg-gradient-to-r from-purple-950/20 via-indigo-950/10 to-cyan-950/20 border-purple-500/15'
                : 'bg-gradient-to-r from-purple-50/10 via-indigo-50/20 to-cyan-50/10 border-purple-250/20'
            }`}
          >
            <div className="absolute top-0 right-0 h-24 w-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center space-x-3.5 text-xs leading-relaxed z-10 pr-4">
              <Sparkles className="w-5 h-5 text-purple-500 shrink-0 animate-bounce" />
              <div>
                <span className={`font-bold block ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                  Welcome to SyncWave Social!
                </span>
                <span className={resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-605'}>
                  Invite followers to your rooms, queue YouTube media tracks, and watch together synchronized in real time!
                </span>
              </div>
            </div>
            <button 
              onClick={() => setShowNotification(false)}
              className={`transition z-10 cursor-pointer ${
                resolvedTheme === 'dark' ? 'text-stone-400 hover:text-white' : 'text-stone-500 hover:text-stone-950'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* COLUMN LEFT (8 cols): Interactive Dashboard Panels */}
          <div className="lg:col-span-8 flex flex-col space-y-8">
            
            {/* COMPACT PROFILE CARD */}
            <div 
              className={`border rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative overflow-hidden transition-all ${
                resolvedTheme === 'dark'
                  ? 'bg-stone-900/45 border-stone-850/80 text-stone-150'
                  : 'bg-white border-stone-200/80 text-stone-850 shadow-sm'
              }`}
            >
              {/* Profile card left */}
              <div className="flex items-center space-x-5">
                <div className="relative group cursor-pointer" onClick={() => setShowEditProfile(true)}>
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-2xl blur opacity-30 group-hover:opacity-55 transition duration-300"></div>
                  {profile?.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt={profile.username || 'Avatar'} 
                      className={`relative w-15 h-15 rounded-2xl border object-cover shrink-0 ${
                        resolvedTheme === 'dark' ? 'border-stone-800 bg-stone-900' : 'border-stone-200 bg-stone-100'
                      }`} 
                    />
                  ) : (
                    <div className={`relative w-15 h-15 rounded-2xl border flex items-center justify-center shrink-0 ${
                      resolvedTheme === 'dark' ? 'border-stone-800 bg-stone-950' : 'border-stone-200 bg-stone-100'
                    }`}>
                      <User className={`w-7 h-7 ${resolvedTheme === 'dark' ? 'text-stone-555' : 'text-stone-400'}`} />
                    </div>
                  )}
                  <div className={`absolute -bottom-1 -right-1 border p-1 rounded-lg ${
                    resolvedTheme === 'dark' ? 'bg-stone-950 border-stone-800' : 'bg-white border-stone-200'
                  }`}>
                    <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                </div>
                
                <div className="leading-tight">
                  <div className="flex items-center gap-2">
                    <h2 className={`text-md font-bold tracking-tight ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'}`}>
                      {profile?.display_name || 'Wave User'}
                    </h2>
                    {profile?.username === 'operator' && <Crown className="w-4 h-4 text-amber-500 shrink-0" />}
                  </div>
                  <p className="text-xs font-mono text-purple-500 font-bold mt-0.5">@{profile?.username || 'user'}</p>
                  <p className={`text-[10px] font-mono mt-1 ${resolvedTheme === 'dark' ? 'text-stone-450' : 'text-stone-500'}`}>
                    {profile?.email}
                  </p>
                </div>
              </div>

              {/* Stats highlights */}
              <div 
                className={`grid grid-cols-4 gap-1.5 text-center p-3 rounded-xl min-w-[280px] sm:min-w-[340px] border ${
                  resolvedTheme === 'dark' 
                    ? 'bg-stone-950/45 border-stone-850' 
                    : 'bg-stone-50 border-stone-200'
                }`}
              >
                <div>
                  <span className={`text-[15px] font-bold block ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'}`}>
                    {roomsJoined.filter(r => r.isOwner).length}
                  </span>
                  <span className={`text-[9px] font-medium tracking-tight block ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-500'}`}>Hosted</span>
                </div>
                <div className={`border-l ${resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-200'}`}>
                  <span className={`text-[15px] font-bold block ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'}`}>
                    {roomsJoined.length}
                  </span>
                  <span className={`text-[9px] font-medium tracking-tight block ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-500'}`}>Joined</span>
                </div>
                <div className={`border-l ${resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-200'}`}>
                  <span className="text-[15px] font-bold text-cyan-405 block">0</span>
                  <span className={`text-[9px] font-medium tracking-tight block ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-500'}`}>Online</span>
                </div>
                <div className={`border-l ${resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-200'}`}>
                  <span className="text-[15px] font-bold text-purple-400 block">42h</span>
                  <span className={`text-[9px] font-medium tracking-tight block ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-500'}`}>Synced</span>
                </div>
              </div>

            </div>

            {/* PRIMARY ACTIONS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Box 1: CREATE LOUNGE */}
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className={`border p-6 rounded-2xl shadow-md relative overflow-hidden group justify-between flex flex-col space-y-4 min-h-[180px] transition-all duration-300 ${
                  resolvedTheme === 'dark' 
                    ? 'bg-gradient-to-br from-stone-900 to-stone-950 border-stone-850' 
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="absolute top-0 right-0 h-28 w-28 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition duration-300" />
                
                <div>
                  <div className="bg-cyan-500/10 border border-cyan-500/20 h-9 w-9 rounded-xl flex items-center justify-center text-cyan-450 text-sm">
                    <Plus className="w-5 h-5 font-bold" />
                  </div>
                  <h3 className={`text-sm font-bold tracking-wide mt-3 ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                    Start Syncing Audio
                  </h3>
                  <p className={`text-xs leading-normal mt-1 ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-600'}`}>
                    Assemble a private or public music room, stream live visual tracks, and listen in sync.
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 hover:from-cyan-350 hover:to-purple-450 text-white font-bold py-2.5 px-4 rounded-xl text-xs tracking-wider uppercase transition shadow-md shadow-cyan-500/5 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <span>Create New Lounge</span>
                </button>
              </motion.div>

              {/* Box 2: JOIN LOUNGE BY CODE */}
              <div 
                className={`border p-6 rounded-2xl shadow-md flex flex-col justify-between space-y-4 min-h-[180px] transition-all duration-300 ${
                  resolvedTheme === 'dark' 
                    ? 'bg-gradient-to-br from-stone-900 to-stone-950 border-stone-850' 
                    : 'bg-white border-stone-200 shadow-sm'
                }`}
              >
                <div>
                  <div className="bg-purple-500/10 border border-purple-500/20 h-9 w-9 rounded-xl flex items-center justify-center text-purple-450 text-sm">
                    <Search className="w-4 h-4" />
                  </div>
                  <h3 className={`text-sm font-bold tracking-wide mt-3 ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                    Enter Room Code
                  </h3>
                  <p className={`text-xs leading-normal mt-1 ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-600'}`}>
                    Enter the secret 6-digit lounge code supplied by a friend to connect instantly.
                  </p>
                </div>

                <form onSubmit={handleJoinByCode} className="space-y-1.5 relative">
                  <div className="relative">
                    <input
                      id="join-code-input-field"
                      type="text"
                      required
                      placeholder="e.g. SLUG99"
                      maxLength={6}
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value)}
                      className={`w-full text-xs uppercase px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-400 transition font-mono tracking-widest font-bold pr-11 ${
                        resolvedTheme === 'dark'
                          ? 'bg-stone-950 border-stone-800 text-stone-100'
                          : 'bg-stone-50 border-stone-250 text-stone-900'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={joining || !joinCodeInput.trim()}
                      className="absolute right-1.5 top-1.5 p-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition overflow-hidden cursor-pointer disabled:bg-stone-500"
                    >
                      {joining ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  </div>
                  {joinError && (
                    <p className="text-[10px] text-rose-500 font-bold leading-normal flex items-center gap-1.5 px-1 animate-pulse">
                      <ShieldAlert className="w-3 h-3 shrink-0" />
                      <span>{joinError}</span>
                    </p>
                  )}
                </form>
              </div>

            </div>

            {/* SECTION: MY CONNECTED ROOMS */}
            <div 
              className={`border p-6 rounded-2xl shadow-xl transition-all ${
                resolvedTheme === 'dark' 
                  ? 'bg-stone-900/30 border-stone-850' 
                  : 'bg-white border-stone-200 shadow-sm'
              }`}
            >
              <div className={`flex justify-between items-center pb-4 border-b mb-6 ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <h3 className={`text-xs font-bold uppercase tracking-widest ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-905'}`}>
                    Active Connected Lounges ({roomsJoined.length})
                  </h3>
                </div>
                
                <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/15 px-2.5 py-0.5 rounded-full font-bold uppercase">
                  Connected Signal
                </span>
              </div>

              {loadingRooms ? (
                <div className="py-12 text-center flex flex-col items-center justify-center space-y-3 font-mono text-xs text-stone-400">
                  <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                  <span>Calibrating space frequencies...</span>
                </div>
              ) : roomsJoined.length === 0 ? (
                /* DELIGHTFUL EMPTY STATE FOR MY ROOMS */
                <div className={`border border-dashed rounded-2xl py-12 px-6 text-center space-y-4 max-w-lg mx-auto ${
                  resolvedTheme === 'dark' ? 'border-stone-800 bg-stone-950/40' : 'border-stone-200 bg-stone-50/50'
                }`}>
                  <div className={`w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto border ${
                    resolvedTheme === 'dark' ? 'border-purple-500/20' : 'border-purple-250/20'
                  }`}>
                    <Music className="w-6 h-6 text-purple-450" />
                  </div>
                  
                  <div className="space-y-1">
                    <span className={`text-xs font-bold block ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                      You haven&apos;t joined any rooms yet.
                    </span>
                    <span className="text-[11px] text-stone-500 block leading-normal leading-relaxed">
                      🎵 Start your first listening session now, sync YouTube visualizer streams, or vibe to sound loops with friends in real-time.
                    </span>
                  </div>

                  <div className="flex items-center justify-center space-x-3 text-xs font-mono pt-2">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-cyan-400 text-stone-950 font-bold rounded-xl shadow-md transition active:scale-95 cursor-pointer hover:bg-cyan-500 flex items-center gap-1.5 text-[11px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Room</span>
                    </button>
                    <button
                      onClick={focusJoinInput}
                      className={`px-4 py-2 border font-bold rounded-xl transition active:scale-95 cursor-pointer text-[11px] ${
                        resolvedTheme === 'dark' 
                          ? 'border-stone-800 bg-stone-900 text-stone-300 hover:text-white' 
                          : 'border-stone-250 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Join Room
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {roomsJoined.map((r) => {
                    const count = roomsCount[r.id] || 1;
                    return (
                      <div
                        key={r.id}
                        className={`p-5 border rounded-2xl transition duration-200 flex flex-col justify-between space-y-4 group relative overflow-hidden ${
                          resolvedTheme === 'dark'
                            ? 'bg-stone-950 hover:bg-stone-900 border-stone-850/60'
                            : 'bg-stone-50/50 hover:bg-stone-100/50 border-stone-200'
                        }`}
                      >
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-cyan-400 to-purple-500 opacity-25 group-hover:opacity-100 transition duration-300" />
                        
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <h5 
                              className={`text-xs font-bold truncate leading-tight group-hover:text-cyan-405 transition cursor-pointer ${
                                resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'
                              }`} 
                              onClick={() => router.push(`/room/${r.slug}`)}
                            >
                              {r.name}
                            </h5>
                            <span className="text-[10px] font-mono text-cyan-400 font-bold block mt-1">
                              #{r.slug}
                            </span>
                          </div>
                          
                          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider border px-2 py-0.5 rounded-md shrink-0 ${
                            resolvedTheme === 'dark'
                              ? 'border-stone-800 bg-stone-900 text-stone-400'
                              : 'border-stone-200 bg-white text-stone-605'
                          }`}>
                            {r.isOwner ? '👑 Host' : 'Listener'}
                          </span>
                        </div>

                        <p className={`text-[11px] leading-relaxed line-clamp-2 ${resolvedTheme === 'dark' ? 'text-stone-400' : 'text-stone-600'}`}>
                          {r.description || 'Interactive and synchronized loop playground workspace'}
                        </p>

                        <div className={`p-2.5 rounded-xl border flex items-center justify-between text-[11px] ${
                          resolvedTheme === 'dark'
                            ? 'bg-stone-900/40 border-stone-850'
                            : 'bg-white border-stone-200 shadow-sm'
                        }`}>
                          <span className="text-stone-300 flex items-center gap-1.5 min-w-0">
                            <Music className="w-3.5 h-3.5 text-purple-400 shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
                            <span className={`truncate max-w-[140px] font-medium leading-none ${resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-700'}`}>
                              Realtime Sync Active
                            </span>
                          </span>
                          
                          <span className="text-[10px] text-stone-400 font-semibold shrink-0 font-mono">Loop Live</span>
                        </div>

                        <div className={`flex justify-between items-center pt-3 border-t text-[10px] text-stone-400 font-mono ${
                          resolvedTheme === 'dark' ? 'border-stone-900' : 'border-stone-150'
                        }`}>
                          <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            STABLE SIGNAL
                          </span>
                          
                          <div className="flex items-center space-x-3.5">
                            <span className="flex items-center gap-1 text-stone-400">
                              <Users className="w-3.5 h-3.5 text-stone-550" />
                              <span className="font-bold">{count} connected</span>
                            </span>

                            <button 
                              onClick={() => copyRoomInvite(r.slug)}
                              className="text-stone-450 hover:text-cyan-400 transition-colors p-1 cursor-pointer hover:scale-105"
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
                              className="absolute inset-0 bg-stone-950/95 backdrop-blur-sm flex items-center justify-center p-3 text-center z-20"
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

            {/* SECTION: TRENDING PUBLIC LOUNGES */}
            <div 
              className={`border p-6 rounded-2xl shadow-xl transition-all ${
                resolvedTheme === 'dark' 
                  ? 'bg-stone-900/30 border-stone-850' 
                  : 'bg-white border-stone-200 shadow-sm'
              }`}
            >
              <div className={`flex items-center space-x-2.5 pb-4 border-b mb-6 ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className={`text-xs font-bold uppercase tracking-widest ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                  🔥 Trending Public Lounges
                </h3>
              </div>

              {loadingRooms ? (
                <div className="py-10 text-center flex flex-col items-center justify-center space-y-2 font-mono text-xs text-stone-400">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                  <span>Scanning frequencies...</span>
                </div>
              ) : publicRooms.length === 0 ? (
                /* BEAUTIFUL EMPTY STATE FOR TRENDING PUBLIC LOUNGES */
                <div className={`border border-dashed rounded-2xl py-12 px-6 text-center space-y-4 max-w-lg mx-auto ${
                  resolvedTheme === 'dark' ? 'border-stone-800 bg-stone-950/40' : 'border-stone-200 bg-stone-50/50'
                }`}>
                  <div className={`w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto border ${
                    resolvedTheme === 'dark' ? 'border-amber-500/20' : 'border-amber-250/20'
                  }`}>
                    <Radio className="w-5 h-5 text-amber-505" />
                  </div>
                  
                  <div className="space-y-1">
                    <span className={`text-xs font-bold block ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                      No active public rooms yet.
                    </span>
                    <span className="text-[11px] text-stone-500 block leading-normal leading-relaxed">
                      🎧 Be the pioneer! Create a new public soundscape now and start broadcasting for the SyncWave community.
                    </span>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 bg-amber-500 text-stone-950 font-bold rounded-xl shadow-md transition active:scale-95 cursor-pointer hover:bg-amber-600 inline-flex items-center gap-1.5 text-[11px] font-mono"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Room</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {publicRooms.map((trObj) => (
                    <div 
                      key={trObj.id}
                      className={`p-4.5 border rounded-xl relative overflow-hidden group flex flex-col justify-between space-y-4 min-h-[140px] transition duration-200 ${
                        resolvedTheme === 'dark'
                          ? 'bg-stone-950 border-stone-850/80'
                          : 'bg-stone-50/70 border-stone-200 shadow-sm hover:bg-stone-100/50'
                      }`}
                    >
                      <div>
                        <span className="text-[9px] font-mono font-bold text-cyan-405 bg-cyan-400/5 border border-cyan-400/10 px-2 py-0.5 rounded-full uppercase">
                          STUDIO WAVES
                        </span>
                        <h4 className={`text-xs font-bold mt-2.5 leading-snug group-hover:text-cyan-400 transition duration-150 ${
                          resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'
                        }`}>
                          {trObj.name}
                        </h4>
                        <span className="text-[10px] text-stone-500 block mt-1 font-mono">
                          host ID: #{trObj.host_id.substring(0, 5)}
                        </span>
                      </div>

                      <div className={`flex items-center justify-between pt-2.5 border-t text-[10px] font-mono ${
                        resolvedTheme === 'dark' ? 'border-stone-900' : 'border-stone-150'
                      }`}>
                        <span className="text-stone-400 flex items-center gap-1">
                          <Users className="w-3 h-3 text-stone-500" />
                          <span>Active Lobby</span>
                        </span>

                        <button 
                          onClick={() => router.push(`/room/${trObj.slug}`)} 
                          className="text-cyan-405 hover:text-cyan-300 font-bold flex items-center gap-0.5 group/btn cursor-pointer"
                        >
                          <span>Enter</span> 
                          <ArrowUpRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition duration-150" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* COLUMN RIGHT (4 cols): User updates & beautiful empty state social feeds */}
          <div className="lg:col-span-4 flex flex-col space-y-8">
            
            {/* SOCIAL FEED - GEN Z COMPLIANT EMPTY STATE */}
            <div 
              className={`border p-6 rounded-2xl shadow-xl flex flex-col space-y-4 transition-all ${
                resolvedTheme === 'dark' 
                  ? 'bg-stone-900/30 border-stone-850' 
                  : 'bg-white border-stone-200 shadow-sm'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                  <h3 className={`text-xs font-bold uppercase tracking-widest ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                    Social Feed
                  </h3>
                </div>
                <span className="h-2 w-2 rounded-full bg-stone-400"></span>
              </div>

              {/* EMPTY STATE COMPONENT */}
              <div className="py-6 text-center space-y-4">
                <div className={`w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto border ${
                  resolvedTheme === 'dark' ? 'border-purple-500/20' : 'border-purple-250/20'
                }`}>
                  <UserPlus className="w-5 h-5 text-purple-400" />
                </div>
                
                <div className="space-y-1 px-2">
                  <span className={`text-xs font-bold block ${resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-800'}`}>
                    Your social feed will appear here.
                  </span>
                  <span className="text-[10px] text-stone-500 block leading-normal leading-relaxed">
                    🔥 Invite friends to sync together, browse real-time chat highlights, and align sound tempos.
                  </span>
                </div>

                <div className="pt-1.5">
                  <button 
                    onClick={triggerGlobalInviteCopy}
                    className="mx-auto bg-stone-950 hover:bg-stone-900 text-stone-200 hover:text-white border border-stone-800 px-3.5 py-2 rounded-xl text-[10px] font-bold font-mono tracking-wider uppercase transition active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <Link2 className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>Invite Friends</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ONLINE FRIENDS - GEN Z COMPLIANT EMPTY STATE */}
            <div 
              className={`border p-6 rounded-2xl shadow-xl flex flex-col space-y-4 transition-all ${
                resolvedTheme === 'dark' 
                  ? 'bg-stone-900/30 border-stone-850' 
                  : 'bg-white border-stone-200 shadow-sm'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <Headphones className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <h3 className={`text-xs font-bold uppercase tracking-widest ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                    Friends Online
                  </h3>
                </div>
              </div>

              {/* EMPTY STATE COMPONENT */}
              <div className="py-6 text-center space-y-4">
                <div className={`w-10 h-10 rounded-xl bg-cyan-550/10 flex items-center justify-center mx-auto border ${
                  resolvedTheme === 'dark' ? 'border-cyan-500/20' : 'border-cyan-250/20'
                }`}>
                  <User className="w-5 h-5 text-cyan-400" />
                </div>
                
                <div className="space-y-1 px-2">
                  <span className={`text-xs font-bold block ${resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-850'}`}>
                    No friends connected yet.
                  </span>
                  <span className="text-[10px] text-stone-500 block leading-normal leading-relaxed">
                    ✨ Your activity will appear here once you distribute room invitations to your social circle.
                  </span>
                </div>

                <div className="pt-1.5">
                  <button 
                    onClick={triggerGlobalInviteCopy}
                    className="mx-auto bg-stone-950 hover:bg-stone-900 text-stone-200 hover:text-white border border-stone-800 px-3.5 py-2 rounded-xl text-[10px] font-bold font-mono tracking-wider uppercase transition active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <UserPlus className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>Invite Friends</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PLAYBACK HISTORY - GEN Z COMPLIANT EMPTY STATE */}
            <div 
              className={`border p-6 rounded-2xl shadow-xl flex flex-col space-y-4 transition-all ${
                resolvedTheme === 'dark' 
                  ? 'bg-stone-900/30 border-stone-850' 
                  : 'bg-white border-stone-200 shadow-sm'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-purple-400 animate-pulse" />
                  <h3 className={`text-xs font-bold uppercase tracking-widest ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-900'}`}>
                    Playback Activity
                  </h3>
                </div>
              </div>

              {/* EMPTY STATE COMPONENT */}
              <div className="py-6 text-center space-y-4">
                <div className={`w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto border ${
                  resolvedTheme === 'dark' ? 'border-purple-500/20' : 'border-purple-250/20'
                }`}>
                  <Music className="w-5 h-5 text-purple-405" />
                </div>
                
                <div className="space-y-1 px-2">
                  <span className={`text-xs font-bold block ${resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-850'}`}>
                    Your listening activity will appear here.
                  </span>
                  <span className="text-[10px] text-stone-500 block leading-normal leading-relaxed">
                    🎧 Establish your first live audio workspace session, or input a secret invite slug from your peers.
                  </span>
                </div>

                <div className="pt-1.5">
                  <button 
                    onClick={focusJoinInput}
                    className="mx-auto bg-stone-950 hover:bg-stone-900 text-stone-200 hover:text-white border border-stone-800 px-3.5 py-2 rounded-xl text-[10px] font-bold font-mono tracking-wider uppercase transition active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
                  >
                    <Search className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>Join a Room</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PERSISTENT MODERN SHARE CARD */}
            <div className="bg-gradient-to-br from-indigo-950 to-stone-900 border border-purple-550/15 p-6 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-4">
              <div className="absolute top-0 right-0 h-24 w-24 bg-cyan-405/5 rounded-full blur-2xl pointer-events-none" />
              
              <div>
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest block">
                  Spread the vibe
                </span>
                <h4 className="text-sm font-bold text-white mt-1 leading-snug">Invite Friends</h4>
                <p className="text-xs text-stone-300 leading-relaxed mt-1">
                  Share SyncWave with friends to coordinate playlists and stream live audio media together!
                </p>
              </div>

              <button 
                onClick={triggerGlobalInviteCopy}
                className="w-full bg-stone-950 hover:bg-stone-900 text-stone-250 border border-stone-800 hover:border-stone-750 font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-2 transition active:scale-95 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Copy Share link</span>
              </button>

              <AnimatePresence>
                {copiedShare && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute inset-0 bg-stone-950/95 backdrop-blur-sm flex items-center justify-center p-4 text-center z-30"
                  >
                    <div className="space-y-1">
                      <CheckCircle className="w-5 h-5 text-cyan-450 mx-auto" />
                      <span className="text-xs font-bold text-white block">SyncWave Link Copied!</span>
                      <span className="text-[10px] text-stone-400 font-mono">Distribute to potential listeners.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

        </div>

      </main>

      {/* EDIT PROFILE MODAL */}
      <AnimatePresence>
        {showEditProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col space-y-5 relative ${
                resolvedTheme === 'dark' ? 'bg-stone-900 border-stone-850 text-stone-200' : 'bg-white border-stone-200 text-stone-900'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-cyan-404" />
                  <h3 className={`text-sm font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'}`}>
                    Edit Lounge Profile
                  </h3>
                </div>
                <button
                  onClick={() => setShowEditProfile(false)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    resolvedTheme === 'dark' ? 'bg-stone-850 hover:bg-stone-800 text-stone-400' : 'bg-stone-100 hover:bg-stone-150 text-stone-600'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {errorNotice && (
                <div className="bg-rose-500/10 border border-rose-505/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorNotice}</span>
                </div>
              )}

              {successNotice && (
                <div className="bg-emerald-500/10 border border-emerald-505/20 text-emerald-350 p-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{successNotice}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono text-stone-500 block uppercase mb-1.5 font-bold">Display Name</label>
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
                      className={`w-full text-xs pl-8.5 pr-3 py-2.5 border rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition ${
                        resolvedTheme === 'dark' 
                          ? 'bg-stone-950 border-stone-800 text-stone-200' 
                          : 'bg-stone-50 border-stone-250 text-stone-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                  <div className={`p-2.5 border rounded-xl ${
                    resolvedTheme === 'dark' ? 'bg-stone-950 border-stone-850' : 'bg-stone-50 border-stone-200'
                  }`}>
                    <span className="text-stone-500 block text-[9px] uppercase font-bold">Handle</span>
                    <span className={`truncate block mt-0.5 font-bold ${resolvedTheme === 'dark' ? 'text-stone-300' : 'text-stone-700'}`}>
                      @{profile?.username}
                    </span>
                  </div>
                  <div className={`p-2.5 border rounded-xl ${
                    resolvedTheme === 'dark' ? 'bg-stone-950 border-stone-850' : 'bg-stone-50 border-stone-200'
                  }`}>
                    <span className="text-stone-500 block text-[9px] uppercase font-bold">Status</span>
                    <span className="text-emerald-505 font-bold block mt-0.5">VERIFIED</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={updating || !displayName.trim()}
                  className="w-full bg-cyan-400 hover:bg-cyan-500 text-stone-950 font-bold py-2.5 rounded-xl text-xs tracking-wider uppercase transition active:scale-98 disabled:bg-stone-800 disabled:text-stone-550 cursor-pointer"
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
              className={`border rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col space-y-5 relative overflow-hidden ${
                resolvedTheme === 'dark' ? 'bg-stone-900 border-stone-850 text-stone-105' : 'bg-white border-stone-200 text-stone-900'
              }`}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500"></div>
              
              <div className={`flex items-center justify-between pb-3 border-b ${
                resolvedTheme === 'dark' ? 'border-stone-850' : 'border-stone-150'
              }`}>
                <div className="flex items-center space-x-2">
                  <Radio className="w-5 h-5 text-cyan-400 animate-pulse shrink-0" />
                  <h3 className={`text-sm font-bold ${resolvedTheme === 'dark' ? 'text-white' : 'text-stone-950'}`}>
                    Host Clean Sound Space
                  </h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    resolvedTheme === 'dark' ? 'bg-stone-850 hover:bg-stone-800 text-stone-400' : 'bg-stone-105 hover:bg-stone-150 text-stone-605'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {createError && (
                <div className="bg-rose-500/10 border border-rose-505/20 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4 text-xs">
                <div>
                  <label className="text-[10px] font-mono text-stone-500 block uppercase mb-1.5 font-bold">Lounge Name</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    placeholder="e.g. Afternoon Lofi Chillout"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className={`w-full text-xs px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition ${
                      resolvedTheme === 'dark' 
                        ? 'bg-stone-950 border-stone-800 text-stone-200' 
                        : 'bg-stone-50 border-stone-250 text-stone-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-stone-500 block uppercase mb-1.5 font-bold">Description (Optional)</label>
                  <textarea
                    maxLength={160}
                    placeholder="e.g. Ambient chill visual tracks, coordinate queues with us."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className={`w-full text-xs px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-400 transition h-20 resize-none ${
                      resolvedTheme === 'dark' 
                        ? 'bg-stone-950 border-stone-800 text-stone-200' 
                        : 'bg-stone-50 border-stone-250 text-stone-900'
                    }`}
                  />
                </div>

                {/* Privacy Toggle */}
                <div className={`space-y-2.5 p-4 rounded-xl border ${
                  resolvedTheme === 'dark' ? 'bg-stone-950 border-stone-850' : 'bg-stone-50/70 border-stone-200'
                }`}>
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-stone-500 block uppercase font-bold">Lounge Privacy</label>
                    <span className="text-[9px] font-mono text-cyan-455 bg-cyan-500/10 px-2 py-0.5 rounded font-bold uppercase">
                      {createIsPrivate ? 'PRIVATE' : 'PUBLIC'}
                    </span>
                  </div>
                  <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl ${
                    resolvedTheme === 'dark' ? 'bg-stone-900' : 'bg-stone-150/60'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setCreateIsPrivate(false)}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        !createIsPrivate
                          ? 'bg-purple-500 text-white shadow-sm'
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
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'text-stone-450 hover:text-stone-300'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                  <span className="text-[10px] text-stone-450 block leading-normal leading-relaxed mt-1">
                    {createIsPrivate 
                      ? 'Only listeners with the unique secret code can search and sync.' 
                      : 'Lounge is listed public. Anyone can connect and synchronize.'}
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
