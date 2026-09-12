# PrayRest Onboarding Quiz & Paywall — Design Spec

**Date:** 2026-09-12
**Status:** Approved for planning
**Source material:** `docs/sdResearch01.md` (competitor research — Bible Chat, Hallow onboarding/paywall patterns), `docs/superpowers/specs/2026-08-30-prayrest-ios-design.md` (base app spec)
**Target:** A pre-auth quiz + paywall flow for the existing native iOS PrayRest app, built and merged now but kept fully dormant behind a feature flag until App Store Connect / RevenueCat setup is complete.

## 1. Overview

The base app spec (`2026-08-30-prayrest-ios-design.md` §1) lists subscription billing as an explicit v1 non-goal, prioritizing a small trusted TestFlight beta over monetization. This spec does not reverse that decision — Phase 1 ships and is used exactly as before. Instead, it designs and builds a quiz-style onboarding + trial paywall flow (informed by competitor research into Bible Chat and Hallow, two $500K+/month Christian prayer/devotional apps) so it is ready to switch on once App Store Connect subscription products and a RevenueCat project exist. Until then, the entire subsystem is inert behind one feature flag.

### Non-goals (this spec)

- Actually enabling monetization for current/beta users — that's a separate decision made by flipping the flag, not part of this build.
- Personalizing app behavior (verse selection, notifications, etc.) based on quiz answers — quiz answers are attribution/analytics data only in this phase (see §3).
- Rich animated "building your plan" interstitials (Bible Chat's 20-step mechanic) — a lean 3-4 step flow is used instead; richer theater is a possible future iteration once this converts.
- Android — the base app targets iOS; RevenueCat/StoreKit here is iOS-only, matching the existing scope.

## 2. Key Decisions

| Area | Decision |
|---|---|
| Flow placement | Quiz + paywall run **before** signup: `index` → quiz (3 screens) → paywall → `signup` → ... (unchanged from `verify-email` onward) |
| Quiz purpose | Personalization theater + attribution only (v1) — not wired into verse selection, notifications, or any app behavior |
| Dormancy mechanism | Single feature flag, `EXPO_PUBLIC_PAYWALL_ENABLED`. Off (default): today's exact flow, no RevenueCat SDK initialized, no new routes registered. On: full new flow + post-login entitlement gate active |
| Subscription mechanics | RevenueCat (`react-native-purchases`) wrapping StoreKit — industry standard, avoids building custom receipt validation |
| Paywall gating (once live) | Trial-then-paywall on everything — full app access during a free trial, hard paywall on the whole app after, matching both researched competitors |
| Entitlement check failure mode | **Fail open** — an error from RevenueCat is treated as "entitled," logged, and the user proceeds. Locking out an already-paying subscriber during an outage is worse than a few free sessions during one |
| Quiz answer storage | New `public.onboarding_responses` table (one row per completion), not a column on `profiles` — keeps analytics/attribution data queryable and separate from the core identity table, and supports a future "retake the quiz" flow for free |
| Default trial/pricing | Proposed starting point, tunable later via RevenueCat/App Store Connect config with no app code changes: 7-day free trial; Weekly $4.99 and Annual $39.99 (~$3.33/mo) — the annual price anchors against the weekly rate annualized (~$260/yr), framed as "save ~85% vs. paying weekly," matching Bible Chat's anchor-messaging pattern from the research |

## 3. Quiz Content

Three screens, each its own route (see §5), presented as fast, low-friction steps — closer to Hallow's 2-question/6-step pace than Bible Chat's 20-step flow:

1. **Goals** (`app/quiz-goals.tsx`) — multi-select illustrated card grid: "What brings you to PrayRest?" — Feel God's peace daily / Build a consistent prayer habit / Find verses for hard moments / Track answered prayers / Share prayer with others.
2. **Attribution** (`app/quiz-source.tsx`) — single-select: "How did you hear about PrayRest?" — App Store search / Friend or family / Social media / Church / Other.
3. **Commitment** (`app/quiz-commitment.tsx`) — single yes/no prime: "Are you ready to make prayer a daily habit?" — a low-cost version of Bible Chat's consistency-trigger question, immediately before the paywall. The answer does not branch the flow — both "Yes" and "No" proceed to the paywall; it exists purely as a self-identification/attribution capture, consistent with §2's "personalization theater only" decision.

Answers are held in a single in-memory Jotai atom (`quizAnswersAtom: { goals: string[], source: string, committed: boolean }`) that flows forward through the stack. There is no draft-persistence requirement — backing out of the quiz simply resets the atom, since it's a single forward-moving flow with no resume-later requirement in this phase.

## 4. Data Model

One additive migration, no changes to any existing Phase 1 table or policy:

```sql
create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quiz_answers jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.onboarding_responses enable row level security;

create policy "onboarding_responses_select_own" on public.onboarding_responses
  for select to authenticated using (auth.uid() = user_id);
create policy "onboarding_responses_insert_own" on public.onboarding_responses
  for insert to authenticated with check (auth.uid() = user_id);
```

Populated via the same `raw_user_meta_data` handoff pattern the base spec already uses for `display_name`: `signUp({ options: { data: { display_name, quiz_answers } } })`, with `handle_new_user()` (defined in the base app's Task 2 migration) extended to also insert into `onboarding_responses` when `raw_user_meta_data->'quiz_answers'` is present. If the flag is off, `quiz_answers` is never sent and no row is created — the trigger addition is a no-op for today's signups.

## 5. Screens & Navigation

**New route files**, all added to the *signed-out* stack in `app/_layout.tsx`:
- `app/quiz-goals.tsx`, `app/quiz-source.tsx`, `app/quiz-commitment.tsx` — one screen per quiz step (§3), matching the codebase's existing pattern of one route file per screen rather than a single wizard component with internal step state.
- `app/paywall.tsx` — trial pitch, Weekly/Annual plan picker, "Start Free Trial" CTA, "Restore Purchases" link (required by App Store guideline 3.1.2), and a `context` search param (`pre-auth` default, `resubscribe` for the post-login gate in §6) that swaps copy and back-button behavior.

**Flag-gated registration:** when `EXPO_PUBLIC_PAYWALL_ENABLED` is false, none of these four screens are registered in the `<Stack>` and `index.tsx`'s "Get Started" button routes directly to `/signup` — identical to today's behavior. When true, they're registered and `index.tsx` routes to `/quiz-goals` instead.

**Flow:** `index` → `quiz-goals` → `quiz-source` → `quiz-commitment` → `paywall` (context=pre-auth) → `signup` → `verify-email` → `login` → onboarding (translation picker, unchanged) → tabs.

**Compliance note:** the pre-auth paywall's only way out is back-navigation to `quiz-commitment` — there is no "skip to signup" link. This avoids a state where a signed-up user has no trial and no path back to the paywall until the post-login entitlement check catches them anyway, and matches both researched competitors, neither of which offers a skip.

## 6. RevenueCat Integration

**Package:** `react-native-purchases`, requiring the native iOS project (already prebuilt and committed) and a dev-client build rather than Expo Go.

**Initialization:** `Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY })` runs once in `app/_layout.tsx`, entirely skipped when the flag is off.

**Identity linking:** RevenueCat assigns an anonymous ID on first `configure()` call, so a trial started pre-signup on `paywall.tsx` already has a purchase attached to that anonymous identity. Immediately after `supabase.auth.signUp()` resolves successfully, call `Purchases.logIn(supabaseUserId)`; RevenueCat merges the anonymous user's entitlements into the newly identified account. A failure here is logged and does not block the signup flow (§7) — the post-login entitlement check will reconcile on next launch.

**Entitlement abstraction** (`lib/entitlement.ts`), following the same small-injected-interface style as the base spec's `BibleTextProvider`/`VerseReferenceProvider`:

```typescript
export interface EntitlementProvider {
  hasActiveEntitlement(): Promise<boolean>;
}

export class RevenueCatEntitlementProvider implements EntitlementProvider {
  async hasActiveEntitlement(): Promise<boolean> {
    try {
      const info = await Purchases.getCustomerInfo();
      return 'premium' in info.entitlements.active;
    } catch (err) {
      console.error('Entitlement check failed, failing open:', err);
      return true;
    }
  }
}
```

**Post-login gate:** in `app/_layout.tsx`, once `isSignedIn` is true and the flag is on, `hasActiveEntitlement()` is checked alongside the existing profile load (both gate rendering the same way `isSignedIn === null` already does). No entitlement → `router.replace('/paywall?context=resubscribe')`. In that context, `paywall.tsx` shows "Your trial has ended" copy and its back action signs the user out (via the existing `supabase.auth.signOut()` path) rather than dead-ending, since there is no prior screen in the signed-in stack to return to.

**Manual dashboard setup** (external, non-code — listed as plan tasks, same treatment as the base spec's Supabase project setup):
1. App Store Connect: create a subscription group ("PrayRest Premium") with two auto-renewable products — weekly and annual, each with a 7-day free trial intro offer. Subject to Apple review (24-48h typical).
2. RevenueCat: create a project, link it to App Store Connect via an App Store Connect API key, define an entitlement named `premium`, and a `default` offering containing both packages.
3. Set `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in `.env` (this is RevenueCat's public SDK key, safe client-side per RevenueCat's own documentation — it only authorizes receipt validation, not account access).

## 7. Error Handling & Edge Cases

- **Entitlement check errors:** fail open (§2, §6) — logged, user proceeds as entitled.
- **Purchase declined/cancelled on the paywall:** stay on `paywall.tsx`, show an inline "Something went wrong — please try again" message. Not worth distinguishing decline vs. network failure in this phase.
- **Restore Purchases finds nothing:** inline message ("No previous purchases found on this Apple ID") rather than doing nothing silently — consistent with the "surface, don't swallow" fix already applied to profile/history errors in the base app.
- **`Purchases.logIn` fails post-signup:** logged, signup flow continues uninterrupted (§6).
- **Flag-off regression:** with `EXPO_PUBLIC_PAYWALL_ENABLED=false`, none of this subsystem's code paths execute — no RevenueCat network calls, no new routes, `index.tsx` behaves exactly as it does today. This is the primary safety property of the whole design.

## 8. Testing Approach

Per the base spec (§10), no test runner is configured for the RN app itself — only Deno's runner for edge functions, and this feature is almost entirely client-side. Scope accordingly:

- `lib/entitlement.ts`'s fail-open branch is the one piece of real logic here; it stays manually verified rather than introducing an RN test framework as a side effect of this feature.
- `onboarding_responses` RLS gets the same manual SQL-editor structural check plus cross-account verification the base app's Task 2/14 already established for `profiles`/`prayers`/`prayer_verses`.
- A manual QA checklist (written alongside the implementation plan, same format as the Phase 1 QA checklist) covers: golden path through quiz → paywall → trial → signup; flag-off regression (confirm today's direct-to-signup flow is unchanged); Restore Purchases; the resubscribe gate after a simulated trial expiry (StoreKit sandbox supports accelerated trial periods for exactly this test); and the failure-mode cases in §7.

## 9. Compliance

- **Restore Purchases** is present on the paywall per App Store guideline 3.1.2.
- **No dead ends:** the pre-auth paywall backs out to the quiz; the resubscribe paywall signs out rather than trapping the user with no way forward.
- Nothing here changes the base spec's existing compliance posture (§9 of the base spec) around account deletion, privacy policy, or content moderation — those remain tracked against Phase 4 there, unaffected by this work.
