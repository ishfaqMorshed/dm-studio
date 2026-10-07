# Deploy Style Card v2 (incl. "Art style reference wins", "QC sees the Art style reference" and "Fix an area, locked outside")

## Deployed 2026-10-07

Live since 2026-10-07 (project `voatrqhfsdfjomyajovi`; everything below verified live that day). The ordered runbook further down was executed
exactly as written, in order, every check and smoke passed; it stays here as the reference for a re-run or a rollback (`n8n/ops/README.md`
sections 6 and 7).

- **0a. Hot-fix OpenRouter image parameters (E2E-022), 04:4x UTC** - WF-2 `KVLDYPaWZZZtOoir` published version `a97b0c40-032d-409b-aca1-f71095a4aa7e`,
  WF-3 `V83NWHjzDdyiqtNP` published version `00604cbf-42ce-451f-b119-5687284e5eae`. Smoke on the E2E Test Client: generation a78197cd
  (execution 117510) done in 27 s, `Build OpenRouter Image` item dropped `["resolution","output_format"]`, mapped `[]`, caps_source `"live"`
  (so `this.helpers.httpRequest` works in the Code node on this n8n).
- **0. studio_29b** - applied with apply_migration, recorded as `20261007045339 studio_29b_region_child_no_notify`. Gate proven by the Use full
  regeneration smoke below (`n8n_execution_id` still NULL after 75 s).
- **studio_30 (new, same day)** - `supabase/migrations/20261007_studio_30_gens_staff_update.sql`, policy `gens_staff_update` (staff may replace
  objects in the `gens` bucket), written and applied. It fixes the "A mask for this generation already exists and could not be replaced (new row
  violates row-level security policy)" error of a second Fix an area on the same version - the bucket had no staff UPDATE policy (E2E-023).
- **1. Edge Functions** (verify_jwt false): `style-card-check` v1 (deployed as two files `style-card-check/index.ts` + `_shared/style_card_rules.ts`,
  entrypoint `style-card-check/index.ts`; probes: wrong secret 401, positive 200 with the expected validation errors); `region-composite` v1
  (probes 401 / OPTIONS 204 / unknown id 404 `not_found`); `qc-judge` v2 (the deployed `qc.ts` differs from the repo only in that the six À / ɏ
  escapes in `mentionedInInstruction` are stored as the literal characters - same regex semantics, verified by a byte comparison);
  `prompt-engine` v8 = ONE minified esbuild bundle `index.ts` (64792 bytes, sha256
  `3173a777500a0bed892d1ca375c47c9f8cf4de02fdf9b9a25e260b728f5296cd`) produced by `scripts/bundle-prompt-engine.sh` (esbuild 0.25.10,
  `--bundle --format=esm --minify --line-limit=180`, `jsr:*` external) because the three sources (160 KB) exceed what the Supabase MCP
  `deploy_edge_function` call can carry; the deployed file was verified byte-identical to the bundle; probes 401 / OPTIONS 204. The other three
  functions were verified byte-identical to the repo sources (except the qc.ts escapes).
- **2. Step A - WF-1b `CsohPMosybjBoP8s`** - published version `f7413f44-0db0-4a53-aacb-7c88fd63545e` (65 ops + sticky); templates `style_sheet` v1 +
  `style_profiler` v3 active. Smoke: style_draft_requests 0a8d1982 (execution 117661) done in 68 s, 5 sheets (OpenRouter Describe Designs),
  validation errors `[]` after 5 automatic fixes, no repair pass, draft Style Card v7 4b2c704a on the E2E client (UPPER, bold, 5-colour strict
  palette). Cosmetic nit: Parse Sheets reports `sheet_template_version` null while `raw.template_versions.sheet` is 1.
- **3. Step B - WF-1 `CrpmkqYiaWBtvto6`** - published version `46d45ec0-bb49-4550-a7c1-a12a8f24530b` (22 ops + sticky); templates `analysis_prompt` v3,
  `tier_rules` v2, `text_rules` v2, `defects` v2, `background_rule` v2, `style_card_render` v2 active. Smoke: card
  9b2b4180-fc26-4de9-be01-513476489db7 (`create_card_as_designer` with three fixture references uploaded under `<client>/<card>/ref-N.png`, roles
  subject / art_style / typography; execution 117684): review in 94 s, Build Analysis Request text carries IMAGE 1 - WHAT TO MAKE / IMAGE 2 - ART
  STYLE / IMAGE 3 - LETTERING and no `{{` token, `reference_analysis` template_version 3 with 3 per-slot readings, the art slot palette (3 hexes)
  and stage note "reference analysis complete (3 references)". Note: the RPC refuses library paths - card references must live under
  `<client_id>/<card_id>/`.
- **4. Step C - WF-2 `KVLDYPaWZZZtOoir` + WF-3 `V83NWHjzDdyiqtNP`** - WF-2 published version `ca401e02-06d0-4288-b98f-2b0fe41f4986` (5 ops + sticky),
  WF-3 published version `806d197b-c596-4461-8068-1afe23efe036` (35 ops + sticky); `qc_prompt` v2 active.
  - Generate smoke on that card (generation 454939ef, execution 117694, OpenRouter Sunburst): done in 45 s, attempt 1, prompt has the ART STYLE
    block, the SUBJECT block (subject from the WHAT TO MAKE reference), the per-slot REFERENCES block and the art PRECEDENCE line, no `..`, no
    NICHE leak, no as_typed, no `{{`; effective_style source `art_reference` with reference_path `<client>/<card>/ref-2.png` and
    reference_image_index 2; QC verdict pass, score 100, style_match 100, art_reference_attached true, art_match overall "same", one art_style
    check passed; card needs_review.
  - Fix an area smoke (child 51ab7937, execution 117700, instruction "replace the sun with a crescent moon", box 320,300 384x300 on a 1024 px
    parent): done in 71 s on openai/gpt-image-2.5-sunburst via OpenRouter, `Build OpenRouter Image` body = exactly model, prompt,
    input_references (2), aspect_ratio 1:1, quality high, background opaque, n 1 with dropped `[]` mapped `[]` caps_source live; raw stored at
    `<card>/<child>.raw.png`, composite_mode locked, beyond_ring_changed_px 0, shift (0,0) reliable, colour offset r -1.4 g -0.4 b 0.5, resampled
    null, overflow false, drift_outside_pct_gt8 3.4, seam_ratio_box 1.12, seam_ratio_ring 1.0, composite 1.4 s total; QC pass with region
    {instruction_done true, seam_visible false, object_cut_off false, text_changed null (no lettering touches the area)}; card current = the child.
  - Use full regeneration smoke ($0, staff login, mode full): child d60384ca done, composite_mode full, drift_pct 3.4, raw_image_path = the
    source's raw, `n8n_execution_id` still NULL after 75 s (studio_29b gate proven), card current = that child.
- **6. Migration records** - studio_19, 20, 21, 22, 23, 24, 25, 25b, 25c, 27 and 29 recorded in `supabase_migrations.schema_migrations` with
  synthetic versions 20260930000019..22, 20261001000023..28 and 20261005000029 (name = the file's studio name); studio_26, 28, 29b and 30 were
  already recorded by apply_migration.
- **Verification method for every n8n step** - a read-only comparison of the live draft (`get_workflow_details`) against the SDK-parsed source:
  node names, parameters, settings and the edge set identical for WF-1b (37+1, 56), WF-1 (28+1, 38), WF-2 (53+1, 75) and WF-3 (45+1, 71).
  `get_workflow_details` omits credential bindings, so Describe Designs and Profile Style got an explicit setNodeCredential
  (`Gemini 3.1 Pro [DM-Kie]`, 0l2nHQUQNnsCAfTR) before publishing.
- **Remaining / known** - `n8n/ops/before/*.sdk.js` baselines are now STALE (the live workflows moved to the versions above): refresh them from
  the live versions before generating new ops (`n8n/ops/README.md` section 7). The probe workflow `qTPPe2lbVfKDeQv8` is being archived; WF-8
  `Cu7if7YfPpWjNVnL` error workflow + Kie credential are being set (step 7 below). The user's Happy Hour Farm card 2e99c36b is retried by the user,
  never by an automated session. 4:5 back / full_front / tote placements on OpenRouter GPT Image render as 3:4 (mapped). Kie region lane still
  untested.

## Runbook (executed 2026-10-07 - kept for re-runs and rollback)

State before the run: everything built, tested and committed on branch `e2e-openrouter-platform`; the database parts applied (migrations
studio_21–28, new template versions inserted **inactive**; studio_28 = the qc_prompt v2 ART STYLE REFERENCE paragraph + `settings.qc_art_regen`,
applied 2026-10-02 with apply_migration, so already recorded in `supabase_migrations.schema_migrations`; studio_29 = Fix an area locked outside -
`generations.raw_image_path` / `region_metrics` / `composite_mode`, `settings.region_ring_pct`, `openrouter_models.region`, `rpc region_child` -
applied with execute_sql by the engine step of the 2026-10-05 build, confirmed with the three studio_29 checks in `n8n/ops/README.md` section 2
and recorded 2026-10-07 as `20261005000029`; it is harmless to the live WF-3. studio_29b = `20261005_studio_29b_region_child_no_notify.sql`,
the 2026-10-06 review fix: the edit trigger `generations_notify_edit` gets an explicit `WHEN (new.kind <> 'generate' and new.status = 'queued')`
clause (the same test the phase-1 function body already had, now owned by a file and self-checked) so that Extend area / Use full regeneration -
which insert their $0 child with status done through `rpc region_child` - can never start WF-3 on it; applied 2026-10-07 as step 0 below). Not
live before the run: studio_29b, the four Edge Functions, the n8n workflow updates and the template switch - all live since 2026-10-07 (section
above).

The full, ordered runbook with checks and rollback is `n8n/ops/README.md`. Order (rule R1 — never activate a template before its workflow is
published):

0a. **Hot-fix first (2026-10-06, independent of everything below; `n8n/ops/README.md` section 0):** OpenRouter now rejects `resolution` /
   `output_format` for GPT Image, so every OpenRouter generate failed (E2E-022; applied 2026-10-07 04:4x UTC, versions above). Apply the bundle `n8n/ops/hotfix-2026-10-06-openrouter-params/`
   = one `Build OpenRouter Image` node update per workflow.
   Route A (n8n UI): paste the bundle's `wf2-build-openrouter-image.js` into `Build OpenRouter Image` of WF-2 `KVLDYPaWZZZtOoir` and
   `wf3-build-openrouter-image.js` into the same node of WF-3 `V83NWHjzDdyiqtNP`, Save, Publish.
   Route B (MCP): `update_workflow` with the bundle's `wf2.ops.json` then `publish_workflow KVLDYPaWZZZtOoir`; `wf3.ops.json` then `publish_workflow V83NWHjzDdyiqtNP`.
   Then the USER retries card 2e99c36b (Chicken Happy Hour, a 4:5 back placement); the execution's `Build OpenRouter Image` item lists
   `dropped: ["resolution","output_format"]`, `mapped: ["aspect_ratio 4:5 to 3:4"]` (GPT Image has no 4:5; the design comes back 3:4) and
   `caps_source: "live"`.
   Step C below re-applies the WF-2 node idempotently and adds the region branch to the WF-3 node (the hot-fix node is region-free).
0. Apply `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql` as one script (SQL editor or execute_sql; its final DO block
   raises unless the trigger gate is visible, so a silent success is the proof) and run the two studio_29b checks of `n8n/ops/README.md`
   section 2 (`pg_get_triggerdef` shows `WHEN (... new.status = 'queued' ...)`). Harmless to the live WF-3: request_edit still fires.
   (Applied 2026-10-07 with apply_migration, recorded `20261007045339`.)
1. Deploy Edge Functions `style-card-check` (new), `prompt-engine` (v8.1), `qc-judge` (v2.3) and `region-composite` (new, 2026-10-05) to
   project `voatrqhfsdfjomyajovi`, verify_jwt off for all four (region-composite checks `x-studio-secret` for WF-3 and a staff JWT through
   `rpc/is_staff` for the app's Extend area / Use full regeneration, so the gateway must not verify the JWT).
   (prompt-engine v8 now also writes `effective_style.reference_path` / `reference_image_index`; qc-judge v2.2 reads the request field
   `art_reference_attached` and `settings.qc_art_regen` - same functions, nothing extra to deploy. v8.1 / v2.3 add the Fix an area region
   lane: the `region` block WF-3 sends to GPT Image 2.5 Sunburst, and the 4 region QC checks. Probe region-composite as the runbook
   section 2 says: wrong secret -> 401, OPTIONS -> 204.)
2. Step A — WF-1b `CsohPMosybjBoP8s`: apply `n8n/ops/wf1b.ops.json` + sticky ops, publish, activate `style_sheet` v1 + `style_profiler` v3.
3. Step B — WF-1 `CrpmkqYiaWBtvto6`: apply `n8n/ops/wf1.ops.json` + sticky ops, publish, activate `analysis_prompt` v3, `tier_rules` v2,
   `text_rules` v2, `defects` v2, `background_rule` v2, `style_card_render` v2.
4. Step C — WF-2 `KVLDYPaWZZZtOoir` + WF-3 `V83NWHjzDdyiqtNP`: apply `wf2.ops.json` / `wf3.ops.json` + sticky ops, publish both, activate
   `qc_prompt` v2 (it carries the studio_28 `{{ART_REFERENCE_ATTACHED}}` paragraph, so it must go live only with the WF-2/WF-3 that fill it).
   The Art style reference attachment switches on with this activation: the new WF-2 attaches the second QC image only when the active
   `qc_prompt` body carries `{{ART_REFERENCE_ATTACHED}}`, so before it (qc_prompt v1 active) a smoke shows one `image_url` part and
   `art_reference_attached` false - that is expected, not a broken WF-2. After it, an art-reference card shows two `image_url` parts.
   `wf3.ops.json` now also carries the WF-3 region lane (35 ops: Fix an area = GPT Image 2.5 Sunburst on OpenRouter, raw regeneration stored,
   Edge Function region-composite keeps only the area, Region QC Prompt) - it needs studio_29 and the four functions of step 1 first.
5. Smoke each step as the runbook says (wrong-secret curl, one Analyse ~$0.05, one card ~$0.10, one Fix an area ~$0.07).
6. Record migrations studio_19–25c, studio_27, studio_29 (`20261005_studio_29_region_locked_outside.sql`) and studio_29b
   (`20261005_studio_29b_region_child_no_notify.sql`) in `supabase_migrations.schema_migrations` (they were applied with execute_sql;
   studio_26 and studio_28 are already recorded). Done 2026-10-07: synthetic versions as listed above; studio_29b (and studio_30) went in
   through apply_migration.
7. In n8n UI: delete the temporary probe workflow `qTPPe2lbVfKDeQv8` ("DM Studio · PROBE region edit (temporary)", unpublished, manual-start only). WF-8 Brief Parse `Cu7if7YfPpWjNVnL` → Settings → Error workflow = WF-6; node "Kie Parse Brief" credential = "GPT Image 2 [DM-Kie]".
   (2026-10-07: the probe workflow is being archived; the WF-8 error workflow + Kie credential are being set.)

## Why a fresh Claude Code session

The Supabase `deploy_edge_function` and n8n `update_workflow` tools need array arguments. In a long session that was compacted, these tools
come back without their typed schema and every call is rejected ("Expected array, received string"). A fresh session gets the typed tools.

## Paste this into a fresh Claude Code session opened on `/Users/macbookair/projects/dm-studio` - already executed on 2026-10-07

Already executed on 2026-10-07 (results in "Deployed 2026-10-07" at the top). Kept as the reference text; a re-run needs fresh BEFORE baselines
first (`n8n/ops/README.md` section 7) because every `*.ops.json` targets the 2026-09-30 live graphs, which the workflows have left.

> Deploy Style Card v2 by following `n8n/ops/README.md` exactly. FIRST action (section 0, hot-fix E2E-022): apply
> `n8n/ops/hotfix-2026-10-06-openrouter-params/wf2.ops.json` with the n8n MCP `update_workflow` on `KVLDYPaWZZZtOoir` then `publish_workflow`,
> and `wf3.ops.json` on `V83NWHjzDdyiqtNP` then `publish_workflow`; do NOT retry card 2e99c36b or any Chicken Happy Hour card - the user does that
> retry; report that the hot-fix is live and move on. Then apply `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql`
> with execute_sql as one script (it self-checks) and run its two checks, then section 2, then Steps A, B and C, including every check and smoke test
> (spend at most one Analyse ≈ $0.05, one card ≈ $0.10 and one Fix an area ≈ $0.07 on the E2E Test Client `bef63960-2c70-47a3-b727-2c08165b5dae`; never touch the
> client "Chicken Happy Hour"). Deploy Edge Functions `style-card-check`, `prompt-engine`, `qc-judge`, `region-composite` with the Supabase MCP
> `deploy_edge_function` (project `voatrqhfsdfjomyajovi`, verify_jwt false). Apply each ops file with the n8n MCP `update_workflow`
> (operations as a JSON array), then `publish_workflow`, then activate the templates of that step in one transaction. If any check fails,
> stop and roll that step back per section 6. Finally record migrations studio_19–25c, studio_27, studio_29 and studio_29b in `supabase_migrations.schema_migrations`
> (studio_26 and studio_28 are already recorded) and report
> what was deployed, the smoke results, and anything you did not do.

## Doing it by hand instead

- Hot-fix first (step 0a): in the n8n UI open WF-2 `KVLDYPaWZZZtOoir` -> node `Build OpenRouter Image` -> replace the JavaScript with the
  bundle's `n8n/ops/hotfix-2026-10-06-openrouter-params/wf2-build-openrouter-image.js` -> Save -> Publish; same for WF-3 `V83NWHjzDdyiqtNP` with
  `wf3-build-openrouter-image.js`. Then Retry card 2e99c36b.
- SQL first: paste `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql` into the Supabase SQL editor and run it whole (it raises
  unless the trigger gate is visible afterwards), then the two checks in `n8n/ops/README.md` section 2.
- Edge Functions: `supabase login` with the account that owns the **DM a1** organisation, then the four `supabase functions deploy …
  --project-ref voatrqhfsdfjomyajovi --no-verify-jwt` commands in `n8n/ops/README.md` section 2.
- n8n: the ops files are machine instructions; by hand it is easier to import the sources. Ask a session to produce importable workflow
  JSON from `n8n/wf1b-style-draft.sdk.js`, `wf1-intake.sdk.js`, `wf2-generate.sdk.js`, `wf3-edit.sdk.js` if you prefer that route.
- Template activation SQL: copy the `begin … commit;` blocks from the runbook into the Supabase SQL editor, one step at a time, after the
  matching workflow is published.
