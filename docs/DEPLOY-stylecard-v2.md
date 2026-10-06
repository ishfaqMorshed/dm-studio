# Deploy Style Card v2 (incl. "Art style reference wins", "QC sees the Art style reference" and "Fix an area, locked outside")

Everything is built, tested and committed on branch `e2e-openrouter-platform`; the database parts are applied (migrations studio_21–28, new
template versions inserted **inactive**; studio_28 = the qc_prompt v2 ART STYLE REFERENCE paragraph + `settings.qc_art_regen`, applied
2026-10-02 with apply_migration, so it is already recorded in `supabase_migrations.schema_migrations`; studio_29 = Fix an area locked outside -
`generations.raw_image_path` / `region_metrics` / `composite_mode`, `settings.region_ring_pct`, `openrouter_models.region`, `rpc region_child` -
applied with execute_sql by the engine step of the 2026-10-05 build, NOT recorded - confirm it with the three studio_29 checks in
`n8n/ops/README.md` section 2 before step 1; it is harmless to the live WF-3. studio_29b = `20261005_studio_29b_region_child_no_notify.sql`,
the 2026-10-06 review fix: the edit trigger `generations_notify_edit` gets an explicit `WHEN (new.kind <> 'generate' and new.status = 'queued')`
clause (the same test the phase-1 function body already had, now owned by a file and self-checked) so that Extend area / Use full regeneration -
which insert their $0 child with status done through `rpc region_child` - can never start WF-3 on it. It is written but NOT APPLIED: run it as
step 0 below). What is NOT live yet: studio_29b, four Edge Functions and the n8n workflow updates, and the template switch.
Until then the studio runs exactly as before.

The full, ordered runbook with checks and rollback is `n8n/ops/README.md`. Order (rule R1 — never activate a template before its workflow is
published):

0. Apply `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql` as one script (SQL editor or execute_sql; its final DO block
   raises unless the trigger gate is visible, so a silent success is the proof) and run the two studio_29b checks of `n8n/ops/README.md`
   section 2 (`pg_get_triggerdef` shows `WHEN (... new.status = 'queued' ...)`). Harmless to the live WF-3: request_edit still fires.
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
   studio_26 and studio_28 are already recorded).
7. In n8n UI: delete the temporary probe workflow `qTPPe2lbVfKDeQv8` ("DM Studio · PROBE region edit (temporary)", unpublished, manual-start only). WF-8 Brief Parse `Cu7if7YfPpWjNVnL` → Settings → Error workflow = WF-6; node "Kie Parse Brief" credential = "GPT Image 2 [DM-Kie]".

## Why a fresh Claude Code session

The Supabase `deploy_edge_function` and n8n `update_workflow` tools need array arguments. In a long session that was compacted, these tools
come back without their typed schema and every call is rejected ("Expected array, received string"). A fresh session gets the typed tools.

## Paste this into a fresh Claude Code session opened on `/Users/macbookair/projects/dm-studio`

> Deploy Style Card v2 by following `n8n/ops/README.md` exactly: first apply `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql`
> with execute_sql as one script (it self-checks) and run its two checks, then section 2, then Steps A, B and C, including every check and smoke test
> (spend at most one Analyse ≈ $0.05, one card ≈ $0.10 and one Fix an area ≈ $0.07 on the E2E Test Client `bef63960-2c70-47a3-b727-2c08165b5dae`; never touch the
> client "Chicken Happy Hour"). Deploy Edge Functions `style-card-check`, `prompt-engine`, `qc-judge`, `region-composite` with the Supabase MCP
> `deploy_edge_function` (project `voatrqhfsdfjomyajovi`, verify_jwt false). Apply each ops file with the n8n MCP `update_workflow`
> (operations as a JSON array), then `publish_workflow`, then activate the templates of that step in one transaction. If any check fails,
> stop and roll that step back per section 6. Finally record migrations studio_19–25c, studio_27, studio_29 and studio_29b in `supabase_migrations.schema_migrations`
> (studio_26 and studio_28 are already recorded) and report
> what was deployed, the smoke results, and anything you did not do.

## Doing it by hand instead

- SQL first: paste `supabase/migrations/20261005_studio_29b_region_child_no_notify.sql` into the Supabase SQL editor and run it whole (it raises
  unless the trigger gate is visible afterwards), then the two checks in `n8n/ops/README.md` section 2.
- Edge Functions: `supabase login` with the account that owns the **DM a1** organisation, then the four `supabase functions deploy …
  --project-ref voatrqhfsdfjomyajovi --no-verify-jwt` commands in `n8n/ops/README.md` section 2.
- n8n: the ops files are machine instructions; by hand it is easier to import the sources. Ask a session to produce importable workflow
  JSON from `n8n/wf1b-style-draft.sdk.js`, `wf1-intake.sdk.js`, `wf2-generate.sdk.js`, `wf3-edit.sdk.js` if you prefer that route.
- Template activation SQL: copy the `begin … commit;` blocks from the runbook into the Supabase SQL editor, one step at a time, after the
  matching workflow is published.
