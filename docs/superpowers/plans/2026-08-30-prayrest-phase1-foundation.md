# PrayRest Phase 1 — Foundation & Core Prayer Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, testable slice of PrayRest — email/password auth with verification and password reset, a translation-picker onboarding step, a Pray screen that runs the two-stage AI+Bible-API verse pipeline (including emotional/spiritual need detection), a verse overlay with an empathetic acknowledgment line and native Listen (TTS), and a History screen (list/expand/mark answered) — all behind RLS on `profiles`/`prayers`/`prayer_verses`.

**Architecture:** A fresh Supabase project backs the app (Postgres + Auth + Edge Functions). The `get-prayer-verses` Deno edge function implements the anti-hallucination two-stage pipeline: a Claude tool-call identifies emotional/spiritual needs and verse *references only* (never text), then a small `BibleTextProvider` resolves each reference against the wldeh/bible-api public-domain CDN — the only source of verse text ever shown to the user. The pipeline is a pure, provider-injected function so it's unit-testable with Deno's test runner without hitting either external API. On the client, all of this repo's existing StarterStories example screens are deleted and replaced with PrayRest's own auth, onboarding, and tab screens (Expo Router + Jotai + `@supabase/supabase-js`), following the patterns already established in `app/_layout.tsx` and `lib/supabase.ts`.

**Tech Stack:** Expo (managed, existing `ios/` prebuild), Expo Router, React Native, TypeScript, Jotai, Supabase (Postgres/Auth/Edge Functions), Deno edge runtime with `npm:` specifiers, `@anthropic-ai/sdk` (Claude Sonnet 5), wldeh/bible-api (jsDelivr CDN, no auth), `expo-speech` (native TTS), `@react-native-async-storage/async-storage`, `expo-linking` (password-reset deep link).

**Spec:** `docs/superpowers/specs/2026-08-30-prayrest-ios-design.md` (this plan implements §3–§7 for Phase 1 scope defined in §8; §9/§10 inform the testing approach below). Also see `artifacts/prPrompt.md` for carried-forward screen/UX details referenced by the spec, and `artifacts/session-summary-2026-08-30.md` for brainstorming context.

## Global Constraints

- Verse text shown or read aloud to the user is **always** fetched from the wldeh/bible-api CDN — the LLM must never be trusted to produce verse text (spec §3).
- LLM provider for reference identification: **Claude Sonnet 5** (`claude-sonnet-5`), called via `@anthropic-ai/sdk` (`npm:` specifier) from the Deno edge runtime (spec §3, §4).
- `detected_needs` (free-form `text[]`, not a Postgres enum) is a required, named field in the LLM's structured output — not folded into `explanation` (spec §3, post-approval revision).
- `preferred_translation` is a constrained enum: `'kjv' | 'asv' | 'web'`, default `'kjv'` (spec §3, §5). No ESV/NIV/NLT in v1.
- Bible API base: `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/{version}/books/{book}/chapters/{chapter}/verses/{verse}.json`, whole-chapter variant drops `/verses/{verse}`. Version ids are `en-kjv`, `en-asv`, `en-web` (confirmed live against the CDN; note this differs from the bare `kjv`/`asv`/`web` codes used in our own schema/enum — the two are not the same string). Book path segments are the book's full English name, lowercased with spaces removed (e.g. `1 Corinthians` → `1corinthians`, `Song of Solomon` → `songofsolomon`) — confirmed against the live repo's book directory listing.
- Multi-verse ranges are resolved as parallel per-verse fetches and concatenated in order; if any verse in a range fails to resolve, the whole reference is dropped from the result set (never falls back to LLM text) (spec §3).
- RLS in Phase 1 covers `profiles`, `prayers`, `prayer_verses` only — the PWA prompt's RLS section (carried forward unchanged) is the source for the ownership rules on these three tables.
- Testing approach (spec §10, finalized here): Deno's built-in test runner for edge function logic (provider interfaces + pipeline orchestration, including the dropped-reference behavior); manual SQL-based RLS structural checks after the migration, plus manual cross-account RLS verification once auth screens exist; a manual QA checklist (Task 14) covering the golden path and empty/error states for everything without an automated test runner (there is none configured for the RN app itself).

## Decisions made in this plan (not verbatim in the spec)

- **Onboarding gating is device-local, not schema-based.** The spec doesn't add an `onboarding_completed` column, so "show the translation picker once after first login" is tracked via `AsyncStorage` keyed by user id (`lib/onboarding.ts`), not a DB flag. This is a UX nicety, not a security or data boundary — `preferred_translation` already defaults sensibly and is editable anytime from Profile, so a device-local flag (not synced across devices) is an acceptable v1 tradeoff.
- **Requests and Profile tabs exist in Phase 1 as thin shells**, even though their features ship in Phase 2/3. `Profile` gets real functionality now (translation change, sign out) because it's needed to exercise `profiles` RLS and dogfood the app; `Requests` is a one-screen "coming soon" placeholder purely so the tab bar matches the spec's final 4-tab shape (§7) without pretending Phase 2 features exist.
- **Email verification uses the "leave the app, confirm, come back" pattern**, not an in-app deep-link auto-login. This avoids configuring a second deep-link path in Task 1; the user re-opens the app and logs in normally once confirmed. Password reset, by contrast, *requires* a deep link back into the app (there's no web app to host a "set new password" page), so that one is built with `expo-linking` in Task 9.
- **App identity (bundle id, app name, icon) is not changed in Phase 1.** The `ios/` directory is already prebuilt against `com.anonymous.StarterStoryTemplate`; renaming it is native-project surgery that belongs with Phase 4's App Store metadata work, not this phase.
- Phase 1's History screen implements list/expand/mark-answered only (per spec §8's explicit Phase 1 bullet) — filter/search from `prPrompt.md`'s fuller History description is left for a later phase.

---

### Task 1: Supabase project setup, secrets, and native dependency

**Files:**
- Modify: `.env`
- Modify: `package.json`, `package-lock.json`
- Create: `supabase/config.toml`, `supabase/functions/`, `supabase/migrations/` (via `supabase init`)

**Interfaces:**
- Produces: a linked Supabase project (URL + anon key in `.env`), an `ANTHROPIC_API_KEY` edge function secret, `supabase/` CLI scaffolding that Tasks 2–6 build on, and the `expo-speech` package that Task 11 imports as `import * as Speech from 'expo-speech'`.

- [ ] **Step 1: Confirm the Supabase CLI is usable**

Run: `npx supabase --version`
Expected: prints a version number (npx will install it on first run if needed).

- [ ] **Step 2: Scaffold the local Supabase project**

Run: `npx supabase init` from the repo root.
Expected: creates `supabase/config.toml`, `supabase/functions/`, `supabase/migrations/`. When prompted about VS Code settings, either answer is fine.

- [ ] **Step 3: Create a fresh Supabase project**

Via the Supabase dashboard (https://supabase.com/dashboard), create a **new** project named `prayrest` — do not reuse the project currently referenced in `.env`, per spec §2 ("fresh Supabase project; schema is net-new, no data migration"). Note the project's Project URL, `anon` public key, and project ref (visible in Project Settings → API and the URL itself).

- [ ] **Step 4: Link the CLI to the new project**

Run: `npx supabase login` (opens a browser to authenticate), then `npx supabase link --project-ref <your-project-ref>`.
Expected: CLI reports the project is linked; you'll be prompted for the database password you set when creating the project.

- [ ] **Step 5: Point the app at the new project**

Edit `.env`, replacing the existing values:
```
EXPO_PUBLIC_SUPABASE_URL=<new project URL, e.g. https://xxxxx.supabase.co>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<new project anon key>
```

- [ ] **Step 6: Set the Anthropic API key as an edge function secret**

Run: `npx supabase secrets set ANTHROPIC_API_KEY=<your Anthropic API key>`
Expected: CLI confirms the secret was set. (`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically into edge functions by Supabase — no need to set those.)

- [ ] **Step 7: Configure Auth email confirmation and redirect URLs**

In the Supabase dashboard for the new project: under Authentication → Providers → Email, confirm "Confirm email" is enabled (it's the default). Under Authentication → URL Configuration → Redirect URLs, add `starterstorytemplate://**` (matches the `scheme` already set in `app.json`) so the password-reset deep link built in Task 9 is allowed.

- [ ] **Step 8: Install `expo-speech`**

Run: `npx expo install expo-speech`
Expected: `expo-speech` and its correct version-pinned entry are added to `package.json`/`package-lock.json`.

- [ ] **Step 9: Verify the app still boots against the new project**

Run: `npx expo start`, open in iOS Simulator.
Expected: app loads to the existing (not-yet-replaced) welcome screen with no red-box Supabase env errors in the console.

- [ ] **Step 10: Commit**

```bash
git add .env package.json package-lock.json supabase/config.toml
git commit -m "chore: link fresh Supabase project, add expo-speech"
```

---

### Task 2: Database schema & RLS migration

**Files:**
- Create: `supabase/migrations/<timestamp>_phase1_schema.sql`

**Interfaces:**
- Produces: tables `public.profiles`, `public.prayers`, `public.prayer_verses`; enum `public.translation_code` (`'kjv' | 'asv' | 'web'`); a trigger that auto-creates a `profiles` row on signup, reading `display_name` from `auth.users.raw_user_meta_data->>'display_name'` — this is the contract Task 8's `supabase.auth.signUp({ options: { data: { display_name } } })` call relies on.

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new phase1_schema`
Expected: creates an empty `supabase/migrations/<timestamp>_phase1_schema.sql`.

- [ ] **Step 2: Write the schema, trigger, and RLS policies**

Replace the file's contents with:

```sql
-- Enums
create type public.translation_code as enum ('kjv', 'asv', 'web');
create type public.reminder_channel as enum ('email', 'sms', 'push');
create type public.prayer_input_method as enum ('text', 'voice');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  preferred_translation public.translation_code not null default 'kjv',
  reminder_enabled boolean not null default false,
  reminder_time time,
  reminder_days text[],
  reminder_channel public.reminder_channel not null default 'push',
  push_token text,
  phone_number text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prayers
create table public.prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null,
  input_method public.prayer_input_method not null default 'text',
  detected_needs text[],
  is_answered boolean not null default false,
  answered_at timestamptz,
  answered_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- prayer_verses
create table public.prayer_verses (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayers(id) on delete cascade,
  reference text not null,
  verse_text text not null,
  translation public.translation_code not null,
  explanation text,
  sort_order int not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Friend'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.prayers enable row level security;
alter table public.prayer_verses enable row level security;

-- profiles: readable by all authenticated users; writable only by own user (prPrompt.md RLS section)
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- prayers: users can only read/write their own
create policy "prayers_select_own" on public.prayers
  for select to authenticated using (auth.uid() = user_id);
create policy "prayers_insert_own" on public.prayers
  for insert to authenticated with check (auth.uid() = user_id);
create policy "prayers_update_own" on public.prayers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- prayer_verses: users can only read/write verses for their own prayers
create policy "prayer_verses_select_own" on public.prayer_verses
  for select to authenticated using (
    exists (select 1 from public.prayers p where p.id = prayer_verses.prayer_id and p.user_id = auth.uid())
  );
create policy "prayer_verses_insert_own" on public.prayer_verses
  for insert to authenticated with check (
    exists (select 1 from public.prayers p where p.id = prayer_verses.prayer_id and p.user_id = auth.uid())
  );
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: CLI reports the migration applied successfully to the linked project.

- [ ] **Step 4: Verify RLS is enabled and policies exist**

In the Supabase dashboard SQL editor, run:
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
select tablename, polname from pg_policies where schemaname = 'public' order by tablename, polname;
```
Expected: `rowsecurity = true` for `profiles`, `prayers`, `prayer_verses`; the policy list matches the 6 policy names created above. (Full cross-account behavioral RLS verification happens in Task 14, once real user accounts exist via the app.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add Phase 1 schema, profile-bootstrap trigger, and RLS"
```

---

### Task 3: Bible text provider (Deno) + unit tests

**Files:**
- Create: `supabase/functions/get-prayer-verses/providers/bible-text-provider.ts`
- Test: `supabase/functions/get-prayer-verses/providers/bible-text-provider.test.ts`

**Interfaces:**
- Produces: `TranslationCode` type, `BibleTextProvider` interface with `fetchVerse(translation, book, chapter, verse): Promise<string | null>`, and `WldehBibleTextProvider` class — consumed by Task 5's pipeline via the `BibleTextProvider` interface (not the concrete class), and instantiated directly in Task 6's edge function handler.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/functions/get-prayer-verses/providers/bible-text-provider.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/providers/bible-text-provider.test.ts`
Expected: FAIL — `bible-text-provider.ts` does not exist yet. (If `deno` is not installed, run `brew install deno` first.)

- [ ] **Step 3: Implement the provider**

```typescript
// supabase/functions/get-prayer-verses/providers/bible-text-provider.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/providers/bible-text-provider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-prayer-verses/providers/bible-text-provider.ts supabase/functions/get-prayer-verses/providers/bible-text-provider.test.ts
git commit -m "feat: add wldeh Bible text provider with unit tests"
```

---

### Task 4: Verse reference provider (Claude) + unit tests

**Files:**
- Create: `supabase/functions/get-prayer-verses/providers/verse-reference-provider.ts`
- Test: `supabase/functions/get-prayer-verses/providers/verse-reference-provider.test.ts`

**Interfaces:**
- Consumes: `TranslationCode` from `./bible-text-provider.ts` (Task 3).
- Produces: `VerseReference` (`{ book, chapter, verseStart, verseEnd, explanation }`), `VerseIdentification` (`{ detectedNeeds: string[], verses: VerseReference[] }`), `VerseReferenceProvider` interface with `identifyVerses(prayerText, preferredTranslation): Promise<VerseIdentification>`, and `ClaudeVerseReferenceProvider` class — consumed by Task 5's pipeline via the interface, instantiated in Task 6's handler with a real `Anthropic` client.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/functions/get-prayer-verses/providers/verse-reference-provider.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.9";
import { ClaudeVerseReferenceProvider, type AnthropicMessagesClient } from "./verse-reference-provider.ts";

function fakeClient(content: unknown[]): { messages: AnthropicMessagesClient } {
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/providers/verse-reference-provider.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the provider**

```typescript
// supabase/functions/get-prayer-verses/providers/verse-reference-provider.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/providers/verse-reference-provider.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-prayer-verses/providers/verse-reference-provider.ts supabase/functions/get-prayer-verses/providers/verse-reference-provider.test.ts
git commit -m "feat: add Claude verse-reference provider with unit tests"
```

---

### Task 5: Verse pipeline orchestration + unit tests

**Files:**
- Create: `supabase/functions/get-prayer-verses/pipeline.ts`
- Test: `supabase/functions/get-prayer-verses/pipeline.test.ts`

**Interfaces:**
- Consumes: `TranslationCode`, `BibleTextProvider` from `./providers/bible-text-provider.ts` (Task 3); `VerseReference`, `VerseReferenceProvider` from `./providers/verse-reference-provider.ts` (Task 4).
- Produces: `ResolvedVerse` (`{ reference, translation, verseText, explanation, sortOrder }`), `VersePipelineResult` (`{ detectedNeeds, verses: ResolvedVerse[] }`), and `runVersePipeline(prayerText, preferredTranslation, referenceProvider, textProvider): Promise<VersePipelineResult>` — consumed directly by Task 6's edge function handler.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/functions/get-prayer-verses/pipeline.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/pipeline.test.ts`
Expected: FAIL — `pipeline.ts` does not exist yet.

- [ ] **Step 3: Implement the pipeline**

```typescript
// supabase/functions/get-prayer-verses/pipeline.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/pipeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/get-prayer-verses/pipeline.ts supabase/functions/get-prayer-verses/pipeline.test.ts
git commit -m "feat: add verse pipeline orchestration with unit tests"
```

---

### Task 6: `get-prayer-verses` edge function handler

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/get-prayer-verses/index.ts`

**Interfaces:**
- Consumes: `runVersePipeline` from `./pipeline.ts` (Task 5); `WldehBibleTextProvider` from `./providers/bible-text-provider.ts` (Task 3); `ClaudeVerseReferenceProvider` from `./providers/verse-reference-provider.ts` (Task 4).
- Produces: an HTTP endpoint `POST /functions/v1/get-prayer-verses` accepting `{ prayer_id: string, prayer_text: string, preferred_translation: 'kjv'|'asv'|'web' }`, returning `{ detected_needs: string[], verses: { reference, translation, verse_text, explanation, sort_order }[] }` — this exact request/response shape is what Task 11's `lib/prayer.ts` calls via `supabase.functions.invoke('get-prayer-verses', { body })`.

- [ ] **Step 1: Add the shared CORS helper**

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

- [ ] **Step 2: Write the handler**

```typescript
// supabase/functions/get-prayer-verses/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.122.0";
import { corsHeaders } from "../_shared/cors.ts";
import { runVersePipeline } from "./pipeline.ts";
import { ClaudeVerseReferenceProvider } from "./providers/verse-reference-provider.ts";
import { WldehBibleTextProvider } from "./providers/bible-text-provider.ts";
import type { TranslationCode } from "./providers/bible-text-provider.ts";

interface RequestBody {
  prayer_id: string;
  prayer_text: string;
  preferred_translation: TranslationCode;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prayer_id, prayer_text, preferred_translation } = (await req.json()) as RequestBody;

    if (!prayer_id || !prayer_text || !preferred_translation) {
      return new Response(
        JSON.stringify({ error: "prayer_id, prayer_text, and preferred_translation are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    const referenceProvider = new ClaudeVerseReferenceProvider(anthropic);
    const textProvider = new WldehBibleTextProvider();

    const { detectedNeeds, verses } = await runVersePipeline(
      prayer_text,
      preferred_translation,
      referenceProvider,
      textProvider,
    );

    const { error: updateError } = await supabase
      .from("prayers")
      .update({ detected_needs: detectedNeeds })
      .eq("id", prayer_id);
    if (updateError) throw updateError;

    if (verses.length > 0) {
      const { error: insertError } = await supabase.from("prayer_verses").insert(
        verses.map((v) => ({
          prayer_id,
          reference: v.reference,
          verse_text: v.verseText,
          translation: v.translation,
          explanation: v.explanation,
          sort_order: v.sortOrder,
        })),
      );
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        detected_needs: detectedNeeds,
        verses: verses.map((v) => ({
          reference: v.reference,
          translation: v.translation,
          verse_text: v.verseText,
          explanation: v.explanation,
          sort_order: v.sortOrder,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Failed to process prayer verses" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 3: Deploy the function**

Run: `npx supabase functions deploy get-prayer-verses`
Expected: CLI reports a successful deploy.

- [ ] **Step 4: Manually verify end-to-end against the live project**

Create one test user directly in the Supabase dashboard (Authentication → Users → Add user, with auto-confirm), then in the SQL editor insert a test prayer row as that user (or temporarily note their JWT via the dashboard's "impersonate" / API docs page), and call:
```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/get-prayer-verses" \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"prayer_id":"<test-prayer-id>","prayer_text":"I am scared about my job interview tomorrow","preferred_translation":"kjv"}'
```
Expected: HTTP 200 with a JSON body containing 1-3 `detected_needs` and 3-5 `verses`, each with non-empty `verse_text`; confirm in the SQL editor that `prayers.detected_needs` and `prayer_verses` rows were written for that `prayer_id`. (Full test-user creation via the app itself happens once Task 8 ships — this step just proves the function works before the client exists.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/get-prayer-verses/index.ts
git commit -m "feat: wire up get-prayer-verses edge function handler"
```

---

### Task 7: Remove boilerplate screens, scaffold new route skeleton

**Files:**
- Delete: `app/onboarding1.tsx`, `app/onboarding2.tsx`, `app/onboarding3.tsx`, `app/onboardingPathos.tsx`, `app/onboardingEthos.tsx`, `app/onboardingLogos.tsx`, `app/personalization.tsx`, `app/personalizingscreen.tsx`, `app/(tabs)/detail.tsx`, `app/(tabs)/loading.tsx`, `app/(tabs)/settings.tsx`
- Modify: `lib/atoms.ts`
- Create (empty placeholder screens, filled in by later tasks): `app/verify-email.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/onboarding.tsx`, `app/(tabs)/history.tsx`, `app/(tabs)/requests.tsx`, `app/(tabs)/profile.tsx`
- Modify: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`

**Interfaces:**
- Produces: `Profile` type and `profileAtom` in `lib/atoms.ts` — consumed by Task 10 (`_layout.tsx` profile loading), Task 11 (Pray screen), and Task 13 (Profile tab). Produces the route skeleton every later app task fills in.

- [ ] **Step 1: Delete the boilerplate example screens**

```bash
git rm app/onboarding1.tsx app/onboarding2.tsx app/onboarding3.tsx app/onboardingPathos.tsx app/onboardingEthos.tsx app/onboardingLogos.tsx app/personalization.tsx app/personalizingscreen.tsx "app/(tabs)/detail.tsx" "app/(tabs)/loading.tsx" "app/(tabs)/settings.tsx"
```

- [ ] **Step 2: Replace `lib/atoms.ts`**

```typescript
// lib/atoms.ts
import { atom } from 'jotai';

export type TranslationCode = 'kjv' | 'asv' | 'web';

export interface Profile {
  id: string;
  displayName: string;
  preferredTranslation: TranslationCode;
}

export const profileAtom = atom<Profile | null>(null);
```

- [ ] **Step 3: Create placeholder route files**

Each of these gets real content in a later task — for now, a minimal valid screen so the router doesn't error:

```tsx
// app/verify-email.tsx (filled in by Task 8)
import React from 'react';
import { Text, View } from 'react-native';
export default function VerifyEmail() {
  return <View><Text>Verify Email</Text></View>;
}
```
Repeat the same minimal pattern (default-exported component returning a `<Text>` with the screen's name) for `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/onboarding.tsx`, `app/(tabs)/history.tsx`, `app/(tabs)/requests.tsx`, `app/(tabs)/profile.tsx`.

- [ ] **Step 4: Rewrite `app/_layout.tsx`'s stack registration**

```tsx
// app/_layout.tsx
import { supabase } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsSignedIn(!!data.session?.user);
    };
    checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsSignedIn(!!session?.user);
      if (event === 'SIGNED_IN' && session?.user) {
        router.replace('/(tabs)');
      }
    });
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!loaded || isSignedIn === null) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
```
(Task 9 adds password-recovery deep-link handling here; Task 10 adds profile loading. This step establishes the route split first so it's independently reviewable.)

- [ ] **Step 5: Rewrite `app/(tabs)/_layout.tsx`**

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#D4A853' }}>
      <Tabs.Screen name="index" options={{ title: 'Pray' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

- [ ] **Step 6: Verify the app boots and typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (the old `app/(tabs)/index.tsx` still references `sessionsAtom`/`Session` from `lib/atoms.ts`, which no longer exist — if `tsc` fails here, that's expected; Task 11 rewrites that file. If you want a clean typecheck at this checkpoint, also stub `app/(tabs)/index.tsx` to a minimal component here.)

Then run: `npx expo start`, open in iOS Simulator.
Expected: unauthenticated stack loads to `index` (the existing, not-yet-restyled welcome screen) with no crash.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove boilerplate example screens, scaffold Phase 1 route skeleton"
```

---

### Task 8: Auth screens — signup, verify-email, login

**Files:**
- Modify: `app/index.tsx`, `app/signup.tsx`, `app/login.tsx`, `app/verify-email.tsx`

**Interfaces:**
- Consumes: `supabase` client from `lib/supabase.ts`. Relies on Task 2's `handle_new_user` trigger reading `raw_user_meta_data->>'display_name'`.
- Produces: a working signup → email-confirmation → login flow. No new exports consumed elsewhere.

- [ ] **Step 1: Rewrite `app/index.tsx`**

```tsx
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Welcome() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.flexGrow} />
      <Text style={styles.title}>PrayRest</Text>
      <Text style={styles.subtitle}>Tell God about what's on your heart. Then rest, assured.</Text>
      <View style={styles.flexGrow} />
      <TouchableOpacity style={styles.button} onPress={() => router.push('/signup')}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
      <Pressable onPress={() => router.push('/login')}>
        <Text style={styles.signInText}>or Sign In here</Text>
      </Pressable>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  spacer: { height: 40 },
  title: { fontSize: 40, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: '#3D2E1F' },
  subtitle: { fontSize: 18, color: '#6B5A45', marginBottom: 32, textAlign: 'center', paddingHorizontal: 16 },
  flexGrow: { flex: 1 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, paddingHorizontal: 48, borderRadius: 20, marginBottom: 12, width: '100%' },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  signInText: { color: '#3D2E1F', fontSize: 16, textAlign: 'center', textDecorationLine: 'underline', marginBottom: 24 },
});
```

- [ ] **Step 2: Rewrite `app/signup.tsx`**

```tsx
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function SignUp() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (!data.session) {
      router.replace('/verify-email');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Begin your prayer journey</Text>
      <TextInput style={styles.input} placeholder="Your name" value={displayName} onChangeText={setDisplayName} />
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Confirm password" secureTextEntry value={confirm} onChangeText={setConfirm} />
      <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing Up...' : 'Sign Up'}</Text>
      </TouchableOpacity>
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => router.push('/login')}>
          <Text style={styles.footerLink}>Already have an account?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 30, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#3D2E1F' },
  subtitle: { fontSize: 18, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16, width: '100%' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, width: '100%', alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  footer: { marginTop: 24, alignItems: 'center', width: '100%' },
  footerLink: { color: '#3D2E1F', fontSize: 15, fontWeight: 'bold', textDecorationLine: 'underline' },
});
```

- [ ] **Step 3: Fill in `app/verify-email.tsx`**

```tsx
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function VerifyEmail() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent you a confirmation link. Tap it to verify your email, then come back and log in.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
        <Text style={styles.buttonText}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 16, textAlign: 'center' },
  body: { fontSize: 16, color: '#3D2E1F', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, paddingHorizontal: 40, borderRadius: 20 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Rewrite `app/login.tsx`**

```tsx
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Glad to see you here</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Logging In...' : 'Login'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/forgot-password')}>
        <Text style={styles.footerLink}>Forgot password?</Text>
      </TouchableOpacity>
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => router.push('/signup')}>
          <Text style={styles.footerLink}>Need to make a new account?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, color: '#3D2E1F' },
  subtitle: { fontSize: 18, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16, width: '100%' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, width: '100%', alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  footer: { marginTop: 24, alignItems: 'center', width: '100%' },
  footerLink: { color: '#3D2E1F', fontSize: 15, fontWeight: 'bold', textDecorationLine: 'underline', marginTop: 8 },
});
```

- [ ] **Step 5: Manually verify the flow**

Run `npx expo start`, open in iOS Simulator. Sign up with a real-ish email you control (or a Supabase-dashboard-visible one), confirm you land on "Check your email", confirm the confirmation email arrives (check Supabase dashboard → Authentication → Users shows the new user with `email_confirmed_at` null), click the email's confirmation link, then return to the app and log in — confirm you're taken to `/(tabs)` (a placeholder Pray tab for now) and that a matching row now exists in `public.profiles` with the correct `display_name`.

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx app/signup.tsx app/login.tsx app/verify-email.tsx
git commit -m "feat: implement signup, email verification, and login screens"
```

---

### Task 9: Password reset flow (forgot-password, reset-password, deep link)

**Files:**
- Create: `lib/deepLinks.ts`
- Modify: `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/_layout.tsx`

**Interfaces:**
- Produces: `parseAuthDeepLink(url): { type, accessToken, refreshToken }` and `handleAuthDeepLink(url): Promise<boolean>` in `lib/deepLinks.ts`, used only within `app/_layout.tsx`.

- [ ] **Step 1: Write `lib/deepLinks.ts`**

```typescript
// lib/deepLinks.ts
import { supabase } from '@/lib/supabase';

export interface ParsedAuthLink {
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export function parseAuthDeepLink(url: string): ParsedAuthLink {
  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  return {
    type: params.get('type'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  };
}

export async function handleAuthDeepLink(url: string): Promise<boolean> {
  const { type, accessToken, refreshToken } = parseAuthDeepLink(url);
  if (type !== 'recovery' || !accessToken || !refreshToken) {
    return false;
  }
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return true;
}
```

- [ ] **Step 2: Fill in `app/forgot-password.tsx`**

```tsx
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Check your email', 'We sent a link to reset your password.');
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 24, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 3: Fill in `app/reset-password.tsx`**

```tsx
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Password updated', 'Your password has been changed.');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <TextInput style={styles.input} placeholder="New password" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Confirm password" secureTextEntry value={confirm} onChangeText={setConfirm} />
      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Update Password'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 24, textAlign: 'center' },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Wire deep-link handling into `app/_layout.tsx`**

Add the deep-link effect and a guard so the `SIGNED_IN` redirect-to-tabs logic doesn't race with the recovery redirect. Update the file to:

```tsx
// app/_layout.tsx
import { handleAuthDeepLink, parseAuthDeepLink } from '@/lib/deepLinks';
import { supabase } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const skipNextSignedInRedirect = useRef(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsSignedIn(!!data.session?.user);
    };
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsSignedIn(!!session?.user);
      if (event === 'SIGNED_IN' && session?.user) {
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else {
          router.replace('/(tabs)');
        }
      }
    });

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const { type } = parseAuthDeepLink(url);
      if (type === 'recovery') {
        skipNextSignedInRedirect.current = true;
      }
      const isRecovery = await handleAuthDeepLink(url);
      if (isRecovery) {
        router.replace('/reset-password');
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const urlSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      listener?.subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  if (!loaded || isSignedIn === null) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Manually verify (requires a development build, not Expo Go)**

Password-reset deep linking relies on this app's custom URL scheme (`starterstorytemplate://`), which Expo Go does not route into this app. Run `npx expo run:ios` to build and launch a development build in the simulator. From the login screen, tap "Forgot password?", submit your test account's email, open the reset email on the simulator (Mail app signed into a real account, or copy the link and open it via `xcrun simctl openurl booted "<the link>"`), and confirm the app opens directly to "Set a new password", that submitting a new password succeeds, and that you land on the Pray tab signed in.

- [ ] **Step 6: Commit**

```bash
git add lib/deepLinks.ts app/forgot-password.tsx app/reset-password.tsx app/_layout.tsx
git commit -m "feat: implement password reset via deep link"
```

---

### Task 10: Onboarding screen + profile bootstrap wiring

**Files:**
- Create: `lib/onboarding.ts`
- Modify: `app/onboarding.tsx`, `app/_layout.tsx`

**Interfaces:**
- Consumes: `Profile`, `profileAtom`, `TranslationCode` from `lib/atoms.ts` (Task 7).
- Produces: `hasCompletedOnboarding(userId): Promise<boolean>` and `markOnboardingComplete(userId): Promise<void>` in `lib/onboarding.ts`. Populates `profileAtom` from `app/_layout.tsx` on every sign-in — this is what Task 11 (Pray screen) and Task 13 (Profile tab) read via `useAtomValue(profileAtom)` / `useAtom(profileAtom)`.

- [ ] **Step 1: Write `lib/onboarding.ts`**

```typescript
// lib/onboarding.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'prayrest_onboarded_';

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(`${KEY_PREFIX}${userId}`);
  return value === 'true';
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(`${KEY_PREFIX}${userId}`, 'true');
}
```

- [ ] **Step 2: Fill in `app/onboarding.tsx`**

```tsx
import { markOnboardingComplete } from '@/lib/onboarding';
import { profileAtom, type TranslationCode } from '@/lib/atoms';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TRANSLATIONS: { code: TranslationCode; label: string }[] = [
  { code: 'kjv', label: 'King James Version' },
  { code: 'asv', label: 'American Standard Version' },
  { code: 'web', label: 'World English Bible' },
];

export default function Onboarding() {
  const router = useRouter();
  const [profile, setProfile] = useAtom(profileAtom);
  const [selected, setSelected] = useState<TranslationCode>('kjv');
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_translation: selected })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile({ ...profile, preferredTranslation: selected });
    await markOnboardingComplete(profile.id);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose your translation</Text>
      <Text style={styles.subtitle}>You can change this anytime in Profile.</Text>
      {TRANSLATIONS.map((t) => (
        <TouchableOpacity
          key={t.code}
          style={[styles.option, selected === t.code && styles.optionSelected]}
          onPress={() => setSelected(t.code)}
        >
          <Text style={styles.optionText}>{t.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={saving || !profile}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#6B5A45', marginBottom: 32, textAlign: 'center' },
  option: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#eee' },
  optionSelected: { borderColor: '#D4A853', backgroundColor: '#FFF8E7' },
  optionText: { fontSize: 18, color: '#3D2E1F', textAlign: 'center' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 3: Load the profile and route to onboarding-or-tabs in `app/_layout.tsx`**

Add a `loadProfile` helper and use it both on initial session check and on `SIGNED_IN`, and replace the flat `router.replace('/(tabs)')` with an onboarding check:

```tsx
// app/_layout.tsx — apply these changes on top of Task 9's version
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { profileAtom, type Profile } from '@/lib/atoms';
import { handleAuthDeepLink, parseAuthDeepLink } from '@/lib/deepLinks';
import { supabase } from '@/lib/supabase';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSetAtom } from 'jotai';
import React, { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const setProfile = useSetAtom(profileAtom);
  const skipNextSignedInRedirect = useRef(false);

  const loadProfile = async (userId: string): Promise<void> => {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, preferred_translation')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile({
        id: data.id,
        displayName: data.display_name,
        preferredTranslation: data.preferred_translation,
      } satisfies Profile);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const signedIn = !!data.session?.user;
      setIsSignedIn(signedIn);
      if (signedIn) await loadProfile(data.session!.user.id);
    };
    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsSignedIn(!!session?.user);

      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user.id);
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else {
          const onboarded = await hasCompletedOnboarding(session.user.id);
          router.replace(onboarded ? '/(tabs)' : '/onboarding');
        }
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
    });

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const { type } = parseAuthDeepLink(url);
      if (type === 'recovery') {
        skipNextSignedInRedirect.current = true;
      }
      const isRecovery = await handleAuthDeepLink(url);
      if (isRecovery) {
        router.replace('/reset-password');
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const urlSub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      listener?.subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  if (!loaded || isSignedIn === null) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Manually verify**

Log in with a freshly-confirmed account for the first time — confirm you land on "Choose your translation", picking one and continuing takes you to the (still placeholder) Pray tab, and `profiles.preferred_translation` updates in the SQL editor. Sign out and back in with the same account — confirm onboarding is skipped this time.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding.ts app/onboarding.tsx app/_layout.tsx
git commit -m "feat: add onboarding translation picker and profile loading"
```

---

### Task 11: Pray screen — verse pipeline, acknowledgment, verse overlay with Listen

**Files:**
- Create: `lib/prayer.ts`, `lib/needAcknowledgment.ts`, `components/prayer/VerseOverlay.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `profileAtom` from `lib/atoms.ts` (Task 7/10); calls the `get-prayer-verses` edge function built in Task 6 with the exact request/response shape documented there.
- Produces: `submitPrayer(content, preferredTranslation): Promise<PrayerResult>` and `ResolvedVerse`/`PrayerResult` types in `lib/prayer.ts`; `buildAcknowledgment(detectedNeeds): string | null` in `lib/needAcknowledgment.ts`; `VerseOverlay` component — all consumed only within this task's `app/(tabs)/index.tsx`.

- [ ] **Step 1: Write `lib/prayer.ts`**

```typescript
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
```

- [ ] **Step 2: Write `lib/needAcknowledgment.ts`**

```typescript
// lib/needAcknowledgment.ts
const NEED_PHRASES: Record<string, string> = {
  anger: 'anger',
  grief: 'grief',
  fear: 'fear',
  temptation: 'temptation',
  doubt: 'doubt',
  loneliness: 'loneliness',
  gratitude: 'gratitude',
  crisis: 'a crisis',
  'guidance-seeking': 'a need for guidance',
  thanksgiving: 'thanksgiving',
};

function phraseFor(need: string): string {
  return NEED_PHRASES[need.toLowerCase()] ?? need.toLowerCase();
}

export function buildAcknowledgment(detectedNeeds: string[]): string | null {
  if (detectedNeeds.length === 0) return null;
  const phrases = detectedNeeds.map(phraseFor);
  const joined =
    phrases.length === 1
      ? phrases[0]
      : phrases.length === 2
        ? `${phrases[0]} and ${phrases[1]}`
        : `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
  return `It sounds like you're carrying some ${joined} right now.`;
}
```

- [ ] **Step 3: Write `components/prayer/VerseOverlay.tsx`**

```tsx
import { buildAcknowledgment } from '@/lib/needAcknowledgment';
import type { PrayerResult } from '@/lib/prayer';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  result: PrayerResult;
  onClose: () => void;
}

const FALLBACK_MESSAGE = "We couldn't find verses right now, but God heard your prayer. Try again later.";

export function VerseOverlay({ result, onClose }: Props) {
  const [showMore, setShowMore] = useState(false);
  const [listening, setListening] = useState(false);
  const acknowledgment = buildAcknowledgment(result.detectedNeeds);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const toggleListen = (verseText: string) => {
    if (listening) {
      Speech.stop();
      setListening(false);
      return;
    }
    setListening(true);
    Speech.speak(verseText, { onDone: () => setListening(false), onStopped: () => setListening(false) });
  };

  const handleClose = () => {
    Speech.stop();
    onClose();
  };

  const [firstVerse, ...restVerses] = result.verses;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
          {acknowledgment && <Text style={styles.acknowledgment}>{acknowledgment}</Text>}

          {firstVerse ? (
            <View style={styles.verseBlock}>
              <Text style={styles.reference}>{firstVerse.reference}</Text>
              <Text style={styles.verseText}>{firstVerse.verseText}</Text>
              <Text style={styles.explanation}>{firstVerse.explanation}</Text>
              <View style={styles.listenRow}>
                <Text style={styles.listenLabel}>Listen</Text>
                <Switch value={listening} onValueChange={() => toggleListen(firstVerse.verseText)} />
              </View>
            </View>
          ) : (
            <Text style={styles.body}>{FALLBACK_MESSAGE}</Text>
          )}

          {restVerses.length > 0 && !showMore && (
            <TouchableOpacity onPress={() => setShowMore(true)}>
              <Text style={styles.moreLink}>MORE</Text>
            </TouchableOpacity>
          )}

          {showMore &&
            restVerses.map((verse) => (
              <View key={verse.reference} style={styles.verseBlock}>
                <Text style={styles.reference}>{verse.reference}</Text>
                <Text style={styles.verseText}>{verse.verseText}</Text>
                <Text style={styles.explanation}>{verse.explanation}</Text>
              </View>
            ))}

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Amen</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(61,46,31,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFF8E7', borderRadius: 24, maxHeight: '80%' },
  cardContent: { padding: 24 },
  acknowledgment: { fontSize: 16, fontStyle: 'italic', color: '#3D2E1F', marginBottom: 20, textAlign: 'center' },
  verseBlock: { marginBottom: 20 },
  reference: { fontSize: 18, fontWeight: 'bold', color: '#C47B3A', marginBottom: 8 },
  verseText: { fontSize: 18, color: '#3D2E1F', lineHeight: 26, marginBottom: 8 },
  explanation: { fontSize: 14, color: '#6B5A45', fontStyle: 'italic' },
  listenRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  listenLabel: { fontSize: 14, color: '#3D2E1F', marginRight: 8 },
  moreLink: { fontSize: 14, fontWeight: 'bold', color: '#C47B3A', textAlign: 'center', marginBottom: 20 },
  body: { fontSize: 16, color: '#3D2E1F', textAlign: 'center', marginBottom: 20 },
  closeButton: { backgroundColor: '#D4A853', borderRadius: 20, paddingVertical: 16, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

Note: `result.verses` can be empty even when `verseFetchFailed` is `false` (every reference the LLM returned failed to resolve) — the `firstVerse` ternary above shows the same gentle fallback message in that case, matching `prPrompt.md`'s "Key UX Details" error-handling guidance.

- [ ] **Step 4: Rewrite `app/(tabs)/index.tsx`**

```tsx
import { VerseOverlay } from '@/components/prayer/VerseOverlay';
import { profileAtom } from '@/lib/atoms';
import { submitPrayer, type PrayerResult } from '@/lib/prayer';
import { useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';

export default function PrayScreen() {
  const profile = useAtomValue(profileAtom);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PrayerResult | null>(null);

  const handleAmen = async () => {
    if (!content.trim() || !profile) return;
    setSubmitting(true);
    try {
      const prayerResult = await submitPrayer(content.trim(), profile.preferredTranslation);
      setResult(prayerResult);
      setContent('');
    } catch {
      Alert.alert('Something went wrong', 'We could not save your prayer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.heading}>What's on your heart today?</Text>
      <TextInput
        style={styles.input}
        multiline
        placeholder="Tell God about what's on your heart..."
        placeholderTextColor="#9C8A72"
        value={content}
        onChangeText={setContent}
      />
      <TouchableOpacity
        style={[styles.amenButton, (!content.trim() || submitting) && styles.amenButtonDisabled]}
        onPress={handleAmen}
        disabled={!content.trim() || submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.amenButtonText}>Amen</Text>}
      </TouchableOpacity>

      {result && <VerseOverlay result={result} onClose={() => setResult(null)} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', padding: 24, justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '600', color: '#3D2E1F', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#fff', borderRadius: 16, padding: 20, fontSize: 18, minHeight: 160, textAlignVertical: 'top', color: '#3D2E1F' },
  amenButton: { backgroundColor: '#D4A853', borderRadius: 24, paddingVertical: 18, marginTop: 24, alignItems: 'center' },
  amenButtonDisabled: { opacity: 0.5 },
  amenButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
```

- [ ] **Step 5: Manually verify**

In the simulator, type a prayer expressing a clear emotion (e.g. "I'm anxious about a big decision tomorrow"), tap Amen. Confirm: a loading spinner shows briefly, the overlay appears with an italic acknowledgment line naming the detected need(s), the first verse + reference + explanation + a Listen toggle, tapping Listen speaks the verse aloud (and toggles back off when tapped again or when speech finishes), tapping MORE reveals the remaining verses, and tapping Amen closes the overlay and clears the input. Confirm in the SQL editor that a `prayers` row (with `detected_needs` populated) and matching `prayer_verses` rows exist.

- [ ] **Step 6: Commit**

```bash
git add lib/prayer.ts lib/needAcknowledgment.ts components/prayer/VerseOverlay.tsx "app/(tabs)/index.tsx"
git commit -m "feat: implement Pray screen with verse pipeline and overlay"
```

---

### Task 12: History screen (list, expand, mark answered)

**Files:**
- Modify: `app/(tabs)/history.tsx`

**Interfaces:**
- Consumes: `supabase` client from `lib/supabase.ts`; reads `prayers`/`prayer_verses` rows written by Task 11's flow.

- [ ] **Step 1: Fill in `app/(tabs)/history.tsx`**

```tsx
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface PrayerRow {
  id: string;
  content: string;
  is_answered: boolean;
  answered_note: string | null;
  created_at: string;
}

interface VerseRow {
  id: string;
  reference: string;
  verse_text: string;
  explanation: string | null;
  sort_order: number;
}

export default function HistoryScreen() {
  const [prayers, setPrayers] = useState<PrayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versesByPrayer, setVersesByPrayer] = useState<Record<string, VerseRow[]>>({});
  const [noteDraft, setNoteDraft] = useState('');

  const loadPrayers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prayers')
      .select('id, content, is_answered, answered_note, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setPrayers(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPrayers();
    }, [loadPrayers]),
  );

  const toggleExpand = async (prayerId: string) => {
    if (expandedId === prayerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(prayerId);
    if (!versesByPrayer[prayerId]) {
      const { data } = await supabase
        .from('prayer_verses')
        .select('id, reference, verse_text, explanation, sort_order')
        .eq('prayer_id', prayerId)
        .order('sort_order');
      setVersesByPrayer((prev) => ({ ...prev, [prayerId]: data ?? [] }));
    }
  };

  const markAnswered = async (prayerId: string) => {
    const { error } = await supabase
      .from('prayers')
      .update({ is_answered: true, answered_at: new Date().toISOString(), answered_note: noteDraft.trim() || null })
      .eq('id', prayerId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNoteDraft('');
    loadPrayers();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#D4A853" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={prayers}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <Text style={styles.emptyText}>Your prayer journey starts with one prayer. Go ahead — He's listening.</Text>
      }
      renderItem={({ item }) => {
        const expanded = expandedId === item.id;
        return (
          <TouchableOpacity style={styles.card} onPress={() => toggleExpand(item.id)} activeOpacity={0.85}>
            <View style={styles.cardHeader}>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
              {item.is_answered && <Text style={styles.answeredBadge}>Answered</Text>}
            </View>
            <Text style={styles.content} numberOfLines={expanded ? undefined : 2}>
              {item.content}
            </Text>

            {expanded && (
              <View style={styles.expandedSection}>
                {(versesByPrayer[item.id] ?? []).map((verse) => (
                  <View key={verse.id} style={styles.verseBlock}>
                    <Text style={styles.reference}>{verse.reference}</Text>
                    <Text style={styles.verseText}>{verse.verse_text}</Text>
                    <TouchableOpacity onPress={() => Speech.speak(verse.verse_text)}>
                      <Text style={styles.listenLink}>Listen</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {item.is_answered ? (
                  item.answered_note && <Text style={styles.answeredNote}>{item.answered_note}</Text>
                ) : (
                  <View style={styles.markAnsweredRow}>
                    <TextInput
                      style={styles.noteInput}
                      placeholder="How was this answered? (optional)"
                      value={noteDraft}
                      onChangeText={setNoteDraft}
                    />
                    <TouchableOpacity style={styles.markButton} onPress={() => markAnswered(item.id)}>
                      <Text style={styles.markButtonText}>Mark Answered</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDF8F0' },
  listContent: { padding: 16 },
  emptyText: { textAlign: 'center', color: '#6B5A45', fontSize: 16, marginTop: 60, paddingHorizontal: 32 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  date: { fontSize: 12, color: '#9C8A72' },
  answeredBadge: { fontSize: 12, fontWeight: 'bold', color: '#6B8E23' },
  content: { fontSize: 16, color: '#3D2E1F' },
  expandedSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16 },
  verseBlock: { marginBottom: 12 },
  reference: { fontSize: 14, fontWeight: 'bold', color: '#C47B3A' },
  verseText: { fontSize: 14, color: '#3D2E1F', marginTop: 4 },
  listenLink: { fontSize: 13, color: '#C47B3A', marginTop: 4, textDecorationLine: 'underline' },
  answeredNote: { fontSize: 14, color: '#6B8E23', fontStyle: 'italic', marginTop: 4 },
  markAnsweredRow: { marginTop: 8 },
  noteInput: { backgroundColor: '#f7f2e9', borderRadius: 10, padding: 10, fontSize: 14, marginBottom: 8 },
  markButton: { backgroundColor: '#6B8E23', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  markButtonText: { color: '#fff', fontWeight: 'bold' },
});
```

- [ ] **Step 2: Manually verify**

Pray a few times from the Pray tab, then switch to History. Confirm: newest-first ordering, empty state before any prayers exist, tapping a card expands it to show full content + verses with working Listen links, tapping "Mark Answered" (with and without a note) flips the badge to "Answered" and persists across a re-fetch (backgrounding/reopening the tab).

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/history.tsx"
git commit -m "feat: implement History screen with expand and mark-answered"
```

---

### Task 13: Profile tab + Requests stub + tab bar polish

**Files:**
- Modify: `app/(tabs)/profile.tsx`, `app/(tabs)/requests.tsx`

**Interfaces:**
- Consumes: `profileAtom`, `TranslationCode` from `lib/atoms.ts` (Task 7/10).

- [ ] **Step 1: Fill in `app/(tabs)/profile.tsx`**

```tsx
import { profileAtom, type TranslationCode } from '@/lib/atoms';
import { supabase } from '@/lib/supabase';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TRANSLATIONS: { code: TranslationCode; label: string }[] = [
  { code: 'kjv', label: 'King James Version' },
  { code: 'asv', label: 'American Standard Version' },
  { code: 'web', label: 'World English Bible' },
];

export default function ProfileScreen() {
  const [profile, setProfile] = useAtom(profileAtom);
  const [saving, setSaving] = useState(false);

  const changeTranslation = async (code: TranslationCode) => {
    if (!profile || code === profile.preferredTranslation) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ preferred_translation: code }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile({ ...profile, preferredTranslation: code });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!profile) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile.displayName}</Text>

      <Text style={styles.sectionTitle}>Preferred Translation</Text>
      {TRANSLATIONS.map((t) => (
        <TouchableOpacity
          key={t.code}
          style={[styles.option, profile.preferredTranslation === t.code && styles.optionSelected]}
          onPress={() => changeTranslation(t.code)}
          disabled={saving}
        >
          <Text style={styles.optionText}>{t.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', padding: 24 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 24, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#6B5A45', marginBottom: 12, textTransform: 'uppercase' },
  option: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: '#eee' },
  optionSelected: { borderColor: '#D4A853', backgroundColor: '#FFF8E7' },
  optionText: { fontSize: 16, color: '#3D2E1F' },
  signOutButton: { marginTop: 40, alignItems: 'center' },
  signOutText: { color: '#C47B3A', fontSize: 16, fontWeight: 'bold' },
});
```

- [ ] **Step 2: Fill in `app/(tabs)/requests.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RequestsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Prayer Requests</Text>
      <Text style={styles.body}>Sharing and praying for others' requests is coming in a future update.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDF8F0', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#3D2E1F', marginBottom: 12 },
  body: { fontSize: 15, color: '#6B5A45', textAlign: 'center' },
});
```

- [ ] **Step 3: Manually verify**

Confirm all 4 tabs (Pray, History, Requests, Profile) render without error. On Profile, tap a different translation and confirm `profiles.preferred_translation` updates in the SQL editor and the selected pill updates; tap Sign Out and confirm you land back on the Welcome screen. Log back in and confirm the previously-selected translation is still shown (proves it round-trips through `loadProfile` in `_layout.tsx`, not just local state).

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/profile.tsx" "app/(tabs)/requests.tsx"
git commit -m "feat: implement Profile tab and Requests placeholder"
```

---

### Task 14: Manual QA checklist and cross-account RLS verification

**Files:**
- Create: `docs/superpowers/plans/2026-08-30-prayrest-phase1-qa-checklist.md`

**Interfaces:**
- None — this task exercises everything built in Tasks 1–13 end to end and closes out spec §10's Phase-1 testing approach.

- [ ] **Step 1: Run the full Deno test suite one more time**

Run: `deno test --allow-net supabase/functions/get-prayer-verses/`
Expected: all tests from Tasks 3–5 pass together (10 tests total).

- [ ] **Step 2: Cross-account RLS verification**

Create a second test account (Account B) through the app itself (Task 8's signup flow). While signed in as Account B, in the app or via the Supabase JS client / SQL editor using Account B's JWT, attempt:
- `select * from prayers` — confirm it returns only Account B's prayers, never Account A's.
- `select * from prayer_verses where prayer_id = '<an Account A prayer id>'` — confirm zero rows.
- `update prayers set is_answered = true where id = '<an Account A prayer id>'` — confirm it affects 0 rows (RLS blocks it, not a hard error, since the `USING` clause simply excludes the row).
- `select * from profiles` — confirm it returns **both** accounts' profiles (profiles are readable by all authenticated users per policy), but an `update profiles set display_name = 'x' where id = '<Account A id>'` from Account B affects 0 rows.

- [ ] **Step 3: Write the golden-path + empty/error-state QA checklist**

```markdown
# PrayRest Phase 1 — Manual QA Checklist

Run this against a real device or simulator build before considering Phase 1 done.

## Golden path
- [ ] Sign up with a new account (name, email, password) → routed to "Check your email"
- [ ] Confirmation email arrives; clicking it confirms the account (dashboard shows `email_confirmed_at`)
- [ ] Log in with the confirmed account → routed to onboarding (first time only)
- [ ] Pick a translation on onboarding → routed to Pray tab; `profiles.preferred_translation` updated
- [ ] Log out and back in → onboarding is skipped, straight to Pray tab
- [ ] Type a prayer with a clear emotional theme, tap Amen → verse overlay appears with an acknowledgment line, first verse, explanation, working Listen toggle, MORE reveals remaining verses
- [ ] Closing the overlay clears the input; the prayer appears at the top of History
- [ ] Expand a History card → shows full content, all verses, Listen works per verse
- [ ] Mark a prayer answered (with and without a note) → badge updates, persists after leaving and returning to the tab
- [ ] Change translation from Profile → subsequent prayers/verse text use the new translation
- [ ] Forgot password → email arrives → deep link opens the app to "Set a new password" (requires a dev build, not Expo Go) → new password works on next login

## Empty / error states
- [ ] History tab with zero prayers shows the warm empty state, not a blank screen
- [ ] Submitting a prayer while offline (airplane mode) shows the "something went wrong" alert, not a crash
- [ ] If the edge function fails or every returned reference fails to resolve, the overlay shows the gentle fallback message ("We couldn't find verses right now, but God heard your prayer...") instead of an empty/broken card
- [ ] Wrong password on login shows a clear inline error, not a silent failure
- [ ] Mismatched passwords on signup / reset-password are caught before hitting the network

## Known limitations to carry into later phases
- [ ] KJV verse text occasionally includes inline footnote/Strong's-number artifacts from the source API (see caveat in `bible-text-provider.ts`) — not fixed in Phase 1
- [ ] Onboarding-seen state is device-local (AsyncStorage), not account-synced — reinstalling or switching devices re-shows onboarding
- [ ] Requests tab is a placeholder; Friends/Settings/notifications are not in this phase
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-30-prayrest-phase1-qa-checklist.md
git commit -m "docs: add Phase 1 manual QA checklist"
```
