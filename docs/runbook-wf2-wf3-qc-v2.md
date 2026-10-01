# Runbook - WF-2 / WF-3 QC request v2 (Style Card v2 spec, Phase 2, section 2.3)

Scope: n8n **WF-2 Generate** (`KVLDYPaWZZZtOoir`) and **WF-3 Edit** (`V83NWHjzDdyiqtNP`) only. Nothing here was applied to n8n: the
sources, the BEFORE copies, the `update_workflow` operations and this runbook were produced offline (2026-09-30); the apply is a
user / connector step. WF-1b and WF-1 have their own runbooks.

## What changes (sources, branch e2e-openrouter-platform)

| File | Node | Change |
|---|---|---|
| `n8n/wf2-generate.sdk.js` | Get Generation (HTTP) | the `cards!generations_card_id_fkey(...)` embed adds `client_submission` (fallback source of the expected subject). |
| `n8n/wf2-generate.sdk.js` | Build QC Request (Code, 20 lines) | new template vars `EXPECTED_SUBJECT` = `magic_prompt_json.subject.text` else `brief_snapshot.subject` else `cards.client_submission.subject` else `''`; `PALETTE_RULE` = the strict / flexible sentence chosen from `style_card_snapshot.rules.palette_mode` (the two sentences that were hard-coded in the fallback paragraph); `FORBID_LIST` = forbid numbered `1. a; 2. b` (entries matching the style-card-check text-demand regex `@\w+|\bhandle\b|hashtag|tagline|slogan|\bEST\.?\s*\d|watermark|\bsignature (text|line)\b|^(omitting|missing|no |without|lack)` are dropped, `none` when empty); `STYLE_CARD_JSON` = pruned `{medium, realism, linework, shading, shading_method, texture, edge_finish, palette, composition, typography, rules}` where `palette` is the `palette_variants` entry (`{garment, hexes}`) for the garment side (dark = /black|navy|charcoal|dark/i on `cards.garment_color`, else light) when one exists, else the card palette. The hard-coded palette_ok/style_violations paragraph is still appended ONLY when the active template lacks `STYLE_CARD_JSON`/`PALETTE_JSON` (qc_prompt v1); it now carries the pruned card plus the filtered `forbid`. Output gains `expected_subject`. |
| `n8n/wf2-generate.sdk.js` | Build Corrective Prompt (Code, 19 lines) | `{{ISSUES}}` = qc-judge's `corrective_instruction` when present (qc-judge v2 includes the style corrections it decided on, e.g. the wrong hero). Because qc.ts `buildCorrective` emits the whole paragraph, its own `CRITICAL CORRECTIONS ...: ` head and `. The ONLY text ... / . The image must contain NO text ...` tail and a trailing period are stripped first, so the corrective_suffix template wraps the issues exactly once; an issues-only string is used as is. Empty -> today's rebuild from the failed checks + style_violations -> the EXTRACT 3.9 fallback sentence. |
| `n8n/wf3-edit.sdk.js` | Get Generation (HTTP) | the `cards!generations_card_id_fkey(...)` embed adds `client_submission`, like WF-2 (review fix 2026-09-30: the Code node already fell back to it but the column was never selected, so the fallback could not fire). |
| `n8n/wf3-edit.sdk.js` | Build QC Request (Code, 20 lines) | same vars as WF-2 (edit_text old->new swap kept): EXPECTED_SUBJECT = `magic_prompt_json.subject.text`, else `brief_snapshot.subject`, else `cards.client_submission.subject`, else `''`. |
| both | sticky note | wording updated in the source only - `diff-ops.js` skips sticky notes, so the live canvas note keeps the old text unless edited by hand. |
| `n8n/tools/test-wf2-prompts.js` | - | rewritten: mocks `Prompt Engine` / `Load Config` (the old file already failed with `unmocked node Prompt Engine` against HEAD), qc_prompt v2 body read from `supabase/migrations/20260930_studio_21_style_card_v2.sql` (jsonb_populate_record insert, `$qc$` tag) through the shared helper `n8n/tools/template-from-migrations.js`; the embedded copy (seeded v1 + the spec 1.4 tail) is only the fallback and a check fails when the migration body differs from it. 53 checks incl. WF-3's Build QC Request (with the client_submission fallback and the Get Generation embeds of both lanes) and the five corrective shapes. |

Token / node names are the contract with the backend work: qc_prompt v2 (`{{EXPECTED_SUBJECT}}`, `{{PALETTE_RULE}}`, `{{FORBID_LIST}}`,
`{{STYLE_CARD_JSON}}`), prompt-engine v8 `magic_prompt_json.subject.text`, qc-judge v2 `corrective_instruction` / `qc_report.style_match`.

## Baseline (verified 2026-09-30)

- Live WF-2 and WF-3 (`get_workflow_details`) have the same node set as HEAD and 0 parameter differences on every non-sticky node
  (compared with the SDK build of `git show HEAD:n8n/wf2-generate.sdk.js` / `wf3-edit.sdk.js`). Live settings: errorWorkflow
  `PIgUHDGkVJVg9FHj`, executionOrder v1 - unchanged by this runbook.
- BEFORE copies: `n8n/ops/before/wf2-generate.sdk.js`, `n8n/ops/before/wf3-edit.sdk.js` (= HEAD, md5 20fc9a08... / 31e87d70...).
- Operations: `n8n/ops/wf2-generate.ops.json` (3 x `updateNodeParameters`, replace: true - Get Generation, Build QC Request,
  Build Corrective Prompt), `n8n/ops/wf3-edit.ops.json` (2 x `updateNodeParameters` - Get Generation, Build QC Request). Regenerate any time with
  `node n8n/tools/diff-ops.js n8n/ops/before/wf2-generate.sdk.js n8n/wf2-generate.sdk.js` (add `--split N` for batches).
- Validators: `node n8n/tools/check.js n8n/wf2-generate.sdk.js n8n/wf3-edit.sdk.js` -> `valid: true ok: true` for both (54 / 49 nodes,
  75 / 77 connections, no Code node over 20 lines). Test: `node n8n/tools/test-wf2-prompts.js` -> `all checks passed`.

## Order (spec R1 - publish the workflow first, then activate the template)

The new Code nodes accept BOTH qc_prompt v1 (fallback paragraph) and v2 (tokens), so they can go live before the template flips.
qc_prompt v2 must NOT be activated before both workflows are published (the token replacer leaves unknown tokens literally).

1. Pre-flight (read-only): `get_workflow_details("KVLDYPaWZZZtOoir")` and `("V83NWHjzDdyiqtNP")` - confirm the three node names exist and
   the workflows are unchanged since the baseline (re-run the comparison, or `get_workflow_history` shows no version after 2026-09-30).
   If the live version drifted, regenerate the BEFORE copy from the live version (export) instead of HEAD and re-run diff-ops.
2. Deploy prompt-engine v8 and qc-judge v2 first (Phase 3; backend owner) - otherwise EXPECTED_SUBJECT falls back to the brief /
   client_submission subject and `style_match` stays null. Not blocking: the QC request degrades gracefully.
3. Apply WF-2: `update_workflow` with id `KVLDYPaWZZZtOoir` and `operations` = the array in `n8n/ops/wf2-generate.ops.json`
   (one call; or the `--split 1` lines one by one). Then `validate_workflow("KVLDYPaWZZZtOoir")`.
4. Apply WF-3: `update_workflow` with id `V83NWHjzDdyiqtNP` and `operations` = `n8n/ops/wf3-edit.ops.json` (2 x `updateNodeParameters`:
   Get Generation, Build QC Request). Then `validate_workflow`.
5. Publish both (`publish_workflow`), in the UI or through the connector. Settings (Error workflow WF-6) are untouched by the ops.
6. Activate the template, only now, in one transaction (needs the studio_21 migration rows from Phase 1):
   `update public.prompt_templates set active = (version = 2) where slug = 'qc_prompt';`
7. Optional: paste the new sticky wording into the canvas notes of WF-2 / WF-3 (source text in the two sdk files; not part of the ops).

## Verification

- Trigger one render (Approve a card, or the wizard test render). In the n8n execution open **Build QC Request**: output has
  `expected_subject` (the SUBJECT text, or `''`), `template_version` 2, and `body.messages[0].content[0].text` contains
  `EXPECTED SUBJECT: "` , `FORBID: 1. `, a one-line `{"medium":...}` JSON whose keys are exactly the 11 pruned keys, no `{{`, no
  `Add two keys to your JSON` (v1 paragraph), and no `@` / `handle` anywhere.
- `select qc_report->'style_match', qc_report->'corrective_instruction' from public.generations order by created_at desc limit 1;`
  -> `style_match` non-null once qc-judge v2 is deployed (spec 2.3 acceptance).
- When a corrective pass runs (attempt 2): **Build Corrective Prompt** output `corrective_suffix` starts with
  `CRITICAL CORRECTIONS` exactly once, contains `The ONLY text` at most once, and has no `..`.
- WF-3: run an Edit text; the same checks on its **Build QC Request** output (expected_subject from the engine, else the brief
  snapshot, else the card's client_submission).

## Rollback

- Template only: `update public.prompt_templates set active = (version = 1) where slug = 'qc_prompt';` - the new Code nodes then append
  the v1 fallback paragraph again (no workflow change needed).
- Workflow: `node n8n/tools/diff-ops.js n8n/wf2-generate.sdk.js n8n/ops/before/wf2-generate.sdk.js` (arguments reversed) prints the
  operations that restore the HEAD parameters; apply with `update_workflow` and publish. Or restore the previous version from the n8n
  version history (`get_workflow_history` / `restore_workflow_version`).

## Known limits / follow-ups

- Edits inherit the parent's magic prompt (spec R3), so in WF-3 `magic_prompt_json.subject.text` normally wins; `brief_snapshot.subject`
  and `cards.client_submission.subject` (embedded by both Get Generation nodes since the review fix) only matter for pre-v8 generations.
- The forbid text-demand filter duplicates the validator regex on purpose: `generations.style_card_snapshot` of cards approved before
  the validator existed (e.g. Chicken v2, forbid[4] 'Omitting the bottom center social media handle') is never re-validated.
- `docs/STATUS.md` was not edited here (shared page; add one line under Ongoing when the ops are applied).
