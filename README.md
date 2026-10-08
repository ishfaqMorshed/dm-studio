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

**Live since 2026-10-08:** https://dm-studio-olive.vercel.app (Vercel project `dm-studio`, scope ishfaqmorshed's projects; GitHub
`ishfaqMorshed/dm-studio`, private, default branch `master`). Deploy from this folder with `npx vercel deploy --prod --yes` (the CLI is
linked via `.vercel/`, ignored) or by pushing `master` once the Git connection is made in the Vercel dashboard.

Hosting = GitHub (private repo) + Vercel (static Vite build) + the existing Supabase project `voatrqhfsdfjomyajovi` and n8n; nothing
in the back end changes when the app is hosted - the browser talks to Supabase directly, n8n and the Edge Functions never see the
app's URL. Production branch: `master`.

Before the first push (done 2026-10-08): `npm run build` passes (one 1.07 MB JS chunk, 304 kB gzipped), `git status` clean,
no tracked file carries a secret (`.env`, `*.local`, `n8n/*.json`, `supabase/.temp/` are ignored; the test password lives only
in the ignored `.env` as `DM_E2E_PASSWORD`), Node >= 22 pinned in `package.json` engines.

1. Create the private GitHub repository and push (the `gh` CLI is logged in):
   ```bash
   gh repo create <owner>/dm-studio --private --source . --remote origin --push
   ```
   (or `git remote add origin ...` + `git push -u origin master`). Push `e2e-openrouter-platform` too if it is still ahead of master.
2. Vercel -> *Add New -> Project* -> import the repo. Framework preset **Vite** is auto-detected from `vercel.json`, which also
   rewrites every path to `index.html` for the router. Build command `npm run build`, output directory `dist`, Node 22.x.
3. *Project -> Settings -> Environment Variables*, for Production and Preview: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (the `sb_publishable_...` key, same values as the local `.env`; never the service-role key, never `DM_E2E_PASSWORD`).
4. Deploy, open the URL, sign in with a staff account, then load `/board`, `/card/<id>` and `/brief/<token>` directly (full page
   load) to confirm the SPA rewrite. The client form link shown on the card page and in the Edit client dialog is built from
   `window.location.origin`, so it is correct on the deployed domain automatically - send clients the hosted link, not localhost.
5. Supabase, once the URL is known (dashboard, not in this repo): *Authentication -> URL Configuration -> Site URL* = the Vercel
   URL (password login does not need redirect URLs; add the origin to *Redirect URLs* only if magic links or password resets are
   ever enabled); *Authentication -> Attack protection -> Leaked password protection* = on (advisor warning); keep the three
   storage buckets private (they are). The security advisor's "anon can execute SECURITY DEFINER function" warnings are by
   design: the public brief form (`resolve_form_token`, `start_brief`, `submit_brief`, `refs_upload_ok`) and the n8n / Edge
   Function workers (everything guarded by `studio_secret_ok()`) call with the publishable key; every such function checks the
   form token, the studio secret or `is_staff()` inside (verified 2026-10-08, see `docs/STATUS.md`).
6. Custom domain (optional): Vercel -> Domains, then update the Supabase Site URL to it.

Rollback = Vercel -> Deployments -> promote the previous deployment; the app has no server state.

Current build state: `docs/STATUS.md`. Workflow conventions: `docs/n8n-config-contract.md`. Generation spec and acceptance flow: `docs/generation-spec.md`.

## Test accounts

- Staff (lead): `studio-test@dmteam.local` (password kept out of the repo; ask the lead)
- Client form token of **Test Client (phase 1)** (`df526fbe…`, not the E2E Test Client): `0570536095895eb6f05ed21a73a8624d` → `/brief/0570536095895eb6f05ed21a73a8624d`. Every client's own form link is shown by the Edit client dialog on `/clients` (`clients.form_token`); QA of the E2E Test Client (`bef63960…`) uses that link.

Delete the test user in Supabase → Authentication when no longer needed.
