// lib/prayer.ts
import { supabase } from '@/lib/supabase';
import type { TranslationCode } from '@/lib/atoms';

export interface ResolvedVerse {
  reference: string;
  translation: TranslationCode;
  verseText: string;
  explanation: string;
  sortOrder: number;
}

export interface PrayerResult {
  prayerId: string;
  detectedNeeds: string[];
  verses: ResolvedVerse[];
  verseFetchFailed: boolean;
}

interface EdgeFunctionVerse {
  reference: string;
  translation: TranslationCode;
  verse_text: string;
  explanation: string;
  sort_order: number;
}

interface EdgeFunctionResponse {
  detected_needs: string[];
  verses: EdgeFunctionVerse[];
}

export async function submitPrayer(content: string, preferredTranslation: TranslationCode): Promise<PrayerResult> {
  const { data: prayer, error: insertError } = await supabase
    .from('prayers')
    .insert({ content, input_method: 'text' })
    .select('id')
    .single();

  if (insertError || !prayer) {
    throw insertError ?? new Error('Failed to save prayer');
  }

  const { data, error: invokeError } = await supabase.functions.invoke<EdgeFunctionResponse>('get-prayer-verses', {
    body: {
      prayer_id: prayer.id,
      prayer_text: content,
      preferred_translation: preferredTranslation,
    },
  });

  if (invokeError || !data) {
    return { prayerId: prayer.id, detectedNeeds: [], verses: [], verseFetchFailed: true };
  }

  return {
    prayerId: prayer.id,
    detectedNeeds: data.detected_needs ?? [],
    verses: (data.verses ?? []).map((v) => ({
      reference: v.reference,
      translation: v.translation,
      verseText: v.verse_text,
      explanation: v.explanation,
      sortOrder: v.sort_order,
    })),
    verseFetchFailed: false,
  };
}
