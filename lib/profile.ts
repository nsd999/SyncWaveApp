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
  const cleanDisplay = displayName || email.split('@')[0] || 'Member';
  
  try {
    const { data: existingProfile, error: getError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      return existingProfile as Profile;
    }

    const uniqueUsername = await generateUniqueUsername(email);
    const newProfile = {
      id: userId,
      email: email.toLowerCase().trim(),
      username: uniqueUsername,
      display_name: cleanDisplay,
      avatar_url: `https://picsum.photos/seed/${uniqueUsername}/150`
    };

    const { data: insertedProfile, error: insertError } = await supabase
      .from('profiles')
      .insert([newProfile])
      .select()
      .single();

    if (insertError) {
      console.warn('Profile insertion error:', insertError);
      throw insertError;
    }
    
    return insertedProfile as Profile;
  } catch (err: any) {
    console.error('Supabase profile store error:', err);
    return {
      id: userId,
      email: email.toLowerCase().trim(),
      username: email.split('@')[0] || 'member',
      display_name: cleanDisplay,
      avatar_url: `https://picsum.photos/seed/${userId}/150`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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
