# DM Studio — status (updated 2026-09-24)

One page the user can open at any time. Three lists: done / ongoing / to-do. Mirror into SOP section 11 when the SOP is republished as v1.2.

## Done

- Phase 1 (2026-09-16) — Supabase project `voatrqhfsdfjomyajovi`: migrations studio_01..06, `private.secrets.studio_secret` (generated in-DB), tables profiles/clients/style_cards/cards/generations/fin_jobs/fin_job_events/design_lessons/prompt_templates/settings, all stage-changing RPCs, RLS on every table, pg_net triggers to the n8n webhooks, cron `studio-sweep` (5 min) + `studio-lessons` (02:00 UTC), buckets refs/gens/finals. Acceptance SQL test passed.
- Phase 2 — WF-4 Finisher ported (RPC `fin_job_update`, migrations studio_09/10); storage fixture gens/<card>/<gen>.png for generation d955dbe5.
- Phases 3, 4, 8 (2026-09-16) — the app: board, card detail with every action (approve / accept / edit text / edit region mask / regenerate / park / retry / duplicate), public brief form, clients + Style Card editor, completed, settings. tsc / lint / build clean; browser QA passed.
- 2026-09-24 product decisions — engine Kie `gpt-image-2-5-sunburst-image-to-image`; references vision-read AND attached as `input_urls`; per-client reference library → `style_profiler` → Style Card draft; client-scoped board with header client selector; designer New card (`create_card_as_designer`). Migration studio_11 (client_references, style_draft_requests + trigger, settings.generation_model/generation_resolution/vision_model/max_style_refs, generations.aspect_ratio/resolution/reference_urls/rendered_prompt, cards.source).
- Client-scoped frontend build (header selector, client panel with reference library + "Draft Style Card", New card dialog, engine settings fields, rendered_prompt on the card page).
- Generation build — prompt_templates seeded (14+1 active, analysis_prompt v2), Edge Functions `prompt-engine` and `qc-judge` deployed (verify_jwt off, `x-studio-secret` checked via `studio_secret_ok`), smoke-tested; migrations 20260924_* in `supabase/migrations`.
- Nine n8n workflows created (unpublished) in the config-node convention (`docs/n8n-config-contract.md`): WF-0 `vbyjWhK4ZRN9uZUM`, WF-1 `CrpmkqYiaWBtvto6`, WF-1b `CsohPMosybjBoP8s`, WF-2 `KVLDYPaWZZZtOoir`, WF-3 `V83NWHjzDdyiqtNP`, WF-4 `2HEm3yQETeEMocOL`, WF-5 `3Sr7H74AxZUu6QiW`, WF-6 `PIgUHDGkVJVg9FHj`, WF-7 `zvGIh8mZIBzevlai`. Sources `n8n/*.sdk.js`, validator `node n8n/tools/check.js` clean.
- Hosting prep — `vercel.json` (Vite preset, SPA rewrite), `.env.example` (two VITE vars), README deploy section with the exact GitHub + Vercel steps. `.gitignore` excludes `.env`, `*.local`, `n8n/*.json`.
- Requirements audit (`docs/audit/`): 109 requirements traced; report in `docs/audit/audit-report.md`.
- T-Shirt Engine `DcdygzBz5GAoy2Zg` read-only check: n8n version history shows exactly one saved version (2026-09-21 05:33 UTC, "via MCP"), created before the read-only extract of 2026-09-24 and before any DM Studio workflow work in n8n; nothing in this repo writes to that id. The 2026-09-21 save itself can only be inspected by the user (see to-do).

## Ongoing

- Requirements audit follow-through: closing the OPS gaps (R42, R45, R46, R74, R90, R102, R104). This page and the README/contract updates are part of it.

## To-do (in order; who)

1. **User — n8n WF-0** `vbyjWhK4ZRN9uZUM`, node "Studio Config": paste `studioSecret` (`select value from private.secrets where key = 'studio_secret'` in the Supabase SQL editor), `ideogramKey`, `imgbbKey`, `mlKey`. Verify the Kie nodes still bind "GPT Image 2 [DM-Kie]" / "Gemini 3.1 Pro [DM-Kie]" and Slack binds "DM HR".
2. **User — publish** in this order: WF-0, WF-5, **WF-6**, then WF-2, WF-3, WF-1, WF-1b, WF-4, WF-7.
3. **User — Error workflow binding**: after WF-6 is published (n8n refuses an unpublished error workflow), open WF-1, WF-1b, WF-2, WF-3, WF-4 → Settings → Error workflow → "DM Studio · WF-6 Error" → Save. (The connector's `update_workflow` can set `settings.errorWorkflow`, but only once WF-6 has a published version; it was tried on 2026-09-24 and refused for that reason.)
4. **User — delete superseded workflows** `62DdRaJTr7rIsPFP` (old WF-4) and `3QD6HDEtWWcBYFbD` (stray WF-5); move the nine workflows into folder "Print on demand" `QKT7A5gRiL349k8X` if any sit at the project root.
5. **Assistant — end-to-end acceptance** (`docs/generation-spec.md` section 6) on Test Client as soon as 1–3 are done: upload 6 library images → Draft Style Card → lock → New card with 2 refs → review with reference_analysis → Approve → needs_review within 3 min with image + qc_report (≥ 9 checks) + rendered_prompt containing the text line and two Style Card tokens → Accept → delivered at 300 DPI on Completed. Diagnose any failure from the n8n execution and `cards.last_error` / `generations.last_error`, fix, re-run.
6. **User + assistant — GitHub + Vercel** (README "Deploy to Vercel"): user creates the GitHub repo and confirms the push; import in Vercel with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; deploy. Nothing to add in Supabase Auth unless magic links are enabled.
7. **User — T-Shirt Engine** `DcdygzBz5GAoy2Zg`: open its version history in the n8n UI and confirm the single 2026-09-21 "via MCP" save was your own session (no earlier version exists to diff against).
8. **Assistant — SOP v1.2** (artifact 5X8MwSR1VeEiSdChvvDBUA): update sections 01, 02, 05, 06, 07, 08, 11, 12 from `docs/generation-spec.md` + `docs/n8n-config-contract.md`; fix the rule "secrets never in Set nodes" (now: keys live only in WF-0's Set node); mirror this page into section 11.
9. Before production: upgrade the Supabase project from free tier (pauses after 7 idle days); delete the test lead user and the "Test Client (phase 1)" rows.
