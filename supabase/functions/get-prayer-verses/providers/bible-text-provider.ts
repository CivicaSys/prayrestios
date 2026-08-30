export type TranslationCode = "kjv" | "asv" | "web";

const TRANSLATION_VERSION_ID: Record<TranslationCode, string> = {
  kjv: "en-kjv",
  asv: "en-asv",
  web: "en-web",
};

export interface BibleTextProvider {
  fetchVerse(
    translation: TranslationCode,
    book: string,
    chapter: number,
    verse: number,
  ): Promise<string | null>;
}

function bookSlug(book: string): string {
  return book.toLowerCase().replace(/\s+/g, "");
}

interface VerseResponseBody {
  verse?: string;
  text?: string;
}

/**
 * Resolves verse text against the wldeh/bible-api static JSON CDN
 * (jsDelivr, no auth, public-domain translations only). This is the only
 * source of verse text ever shown to the user — the LLM never produces it.
 *
 * Known caveat: the KJV source occasionally embeds inline footnote/Strong's
 * annotations in `text` (e.g. Psalm 23:2). Not addressed in Phase 1 — flagged
 * here for a future cleanup pass, not silently swallowed.
 */
export class WldehBibleTextProvider implements BibleTextProvider {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles",
  ) {}

  async fetchVerse(
    translation: TranslationCode,
    book: string,
    chapter: number,
    verse: number,
  ): Promise<string | null> {
    const versionId = TRANSLATION_VERSION_ID[translation];
    const url = `${this.baseUrl}/${versionId}/books/${bookSlug(book)}/chapters/${chapter}/verses/${verse}.json`;
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) return null;
      const body = (await res.json()) as VerseResponseBody;
      if (!body.text) return null;
      return body.text.trim();
    } catch {
      return null;
    }
  }
}
