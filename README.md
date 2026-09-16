# DM Finisher

Single-page app for batch image finishing (upscale → background removal → finish). Vite + React 18 + TypeScript + Tailwind v3. Supabase (Auth, Postgres, Storage, Realtime) is the entire backend — there is no server in this repo.

## Run locally

```bash
cp .env.example .env   # already contains the project URL + anon key
npm install
npm run dev            # http://localhost:3000
```

Other scripts: `npm run build` (type-check + production bundle to `dist/`), `npm run preview`.

## Deploy to Vercel

1. Push this folder to a Git repo and **Import** it in Vercel (framework preset: Vite).
2. In *Project → Settings → Environment Variables* add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Build command `npm run build`, output directory `dist` (Vercel detects these automatically).

## Supabase Auth redirect URLs (required)

Magic links redirect back to the app, so Supabase must know the allowed origins. In the Supabase dashboard go to **Authentication → URL Configuration** and make sure **Redirect URLs** (and ideally *Site URL*) include:

- `http://localhost:3000`
- your deployed URL, e.g. `https://dm-finisher.vercel.app`

Without this the magic link will land on the wrong origin and the session will not be established.

## How it works

- Drop images → one `fin_batches` row is created, each file is uploaded to the private `fin-originals` bucket at `<user id>/<job id>.<ext>` (max 4 concurrent uploads), then a `fin_jobs` row is inserted with `status = 'queued'`.
- Processing is fully server-side; the UI just watches `fin_jobs` via Realtime (plus a 20 s polling fallback).
- Finished images live in the private `fin-finals` bucket; the Completed panel signs 1-hour URLs, and downloads (single or zipped with JSZip) are done client-side.

## Project layout

```
src/
  lib/supabase.ts       client + bucket names
  lib/types.ts          row types + status helpers
  lib/signedUrls.ts     memoised 1h signed URLs
  lib/download.ts       single download + zip
  lib/toast.tsx         tiny toast system
  hooks/useAuth.ts      session state
  hooks/useJobs.ts      batches/jobs, realtime + polling, retry
  hooks/useUpload.ts    drop → batch → upload → insert pipeline
  components/           Login, Header, Dropzone, JobTile, CompletedPanel
```

## Backend wiring (n8n)
Processing is fully automatic: each `fin_jobs` insert fires a Postgres trigger → n8n dispatcher → up to 5 parallel workers.
The n8n workflow to use is in `n8n/README.md` (import file for workflow `Vi8LELQs076uE7jD`).

## Test account
`finisher-test@dmteam.local` / `FinisherTest#2026`. Delete this user in Supabase → Authentication when no longer needed.
