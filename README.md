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

Nothing in this repo is deployed yet; the steps below need the user's GitHub and Vercel logins.

1. Create an empty GitHub repository (private), then from this folder:
   ```bash
   git remote add origin git@github.com:<org>/dm-studio.git
   git push -u origin master
   ```
   `.gitignore` already excludes `.env`, `*.local` and `n8n/*.json`; run `git status` first and confirm nothing secret is staged.
2. Vercel → *Add New → Project* → import the repo. Framework preset **Vite** (auto-detected from `vercel.json`, which also rewrites every path to `index.html` for the router). Build command `npm run build`, output directory `dist`.
3. *Project → Settings → Environment Variables*: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key, same values as `.env`), for Production and Preview.
4. Deploy, open the URL, sign in with the staff account and load `/board` and `/brief/<token>` directly to confirm the SPA rewrite.

Password login does not need redirect URLs. If magic links are ever enabled, add the deployed origin under **Authentication → URL Configuration** in Supabase.

Current build state: `docs/STATUS.md`. Workflow conventions: `docs/n8n-config-contract.md`. Generation spec and acceptance flow: `docs/generation-spec.md`.

## Test accounts

- Staff (lead): `studio-test@dmteam.local` (password kept out of the repo; ask the lead)
- Client form token of **Test Client (phase 1)** (`df526fbe…`, not the E2E Test Client): `0570536095895eb6f05ed21a73a8624d` → `/brief/0570536095895eb6f05ed21a73a8624d`. Every client's own form link is shown by the Edit client dialog on `/clients` (`clients.form_token`); QA of the E2E Test Client (`bef63960…`) uses that link.

Delete the test user in Supabase → Authentication when no longer needed.
