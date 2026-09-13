# Onboarding Quiz & Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pre-auth quiz + RevenueCat trial paywall flow for PrayRest, fully wired end to end but completely inert behind a single feature flag until App Store Connect and RevenueCat are configured and the flag is flipped on.

**Architecture:** Three new pre-auth quiz screens feed an in-memory Jotai atom that's written once to a new `onboarding_responses` table at signup. `react-native-purchases` (RevenueCat) handles trial/subscription mechanics; a small `EntitlementProvider` interface (matching this repo's existing `BibleTextProvider`/`VerseReferenceProvider` pattern) wraps the one boolean check the rest of the app needs, with a fail-open error policy. A single `EXPO_PUBLIC_PAYWALL_ENABLED` flag controls both whether the new routes are registered in `app/_layout.tsx` and whether the post-login entitlement gate runs at all — off, the app is byte-for-byte the current shipped behavior.

**Tech Stack:** Expo (existing `ios/` prebuild, native dev client via `expo run:ios`), Expo Router, React Native, TypeScript, Jotai, Supabase (Postgres/Auth), `react-native-purchases` (RevenueCat SDK wrapping StoreKit).

**Spec:** `docs/superpowers/specs/2026-09-12-onboarding-quiz-paywall-design.md`. Also see `docs/superpowers/specs/2026-08-30-prayrest-ios-design.md` (base app spec) and `docs/superpowers/plans/2026-08-30-prayrest-phase1-foundation.md` (established codebase patterns this plan follows).

## Global Constraints

- `EXPO_PUBLIC_PAYWALL_ENABLED` gates the entire subsystem. When it is not the literal string `'true'`: no new routes are registered, `Purchases.configure` is never called, the post-login entitlement check never runs, and `index.tsx` routes straight to `/signup` — today's exact behavior (spec §2, §6, §7).
- RevenueCat entitlement id is `premium` (spec §6).
- Entitlement check failure mode is **fail open** — an error is logged and treated as entitled (spec §2, §6).
- Quiz answers are persisted to a new `public.onboarding_responses` table, one row per completion — never a column on `profiles` (spec §4).
- The pre-auth paywall has no "skip to signup" — its only way out is back-navigation to the last quiz screen (spec §5).
- Proposed defaults (tunable later via RevenueCat/App Store Connect config, no app code changes): 7-day free trial, Weekly $4.99 and Annual $39.99 (spec §2).
- No RN test framework is introduced by this work (spec §8) — `lib/entitlement.ts`'s fail-open branch is verified manually, matching this repo's existing "no test runner configured for the RN app" posture.
- `react-native-purchases` is a native module — requires the committed `ios/` prebuild and a dev-client build (`npx expo run:ios`), not Expo Go.

## Decisions made in this plan (not verbatim in the spec)

- **`paywall` is registered in both the signed-in and signed-out `<Stack>` branches** of `app/_layout.tsx`. The spec's §5 describes all four new routes as added to "the signed-out stack," but §6's resubscribe gate navigates to `/paywall?context=resubscribe` *after* the user is signed in. This repo's `_layout.tsx` explicitly lists only the routes relevant to each auth branch (mirroring how `(tabs)` only appears in the signed-in branch), so `paywall` needs an entry in both lists for the resubscribe case to be reachable; `quiz-goals`/`quiz-source`/`quiz-commitment` stay signed-out-only, since they never run post-login.
- **Two small new lib files not named in the spec:** `lib/featureFlags.ts` (just the parsed `PAYWALL_ENABLED` boolean, since three unrelated files need to read it) and `lib/purchases.ts` (wraps `Purchases.configure`/`Purchases.logIn` so `react-native-purchases` isn't imported directly in `_layout.tsx` and `signup.tsx`). Both are single-responsibility files under the "smaller, focused files" guidance already followed by this codebase's provider files.
- **`quizAnswersAtom` holds `Partial<QuizAnswers>`, not `QuizAnswers | null`.** The three quiz screens fill it in one field at a time (goals → source → committed); a `Partial` type avoids each screen having to fake the fields it hasn't collected yet. `signup.tsx` sends it along only if it has at least one key.

---

### Task 1: Dashboard setup, `react-native-purchases` install, env config

**Files:**
- Modify: `.env` (local only — already gitignored, never committed), `package.json`, `package-lock.json`

**Interfaces:**
- Produces: a RevenueCat project with a `premium` entitlement and a `default` offering, `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_PAYWALL_ENABLED` in `.env`, and the `react-native-purchases` package — consumed by every later task in this plan.

- [ ] **Step 1: Create the subscription group and products in App Store Connect**

In App Store Connect (https://appstoreconnect.apple.com) for the PrayRest app: under Features → In-App Purchases, create a subscription group named "PrayRest Premium" with two auto-renewable subscription products: a weekly product ($4.99) and an annual product ($39.99), each with a 7-day free-trial introductory offer. Note both products' Product IDs.
Expected: both products show status "Ready to Submit" or "Waiting for Review" (full approval can take 24-48h; this doesn't block later tasks, which use RevenueCat's sandbox mode).

- [ ] **Step 2: Create the RevenueCat project**

In the RevenueCat dashboard (https://app.revenuecat.com): create a new project, add an iOS app linked to this app's bundle ID (`com.anonymous.StarterStoryTemplate`), and connect it to App Store Connect via an App Store Connect API key (Integrations → App Store Connect). Create an entitlement named exactly `premium`, attach both subscription products to it, then create an offering named `default` containing both as packages.
Expected: the RevenueCat dashboard shows the `default` offering with two packages, both attached to the `premium` entitlement.

- [ ] **Step 3: Get the RevenueCat iOS API key**

In the RevenueCat dashboard, under Project Settings → API Keys, copy the public "Apple App-Specific" key (starts with `appl_`).

- [ ] **Step 4: Install `react-native-purchases`**

Run: `npx expo install react-native-purchases`
Expected: `react-native-purchases` and its version-pinned entry are added to `package.json`/`package-lock.json`.

- [ ] **Step 5: Install the new native dependency's CocoaPods**

Run: `cd ios && pod install && cd ..`
Expected: CLI reports `Pod installation complete!` and lists `RNPurchases` (or similar) among installed pods.

- [ ] **Step 6: Add the new environment variables**

Edit `.env`, adding two new lines (don't remove the existing Supabase ones):
```
EXPO_PUBLIC_PAYWALL_ENABLED=false
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<the appl_... key from Step 3>
```

- [ ] **Step 7: Verify the app still boots with the flag off**

Run: `npx expo run:ios`
Expected: app builds and loads to the existing Welcome screen with no crash and no RevenueCat-related console output (the flag being `false` means `Purchases.configure` is never called — verified concretely once Task 5 lands; for now this step just confirms the new native pod didn't break the build).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-native-purchases for RevenueCat integration"
```

---

### Task 2: `onboarding_responses` table, RLS, and trigger extension

**Files:**
- Create: `supabase/migrations/<timestamp>_onboarding_responses.sql`

**Interfaces:**
- Produces: table `public.onboarding_responses` (`id`, `user_id`, `quiz_answers` jsonb, `created_at`) with RLS, and an extended `public.handle_new_user()` that inserts into it when `raw_user_meta_data->'quiz_answers'` is present — this is the contract Task 5's `signup.tsx` change relies on (sending `quiz_answers` in `signUp()`'s `options.data`).

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new onboarding_responses`
Expected: creates an empty `supabase/migrations/<timestamp>_onboarding_responses.sql`.

- [ ] **Step 2: Write the table, RLS, and trigger extension**

Replace the file's contents with:

```sql
-- onboarding_responses: one row per completed pre-auth quiz, analytics/attribution only.
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

-- Extend the existing profile-bootstrap trigger function to also record quiz
-- answers when the client sent them at signup. The trigger itself
-- (on_auth_user_created) already points at this function name, so replacing
-- the function body is enough -- no need to touch the trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Friend'));

  if new.raw_user_meta_data ? 'quiz_answers' then
    insert into public.onboarding_responses (user_id, quiz_answers)
    values (new.id, new.raw_user_meta_data->'quiz_answers');
  end if;

  return new;
end;
$$;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: CLI reports the migration applied successfully.

- [ ] **Step 4: Verify RLS is enabled and policies exist**

In the Supabase dashboard SQL editor, run:
```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'onboarding_responses';
select polname from pg_policies where schemaname = 'public' and tablename = 'onboarding_responses' order by polname;
```
Expected: `rowsecurity = true`; two policies listed (`onboarding_responses_insert_own`, `onboarding_responses_select_own`).

- [ ] **Step 5: Verify the trigger extension doesn't break existing signups**

In the Supabase dashboard SQL editor, run:
```sql
select proname from pg_proc where proname = 'handle_new_user';
```
Expected: one row (`handle_new_user`) — confirms `create or replace` didn't create a duplicate. Full behavioral verification (a real signup with `quiz_answers` producing a row) happens in Task 8's QA pass once the client sends it.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add onboarding_responses table, RLS, and trigger extension"
```

---

### Task 3: Quiz screens and `quizAnswersAtom`

**Files:**
- Modify: `lib/atoms.ts`
- Create: `app/quiz-goals.tsx`, `app/quiz-source.tsx`, `app/quiz-commitment.tsx`

**Interfaces:**
- Produces: `QuizAnswers` type and `quizAnswersAtom` (`atom<Partial<QuizAnswers>>`) in `lib/atoms.ts` — consumed by Task 5's `signup.tsx` change. Produces routes `/quiz-goals` → `/quiz-source` → `/quiz-commitment` → `/paywall`, consumed by Task 7's flag-gated `index.tsx`/`_layout.tsx` routing.

- [ ] **Step 1: Add `QuizAnswers` and `quizAnswersAtom` to `lib/atoms.ts`**

Add to the end of `lib/atoms.ts` (after the existing `profileAtom`):

```typescript
export interface QuizAnswers {
  goals: string[];
  source: string;
  committed: boolean;
}

export const quizAnswersAtom = atom<Partial<QuizAnswers>>({});
```

- [ ] **Step 2: Create `app/quiz-goals.tsx`**

```tsx
import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

const GOALS = [
  "Feel God's peace daily",
  'Build a consistent prayer habit',
  'Find verses for hard moments',
  'Track answered prayers',
  'Share prayer with others',
];

export default function QuizGoals() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (goal: string) => {
    setSelected((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));
  };

  const handleNext = () => {
    setQuizAnswers((prev) => ({ ...prev, goals: selected }));
    router.push('/quiz-source');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>What brings you to PrayRest?</Text>
      <Text style={styles.subtitle}>Choose all that apply</Text>
      {GOALS.map((goal) => (
        <TouchableOpacity
          key={goal}
          style={[styles.card, selected.includes(goal) && styles.cardSelected]}
          onPress={() => toggle(goal)}
        >
          <Text style={styles.cardText}>{goal}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.button, selected.length === 0 && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={selected.length === 0}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#D4A853' },
  cardText: { fontSize: 16, color: '#3D2E1F' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 3: Create `app/quiz-source.tsx`**

```tsx
import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SOURCES = ['App Store search', 'Friend or family', 'Social media', 'Church', 'Other'];

export default function QuizSource() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);
  const [selected, setSelected] = useState<string | null>(null);

  const handleNext = () => {
    if (!selected) return;
    setQuizAnswers((prev) => ({ ...prev, source: selected }));
    router.push('/quiz-commitment');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How did you hear about PrayRest?</Text>
      {SOURCES.map((source) => (
        <TouchableOpacity
          key={source}
          style={[styles.card, selected === source && styles.cardSelected]}
          onPress={() => setSelected(source)}
        >
          <Text style={styles.cardText}>{source}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#D4A853' },
  cardText: { fontSize: 16, color: '#3D2E1F' },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

- [ ] **Step 4: Create `app/quiz-commitment.tsx`**

```tsx
import { quizAnswersAtom } from '@/lib/atoms';
import { useRouter } from 'expo-router';
import { useAtom } from 'jotai';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function QuizCommitment() {
  const router = useRouter();
  const [, setQuizAnswers] = useAtom(quizAnswersAtom);

  const handleAnswer = (committed: boolean) => {
    setQuizAnswers((prev) => ({ ...prev, committed }));
    router.push('/paywall');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Are you ready to make prayer a daily habit?</Text>
      <TouchableOpacity style={styles.button} onPress={() => handleAnswer(true)}>
        <Text style={styles.buttonText}>Yes, I&apos;m ready</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.buttonSecondary} onPress={() => handleAnswer(false)}>
        <Text style={styles.buttonSecondaryText}>Not sure yet</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  buttonSecondary: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  buttonSecondaryText: { color: '#6B5A45', fontSize: 16 },
});
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from these three files (existing unrelated errors, if any, are out of scope for this task). These screens aren't reachable yet — Task 7 registers the routes — so no simulator check applies until then.

- [ ] **Step 6: Commit**

```bash
git add lib/atoms.ts app/quiz-goals.tsx app/quiz-source.tsx app/quiz-commitment.tsx
git commit -m "feat: add quiz screens and quizAnswersAtom"
```

---

### Task 4: Entitlement provider

**Files:**
- Create: `lib/entitlement.ts`

**Interfaces:**
- Consumes: `Purchases` from `react-native-purchases` (Task 1).
- Produces: `EntitlementProvider` interface with `hasActiveEntitlement(): Promise<boolean>`, and `RevenueCatEntitlementProvider` class — consumed by Task 7's post-login gate in `app/_layout.tsx`.

- [ ] **Step 1: Write `lib/entitlement.ts`**

```typescript
// lib/entitlement.ts
import Purchases from 'react-native-purchases';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

export interface EntitlementProvider {
  hasActiveEntitlement(): Promise<boolean>;
}

/**
 * Wraps the one boolean check the rest of the app needs from RevenueCat.
 * Fails open: a RevenueCat/network error is logged and treated as
 * "entitled" rather than locking out someone who may have already paid.
 */
export class RevenueCatEntitlementProvider implements EntitlementProvider {
  async hasActiveEntitlement(): Promise<boolean> {
    try {
      const info = await Purchases.getCustomerInfo();
      return PREMIUM_ENTITLEMENT_ID in info.entitlements.active;
    } catch (err) {
      console.error('Entitlement check failed, failing open:', err);
      return true;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manually verify the fail-open branch**

There's no RN test runner in this repo to automate this (Global Constraints), so verify it by temporarily forcing the catch branch: edit the file to replace `const info = await Purchases.getCustomerInfo();` with `throw new Error('manual fail-open test'); const info = await Purchases.getCustomerInfo();`, then in a scratch file or the RN debugger console call `new RevenueCatEntitlementProvider().hasActiveEntitlement()` and confirm it resolves to `true` with the error logged to console — not a thrown/unhandled rejection. Revert the temporary throw afterward.
Expected: resolves `true`, logs the error, does not throw.

- [ ] **Step 4: Commit**

```bash
git add lib/entitlement.ts
git commit -m "feat: add RevenueCat entitlement provider with fail-open handling"
```

---

### Task 5: RevenueCat client wiring and signup handoff

**Files:**
- Create: `lib/featureFlags.ts`, `lib/purchases.ts`
- Modify: `app/signup.tsx`

**Interfaces:**
- Consumes: `quizAnswersAtom` from `lib/atoms.ts` (Task 3).
- Produces: `PAYWALL_ENABLED` (boolean) in `lib/featureFlags.ts` — consumed by Task 7's `_layout.tsx`/`index.tsx` routing. Produces `configurePurchasesIfEnabled(): void` and `linkPurchasesIdentity(userId: string): Promise<void>` in `lib/purchases.ts` — `configurePurchasesIfEnabled` is consumed by Task 7's `_layout.tsx`.

- [ ] **Step 1: Create `lib/featureFlags.ts`**

```typescript
// lib/featureFlags.ts
export const PAYWALL_ENABLED = process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';
```

- [ ] **Step 2: Create `lib/purchases.ts`**

```typescript
// lib/purchases.ts
import Purchases from 'react-native-purchases';
import { PAYWALL_ENABLED } from './featureFlags';

let configured = false;

export function configurePurchasesIfEnabled(): void {
  if (!PAYWALL_ENABLED || configured) return;
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    console.error('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not set; skipping Purchases.configure');
    return;
  }
  Purchases.configure({ apiKey });
  configured = true;
}

export async function linkPurchasesIdentity(userId: string): Promise<void> {
  if (!PAYWALL_ENABLED) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.error('Purchases.logIn failed, continuing without blocking signup:', err);
  }
}
```

- [ ] **Step 3: Wire `signup.tsx` to send quiz answers and link RevenueCat identity**

In `app/signup.tsx`, add imports:
```typescript
import { quizAnswersAtom } from '@/lib/atoms';
import { linkPurchasesIdentity } from '@/lib/purchases';
import { useAtomValue } from 'jotai';
```

Inside the `SignUp` component, add alongside the existing `useState` calls:
```typescript
const quizAnswers = useAtomValue(quizAnswersAtom);
```

Replace the `handleSignUp` function body's `supabase.auth.signUp` call and the code after it:
```typescript
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
      options: {
        data: {
          display_name: displayName.trim(),
          ...(Object.keys(quizAnswers).length > 0 ? { quiz_answers: quizAnswers } : {}),
        },
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (data.user) {
      await linkPurchasesIdentity(data.user.id);
    }
    if (!data.session) {
      router.replace('/verify-email');
    }
  };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Verify flag-off behavior is unchanged**

With `EXPO_PUBLIC_PAYWALL_ENABLED=false` in `.env` (Task 1's default), run `npx expo run:ios`, sign up with a new test account (use a `@mailinator.com` address per the Phase 1 QA checklist's note on rejected placeholder domains), and confirm: no console errors from `lib/purchases.ts` (its `linkPurchasesIdentity` short-circuits immediately since `PAYWALL_ENABLED` is false), and the app proceeds to "Check your email" exactly as before.
Expected: identical behavior to pre-Task-5 signup; `linkPurchasesIdentity` is a no-op.

- [ ] **Step 6: Commit**

```bash
git add lib/featureFlags.ts lib/purchases.ts app/signup.tsx
git commit -m "feat: wire RevenueCat identity linking and quiz-answer handoff into signup"
```

---

### Task 6: Paywall screen

**Files:**
- Create: `app/paywall.tsx`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts` (for sign-out on the resubscribe back action).
- Produces: route `/paywall`, accepting an optional `context` search param (`'resubscribe'` or absent/anything else = pre-auth) — consumed by Task 7's post-login gate, which navigates here via `router.replace('/paywall?context=resubscribe')`.

- [ ] **Step 1: Create `app/paywall.tsx`**

```tsx
// app/paywall.tsx
import { PREMIUM_ENTITLEMENT_ID } from '@/lib/entitlement';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

export default function Paywall() {
  const router = useRouter();
  const { context } = useLocalSearchParams<{ context?: string }>();
  const isResubscribe = context === 'resubscribe';
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const loadOfferings = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const available = offerings.current?.availablePackages ?? [];
        setPackages(available);
        setSelected(available.find((pkg) => pkg.identifier === '$rc_annual') ?? available[0] ?? null);
      } catch (err) {
        console.error('Failed to load offerings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadOfferings();
  }, []);

  const handleSubscribe = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      await Purchases.purchasePackage(selected);
      router.replace(isResubscribe ? '/(tabs)' : '/signup');
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert('Something went wrong', 'Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      const info = await Purchases.restorePurchases();
      if (PREMIUM_ENTITLEMENT_ID in info.entitlements.active) {
        router.replace(isResubscribe ? '/(tabs)' : '/signup');
      } else {
        Alert.alert('Nothing to restore', 'No previous purchases found on this Apple ID.');
      }
    } catch (err) {
      console.error('Restore purchases failed:', err);
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  const handleBack = async () => {
    if (isResubscribe) {
      await supabase.auth.signOut();
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#D4A853" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isResubscribe ? 'Your trial has ended' : 'Start Your Free Trial'}</Text>
      <Text style={styles.subtitle}>
        {isResubscribe
          ? 'Subscribe to keep praying with PrayRest.'
          : '7 days free, then continue for less than a coffee a week.'}
      </Text>
      <View style={styles.plans}>
        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.identifier}
            style={[styles.plan, selected?.identifier === pkg.identifier && styles.planSelected]}
            onPress={() => setSelected(pkg)}
          >
            <Text style={styles.planTitle}>{pkg.product.title}</Text>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={handleSubscribe} disabled={purchasing || !selected}>
        <Text style={styles.buttonText}>{purchasing ? 'Processing...' : 'Start Free Trial'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleRestore}>
        <Text style={styles.link}>Restore Purchases</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.link}>{isResubscribe ? 'Sign Out' : 'Back'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FDF8F0' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#3D2E1F', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6B5A45', textAlign: 'center', marginBottom: 24 },
  plans: { width: '100%', marginBottom: 24 },
  plan: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  planSelected: { borderColor: '#D4A853' },
  planTitle: { fontSize: 16, fontWeight: 'bold', color: '#3D2E1F' },
  planPrice: { fontSize: 14, color: '#6B5A45', marginTop: 4 },
  button: { backgroundColor: '#D4A853', paddingVertical: 16, borderRadius: 20, width: '100%', alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  link: { color: '#3D2E1F', fontSize: 15, textDecorationLine: 'underline', marginBottom: 16 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/paywall.tsx
git commit -m "feat: add paywall screen with plan picker and restore purchases"
```

---

### Task 7: Feature-flag-gated routing and post-login entitlement gate

**Files:**
- Modify: `app/_layout.tsx`, `app/index.tsx`

**Interfaces:**
- Consumes: `PAYWALL_ENABLED` from `lib/featureFlags.ts` (Task 5), `configurePurchasesIfEnabled` from `lib/purchases.ts` (Task 5), `RevenueCatEntitlementProvider` from `lib/entitlement.ts` (Task 4), routes from Tasks 3 and 6.
- Produces: the fully wired flag-gated flow — this is the task that makes Tasks 3-6 reachable and turns the whole subsystem on/off.

- [ ] **Step 1: Update `app/index.tsx`'s "Get Started" routing**

In `app/index.tsx`, add the import:
```typescript
import { PAYWALL_ENABLED } from '@/lib/featureFlags';
```

Change the `onPress` handler:
```tsx
      <TouchableOpacity style={styles.button} onPress={() => router.push(PAYWALL_ENABLED ? '/quiz-goals' : '/signup')}>
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
```

- [ ] **Step 2: Register the new routes and wire the entitlement gate in `app/_layout.tsx`**

In `app/_layout.tsx`, add imports:
```typescript
import { RevenueCatEntitlementProvider } from '@/lib/entitlement';
import { PAYWALL_ENABLED } from '@/lib/featureFlags';
import { configurePurchasesIfEnabled } from '@/lib/purchases';
```

Add a module-level instance near the top of the file (outside the component, alongside no other module-level state currently in this file):
```typescript
const entitlementProvider = new RevenueCatEntitlementProvider();
```

Inside `RootLayout`, add a new state variable alongside `isSignedIn`:
```typescript
const [hasEntitlement, setHasEntitlement] = useState<boolean | null>(null);
```

At the top of the component body (before the `useFonts` destructure or right after it), call the RevenueCat configure step once:
```typescript
  useEffect(() => {
    configurePurchasesIfEnabled();
  }, []);
```

In the existing `checkSession` function inside the main `useEffect`, extend it to also resolve entitlement when signed in and the flag is on:
```typescript
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const signedIn = !!data.session?.user;
      setIsSignedIn(signedIn);
      if (signedIn) {
        await loadProfile(data.session!.user.id);
        setHasEntitlement(PAYWALL_ENABLED ? await entitlementProvider.hasActiveEntitlement() : true);
      } else {
        setHasEntitlement(true);
      }
    };
```

In the `onAuthStateChange` listener's `SIGNED_IN` branch, add the same entitlement check right after `loadProfile`:
```typescript
      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user.id);
        const entitled = PAYWALL_ENABLED ? await entitlementProvider.hasActiveEntitlement() : true;
        setHasEntitlement(entitled);
        if (skipNextSignedInRedirect.current) {
          skipNextSignedInRedirect.current = false;
        } else if (entitled) {
          const onboarded = await hasCompletedOnboarding(session.user.id);
          router.replace(onboarded ? '/(tabs)' : '/onboarding');
        }
        // else: not entitled -- leave navigation to the isSignedIn/hasEntitlement
        // effect below, which redirects to the resubscribe paywall. Firing both
        // this replace() and that effect's replace() for the same event would
        // race (briefly showing tabs/onboarding before the paywall redirect wins).
      }
```

Update the loading guard to also wait on entitlement:
```typescript
  if (!loaded || isSignedIn === null || hasEntitlement === null) {
    return null;
  }
```

Add a redirect effect that catches the no-entitlement case once state has settled (placed after the main `useEffect`, before the loading-guard `if`):
```typescript
  useEffect(() => {
    if (isSignedIn && hasEntitlement === false) {
      router.replace('/paywall?context=resubscribe');
    }
  }, [isSignedIn, hasEntitlement]);
```

Finally, update the `<Stack>` JSX to register `paywall` in the signed-in branch and all four new routes in the signed-out branch:
```tsx
      <Stack screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="reset-password" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <>
            <Stack.Screen name="index" />
            <Stack.Screen name="quiz-goals" />
            <Stack.Screen name="quiz-source" />
            <Stack.Screen name="quiz-commitment" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify-email" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
```
(Registering `quiz-*`/`paywall` unconditionally in the JSX is fine — they're only ever reachable if something navigates to them, and Step 1 is the only navigation entry point, which is itself flag-gated. This keeps the JSX simple rather than adding a second layer of conditional rendering.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify flag-off regression**

With `EXPO_PUBLIC_PAYWALL_ENABLED=false`, run `npx expo run:ios`. From the Welcome screen, tap "Get Started" → confirm it goes straight to Signup (not the quiz). Sign in with an existing Phase 1 test account → confirm it goes straight to the tabs with no paywall redirect.
Expected: identical to pre-Task-7 behavior in every respect.

- [ ] **Step 5: Verify the pre-auth flow with the flag on**

Set `EXPO_PUBLIC_PAYWALL_ENABLED=true` in `.env`, restart Metro (`npx expo run:ios` again — env vars are read at build time), tap "Get Started" → confirm it routes through `quiz-goals` → `quiz-source` → `quiz-commitment` → `paywall`, and that the paywall shows real RevenueCat sandbox offerings (requires a sandbox Apple ID signed into the simulator/device — set one up via App Store Connect → Users and Access → Sandbox Testers if not already done).
Expected: full quiz → paywall flow renders; starting a trial in sandbox mode proceeds to Signup.

- [ ] **Step 6: Verify the resubscribe gate**

Using RevenueCat's sandbox accelerated trial periods (a 7-day trial compresses to a few minutes in sandbox), let an active sandbox trial expire, then relaunch the app while signed in.
Expected: redirected to `/paywall?context=resubscribe` showing "Your trial has ended"; tapping "Sign Out" signs out and returns to the Welcome screen rather than dead-ending.

- [ ] **Step 7: Set the flag back to false before committing**

Edit `.env`, set `EXPO_PUBLIC_PAYWALL_ENABLED=false` again — this plan's whole point is shipping the subsystem dormant. Leaving it `true` locally is fine for your own device but don't let it leak into any shared config.

- [ ] **Step 8: Commit**

```bash
git add app/_layout.tsx app/index.tsx
git commit -m "feat: wire feature-flag-gated quiz/paywall routing and entitlement gate"
```

---

### Task 8: Manual QA checklist

**Files:**
- Create: `docs/superpowers/plans/2026-09-12-onboarding-quiz-paywall-qa-checklist.md`

**Interfaces:**
- Produces: a standalone QA checklist document, same format as `docs/superpowers/plans/2026-08-30-prayrest-phase1-qa-checklist.md`, to be run against a real device/simulator before flipping the flag on for real users.

- [ ] **Step 1: Write the checklist**

```markdown
# Onboarding Quiz & Paywall — Manual QA Checklist

Run this against a real device or simulator build before flipping
`EXPO_PUBLIC_PAYWALL_ENABLED` to `true` for real users.

## Flag-off regression (run first — this is the higher-stakes check)

- [ ] `EXPO_PUBLIC_PAYWALL_ENABLED=false`: "Get Started" from Welcome goes straight to Signup, not the quiz
- [ ] `EXPO_PUBLIC_PAYWALL_ENABLED=false`: signing in with an existing account goes straight to tabs, no paywall redirect, no RevenueCat console errors
- [ ] `EXPO_PUBLIC_PAYWALL_ENABLED=false`: signup still creates a `profiles` row correctly and does not create an `onboarding_responses` row (no quiz was taken, so `raw_user_meta_data` never gets a `quiz_answers` key)

## Golden path (flag on)

- [ ] `EXPO_PUBLIC_PAYWALL_ENABLED=true`: "Get Started" routes through quiz-goals (multi-select works, Continue disabled until 1+ selected) → quiz-source (single-select) → quiz-commitment (either answer proceeds) → paywall
- [ ] Paywall shows both Weekly and Annual packages with real sandbox prices; Annual is preselected
- [ ] Starting a free trial (sandbox Apple ID) succeeds and routes to Signup
- [ ] Completing signup creates both a `profiles` row and an `onboarding_responses` row containing the exact `{ goals, source, committed }` picked during the quiz (verify via Supabase SQL editor)
- [ ] After email verification and login, the app does not redirect to the paywall (trial is active) — proceeds to translation-picker onboarding as normal

## Restore purchases

- [ ] On a fresh install/simulator reset with an Apple ID that has a prior sandbox purchase, tapping "Restore Purchases" on the paywall succeeds and proceeds forward
- [ ] On an Apple ID with no prior purchase, "Restore Purchases" shows "No previous purchases found on this Apple ID" rather than doing nothing

## Resubscribe gate

- [ ] Using RevenueCat's sandbox accelerated trial periods, let a trial expire, then relaunch the app while signed in — redirected to `/paywall?context=resubscribe` with "Your trial has ended" copy
- [ ] On the resubscribe paywall, "Sign Out" (not "Back") is shown, and tapping it signs out and returns to Welcome
- [ ] Subscribing from the resubscribe paywall routes to the tabs, not back to Signup

## Failure modes

- [ ] Declining/cancelling the native purchase sheet returns to the paywall with no crash and no error alert (StoreKit user-cancellation is silent by design)
- [ ] Manually verified per Task 4: `RevenueCatEntitlementProvider.hasActiveEntitlement()` fails open (returns `true`, logs) when `Purchases.getCustomerInfo()` throws
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-09-12-onboarding-quiz-paywall-qa-checklist.md
git commit -m "docs: add onboarding quiz and paywall manual QA checklist"
```
