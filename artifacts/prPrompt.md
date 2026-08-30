# PrayRest — Lovable.dev Build Prompt

## App Overview

Build a Progressive Web App called **PrayRest** — a prayer companion app with the tagline "Tell God about what's on your heart. Then rest, assured."

PrayRest lets users voice or type their prayers, receive AI-curated Bible verses related to their prayer's themes and sentiment, journal thoughts during prayer, share prayer requests with other members or non-members, track prayer history and answered prayers, and pray over others' requests. The app uses Supabase for auth/database/edge-functions, Resend for transactional email, and Twilio for SMS notifications.

## Tech Stack & Infrastructure

- **Frontend:** React + TypeScript + Vite (Lovable default)
- **Backend:** Supabase (Auth, PostgreSQL database, Edge Functions, Realtime)
- **AI:** Use a Supabase Edge Function to call an LLM API (OpenAI or Gemini — use whichever you determine is best for Bible knowledge). The edge function receives prayer text and returns relevant Bible verse(s) with full quoted text, book/chapter/verse reference, and a brief explanation of why each verse relates to the prayer.
- **Email:** Resend API (via Supabase Edge Function)
- **SMS:** Twilio API (via Supabase Edge Function)
- **PWA:** Service worker for installability and app-shell caching. Online-only for v1 (no offline data sync needed).
- **Voice Input:** Web Speech API (SpeechRecognition) for speech-to-text prayer dictation. Abstract the speech service behind an interface so a provider like Whisper can be swapped in later.
- **Voice Output (TTS):** Browser built-in SpeechSynthesis API for reading Bible verses aloud. Abstract behind an interface for future upgrade to AI voice (e.g., ElevenLabs).

## Design System & Aesthetic

**Warm & Peaceful** — the app should feel like a sunrise. Calm, inviting, spiritually grounded.

### Color Palette

- **Primary:** Warm gold (#D4A853 range)
- **Secondary:** Soft amber/burnt sienna (#C47B3A range)
- **Background:** Warm off-white (#FDF8F0) to soft cream gradients
- **Surface/Cards:** White with warm-toned subtle shadows
- **Text:** Deep warm brown (#3D2E1F) for primary, muted brown for secondary
- **Accent:** Gentle terracotta or dusty rose for highlights
- **Success/Answered Prayer:** Soft olive green
- **Subtle gradients:** Use gentle sunrise-inspired gradients (peach → gold → warm white) for hero sections and the prayer screen background

### Typography

- Use a clean, modern serif or semi-serif for headings (e.g., "Playfair Display" or "Lora" from Google Fonts) to evoke a timeless, reverent feel
- Use a clean sans-serif for body text (e.g., "Inter" or "Source Sans 3")
- Prayer text input should use a slightly larger, more contemplative font size

### Visual Elements

- Soft, rounded corners on all cards and buttons (border-radius: 16px+)
- Gentle box shadows with warm tones (no harsh black shadows)
- Subtle micro-animations: fade-ins for verse reveals, gentle pulse on the "Amen" button, smooth transitions between views
- Use warm, nature-inspired iconography where possible (dove, sunrise, olive branch motifs — keep subtle)
- The prayer interface should feel immersive and distraction-free

## Authentication

- Email/password only for v1 (use Supabase Auth)
- Registration collects: display name, email, password
- Users can optionally add a profile photo after signup
- Email verification required before full access
- Password reset flow via email

## Database Schema (Supabase/PostgreSQL)

### `profiles` (extends Supabase `auth.users`)

- `id` (uuid, FK to auth.users)
- `display_name` (text)
- `avatar_url` (text, nullable)
- `preferred_translation` (text, default 'NIV') — user's preferred Bible translation (ESV, NIV, KJV, NLT, or others)
- `reminder_enabled` (boolean, default false)
- `reminder_time` (time, nullable)
- `reminder_days` (text[], nullable) — e.g., ['Mon','Wed','Fri']
- `reminder_channel` (text, default 'email') — 'email' | 'sms'
- `phone_number` (text, nullable) — for SMS features
- `notification_preferences` (jsonb) — granular notification settings
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `prayers`

- `id` (uuid, PK)
- `user_id` (uuid, FK to profiles)
- `content` (text) — the prayer text
- `input_method` (text) — 'voice' | 'text'
- `is_answered` (boolean, default false)
- `answered_at` (timestamptz, nullable)
- `answered_note` (text, nullable) — user's note about how the prayer was answered
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `prayer_verses`

- `id` (uuid, PK)
- `prayer_id` (uuid, FK to prayers)
- `reference` (text) — e.g., "Philippians 4:6-7"
- `verse_text` (text) — full quoted text from the AI
- `translation` (text) — which translation was used
- `explanation` (text, nullable) — AI's brief note on why this verse relates
- `sort_order` (int) — ordering of verses returned
- `created_at` (timestamptz)

### `journal_entries`

- `id` (uuid, PK)
- `prayer_id` (uuid, FK to prayers)
- `user_id` (uuid, FK to profiles)
- `content` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `prayer_requests`

- `id` (uuid, PK)
- `sender_id` (uuid, FK to profiles)
- `content` (text) — the prayer request text (may be edited from original prayer before sending)
- `original_prayer_id` (uuid, FK to prayers, nullable) — link to the original prayer if derived from one
- `visibility` (text) — 'public' | 'private'
- `is_anonymous` (boolean, default false) — sender chose to remain anonymous
- `status` (text, default 'active') — 'active' | 'answered' | 'archived'
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `prayer_request_recipients`

- `id` (uuid, PK)
- `prayer_request_id` (uuid, FK to prayer_requests)
- `recipient_type` (text) — 'member' | 'email'
- `recipient_user_id` (uuid, FK to profiles, nullable) — for member recipients
- `recipient_email` (text, nullable) — for non-member email recipients
- `is_read` (boolean, default false)
- `created_at` (timestamptz)

### `prayer_request_responses`

- `id` (uuid, PK)
- `prayer_request_id` (uuid, FK to prayer_requests)
- `responder_id` (uuid, FK to profiles)
- `response_type` (text) — 'prayer' | 'quick' (quick = "I'm praying for you" button)
- `content` (text, nullable) — the prayer they prayed in response (null for 'quick' type)
- `created_at` (timestamptz)

### `friends`

- `id` (uuid, PK)
- `requester_id` (uuid, FK to profiles)
- `addressee_id` (uuid, FK to profiles)
- `status` (text) — 'pending' | 'accepted' | 'declined'
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `invitations`

- `id` (uuid, PK)
- `inviter_id` (uuid, FK to profiles)
- `invitee_email` (text)
- `invite_code` (text, unique)
- `status` (text) — 'pending' | 'accepted' | 'expired'
- `created_at` (timestamptz)
- `expires_at` (timestamptz)

## Core Features & Screens

### 1. Prayer Screen (Main/Home)

The primary experience. Should feel immersive and distraction-free.

- **Input area:** Large, centered text area with placeholder text like "What's on your heart today?"
- **Voice button:** Microphone icon that activates Web Speech API. Show a pulsing animation while recording. Transcribed text appears in the input area in real-time.
- **Type/Voice toggle:** User can switch between typing and dictating seamlessly
- **"Amen" button:** A prominent, warm-styled button. When tapped:
  - Prayer is saved to the `prayers` table
  - A Supabase Edge Function is called with the prayer text
  - The AI analyzes the prayer and returns relevant Bible verse(s) with the user's preferred translation noted
  - A verse alert/popup overlay appears with:
    - The first verse displayed prominently (reference + full text + brief explanation)
    - A "Listen" toggle — when enabled, the verse is read aloud using browser SpeechSynthesis
    - A "MORE" button at the bottom — clicking it reveals additional related verses in a scrollable list
    - A "Close" / "Amen" button to dismiss the overlay
  - After closing the verse overlay, the user is gently prompted: "Would you like to journal any thoughts or impressions?" with an optional text area
- **Journal section:** Appears after prayer completion. Text area for thoughts/impressions. Saved to `journal_entries` linked to the prayer.
- **Share as Prayer Request:** After praying (and optionally journaling), show a subtle option: "Share as a prayer request?" If tapped:
  - Open an edit screen pre-filled with the prayer text — the user can modify it before sending (they may want to remove personal details)
  - Choose visibility: Public (posted to public feed) or Private (sent to specific recipients)
  - Choose anonymity: Toggle "Send anonymously" (default off)
  - Add recipients (for private):
    - Search and select from friends list (member recipients)
    - Enter email addresses for non-member recipients
  - Send — creates a `prayer_requests` record, sends in-app notification to member recipients and SMS with deep-link to prayer request, sends email via Resend to non-member recipients with deep-link to prayer request in app.

### 2. Prayer History Screen

- Chronological list of all user's past prayers (newest first)
- Each prayer card shows:
  - Date/time
  - Prayer content (truncated preview)
  - Status indicator: unanswered (subtle) or answered (highlighted with a checkmark and the olive-green accent)
  - Quick-access icons for: journal entries (if any), verses received, prayer request (if shared)
- **Mark as Answered:** Swipe or tap action to mark a prayer as answered, with an optional text field for a note about how it was answered
- **Tap to expand:** Shows full prayer text, all associated verses (with Listen toggle), journal entries, and any prayer request + responses
- **Filter/Search:** Filter by answered/unanswered, date range, or search by text content

### 3. Prayer Requests Screen (Feed)

Two tabs:

**Public Feed**
- Shows all prayer requests with `visibility = 'public'` from all users
- Each card shows: requester name (or "Anonymous"), prayer request text, timestamp, response count
- **"Pray for this" button:** Opens the prayer interface pre-contextualized with the request. When the user finishes praying (hits Amen), their prayer is saved as a `prayer_request_response` with `response_type = 'prayer'`
- **"I'm praying for you" quick button:** One-tap response, creates a `prayer_request_response` with `response_type = 'quick'`. No SMS notification for quick responses.
- Infinite scroll or pagination

**Private (Sent to Me)**
- Shows prayer requests where the current user is a recipient (`prayer_request_recipients`)
- Same card layout and interaction as public feed
- Unread indicator for new requests

**Response Notifications**
- When someone responds to your prayer request with a full prayer (`response_type = 'prayer'`):
  - In-app notification
  - SMS alert via Twilio with a deep link back to the response in the app
  - Deep link should open the app (PWA) directly to that prayer request's response thread
- When someone responds with "I'm praying for you" (`response_type = 'quick'`):
  - In-app notification only (no SMS)

### 4. Friends & Invitations

- **Friends list:** View current friends, pending requests
- **Add friend:** Search by display name or email
- **Invite to PrayRest:** Enter an email address → sends an invitation email via Resend with a unique invite link. When the invitee signs up, the friendship is auto-established.
- **Friend request flow:** Send request → recipient accepts/declines → if accepted, both can send private prayer requests to each other

### 5. Profile & Settings

- Edit display name, avatar
- **Preferred Bible translation:** Dropdown to select (ESV, NIV, KJV, NLT, etc.)
- **Prayer reminders:**
  - Enable/disable
  - Set time of day
  - Set days of week
  - Choose channel: email (Resend) or SMS (Twilio)
- **Notification preferences:**
  - Prayer request responses: SMS, email, in-app (toggle each)
  - New prayer requests from friends: in-app notification (toggle)
  - Friend requests: in-app notification (toggle)
- **Phone number:** Add/verify phone number for SMS features (Twilio verification)
- Sign out / Delete account

### 6. Onboarding

Brief, warm welcome flow after first signup:

- Welcome screen with tagline and warm illustration
- Set preferred Bible translation
- Optional: set up prayer reminder
- Optional: invite friends
- Go to first prayer

## Supabase Edge Functions

### `get-prayer-verses`

- **Trigger:** Called after a prayer is saved (when user taps "Amen")
- **Input:** prayer text, preferred Bible translation
- **Logic:** Sends prayer text to the LLM API with a system prompt like:

  > "You are a compassionate Bible scholar. Given the following prayer, identify 3-5 Bible verses that directly relate to the prayer's themes, emotions, and requests. For each verse, provide: the reference (book chapter:verse), the full quoted text in [user's preferred translation], and a one-sentence explanation of how it relates to the prayer. Return as JSON."

- **Output:** Array of verse objects saved to `prayer_verses` table, returned to client for the popup

### `send-prayer-request-email`

- **Trigger:** When a prayer request is sent to a non-member email recipient
- **Uses:** Resend API
- **Content:** Warm, branded email with the prayer request notice/alert and a deep-link to the prayer request on PrayRest. (Non-member can view request in the app but must register on submitting/sending their prayer for the prayer requester.)

### `send-sms-notification`

- **Trigger:** When someone responds to a prayer request with a full prayer
- **Uses:** Twilio API
- **Content:** Brief message like "Someone prayed for your request on PrayRest. Tap to read: [deep-link]"

### `send-prayer-reminder`

- **Trigger:** Scheduled cron (Supabase pg_cron) — runs every minute, checks for users whose reminder time matches current time and day
- **Uses:** Resend (email) or Twilio (SMS) based on user preference
- **Content:** Gentle reminder like "It's time to pray. PrayRest is waiting for you. [deep-link]"

### `send-invitation-email`

- **Trigger:** When a user invites a friend
- **Uses:** Resend API
- **Content:** Invitation with personalized message and unique signup link

## Row-Level Security (RLS) Policies

- **`prayers`:** Users can only read/write their own prayers
- **`prayer_verses`:** Users can only read verses for their own prayers
- **`journal_entries`:** Users can only read/write their own entries
- **`prayer_requests`:**
  - Public requests: readable by all authenticated users
  - Private requests: readable only by sender and designated recipients
  - Only sender can update/delete
- **`prayer_request_responses`:**
  - Readable by the request sender and the responder
  - Writable by any authenticated user (to respond to accessible requests)
- **`friends`:** Both parties can read; requester can create; addressee can update status
- **`profiles`:** Readable by all authenticated users; writable only by own user

## PWA Configuration

- **manifest.json:** App name "PrayRest", short name "PrayRest", theme color matching the warm gold primary, background color matching the cream background, `display: "standalone"`, icons in multiple sizes
- **Service Worker:** Cache app shell and static assets for fast loading. No offline data sync needed for v1.
- **Install prompt:** Show a subtle, non-intrusive install banner after the user has prayed 2-3 times

## Navigation

Bottom navigation bar (mobile-first) with 4 tabs:

- 🙏 Pray (home/prayer screen)
- 📖 History (prayer history)
- 🤝 Requests (prayer request feed — with badge for unread)
- 👤 Profile (settings & profile)

On larger screens, convert to a sidebar navigation.

## Key UX Details

- **Loading states:** Use skeleton screens with warm-toned placeholders, never blank screens
- **Empty states:** Warm, encouraging empty states. E.g., History empty state: "Your prayer journey starts with one prayer. Go ahead — He's listening." with a button to navigate to the prayer screen.
- **Error handling:** Gentle, non-alarming error messages. E.g., if AI verse fetch fails: "We couldn't find verses right now, but God heard your prayer. Try again later."
- **Toasts/notifications:** Warm-styled toast notifications for actions (prayer saved, request sent, etc.)
- **Responsiveness:** Mobile-first, but fully responsive for tablet and desktop
- **Accessibility:** Proper ARIA labels, keyboard navigation, sufficient color contrast, screen reader friendly

## Future Considerations

*Do NOT build these, but design the architecture to accommodate them.*

- Organization/church private-label branding (multi-tenancy)
- Subscription billing (Stripe integration)
- AI voice upgrade (ElevenLabs TTS)
- Whisper API for voice input
- Bible API integration for word-perfect verse accuracy across translations
- Push notifications (Web Push API)
- Prayer groups (shared feeds scoped to a group)
- Offline sync for PWA
