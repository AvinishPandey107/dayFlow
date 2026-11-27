# DayFlow

Tasks + calendar PWA. React, TypeScript, Tailwind, Supabase (Auth, Postgres, Realtime, Row Level Security).

## 1. Set up Supabase (free tier is enough)
1. Create a project at supabase.com.
2. **SQL Editor** → paste `supabase/schema.sql` → Run. This creates `categories`, `recurring_rules`, `tasks`, `events`, turns on Row Level Security (every row is readable and writable only by its owner) and enables realtime.
3. **Authentication → Providers**: Email is on by default. For quicker testing you can turn off "Confirm email".
4. **Project Settings → API**: copy the Project URL and the `anon` public key.

The anon key is designed to be public; Row Level Security is what protects your data. Never put the `service_role` key in this app.

## 2. Run locally
```
cp .env.example .env     # paste the URL and anon key
npm install
npm run dev
```
Create an account, then use "Add sample tasks" (and "Remove sample tasks" when done).

## 3. Deploy (Vercel, Netlify or Cloudflare Pages)
1. Push this folder to a GitHub repo.
2. Import it in Vercel (or Netlify / Cloudflare Pages). Build command `npm run build`, output directory `dist`.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In Supabase → **Authentication → URL Configuration**, set Site URL to your deployed https URL.
5. Open the URL on your phone and laptop and sign in with the same account.

## 4. Install as an app
- **Android (Chrome):** open the site → ⋮ menu → *Install app* (or *Add to Home screen*).
- **Laptop (Chrome/Edge):** click the install icon at the right end of the address bar.
- Replace `public/icon-192.png` and `icon-512.png` with your own artwork when you like.

## How sync works
- Every change updates the screen instantly, is saved on the device and queued, then sent to Supabase. If you are offline the queue is sent when the connection returns.
- Supabase Realtime pushes changes to your other devices.
- Edits send only the fields you changed, so changing the title on one device and the deadline on another keeps both. If two devices change the same field, the later write wins.

## Google Calendar (not built yet)
The `events` table already has `google_event_id` / `google_etag` plus a unique constraint, for de-duplication. What is still needed, and requires your own credentials:
1. Google Cloud project → enable Google Calendar API → OAuth client (Web).
2. Supabase **Edge Functions** that hold the client secret and refresh token (never in the frontend), exchange the OAuth code, call `events.list` with a `syncToken` for incremental import, and `events.insert/patch` for changes made in DayFlow.
3. A "Connect Google Calendar" button that starts the OAuth redirect.

## Status
Built: auth, tasks (period, priority, tags, estimate, duplicate, delete, undo via checkbox), progress and overdue indicators, quick-add with natural language and `q` shortcut, search/sort/filter, dashboard, month calendar with drag-to-reschedule and events, dark mode, offline queue, realtime sync, JSON export.
Not built yet: week/day/agenda views, drag-to-reorder, swipe actions, subtasks, recurrence, reminders/notifications, Pomodoro/focus mode, habits, templates, reviews, archive, import/restore, synced settings, Google Calendar.
