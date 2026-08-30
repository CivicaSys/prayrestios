# PrayRest for iPhone — Design Spec

**Date:** 2026-08-30
**Status:** Approved for planning
**Source material:** `artifacts/prPrompt.md` (original Lovable.dev PWA build prompt)
**Target:** Native iOS app built on the StarterStories Expo boilerplate in this repo

## 1. Overview

PrayRest is a prayer companion app: users voice or type prayers, receive AI-identified
Bible verses relevant to the prayer's themes, journal reflections, share prayer requests
with friends or non-members, track prayer history and answered prayers, and pray over
others' requests.

This spec re-targets the existing PWA build prompt at a native iPhone app, built inside
this repo's StarterStories boilerplate (Expo + Expo Router + Supabase + Jotai), rather
than porting the Lovable/Vite/React web app directly. It carries forward the PWA prompt's
data model, screens, and edge functions, and changes only what needs to change to be a
correct native app: notification channels, voice I/O, and — most importantly — how Bible
verse text is sourced.

### Non-goals (v1)

Carried over from the PWA prompt's "Future Considerations," unchanged:
organization/church multi-tenancy, subscription billing, prayer groups, offline sync.
Additionally out of scope for v1: content moderation/reporting tooling for public prayer
requests (flagged as an open risk in §9 — worth a decision before public launch, not
before TestFlight).

## 2. Key Decisions From the PWA Prompt

These are the points where this app deliberately diverges from `prPrompt.md`, each
decided during brainstorming:

| Area | PWA prompt | This app |
|---|---|---|
| Backend | Existing Lovable/Supabase project | **Fresh** Supabase project; schema is net-new, no data migration |
| Notifications | Email (Resend) + SMS (Twilio) only; push deferred to "Future" | Add **native push (APNs via Expo push)** as a first-class channel now, alongside email and SMS |
| Voice I/O | Browser Web Speech API (recognition + synthesis), abstracted for future Whisper/ElevenLabs upgrade | **Native on-device APIs**: Apple Speech framework (STT) + `expo-speech`/`AVSpeechSynthesizer` (TTS), same abstraction intent |
| Boilerplate screens | N/A | Existing StarterStories example screens (onboarding1-3, onboardingPathos/Ethos/Logos, personalization, tabs index/detail/settings/loading) are **replaced entirely**, not adapted |
| Scope delivery | One complete build | **Phased roadmap** (§8) — each phase independently shippable |
| Distribution | PWA install banner | **App Store / TestFlight** — compliance items included (§9) |
| AI verse text | LLM asked to return full quoted verse text directly | **LLM never returns verse text.** See §3 — this is the most significant architectural change. |
| Bible translations | ESV, NIV, KJV, NLT (defaults NIV) | **Public-domain only in v1**: KJV, ASV, WEB (default KJV) — see §3 |

## 3. AI Verse Pipeline (Anti-Hallucination Design)

This is the central design change from the PWA prompt. The original prompt asked the LLM
to return the verse reference *and* the full quoted verse text in one call. That risks the
LLM fabricating or mis-quoting scripture — unacceptable for this app. Verse text must come
from a trusted source, never from the model.

**Two-stage pipeline inside the `get-prayer-verses` edge function:**

1. **Need detection + reference identification (LLM, one call).** Send the prayer text to
   Claude (see model choice below) with a structured-output schema of:
   ```
   {
     detected_needs: string[],   // e.g. ["grief", "fear"] — see vocabulary below
     verses: [
       { book, chapter, verse_start, verse_end, explanation }
     ]
   }
   ```
   The system prompt makes emotional/spiritual need detection an explicit, named step
   the model must do *before* choosing verses — not an implicit judgment folded into
   "explanation" — and requires each verse's `explanation` to tie back to one of the
   `detected_needs`. Example system prompt shape:

   > "First, identify the primary emotional or spiritual need(s) reflected in this
   > prayer — for example: anger, grief, fear, temptation, doubt, loneliness,
   > gratitude, crisis, guidance-seeking, thanksgiving. Name one to three. Then select
   > 3-5 Bible verses that speak directly to those specific needs. For each verse,
   > return its reference and a one-sentence explanation connecting it to the
   > need(s) you identified. Do not return verse text — reference and explanation
   > only."

   The vocabulary above is illustrative, not a closed enum — the model can name a need
   not listed if it fits better; `detected_needs` is stored as free-form `text[]`, not a
   Postgres enum, so it isn't a schema bottleneck as real usage reveals more categories.
   The model still must not produce verse text — only needs, references, and
   explanations. The `translation` code the user has selected is passed as context only
   for register/tone, not because the LLM sources text.
2. **Verse text resolution (Bible API).** For each reference returned, the function
   resolves it against the **wldeh/bible-api** static JSON CDN
   (`https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/{version}/books/{book}/chapters/{chapter}/verses/{verse}.json`;
   whole-chapter variant drops the `/verses/{verse}` segment). No auth required, MIT-licensed
   API surface, 200+ Bible versions/languages available. Multi-verse ranges (e.g. "Philippians
   4:6-7") are resolved as N individual verse fetches, run in parallel, and concatenated in
   order. **The text stored in `prayer_verses.verse_text` and shown/read aloud to the user is
   always this fetched text — never anything the LLM produced.** If a reference the LLM
   returns fails to resolve (bad book slug, out-of-range verse), that verse is dropped from
   the result set rather than falling back to LLM-generated text.

`detected_needs` is persisted on the `prayers` row (§5) and returned to the client
alongside the resolved verses, so the Pray screen can show a brief empathetic
acknowledgment (§7) before/with the verse overlay — not just used internally to steer
verse selection.

**LLM provider.** Default to **Claude Sonnet 5** (`claude-sonnet-5`) for the reference
call — good balance of theological/nuance quality against per-request cost and latency for
a synchronous in-flow call. The call sits behind a small `VerseReferenceProvider` interface
(model/vendor swappable — e.g. drop to Haiku 4.5 for cost, or move providers entirely —
without touching the calling code or the Bible-API resolution stage, which is unaffected by
LLM choice).

**Translations (v1).** The public CDN reliably serves public-domain texts, not commercially
copyrighted ones. `preferred_translation` in v1 is a constrained enum: **KJV, ASV, WEB**
(default **KJV**). ESV/NIV/NLT from the PWA prompt are **not available in v1** — they'd
require a licensed API (api.bible, YouVersion) with separate legal/commercial terms. The
resolution stage is written against a small `BibleTextProvider` interface so a licensed
provider can be added later for those translations without changing the pipeline shape or
the `prayer_verses` schema.

## 4. Tech Stack

- **App:** Expo (managed, with the existing `ios/` prebuild directory), Expo Router,
  React Native, TypeScript, Jotai for global state — all as already established in this
  repo's boilerplate.
- **Backend:** Supabase (Auth, Postgres, Edge Functions, Realtime, `pg_cron`) — a fresh
  project, distinct from any project the PWA used.
- **AI:** Anthropic Claude API (`claude-sonnet-5` default), called from the Deno-based
  Supabase Edge Function runtime via the `@anthropic-ai/sdk` npm package (Deno supports
  `npm:` specifiers).
- **Bible text:** wldeh/bible-api static JSON CDN (jsDelivr), no auth.
- **Email:** Resend API via edge function.
- **SMS:** Twilio API via edge function.
- **Push:** Expo push notification service (APNs under the hood) — `expo-notifications`.
- **Voice input:** Apple Speech framework (via an Expo/React Native speech-to-text
  binding), behind a `SpeechInputProvider` interface.
- **Voice output:** `expo-speech` (`AVSpeechSynthesizer`), behind a `SpeechOutputProvider`
  interface.

## 5. Data Model

All ten tables from the PWA prompt carry forward with the changes noted. Column lists
below show only deltas from `prPrompt.md` §"Database Schema" — assume all unlisted
columns are unchanged from that source.

- **`profiles`**
  - `preferred_translation` — enum `'kjv' | 'asv' | 'web'`, default `'kjv'` (was free
    text defaulting to NIV)
  - `reminder_channel` — enum `'email' | 'sms' | 'push'`, default `'push'` (adds push)
  - `push_token` (text, nullable) — Expo push token, registered on notification
    permission grant
  - `notification_preferences` (jsonb) — same purpose as PWA prompt, extended to carry a
    `push` boolean alongside `email`/`sms` per category
  - All other columns (`display_name`, `avatar_url`, `reminder_enabled`, `reminder_time`,
    `reminder_days`, `phone_number`, timestamps) unchanged
- **`prayers`**
  - `detected_needs` (text[], nullable) — the emotional/spiritual need(s) the LLM
    identified for this prayer (§3), e.g. `['grief', 'fear']`. Free-form, not a Postgres
    enum. Populated by `get-prayer-verses` alongside the verse fetch; stays null if that
    call fails (matches the PWA prompt's existing "AI fetch failed" error state — the
    prayer itself is still saved).
  - All other columns unchanged from `prPrompt.md`.
- **`prayer_verses`, `journal_entries`, `prayer_requests`, `prayer_request_recipients`,
  `prayer_request_responses`, `friends`, `invitations`** — unchanged from `prPrompt.md`.
  Note for `prayer_verses.translation`: stores which of `kjv`/`asv`/`web` was actually
  used, and `verse_text` is always Bible-API-sourced per §3.

RLS policies are unchanged from the PWA prompt's "Row-Level Security (RLS) Policies"
section — they describe ownership/visibility rules independent of client platform.

## 6. Edge Functions

- **`get-prayer-verses`** — rewritten per §3's two-stage pipeline. Input: prayer text,
  `preferred_translation`. Output: `detected_needs` (persisted to `prayers`) plus an
  array of `{reference, translation, verse_text, explanation, sort_order}` persisted to
  `prayer_verses` — both returned to the client in one response.
- **`send-notification`** (renamed/generalized from the PWA prompt's
  `send-prayer-request-email` + `send-sms-notification`) — single fan-out function that,
  given an event (new response, new private request) and a recipient, checks
  `notification_preferences` and dispatches to whichever of push (Expo)/email
  (Resend)/SMS (Twilio) the recipient has enabled for that category. Quick "praying for
  you" responses remain in-app-only (no push/SMS/email), matching the PWA prompt.
- **`send-prayer-reminder`** — unchanged in trigger/logic (scheduled `pg_cron`, matches
  user's reminder time/day), extended to dispatch via push when `reminder_channel = 'push'`.
- **`send-invitation-email`** — unchanged from the PWA prompt.

## 7. Screens & Navigation

Bottom tab bar, matching the PWA prompt's four tabs: **Pray** (home), **History**,
**Requests** (with unread badge), **Profile**. All existing StarterStories example screens
are removed; auth (signup/login/verify/reset), onboarding, and the four tabs are built
fresh using the same underlying patterns already in the repo (Jotai atoms, Supabase
auth-state listener in `app/_layout.tsx`, `expo-router` stacks).

Screen behavior (input methods, Amen flow, verse overlay with Listen toggle, journal
prompt, share-as-request flow, History filters/expand, Requests feed tabs, Friends,
Settings, onboarding steps) matches the PWA prompt's "Core Features & Screens" section
directly, with three changes from that section: the voice button drives native STT
instead of Web Speech API, the "Listen" toggle drives native TTS instead of
`SpeechSynthesis`, and the verse overlay opens with a brief, warm acknowledgment line
derived from `detected_needs` (§3) before the first verse — e.g. "It sounds like you're
carrying some grief and fear right now." — rendered from a small static phrase-template
map keyed by need (not another LLM call), falling back to no acknowledgment line if
`detected_needs` is empty or the verse call failed.

**Design system:** carry forward the PWA prompt's "Warm & Peaceful" palette, typography
(Playfair Display/Lora headings, Inter/Source Sans 3 body), rounded corners, warm shadows,
and micro-animations — translated to React Native styling (e.g. `react-native-reanimated`,
already a dependency, for the fade-ins/pulses).

## 8. Phased Roadmap

Each phase is independently shippable and testable before moving to the next.

**Phase 1 — Foundation & core prayer loop**
Email/password auth (signup, email verification, login, password reset), profile
bootstrap, streamlined onboarding (translation picker only), Pray screen (text input +
Amen — voice deferred to Phase 2), the two-stage AI+Bible-API verse pipeline end to end
including emotional/spiritual need detection (§3), verse overlay with the empathetic
acknowledgment line and Listen toggle (native TTS), History screen (list, expand, mark
answered), RLS on `profiles`/`prayers`/`prayer_verses`.

**Phase 2 — Voice, journaling, sharing**
Native speech-to-text on the Pray screen (type/voice toggle), journal entries tied to a
prayer, "Share as Prayer Request" flow (edit-before-send, public/private, anonymity
toggle), `prayer_requests`/`prayer_request_recipients`/`prayer_request_responses` tables
and RLS, Requests feed (Public + Private tabs, infinite scroll), quick "I'm praying for
you" response.

**Phase 3 — Social & notifications**
Friends (search by name/email, request/accept/decline), Invitations via Resend
(auto-friend on signup-via-invite), push registration (`expo-notifications` permission
flow + token storage) and the `send-notification` fan-out function, SMS for full-prayer
responses, Settings: reminders (day/time/channel including push), per-category
notification preference toggles, phone number entry + Twilio verification.

**Phase 4 — App Store readiness**
Onboarding/empty-state/error-state polish per the PWA prompt's "Key UX Details" section,
accessibility pass (VoiceOver labels, dynamic type, contrast), in-app account deletion,
privacy policy screen/link, App Store metadata and screenshots, TestFlight beta.

## 9. Compliance & Open Risks

- **App Store distribution** is the target (confirmed). Required before submission:
  in-app account deletion (Phase 4), a privacy policy link, and App Store Connect privacy
  "nutrition label" declarations covering what's collected (email, phone, prayer content,
  voice audio transiently for STT).
- **Sign in with Apple** is not required — the app offers only email/password, no
  third-party social login, so Apple's "if you offer social login, offer Apple too" rule
  doesn't apply. Revisit if Google/Facebook login is ever added.
- **Open risk — content moderation:** public prayer requests are visible to all
  authenticated users with no moderation or reporting mechanism specified anywhere in the
  PWA prompt or this spec. This is acceptable for TestFlight with a small, trusted user
  base, but **needs an explicit decision before any public App Store launch** (e.g.
  report-abuse action, basic keyword filtering, or manual review queue). Not scoped into
  any phase above — call this out again before Phase 4 wraps.
- **Open risk — AI/religious content review:** App Store review guidelines require care
  around AI-generated content and religious content; since the AI here only selects
  references (never generates scripture text or theological claims beyond a one-sentence
  relevance note), risk is lower than a "generate a devotional" style app, but the
  App Store listing/description should be explicit about this to preempt review friction.

## 10. Testing Approach

No test framework is currently configured in this boilerplate. Recommended per-phase
approach (to be finalized in the Phase 1 implementation plan, not this spec):
Deno's built-in test runner for edge function logic (especially the verse-reference →
Bible-API resolution mapping in §3, including the dropped-reference-on-failed-resolution
behavior), manual RLS policy verification via Supabase SQL editor or pgTAP, and a manual
QA checklist per phase covering the golden path and the empty/error states called out in
the PWA prompt's "Key UX Details" section.
