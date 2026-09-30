# DM Studio — status (updated 2026-09-30)

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

- 2026-09-28/29 — nine workflows published (WF-0…WF-7; finisher paths `studio-finisher-dispatch/worker`, Slack removed, WF-6 bound as Error workflow). AI platform switch Kie / OpenRouter / Auto (two full lanes in WF-1/1b/2/3/7, Auto = Kie first then OpenRouter; key in WF-0 "OpenRouter Config"; picker in Settings and on Approve / Edit text / Edit region / Regenerate). E2E S1–S6 PASS on the OpenRouter lane (`tests/e2e/REPORT.md`, bugs E2E-001…014 in `tests/e2e/BUGS.md`).
- 2026-09-30 — edits are surgical: multi-line text edits stay on the same image (prompt-engine v6), region edits are pasted back pixel-exact (WF-3 Edit Image chain, `generations.mask_rect`), QC judges style from structured rules (case never a violation). Card page redesigned image-first (click the picture → text slots from the magic prompt; one stage action; collapsed detail panels) — commit 2c90fc2. Onboarding backend (studio_18): `clients.style_brief`, per-image tick/untick (`client_references.excluded`), text case applied at intake, `approve_card(…, p_style_card_id)` test render with a draft card, `create_style_test_card`, style_profiler v2 (brief tokens, `rules`, `evidence`).

- 2026-09-30 — Onboarding wizard `/clients/:id/onboard`: drop 5–16 designs (tick/untick, per-image note, profiler-order numbering) → written brief & lock parameters (`clients.style_brief`, tier, garment colours; saved through `save_onboarding_brief`, any staff) → Analyse (~$0.02, live progress) → visual Style Card (swatches, typography, chips cross-checked against the brief, per-image evidence with exception warnings, stale-rules banner) → Test render (~$0.10, hidden `style_test` card, auto-approve with the draft) → Lock. Migration studio_19 (test-card order, `max_style_refs` 16, `save_onboarding_brief`).

## Ongoing

- WF-1b swap to `baCsaUp7HdrrSf2i` (deterministic image order + `reference_ids` in drafts) — created and verified, waiting for the user to deactivate `CsohPMosybjBoP8s` / activate the new one (see `tests/e2e/BUGS.md` → Run 5).
- Card-page redesign QA leftovers (4 minor, listed in `tests/e2e/BUGS.md` → Run 4).

## To-do (in order; who)

1. **User — E2E-004 decision:** n8n executions store the vendor keys in node outputs. Options: set every workflow's "Save successful executions" to none (errors only) and rotate the Kie / OpenRouter / Ideogram / imgbb / ModelsLab keys once, or leave as is on a private instance.
2. **Assistant — Kie-lane retest** (S2–S4 with `settings.ai_platform = kie`) as soon as Kie Gemini answers again; `openrouter` stays the default until then.
3. **Assistant — finish the onboarding wizard** (workflow running), then commit and update `tests/e2e/REPORT.md`; fix the 4 card-page minors and E2E-009 (Edit region pixel fields append).
4. **User + assistant — GitHub + Vercel** (README "Deploy to Vercel"): user creates the GitHub repo and confirms the push (branch `e2e-openrouter-platform` holds everything since 2026-09-28; merge to main first); import in Vercel with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; deploy.
5. **Assistant — SOP v1.2** (artifact 5X8MwSR1VeEiSdChvvDBUA): update sections 01, 02, 05, 06, 07, 08, 11, 12 from `docs/generation-spec.md` + `docs/n8n-config-contract.md` + the platform switch + onboarding; mirror this page into section 11.
6. Larger prints: OpenRouter `openai/gpt-image-2.5-sunburst` returns 1024 px (Kie returns 2K) → finals are 3072 px / 10.2 in at 300 DPI; test `size` / `quality` on the OpenRouter Images API if bigger prints are needed.
7. Before production: upgrade the Supabase project from free tier (pauses after 7 idle days); delete the test lead user, the "Test Client (phase 1)" rows and the E2E test client's cards.
