'use client';

import * as React from 'react';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, User } from 'firebase/auth';
import { getOrCreateProfile, Profile } from '@/lib/profile';
import { writeLog } from '@/lib/logger';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const configured = isFirebaseConfigured();

  const refreshProfile = React.useCallback(async () => {
    if (!user) return;
    try {
      const activeProfile = await getOrCreateProfile(user.uid, user.email || '');
      setProfile(activeProfile);
    } catch (err: any) {
      writeLog('error', 'Profile recovery', `Error refreshing profile: ${err.message}`);
    }
  }, [user]);

  React.useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (activeUser) => {
      setUser(activeUser);

      if (activeUser) {
        writeLog('success', 'Session restored', `Auth session restored for ${activeUser.email}`);
        try {
          const p = await getOrCreateProfile(activeUser.uid, activeUser.email || '');
          setProfile(p);
        } catch (e: any) {
          writeLog('error', 'Profile recovery', `Database profile error: ${e.message}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [configured]);

  const signOut = async () => {
    try {
      writeLog('info', 'Login started', 'Initiating logout request...');
      await firebaseSignOut(auth);
    } catch (err: any) {
      writeLog('error', 'Login failure', `SignOut warning: ${err.message}`);
    }
    setUser(null);
    setProfile(null);
    writeLog('success', 'Login success', 'Successfully signed out');
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div id="loader-root" className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div id="loader-box" className="flex flex-col items-center space-y-4 max-w-sm w-full">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
          </div>
          <p className="text-stone-500 font-mono text-xs tracking-wider animate-pulse uppercase">Establishing secure connection...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
