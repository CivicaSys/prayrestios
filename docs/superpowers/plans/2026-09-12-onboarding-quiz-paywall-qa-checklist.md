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

## Known gaps from this implementation round

This checklist is a first pass against a live build — **nothing in it has been executed in a simulator or device yet**. This section documents specific deferred verification items that were never possible to test in the sandboxed environment where implementation occurred.

### Task 1: RevenueCat integration never initialized with real keys

- `.env` currently has `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=REPLACE_ME_WITH_REVENUECAT_KEY` as a placeholder
- App Store Connect bundle identifier, RevenueCat project, and in-app purchase offerings were never created
- **Action required before flag-on:** Set up a real RevenueCat project in the dashboard, create offerings for Weekly and Annual subscriptions, link them to App Store Connect, and replace the placeholder key with the real iOS API key
- **Critical:** The flag must remain `false` in any build until this is complete; setting it to `true` with the placeholder will allow bypass of the paywall

### Task 2: Database row-security and migration durability never verified in Supabase dashboard

- SQL verification queries (`pg_tables` row-security check and `pg_policies` duplicate-function check) from Task 2's brief were not executed directly in the Supabase SQL editor
- Verification relied on indirect evidence: successful `supabase db push` and `supabase migration list` confirming the migration was recorded durably
- **Action required:** After first real QA run, log into the Supabase dashboard for the production project and run the two SQL queries from Task 2's brief as a zero-cost confirmation that row security is correctly installed and working

### Task 3: No interactive UI walkthrough performed

- The implementation sandbox had no UI-automation tooling — the iOS Simulator could not be scripted to tap, type, or swipe
- All screens (quiz-goals, quiz-source, quiz-commitment, paywall) and navigation flows are verified only by code review, TypeScript type-checking, and state-machine tracing
- No actual person has ever run through any screen or completed a single flow end-to-end
- **Action required:** Treat every item in this checklist as a first real pass, not a re-verification; be thorough and document any unexpected behavior or crashes before flipping the flag for production users
