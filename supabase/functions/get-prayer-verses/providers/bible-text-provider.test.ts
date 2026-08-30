import { assertEquals } from "jsr:@std/assert@1.0.9";
import { WldehBibleTextProvider } from "./bible-text-provider.ts";

function fakeFetch(responses: Record<string, { status: number; body?: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = responses[url];
    if (!match) {
      throw new Error(`Unexpected fetch to ${url}`);
    }
    return new Response(match.body ? JSON.stringify(match.body) : undefined, { status: match.status });
  }) as typeof fetch;
}

Deno.test("fetchVerse builds the correct URL and returns trimmed text", async () => {
  const url =
    "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/en-kjv/books/philippians/chapters/4/verses/6.json";
  const provider = new WldehBibleTextProvider(fakeFetch({ [url]: { status: 200, body: { verse: "6", text: "  Be careful for nothing...  " } } }));
  const result = await provider.fetchVerse("kjv", "Philippians", 4, 6);
  assertEquals(result, "Be careful for nothing...");
});

Deno.test("fetchVerse slugifies multi-word and numbered book names", async () => {
  const url =
    "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/en-asv/books/1corinthians/chapters/13/verses/4.json";
  const provider = new WldehBibleTextProvider(fakeFetch({ [url]: { status: 200, body: { verse: "4", text: "Love suffereth long..." } } }));
  const result = await provider.fetchVerse("asv", "1 Corinthians", 13, 4);
  assertEquals(result, "Love suffereth long...");
});

Deno.test("fetchVerse returns null on a non-ok response", async () => {
  const url = "https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/en-web/books/genesis/chapters/1/verses/999.json";
  const provider = new WldehBibleTextProvider(fakeFetch({ [url]: { status: 404 } }));
  const result = await provider.fetchVerse("web", "Genesis", 1, 999);
  assertEquals(result, null);
});

Deno.test("fetchVerse returns null when the fetch throws", async () => {
  const throwingFetch = (() => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const provider = new WldehBibleTextProvider(throwingFetch);
  const result = await provider.fetchVerse("kjv", "Genesis", 1, 1);
  assertEquals(result, null);
});
