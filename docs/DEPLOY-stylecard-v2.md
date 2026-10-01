# Deploy Style Card v2 (incl. "Art style reference wins")

Everything is built, tested and committed on branch `e2e-openrouter-platform`; the database parts are applied (migrations studio_21–27, new
template versions inserted **inactive**). What is NOT live yet: three Edge Functions and the n8n workflow updates, and the template switch.
Until then the studio runs exactly as before.

The full, ordered runbook with checks and rollback is `n8n/ops/README.md`. Order (rule R1 — never activate a template before its workflow is
published):

1. Deploy Edge Functions `style-card-check` (new), `prompt-engine` (v8), `qc-judge` (v2.1) to project `voatrqhfsdfjomyajovi`, verify_jwt off.
2. Step A — WF-1b `CsohPMosybjBoP8s`: apply `n8n/ops/wf1b.ops.json` + sticky ops, publish, activate `style_sheet` v1 + `style_profiler` v3.
3. Step B — WF-1 `CrpmkqYiaWBtvto6`: apply `n8n/ops/wf1.ops.json` + sticky ops, publish, activate `analysis_prompt` v3, `tier_rules` v2,
   `text_rules` v2, `defects` v2, `background_rule` v2, `style_card_render` v2.
4. Step C — WF-2 `KVLDYPaWZZZtOoir` + WF-3 `V83NWHjzDdyiqtNP`: apply `wf2.ops.json` / `wf3.ops.json` + sticky ops, publish both, activate
   `qc_prompt` v2.
5. Smoke each step as the runbook says (wrong-secret curl, one Analyse ~$0.05, one card ~$0.10).
6. Record migrations studio_19–27 in `supabase_migrations.schema_migrations` (they were applied with execute_sql).
7. In n8n UI: WF-8 Brief Parse `Cu7if7YfPpWjNVnL` → Settings → Error workflow = WF-6; node "Kie Parse Brief" credential = "GPT Image 2 [DM-Kie]".

## Why a fresh Claude Code session

The Supabase `deploy_edge_function` and n8n `update_workflow` tools need array arguments. In a long session that was compacted, these tools
come back without their typed schema and every call is rejected ("Expected array, received string"). A fresh session gets the typed tools.

## Paste this into a fresh Claude Code session opened on `/Users/macbookair/projects/dm-studio`

> Deploy Style Card v2 by following `n8n/ops/README.md` exactly, section 2 then Steps A, B and C, including every check and smoke test
> (spend at most one Analyse ≈ $0.05 and one card ≈ $0.10 on the E2E Test Client `bef63960-2c70-47a3-b727-2c08165b5dae`; never touch the
> client "Chicken Happy Hour"). Deploy Edge Functions `style-card-check`, `prompt-engine`, `qc-judge` with the Supabase MCP
> `deploy_edge_function` (project `voatrqhfsdfjomyajovi`, verify_jwt false). Apply each ops file with the n8n MCP `update_workflow`
> (operations as a JSON array), then `publish_workflow`, then activate the templates of that step in one transaction. If any check fails,
> stop and roll that step back per section 6. Finally record migrations studio_19–27 in `supabase_migrations.schema_migrations` and report
> what was deployed, the smoke results, and anything you did not do.

## Doing it by hand instead

- Edge Functions: `supabase login` with the account that owns the **DM a1** organisation, then the three `supabase functions deploy …
  --project-ref voatrqhfsdfjomyajovi --no-verify-jwt` commands in `n8n/ops/README.md` section 2.
- n8n: the ops files are machine instructions; by hand it is easier to import the sources. Ask a session to produce importable workflow
  JSON from `n8n/wf1b-style-draft.sdk.js`, `wf1-intake.sdk.js`, `wf2-generate.sdk.js`, `wf3-edit.sdk.js` if you prefer that route.
- Template activation SQL: copy the `begin … commit;` blocks from the runbook into the Supabase SQL editor, one step at a time, after the
  matching workflow is published.
