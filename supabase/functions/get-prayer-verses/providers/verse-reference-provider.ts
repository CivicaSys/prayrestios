import type { TranslationCode } from "./bible-text-provider.ts";

export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
] as const;

export interface VerseReference {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  explanation: string;
}

export interface VerseIdentification {
  detectedNeeds: string[];
  verses: VerseReference[];
}

export interface VerseReferenceProvider {
  identifyVerses(prayerText: string, preferredTranslation: TranslationCode): Promise<VerseIdentification>;
}

// Structural type for the slice of the Anthropic SDK we use, so this file
// (and its tests) never need to import the real SDK — only supabase/functions/get-prayer-verses/index.ts does.
export interface AnthropicMessagesClient {
  create(params: Record<string, unknown>): Promise<{ content: { type: string; [key: string]: unknown }[] }>;
}

const TOOL_NAME = "record_verse_selection";

const SYSTEM_PROMPT = `You are a compassionate Bible scholar helping someone who just prayed.

First, identify the primary emotional or spiritual need(s) reflected in this prayer — for example: anger, grief, fear, temptation, doubt, loneliness, gratitude, crisis, guidance-seeking, thanksgiving. Name one to three; you may use a need not in this list if it fits better.

Then select 3-5 Bible verses that speak directly to those specific needs. For each verse, return its reference and a one-sentence explanation connecting it to the need(s) you identified.

Do not return verse text. Never quote or paraphrase the verse itself — reference and explanation only.`;

interface RawToolInput {
  detected_needs: string[];
  verses: {
    book: string;
    chapter: number;
    verse_start: number;
    verse_end: number;
    explanation: string;
  }[];
}

export class ClaudeVerseReferenceProvider implements VerseReferenceProvider {
  constructor(
    private readonly client: { messages: AnthropicMessagesClient },
    private readonly model = "claude-sonnet-5",
  ) {}

  async identifyVerses(prayerText: string, preferredTranslation: TranslationCode): Promise<VerseIdentification> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Preferred translation (for tone/register only — do not quote it): ${preferredTranslation.toUpperCase()}\n\nPrayer:\n${prayerText}`,
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the detected emotional/spiritual needs and selected Bible verse references for this prayer.",
          input_schema: {
            type: "object",
            properties: {
              detected_needs: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 3,
              },
              verses: {
                type: "array",
                minItems: 3,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    book: { type: "string", enum: BIBLE_BOOKS },
                    chapter: { type: "integer", minimum: 1 },
                    verse_start: { type: "integer", minimum: 1 },
                    verse_end: { type: "integer", minimum: 1 },
                    explanation: { type: "string" },
                  },
                  required: ["book", "chapter", "verse_start", "verse_end", "explanation"],
                },
              },
            },
            required: ["detected_needs", "verses"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || !("input" in toolUse)) {
      throw new Error("Claude did not return a tool_use block for verse selection");
    }
    const input = toolUse.input as RawToolInput;

    return {
      detectedNeeds: input.detected_needs,
      verses: input.verses.map((v) => ({
        book: v.book,
        chapter: v.chapter,
        verseStart: v.verse_start,
        verseEnd: v.verse_end,
        explanation: v.explanation,
      })),
    };
  }
}
