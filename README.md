# DM Studio

Design Musketeer's studio board: client brief → AI generation → designer review → print-ready PNG. Vite + React 18 + TypeScript + Tailwind v3 + react-router-dom v7. Supabase (Auth, Postgres, Storage, Realtime) is the entire backend; n8n workers do the generating and finishing. There is no server in this repo.

Product SOP and the frontend contract live in `docs-frontend-spec.md`.

## Run locally

```bash
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (publishable key only, never service-role)
npm install
npm run dev            # http://localhost:3100
```

Other scripts: `npm run build` (type-check + production bundle to `dist/`), `npm run lint` (oxlint), `npm run preview`.

Type-check on its own: `npx tsc --noEmit -p tsconfig.app.json`.

## Routes

| Route | Page | Who |
| --- | --- | --- |
| `/login` | `components/Login.tsx` | public (password only) |
| `/brief/:token` | `pages/BriefFormPage.tsx` | public, no Header (client form) |
| `/`, `/board` | `pages/BoardPage.tsx` | staff |
| `/card/:id` | `pages/CardPage.tsx` | staff |
| `/completed` | `pages/CompletedPage.tsx` | staff |
| `/clients` | `pages/ClientsPage.tsx` | staff |
| `/clients/:id/style` | `pages/StyleCardPage.tsx` | staff |
| `/settings` | `pages/SettingsPage.tsx` | lead only (others see "Lead only") |

`src/App.tsx` owns routing, the auth gate (no session → `/login`, remembering where you were) and the staff layout (Header + `<main>`).

## Project layout

```
src/
  main.tsx                 React root
  App.tsx                  routes, auth gate, lead guard, layout
  lib/
    database.types.ts      generated from Supabase (do not edit; regenerate with the MCP generate_typescript_types tool)
    supabase.ts            typed client, REFS_BUCKET / GENS_BUCKET / FINALS_BUCKET, storagePaths
    types.ts               row aliases (Card, Generation, FinJob, Client, StyleCard, Settings, …), enums, print_text helpers
    api.ts                 typed wrapper for every RPC; throws Error(postgres message)
    stage.ts               STAGES in SOP order, labels, badge classes, isAutomated, ageLabel, isOverdue
    session.tsx            SessionProvider (session + profile, loaded once)
    useAuth.ts             { session, user, loading, signOut }
    useProfile.ts          { userId, profile, isLead, displayName, loading }
    useSettings.ts         settings row (id=1), 20 s poll, update()
    useQueueCounts.ts      generations / fin_jobs queued+working (realtime + poll)
    useRealtimeTable.ts    generic postgres_changes subscription with 20 s poll fallback
    signedUrls.ts          memoised 1 h signed URLs per bucket+path
    useSignedUrl.ts        hook form of the above for <img src>
    download.ts            single download + zip (jszip)
    toast.tsx              ToastProvider (useToast lives in useToast.ts)
  components/
    Header.tsx             nav, queue indicator, paused banner, sign out
    Login.tsx              password sign-in
    DeleteButton.tsx       trash button with inline confirm (from DM Finisher)
    card/, style/          page-owned component folders
  pages/                   one file per route (see table above)
docs/reference/            DM Finisher's CompletedPanel, kept as a pattern reference (not compiled or linted)
```

## Backend facts

- Supabase project ref `voatrqhfsdfjomyajovi`. RLS on every table; the app only ever uses the publishable key.
- Stage changes go through RPCs only (`approve_card`, `move_card`, `retry_card`, …); a trigger blocks direct updates of `cards.stage`. Wrappers live in `src/lib/api.ts`.
- Storage buckets (private): `refs` (`<client_id>/<card_id>/<n>.<ext>`), `gens` (`<card_id>/<generation_id>.png`, masks `-mask.png`), `finals` (`<card_id>/<generation_id>-final.png`). Staff read through signed URLs (1 h).
- Realtime publication: `cards`, `generations`, `fin_jobs`. Everything else polls.
- Public form: `start_brief(token)` opens a 15-minute anon upload grant, `submit_brief(...)` finalises the card.

## Deploy to Vercel

1. Import the repo in Vercel (framework preset: Vite). `vercel.json` already rewrites every path to `index.html` for the router.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under *Project → Settings → Environment Variables*.
3. Deploy. Build command `npm run build`, output directory `dist`.

Password login does not need redirect URLs. If magic links are ever enabled, add the deployed origin under **Authentication → URL Configuration** in Supabase.

## Test accounts

- Staff (lead): `studio-test@dmteam.local` / `StudioTest#2026`
- Client form token: `0570536095895eb6f05ed21a73a8624d` → `/brief/0570536095895eb6f05ed21a73a8624d`

Delete the test user in Supabase → Authentication when no longer needed.

