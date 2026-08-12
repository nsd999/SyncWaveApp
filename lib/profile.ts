import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
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
  const docRef = doc(db, 'profiles', userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Profile;
  }

  const uniqueUsername = await generateUniqueUsername(email);
  const cleanDisplay = displayName || email.split('@')[0] || 'Member';

  const newProfile: Profile = {
    id: userId,
    email: email.toLowerCase().trim(),
    username: uniqueUsername,
    display_name: cleanDisplay,
    avatar_url: `https://picsum.photos/seed/${uniqueUsername}/150`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await setDoc(docRef, newProfile);
  return newProfile;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Omit<Profile, 'id' | 'email' | 'created_at'>>
): Promise<Profile> {
  const docRef = doc(db, 'profiles', userId);
  const updatedFields = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  await updateDoc(docRef, updatedFields);
  const updatedSnap = await getDoc(docRef);
  return { id: updatedSnap.id, ...updatedSnap.data() } as Profile;
}
