import { assertEquals } from "jsr:@std/assert@1.0.9";
import { runVersePipeline } from "./pipeline.ts";
import type { VerseReferenceProvider, VerseIdentification } from "./providers/verse-reference-provider.ts";
import type { BibleTextProvider, TranslationCode } from "./providers/bible-text-provider.ts";

function fakeReferenceProvider(result: VerseIdentification): VerseReferenceProvider {
  return { identifyVerses: async () => result };
}

function fakeTextProvider(byKey: Record<string, string | null>): BibleTextProvider {
  return {
    fetchVerse: async (translation: TranslationCode, book: string, chapter: number, verse: number) =>
      byKey[`${translation}:${book}:${chapter}:${verse}`] ?? null,
  };
}

Deno.test("resolves a single-verse reference and formats it correctly", async () => {
  const referenceProvider = fakeReferenceProvider({
    detectedNeeds: ["gratitude"],
    verses: [{ book: "Psalms", chapter: 23, verseStart: 1, verseEnd: 1, explanation: "The Lord provides." }],
  });
  const textProvider = fakeTextProvider({ "kjv:Psalms:23:1": "The LORD is my shepherd." });

  const result = await runVersePipeline("thank you", "kjv", referenceProvider, textProvider);

  assertEquals(result.detectedNeeds, ["gratitude"]);
  assertEquals(result.verses, [
    { reference: "Psalms 23:1", translation: "kjv", verseText: "The LORD is my shepherd.", explanation: "The Lord provides.", sortOrder: 0 },
  ]);
});

Deno.test("concatenates a multi-verse range in order and formats the range reference", async () => {
  const referenceProvider = fakeReferenceProvider({
    detectedNeeds: ["fear"],
    verses: [{ book: "Philippians", chapter: 4, verseStart: 6, verseEnd: 7, explanation: "Peace amid anxiety." }],
  });
  const textProvider = fakeTextProvider({
    "kjv:Philippians:4:6": "Be careful for nothing.",
    "kjv:Philippians:4:7": "And the peace of God.",
  });

  const result = await runVersePipeline("I'm anxious", "kjv", referenceProvider, textProvider);

  assertEquals(result.verses[0].reference, "Philippians 4:6-7");
  assertEquals(result.verses[0].verseText, "Be careful for nothing. And the peace of God.");
});

Deno.test("drops a reference when any verse in its range fails to resolve, keeps the rest, and recompacts sortOrder", async () => {
  const referenceProvider = fakeReferenceProvider({
    detectedNeeds: ["doubt"],
    verses: [
      { book: "Philippians", chapter: 4, verseStart: 6, verseEnd: 7, explanation: "Fails to resolve." },
      { book: "Psalms", chapter: 23, verseStart: 1, verseEnd: 1, explanation: "Resolves fine." },
    ],
  });
  const textProvider = fakeTextProvider({
    "kjv:Philippians:4:6": "Be careful for nothing.",
    // 4:7 intentionally missing -> null -> whole range dropped
    "kjv:Psalms:23:1": "The LORD is my shepherd.",
  });

  const result = await runVersePipeline("I doubt", "kjv", referenceProvider, textProvider);

  assertEquals(result.verses.length, 1);
  assertEquals(result.verses[0].reference, "Psalms 23:1");
  assertEquals(result.verses[0].sortOrder, 0);
});

Deno.test("returns an empty verse list without crashing when no references are given", async () => {
  const referenceProvider = fakeReferenceProvider({ detectedNeeds: ["gratitude"], verses: [] });
  const textProvider = fakeTextProvider({});

  const result = await runVersePipeline("thank you", "kjv", referenceProvider, textProvider);

  assertEquals(result.detectedNeeds, ["gratitude"]);
  assertEquals(result.verses, []);
});
