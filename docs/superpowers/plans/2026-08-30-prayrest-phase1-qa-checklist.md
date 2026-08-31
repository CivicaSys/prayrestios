# PrayRest Phase 1 — Manual QA Checklist

Run this against a real device or simulator build before considering Phase 1 done.
Everything below marked **[verified]** was already confirmed live during implementation
via direct Supabase Auth/PostgREST/Edge Function API calls (real accounts, real Claude
calls, real Bible-API text) — not through the RN UI, since no simulator was available
during implementation. Re-verify those through the actual app as a sanity check; the
unmarked items have only been verified by code review and static contract-matching so
far and need a first real pass.

## Golden path

- [ ] Sign up with a new account (name, email, password) → routed to "Check your email"
- [ ] Confirmation email arrives; clicking it confirms the account (dashboard shows `email_confirmed_at`)
  - **[verified, API-level]** signup → `handle_new_user` trigger → `profiles` row with correct `display_name` and default `preferred_translation = 'kjv'`
- [ ] Log in with the confirmed account → routed to onboarding (first time only)
- [ ] Pick a translation on onboarding → routed to Pray tab; `profiles.preferred_translation` updated
- [ ] Log out and back in → onboarding is skipped, straight to Pray tab
- [ ] Type a prayer with a clear emotional theme, tap Amen → verse overlay appears with an acknowledgment line, first verse, explanation, working Listen toggle, MORE reveals remaining verses
  - **[verified, API-level]** full `submitPrayer` contract exercised end to end with a real signed-in user: `POST /rest/v1/prayers` (insert, `user_id` auto-set via `default auth.uid()`) → `POST /functions/v1/get-prayer-verses` → HTTP 200 with 3 detected needs (`fear`, `anxiety about the future`, `need for courage`) and 5 real verses, including a correctly concatenated multi-verse range (Philippians 4:6-7 — both verses joined with a space, in order)
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
- [ ] A stale or already-used password-reset link shows "Link expired... please request a new one" instead of silently doing nothing (added in a Task 9 fix round — not yet exercised on a real device)

## Cross-account RLS — **[verified, API-level, two real accounts]**

Two confirmed test accounts were created directly against the live project (not through
the RN UI) and used to exercise every RLS boundary in Phase 1's schema:

- [x] Account B cannot see Account A's `prayers` (`select` returns `[]`)
- [x] Account B cannot see Account A's `prayer_verses` (`select` by `prayer_id` returns `[]`)
- [x] Account B updating Account A's `prayers` row affects 0 rows (RLS filters silently, no error)
- [x] Account B deleting Account A's `prayers` row affects 0 rows
- [x] Account B *can* see Account A's `profiles` row (public read, by design) but cannot update Account A's `display_name` (0 rows affected)
- [x] Account A deleting her *own* prayer succeeds and cascades to delete its `prayer_verses` (positive-path proof that Task 2's fix-round DELETE policies work correctly, not just that unauthorized deletes are blocked)

No further manual RLS testing needed for Phase 1's three tables — this was exhaustive
for the ownership rules in scope. Re-test only if the RLS policies change.

## Known limitations to carry into later phases

- [ ] KJV verse text occasionally includes inline footnote/Strong's-number artifacts from the source API — **confirmed live**: `Isaiah 41:10` came back from the real pipeline prefixed with a stray `¶` pilcrow character (a paragraph marker baked into the wldeh/bible-api KJV source). Not fixed in Phase 1 (see the caveat comment in `bible-text-provider.ts`); worth a light regex-stripping pass in a later phase if it proves visually distracting.
- [ ] Onboarding-seen state is device-local (AsyncStorage), not account-synced — reinstalling or switching devices re-shows onboarding
- [ ] Requests tab is a placeholder; Friends/Settings/notifications are not in this phase
- [ ] Supabase's default email provider has a low send-rate limit (hit `429 over_email_send_rate_limit` during implementation after ~2 signups in quick succession). Fine for solo manual QA with pauses between signups; will need a custom SMTP provider configured before any real multi-tester TestFlight round, not just before public launch.
- [ ] Test signups against this project reject some placeholder-looking email domains (`@example.com` → `400 email_address_invalid`) but accept disposable-inbox domains like `@mailinator.com` — use the latter, not `@example.com`/`@test.com`, when hand-testing signup.
