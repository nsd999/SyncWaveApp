import { getSupabase } from './supabase';
import { generateUniqueUsername } from './username';

export interface Profile {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Ensures a profile exists in the database.
 * If the record is missing, it automatically creates a new one (Profile Recovery).
 * Includes absolute 15 seconds timeout guard checks to respect agent instructions.
 */
export async function getOrCreateProfile(
  userId: string,
  email: string,
  displayName?: string
): Promise<Profile> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase integration is not fully configured.');
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout of 15 seconds exceeded fetching user profile database.'));
    }, 15000);
    // Unref timer if running in Node server environment
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  const queryJob = (async () => {
    console.log(`[SyncWave Auth] Loading database entry profiles for target UUID: ${userId}`);
    
    // Attempt profile retrieval
    const db = supabase.from('profiles') as any;
    const { data, error } = await db
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn(`[SyncWave Auth] Warning resolving profiles (initiating auto-recovery): ${error.message}`);
      if (error.message.includes('schema cache') || error.message.includes('not find') || error.message.includes('profiles') || error.message.includes('relation')) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('supabase-schema-error', { detail: error.message }));
        }
      }
    }

    const profile = data as Profile | null;

    if (profile) {
      console.log(`[SyncWave Auth] profile recovery loaded: username is "${profile.username}"`);
      return profile;
    }

    // Profile doesn't exist, proceed to create it
    console.log(`[SyncWave Auth] Triggering auto-profile creation for: ${email}`);
    const uniqueUsername = await generateUniqueUsername(email);
    const cleanDisplay = displayName || email.split('@')[0] || 'Member';

    const insertPayload = {
      id: userId,
      email: email.toLowerCase().trim(),
      username: uniqueUsername,
      display_name: cleanDisplay,
      avatar_url: `https://picsum.photos/seed/${uniqueUsername}/150`,
    };

    const { data: createdProfile, error: insertError } = await db
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError) {
      console.error(`[SyncWave Auth] Error writing entry to profiles: ${insertError.message}`);
      if (insertError.message.includes('schema cache') || insertError.message.includes('not find') || insertError.message.includes('profiles') || insertError.message.includes('relation')) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('supabase-schema-error', { detail: insertError.message }));
        }
      }
      throw new Error(`Failed to initialize database profile row: ${insertError.message}. Please sign out and sign in again.`);
    }

    if (!createdProfile) {
      throw new Error('Failed to register user profile. No database row returned.');
    }

    const finalProfile = createdProfile as unknown as Profile;
    console.log(`[SyncWave Auth] Successful profile table entry created: "${finalProfile.username}"`);
    return finalProfile;
  })();

  return Promise.race([queryJob, timeoutPromise]);
}

/**
 * Updates an existing user profile with 15 seconds safety timeout.
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Omit<Profile, 'id' | 'email' | 'created_at'>>
): Promise<Profile> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase integration is not fully configured.');
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Profile update timed out (15 second limit exceeded)'));
    }, 15000);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  const updateJob = (async () => {
    const db = supabase.from('profiles') as any;
    const { data, error } = await db
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as Profile;
  })();

  return Promise.race([updateJob, timeoutPromise]);
}
