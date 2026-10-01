# Runbook — WF-1b Style Draft, Style Card v2 (two-pass profiler + validator + repair)

Spec: `docs/stylecard-v2-spec.md` section 3 / 2.1. Source of truth: `n8n/wf1b-style-draft.sdk.js` (validator green, 38 nodes, 56 connections).
This session could not write to n8n; everything below is for the operator (user or a session with `update_workflow` /
`create_workflow_from_code` / `publish_workflow`). Nothing here touches `src/` or `supabase/`.

## 0. What the new WF-1b does (one screen)

```
Style Draft Webhook → Load Config → Secret OK? → Config → Draft → working (rpc style_draft_update, unchanged)
→ Get Client (id,name,garment_colors,notes,style_brief) → Get Settings → Get Templates (slug=in.(style_sheet,style_profiler), active)
→ List Library (id,path,note,meta; created_at desc, id desc; limit max_style_refs) → Has Library? → Sign Library Ref
→ PASS A  Build Sheet Request → Sheet Platform? → Describe Designs (Kie) | OpenRouter Describe Designs → Kie Sheet Down? → Parse Sheets
→ PASS B  Build Style Request → Style Platform? → Profile Style (Kie) | OpenRouter Profile Style → Kie Style Down? → Parse Style Card
→ Check Style Card (POST /functions/v1/style-card-check) → Card OK?
     true  → New Style Card Version (rpc, the CHECKED card) → Extract Style Card Id → Draft → done (PATCH style_draft_requests: status, style_card_id, raw)
     false → Build Repair Request → Repair Style Card (OpenRouter text model) → Parse Repair → Check Repaired Card → Repaired Card OK?
                true  → New Style Card Version → ... → Draft → done
                false → Fail Message → Draft → failed (PATCH: status failed, last_error, raw)
Any other failure → Fail Message → Draft → failed (raw keeps whatever exists: sheets survive a Pass B failure)
Empty library → Empty Library Message → Draft → failed
```

Contract with the backend workflow (names are exact):
- Templates `style_sheet` v1 (Pass A) and `style_profiler` v3 (Pass B). Tokens rendered by WF-1b: `CLIENT_NAME, NICHE, SUBJECTS, BRAND_TEXT, GARMENT_COLORS` (comma list), `CLIENT_NOTES, MUST_HAVE, AVOID, TYPOGRAPHY_NOTE, PALETTE_MODE, TEXT_CASE, LOCK_TYPOGRAPHY, LOCK_COMPOSITION, REFERENCE_NOTES, IMAGE_COUNT, SHEETS_JSON`. Unknown tokens stay literal (R1).
- `REFERENCE_NOTES` line per image: `Image i: <meta.kind|design>[ on a <meta.garment> garment][; best example of <meta.best_for>][; OUTLIER - not the style][; <note>]`.
- Edge Function `POST {{sbUrl}}/functions/v1/style-card-check` with headers `apikey` + `x-studio-secret`, body `{card, brief, image_count, sheets, reference_ids, client_garments}`; reply `{card (validation filled), errors[], warnings[], fixes[], agreement}`. `Card OK?` = `errors.length === 0`.
- `style_draft_requests.raw` = `{sheets, card, validation, template_versions}` (+ `repaired` on done). Written by direct PATCH (policy `sdr_worker_all`) because rpc `style_draft_update` has no raw argument.
- `style_cards.json` gains `rules`, `reference_ids`, `source = 'library'`, `validation` (from the validator) on top of the v3 profiler keys.

## 1. Preflight (all must be true before publishing)

Run in the Supabase SQL editor (project `voatrqhfsdfjomyajovi`):

```sql
-- Phase 1 columns (studio_21)
select column_name from information_schema.columns where table_schema='public' and table_name='style_draft_requests' and column_name='raw';
select column_name from information_schema.columns where table_schema='public' and table_name='client_references' and column_name='meta';
-- templates inserted, still inactive
select slug, version, active from public.prompt_templates where slug in ('style_sheet','style_profiler') order by slug, version;
-- worker may PATCH style_draft_requests (verified 2026-09-30: policy sdr_worker_all, anon, studio_secret_ok())
select polname, polcmd from pg_policy where polrelid = 'public.style_draft_requests'::regclass;
```
Expected: `raw` and `meta` exist; `style_sheet 1 false`, `style_profiler 2 true`, `style_profiler 3 false`; `sdr_worker_all *`.

Edge Function (Phase 3 deployed):
```
curl -s -X POST "$SB_URL/functions/v1/style-card-check" -H "apikey: $ANON" -H "x-studio-secret: $SECRET" -H "content-type: application/json" \
  -d '{"card":{"medium":"x","palette":[]},"brief":{},"image_count":1,"sheets":null,"reference_ids":[],"client_garments":[]}'
```
Expected: HTTP 200 with `errors` non-empty (palette count). A 404 here means WF-1b would fail every draft with `style-card-check ... 404`.

n8n: WF-0 `vbyjWhK4ZRN9uZUM` has `openrouterKey` pasted (the repair call is OpenRouter-only; on the Kie lane a repair without the key fails with a message naming both the validation errors and the missing key). Kie credential `Gemini 3.1 Pro [DM-Kie]` `0l2nHQUQNnsCAfTR` exists.

Repo: `node n8n/tools/check.js n8n/wf1b-style-draft.sdk.js` prints `valid: true  ok: true`; `node n8n/tools/test-wf1b-style.js` prints `all checks passed`.

## 2. Apply — pick ONE path

### Path A (recommended): update the unpublished base `baCsaUp7HdrrSf2i`
`baCsaUp7HdrrSf2i` equals the HEAD file before this change (List Library `id.desc`, `reference_ids`); the ops were diffed against exactly that.
1. `update_workflow(id = baCsaUp7HdrrSf2i, operations = <n8n/ops/wf1b-from-base-baCsaUp7HdrrSf2i.ops.json>)` — 65 operations: 14 addNode (+10 setNodeSettings), 10 updateNodeParameters (Fail Message, List Library, Build Style Request, Profile Style, OpenRouter Profile Style, Parse Style Card, New Style Card Version, Extract Style Card Id, Draft → done, Draft → failed), removeNode `Get Template`, 2 removeConnection, 28 addConnection. If the connector rejects one big call, send `n8n/ops/wf1b-from-base-baCsaUp7HdrrSf2i.ops.split8.jsonl` line by line (8 ops per call, in order — adds first, then updates, then connections).
2. Positions of existing nodes are not moved by the ops; open the canvas and press **Tidy up** (shift+alt+T) once.
3. `get_workflow_details('baCsaUp7HdrrSf2i')` and confirm: 37 functional nodes, no node named `Get Template`, `Check Style Card` and `Check Repaired Card` present, `Draft → done` method PATCH.
4. Settings → Error workflow = `DM Studio · WF-6 Error` (`PIgUHDGkVJVg9FHj`) — live-only setting, must be set by hand (see `docs/n8n-config-contract.md`).
5. Unpublish `CsohPMosybjBoP8s` (same webhook path `studio-style-draft`; two published workflows cannot share it), then publish `baCsaUp7HdrrSf2i`.
6. Activate the templates in the SAME step (R1), one transaction:
```sql
begin;
update public.prompt_templates set active = false where slug = 'style_profiler' and version <> 3;
update public.prompt_templates set active = true  where slug = 'style_profiler' and version = 3;
update public.prompt_templates set active = true  where slug = 'style_sheet'    and version = 1;
commit;
```
7. Memory / STATUS: the live WF-1b id is now `baCsaUp7HdrrSf2i`; archive `CsohPMosybjBoP8s` after the smoke test.

### Path B: update the live `CsohPMosybjBoP8s` in place
Same as A with `n8n/ops/wf1b-from-live-CsohPMosybjBoP8s.ops.json` (also 65 ops; the live copy equals `git show 2c90fc2:n8n/wf1b-style-draft.sdk.js`, saved as `n8n/ops/before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js`). The change goes live on publish, so run step 6 immediately after. Error workflow is already bound on this id.

### Path C: re-create from code
`create_workflow_from_code` with the content of `n8n/wf1b-style-draft.sdk.js` (folder `QKT7A5gRiL349k8X`), then steps 4–6 of Path A for the new id. Positions come from the file (clean left-to-right layout). Use this when `update_workflow` is unusable (bare tool schemas after a context compaction).

## 3. Smoke test (about $0.05, 4–5 min on OpenRouter)

Pick a client whose brief is complete (niche, ≥ 1 subject, ≥ 1 garment colour — the studio_21 trigger refuses otherwise) and whose library has 5+ ticked images. Insert the request from the wizard Analyse button or SQL:
```sql
insert into public.style_draft_requests (client_id, status, requested_by) values ('<client uuid>', 'queued', auth.uid()) returning id;
```
Then:
```sql
select status, last_error, style_card_id, jsonb_array_length(raw->'sheets') as sheets, raw->'validation'->'errors' as errors,
       raw->'template_versions' as versions, raw->'repaired' as repaired
  from public.style_draft_requests where id = '<request id>';
select version, status, json->'reference_ids' as refs, json->'validation'->'errors' as errors, json->'source' as source, json->'rules' as rules
  from public.style_cards where id = (select style_card_id from public.style_draft_requests where id = '<request id>');
```
Expected (spec 2.1 acceptance): `status done`; `sheets` = the number of ticked images; `errors []`; `versions {"sheet":1,"profiler":3}`; the card has `reference_ids` of that length, `source "library"`, `rules` from the brief, `typography.case` in UPPER|lower|Title|Mixed, `linework.weight` in the enum, no string outside `brand_text` matching `/@|handle/i`.
In the n8n execution: `Parse Sheets` output `sheet_note` is empty; `Build Style Request` text contains the `SHEETS_JSON` array and the `REFERENCE_NOTES` lines from `client_references.meta`.

Degradation checks (optional, cheap):
- Deactivate `style_sheet` v1 and draft again → `raw.sheets` null, `Parse Sheets.sheet_note` = "no active style_sheet template ...", the card still stores (Pass B alone). Re-activate.
- Set `settings.ai_platform = 'auto'` while Kie is down → both passes fall through `Kie ... Down?` to the OpenRouter twins.

## 4. Failure modes → what you see

| Symptom (style_draft_requests.last_error) | Cause | Action |
|---|---|---|
| `no active style_profiler template in prompt_templates` | step 6 not run | activate v3 |
| `style-card-check ... 404` / `Vision service unavailable ...` from Check Style Card | Edge Function not deployed / secret mismatch | deploy Phase 3, check WF-0 studioSecret |
| `Style Card still fails validation after one repair - <errors joined with " - ">` | profiler + one repair could not satisfy the validator | read `raw.validation.errors`, fix the brief or images, draft again |
| `Style Card failed validation (...) and the repair call failed (OpenRouter error 401 - OpenRouter API key missing ...)` | no key in WF-0 | paste the key, draft again |
| `Could not sign N of M library images ...` | storage path / RLS | check `refs` bucket paths. `Build Sheet Request` raises it first (to `Parse Sheets`, so Pass A is skipped and no vision call is paid), then `Build Style Request` fails the run with the same count |
| request stuck in `working` | PATCH refused (missing `raw` column or policy) | run the preflight SQL; the n8n execution shows the PostgREST error on `Draft → done` |
| `raw.sheets` null but `status done` | Pass A degraded (count mismatch, fences, vendor error) — by design | see `Parse Sheets.sheet_note` in the execution; the profiler worked from the images alone |

## 5. Rollback (one transaction + one publish)

```sql
begin;
update public.prompt_templates set active = false where slug = 'style_profiler' and version = 3;
update public.prompt_templates set active = true  where slug = 'style_profiler' and version = 2;
update public.prompt_templates set active = false where slug = 'style_sheet';
commit;
```
Unpublish the new WF-1b, publish `CsohPMosybjBoP8s` again (or re-create it from `n8n/ops/before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js`). The `raw` and `meta` columns can stay; the old workflow ignores them.

## 6. Decisions taken in the source (deviations from the spec text, all deliberate)

- **Second check has its own nodes** (`Check Repaired Card`, `Repaired Card OK?`) instead of looping back into `Check Style Card`: n8n cycles make `$('Node').first()` ambiguous between runs and would need a loop guard; a DAG gives exactly one repair and deterministic references for `raw`.
- **`Draft → done` / `Draft → failed` PATCH the table** (`sdr_worker_all` verified live) because `style_draft_update(p_request_id, p_status, p_style_card_id, p_error, p_execution_id)` has no raw argument; `Draft → working` still uses the RPC. `updated_at` is set in the body as well.
- **Pass A skip without a template**: `Build Sheet Request` throws when `style_sheet` is missing and its error output feeds `Parse Sheets`, so no vision call is paid and the run continues with `sheets = null`. `Build Style Request` therefore reads the signed URLs from `Sign Library Ref` directly, not from its input. The same node also throws `Could not sign N of M library images - skipping per-image sheets` when `Sign Library Ref` signed fewer items than `List Library` returned (review fix 2026-09-30): the per-image notes would otherwise be misaligned and the Pass A call paid for nothing; `Build Style Request` then fails the run with its existing message, as the live workflow did.
- **Repair call**: `max_tokens 8000`, no `response_format` (Claude via OpenRouter does not honour `json_object`); `Parse Repair` strips fences and extracts the first `{...}`. The repair message names both the validation errors and the vendor error when the call fails.
- **Parse Style Card** no longer checks the 13 v1 keys or the palette; the validator owns the shape (spec: "JSON extraction only").
- **Sticky note kept** (pre-existing; the validator flags stickies as informational only).

## 7. Files

- Source: `n8n/wf1b-style-draft.sdk.js`
- Before copies: `n8n/ops/before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js` (= `git show 2c90fc2`), `n8n/ops/before/wf1b-style-draft.base-baCsaUp7HdrrSf2i.sdk.js` (= HEAD before this change)
- Ops: `n8n/ops/wf1b-from-base-baCsaUp7HdrrSf2i.ops.json` (+ `.split8.jsonl`), `n8n/ops/wf1b-from-live-CsohPMosybjBoP8s.ops.json` (+ `.split8.jsonl`); regenerate with `node n8n/tools/diff-ops.js <before> n8n/wf1b-style-draft.sdk.js [--split 8]`
- Tests: `node n8n/tools/check.js n8n/wf1b-style-draft.sdk.js`, `node n8n/tools/test-wf1b-style.js` (template bodies read from `supabase/migrations/20260930_studio_21_style_card_v2.sql` through `n8n/tools/template-from-migrations.js`; the fixture `n8n/tools/fixtures/stylecard-v2-templates.js` = spec 1.4 bodies is the fallback and a check fails when it drifts from the migration)
- Docs touched: `docs/generation-spec.md` (WF-1b paragraph, style_draft_requests line), `docs/n8n-config-contract.md` (items 5, 13), `docs/STATUS.md` (Ongoing)
