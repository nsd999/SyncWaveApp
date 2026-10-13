import { supabase } from './supabase';
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

export async function getOrCreateProfile(
  userId: string,
  email: string,
  displayName?: string
): Promise<Profile> {
  if (!userId || !email) {
    throw new Error('A verified user ID and email are required to load a profile.');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const cleanDisplay = displayName || normalizedEmail.split('@')[0] || 'Member';

  try {
    const { data: existingProfile, error: getError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      return existingProfile as Profile;
    }

    // Only create when the profile is genuinely absent. Do not disguise schema,
    // permission, network, or API-key errors as a successful in-memory profile.
    if (getError) {
      throw getError;
    }

    const uniqueUsername = await generateUniqueUsername(normalizedEmail);
    const newProfile = {
      id: userId,
      email: normalizedEmail,
      username: uniqueUsername,
      display_name: cleanDisplay,
      avatar_url: `https://picsum.photos/seed/${uniqueUsername}/150`,
    };

    const { data: insertedProfile, error: insertError } = await supabase
      .from('profiles')
      .insert([newProfile])
      .select()
      .single();

    if (insertedProfile && !insertError) {
      return insertedProfile as Profile;
    }

    // A database trigger can create the same profile concurrently with this
    // recovery path. Re-read once before returning a meaningful failure.
    const { data: racedProfile, error: rereadError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (racedProfile && !rereadError) {
      return racedProfile as Profile;
    }

    throw insertError || rereadError || new Error('Profile creation did not return a database record.');
  } catch (err) {
    console.error('Supabase profile store error:', err);
    throw err;
  }
}

export async function updateProfile(
  userId: string,
  updates: Partial<Omit<Profile, 'id' | 'email' | 'created_at'>>
): Promise<Profile> {
  const updatedFields = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .update(updatedFields)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}
