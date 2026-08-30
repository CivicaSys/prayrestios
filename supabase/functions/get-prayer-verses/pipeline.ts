import type { BibleTextProvider, TranslationCode } from "./providers/bible-text-provider.ts";
import type { VerseReference, VerseReferenceProvider } from "./providers/verse-reference-provider.ts";

export interface ResolvedVerse {
  reference: string;
  translation: TranslationCode;
  verseText: string;
  explanation: string;
  sortOrder: number;
}

export interface VersePipelineResult {
  detectedNeeds: string[];
  verses: ResolvedVerse[];
}

function formatReference(v: VerseReference): string {
  return v.verseStart === v.verseEnd
    ? `${v.book} ${v.chapter}:${v.verseStart}`
    : `${v.book} ${v.chapter}:${v.verseStart}-${v.verseEnd}`;
}

async function resolveVerseText(
  textProvider: BibleTextProvider,
  translation: TranslationCode,
  v: VerseReference,
): Promise<string | null> {
  const verseNumbers: number[] = [];
  for (let n = v.verseStart; n <= v.verseEnd; n++) verseNumbers.push(n);

  const parts = await Promise.all(
    verseNumbers.map((n) => textProvider.fetchVerse(translation, v.book, v.chapter, n)),
  );
  if (parts.some((p) => p === null)) return null;
  return (parts as string[]).join(" ");
}

/**
 * Two-stage anti-hallucination pipeline: `referenceProvider` identifies needs
 * and verse *references* only; `textProvider` resolves the actual quoted text.
 * A reference whose range fails to resolve (any verse in it) is dropped
 * entirely rather than shown partially or backfilled with LLM text.
 */
export async function runVersePipeline(
  prayerText: string,
  preferredTranslation: TranslationCode,
  referenceProvider: VerseReferenceProvider,
  textProvider: BibleTextProvider,
): Promise<VersePipelineResult> {
  const { detectedNeeds, verses } = await referenceProvider.identifyVerses(prayerText, preferredTranslation);

  const resolutions = await Promise.all(
    verses.map(async (v) => {
      const text = await resolveVerseText(textProvider, preferredTranslation, v);
      if (text === null) return null;
      return {
        reference: formatReference(v),
        translation: preferredTranslation,
        verseText: text,
        explanation: v.explanation,
      };
    }),
  );

  const resolved: ResolvedVerse[] = resolutions
    .filter((r): r is Omit<ResolvedVerse, "sortOrder"> => r !== null)
    .map((r, i) => ({ ...r, sortOrder: i }));

  return { detectedNeeds, verses: resolved };
}
