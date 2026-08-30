import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.9";
import { ClaudeVerseReferenceProvider, type AnthropicMessagesClient } from "./verse-reference-provider.ts";

function fakeClient(content: { type: string; [key: string]: unknown }[]): { messages: AnthropicMessagesClient } {
  return { messages: { create: async () => ({ content }) } };
}

Deno.test("identifyVerses maps a tool_use response to camelCase verse references", async () => {
  const client = fakeClient([
    {
      type: "tool_use",
      input: {
        detected_needs: ["grief", "fear"],
        verses: [
          { book: "Philippians", chapter: 4, verse_start: 6, verse_end: 7, explanation: "Peace amid anxiety." },
          { book: "Psalms", chapter: 23, verse_start: 1, verse_end: 4, explanation: "Comfort in fear." },
        ],
      },
    },
  ]);
  const provider = new ClaudeVerseReferenceProvider(client);
  const result = await provider.identifyVerses("I'm scared and grieving", "kjv");
  assertEquals(result.detectedNeeds, ["grief", "fear"]);
  assertEquals(result.verses.length, 2);
  assertEquals(result.verses[0], { book: "Philippians", chapter: 4, verseStart: 6, verseEnd: 7, explanation: "Peace amid anxiety." });
  assertEquals(result.verses[1].book, "Psalms");
});

Deno.test("identifyVerses throws when Claude returns no tool_use block", async () => {
  const client = fakeClient([{ type: "text", text: "I cannot help with that." }]);
  const provider = new ClaudeVerseReferenceProvider(client);
  await assertRejects(() => provider.identifyVerses("hello", "kjv"));
});
