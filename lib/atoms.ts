// lib/atoms.ts
import { atom } from 'jotai';

export type TranslationCode = 'kjv' | 'asv' | 'web';

export interface Profile {
  id: string;
  displayName: string;
  preferredTranslation: TranslationCode;
}

export const profileAtom = atom<Profile | null>(null);
