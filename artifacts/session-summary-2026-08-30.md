# Session Summary — PrayRest iOS Brainstorming (2026-08-30)

Context handoff for continuing this work in a new session. The authoritative artifact
from this session is the design spec — everything else here is orientation.

## What happened

Read `artifacts/prPrompt.md` (the original Lovable.dev PWA build prompt for PrayRest)
and surveyed this repo (StarterStories Expo boilerplate: Expo Router, Supabase,
Jotai — see `README.md`). Ran the `superpowers:brainstorming` skill's architectural path:
explored context, asked clarifying questions, proposed a design, got approval, and wrote
it up as a spec.

**Spec produced:** `docs/superpowers/specs/2026-08-30-prayrest-ios-design.md`
(initial commit `d1102e5`, revised in commit `b2075e3` — see "Post-approval revision"
below). That file is the source of truth for scope, architecture, data model, and the
phased roadmap — read it in full before doing anything else. **Status: fully approved,
including the written-spec review gate — ready for the implementation plan.**

## Decisions made this session (all in the spec, summarized here for quick recall)

- **Backend:** fresh Supabase project — no reuse of any project the PWA may have used,
  schema is net-new.
- **Notifications:** add native push (Expo/APNs) as a first-class channel alongside the
  PWA prompt's email (Resend) and SMS (Twilio).
- **Voice:** native on-device (Apple Speech framework for STT, `expo-speech`/
  `AVSpeechSynthesizer` for TTS), not a jump straight to Whisper/ElevenLabs.
- **Boilerplate example screens** (onboarding1-3, onboardingPathos/Ethos/Logos,
  personalization, tabs detail/settings/loading): replace entirely, don't adapt.
- **Scope:** phased roadmap (4 phases), not one all-at-once build. See spec §8.
- **Distribution:** App Store/TestFlight — compliance items are in scope (spec §9).
- **AI verse pipeline — most significant change from the PWA prompt:** the LLM (default
  Claude Sonnet 5, swappable) identifies verse *references and explanations only* and is
  explicitly instructed never to produce verse text. Actual verse text is always fetched
  from the wldeh/bible-api static JSON CDN (jsDelivr, no auth, public-domain translations).
  This was an explicit user requirement: no allowance for LLM hallucination of scripture.
  Full mechanics in spec §3.
- **Translations (v1):** KJV, ASV, WEB only (default KJV) — not ESV/NIV/NLT from the PWA
  prompt, because the open Bible API doesn't serve those copyrighted texts. The provider
  is written as swappable so a licensed API can be added later.

## Post-approval revision (commit `b2075e3`)

During the written-spec review gate, the user flagged that emotional/spiritual need
detection (anger, grief, fear, temptation, doubt, loneliness, gratitude, crisis, etc.)
wasn't explicitly named as a step in the two-stage verse pipeline — it was implicit
inside the LLM's "explanation" field. Fixed by:

- Extending the single `get-prayer-verses` LLM call's structured output to a top-level
  `detected_needs: string[]` field alongside the verse array — named and required, not
  implicit. No new LLM call, no added latency.
- Persisting it on a new `prayers.detected_needs` (text[], nullable) column.
- Surfacing it in the UI: the verse overlay opens with a brief empathetic acknowledgment
  line (e.g. "It sounds like you're carrying some grief and fear right now.") rendered
  from a static phrase-template map keyed by need — deliberately **not** a second LLM
  call, to avoid adding cost/latency/another hallucination surface for a cosmetic line.
- This is in Phase 1 scope (not deferred) — it ships with the verse pipeline itself.

Full mechanics: spec §3 (pipeline + example system prompt), §5 (schema), §7 (UI).

## Open items flagged, not yet decided

- **Content moderation for public prayer requests** — no reporting/moderation mechanism
  specified anywhere (PWA prompt or this spec). Fine for TestFlight with a small trusted
  group; needs an explicit decision before any public App Store launch. See spec §9.
- Testing framework/approach for the app (none currently configured in this boilerplate)
  is deferred to the Phase 1 implementation plan rather than decided in the spec — see
  spec §10.

## Where this should go next

The spec has been through its self-review, approved in chat, revised per the user's
written-spec-review feedback (see above), and re-approved as final. **The review gate is
closed** — nothing is pending on the spec itself.

Next: invoke the `superpowers:writing-plans` skill against the spec to produce an
implementation plan — almost certainly scoped to **Phase 1** first (auth, core prayer
loop, the AI+Bible-API verse pipeline including need detection, History screen), given
the phased roadmap. Do not skip straight to writing code without that plan step; the
brainstorming skill's rule is spec → plan → implementation, and that boundary was
intentional, not incidental.

## Note on continuing in a new session

This summary plus the committed spec file should be sufficient context to resume
cleanly — the spec is self-contained (it doesn't assume the reader has this
conversation's history), and the phased roadmap tells the new session exactly what
"first" means. Starting fresh is reasonable and arguably preferable here: this
conversation's context includes a lot of exploratory back-and-forth (clarifying
questions, an aside about updating the superpowers plugin) that a new session doesn't
need to carry. Just make sure the new session's first action is reading the spec file
in full, not skimming this summary alone — this file intentionally omits the detailed
rationale, data model column lists, and phase-by-phase feature breakdowns that only the
spec has.
