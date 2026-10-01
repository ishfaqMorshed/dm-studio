# n8n ops - Phase 2 runbook (Style Card v2: WF-1b, WF-1, WF-2, WF-3)

Spec: `docs/stylecard-v2-spec.md` section 3 (2.1 WF-1b, 2.2 WF-1, 2.3 WF-2/WF-3) and rule R1 (ship together).
State on 2026-09-30: NOTHING in this folder has been applied to n8n. The sources under `n8n/*.sdk.js` are final
(validator green, tool tests green), the BEFORE copies equal the live workflows (verified today, version ids below),
and every `*.ops.json` here is the exact `update_workflow` payload that turns the live workflow into the source.
The operator (user, or a session with the n8n write tools) runs the steps below in order. Nothing is committed.

## 1. Files

| workflow | live id | live versionId (baseline, verified 2026-09-30) | BEFORE copy (= live) | AFTER source | ops | sticky ops |
|---|---|---|---|---|---|---|
| WF-1b Style Draft | `CsohPMosybjBoP8s` | `5ae44133-6c67-4196-a5a6-236f152bf49d` (updated 07:05:28Z) | `before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js` = `git show 2c90fc2:n8n/wf1b-style-draft.sdk.js` | `n8n/wf1b-style-draft.sdk.js` | `wf1b.ops.json` (65 ops; `wf1b.ops.split8.jsonl` = the same 65 in 9 lines of <= 8) | `wf1b.sticky.ops.json` -> live `Sticky Note 8350ba26` |
| WF-1 Intake | `CrpmkqYiaWBtvto6` | `e5d2cb76-d4e6-4da9-9727-cfc15de759a2` (07:05:25Z) | `before/wf1-intake.sdk.js` = HEAD | `n8n/wf1-intake.sdk.js` | `wf1.ops.json` (22 ops) | `wf1.sticky.ops.json` -> `Sticky Note ae342437` |
| WF-2 Generate | `KVLDYPaWZZZtOoir` | `53073bc3-253c-4fcf-af39-202e9db63330` (07:05:29Z) | `before/wf2-generate.sdk.js` = HEAD | `n8n/wf2-generate.sdk.js` | `wf2.ops.json` (4 ops) | `wf2.sticky.ops.json` -> `Sticky Note e40f5e01` |
| WF-3 Edit | `V83NWHjzDdyiqtNP` | `1fbb0856-b853-4458-b181-03d5a7bc0fcd` (07:05:31Z) | `before/wf3-edit.sdk.js` = HEAD | `n8n/wf3-edit.sdk.js` | `wf3.ops.json` (3 ops) | `wf3.sticky.ops.json` -> `Sticky Note b3ad825a` |

Op counts (diff-ops order: addNode/setNodeSettings -> updateNodeParameters -> removeConnection -> removeNode -> addConnection):

- `wf1b.ops.json`: 65 = addNode 14, setNodeSettings 10, updateNodeParameters 10, removeConnection 2, removeNode 1, addConnection 28.
  Adds Get Templates, Build Sheet Request, Parse Sheets, Sheet Platform?, Describe Designs (Kie credential `Gemini 3.1 Pro [DM-Kie]` 0l2nHQUQNnsCAfTR carried in the op), Kie Sheet Down?, OpenRouter Describe Designs, Check Style Card, Card OK?, Build Repair Request, Repair Style Card, Parse Repair, Check Repaired Card, Repaired Card OK?. Updates Fail Message, List Library (select adds `meta`, order `created_at.desc,id.desc`), Build Style Request (v3 tokens), Profile Style + OpenRouter Profile Style (timeout 240000), Parse Style Card, New Style Card Version, Extract Style Card Id, Draft -> done / Draft -> failed (now PATCH `style_draft_requests` with `raw`). Removes Get Template.
- `wf1.ops.json`: 22 = addNode 2 (Card -> review (no Style Card), Draft Requested?), setNodeSettings 1, updateNodeParameters 6 (Get Vision Model, Get Templates, Build Analysis Request, Analyze References, OpenRouter Analyze, Parse Analysis), removeConnection 1, removeNode 8 (the fallback profiler: Build Style Request, Style Platform?, Profile Style, OpenRouter Profile Style, Kie Style Down?, Parse Style Card, Style Draft OK?, New Style Card Version), addConnection 4.
- `wf2.ops.json`: 4 = updateNodeParameters 4 (Get Generation, Build QC Request, QC Judge, Build Corrective Prompt).
- `wf3.ops.json`: 3 = updateNodeParameters 3 (Get Generation, Build QC Request, QC Judge).
- Art style override (2026-10-01, regenerated after the WF-2/3 change): `Build QC Request` (both) uses `magic_prompt_json.effective_style` from prompt-engine v8 when present - `STYLE_CARD_JSON` = that look pruned to the same keys plus its `source` (`art_reference` = the analysed Art style reference of the card wins: its medium, linework, shading, texture, edge finish and palette; `style_card` = the Style Card values as the engine pruned them), `PALETTE_RULE` from its `palette_mode` (the client strictness applied to that palette), `FORBID_LIST` from its `forbid` (same text-demand filter) - and outputs it as `style_card`; `QC Judge` (both) adds `style_card` to the qc-judge body (JSON.stringify drops it when absent, so without effective_style the body is the old four keys and qc-judge keeps its `style_card_snapshot` default). Without `effective_style` (prompt-engine up to v7) the Style Card path is unchanged, byte for byte. Sticky ops regenerated for the new canvas text. Regenerated again 2026-10-01 (same 4 / 3 ops): `PALETTE_RULE` is "always true - no colours were read from the Art style reference, so colours are not judged" when an `art_reference` look has no palette (prompt-engine v8 sends that value-less look for a stamped Art style slot with no per-slot reading, e.g. card 72354a02); sticky text says so.

Sanity (run today, repeat any time - every file is a JSON array, every addConnection / update / settings op names a node of the AFTER file, every removeNode names a node that is gone):

```sh
cd /Users/macbookair/projects/dm-studio
for p in wf1b:wf1b-style-draft wf1:wf1-intake wf2:wf2-generate wf3:wf3-edit; do k=${p%%:*}; f=${p##*:}; node -e '
const fs=require("fs");const {parseWorkflowCodeToBuilder}=require("./n8n/tools/node_modules/@n8n/workflow-sdk");
const [o,a]=process.argv.slice(1);const ops=JSON.parse(fs.readFileSync(o,"utf8"));
const after=parseWorkflowCodeToBuilder(fs.readFileSync(a,"utf8").split("\n").filter(l=>!/^\s*import\s.*from\s+[\x27"]@n8n\/workflow-sdk[\x27"]/.test(l)).join("\n")).toJSON();
const names=new Set(after.nodes.map(n=>n.name));const c={};for(const x of ops)c[x.type]=(c[x.type]||0)+1;
const bad=ops.filter(x=>x.type==="addConnection"&&(!names.has(x.source)||!names.has(x.target)));
console.log(o,ops.length,JSON.stringify(c),"bad addConnection:",bad.length)' n8n/ops/$k.ops.json n8n/$f.sdk.js; done
```
Result 2026-09-30: `wf1b 65 ... bad addConnection: 0`, `wf1 22 ... 0`, `wf2 3 ... 0`, `wf3 2 ... 0`. Result 2026-10-01 after the art style override: `wf2 4 ... 0`, `wf3 3 ... 0` (again after the value-less palette rule; every update op's parameters equal the AFTER node's).

Duplicates: `wf1b-from-live-CsohPMosybjBoP8s.ops.json` and `wf1b-from-base-baCsaUp7HdrrSf2i.ops.json` (+ `.split8.jsonl`) are byte-identical to `wf1b.ops.json` (checked with `cmp`); the former `wf1-intake.ops.json`, `wf2-generate.ops.json` and `wf3-edit.ops.json` copies were removed on 2026-10-01 after the WF-2/3 forbid-filter change (the canonical `wf2.ops.json` / `wf3.ops.json` carry it). The runbooks (`wf1-intake.runbook.md`, `docs/runbook-wf1b-style-card-v2.md`, `docs/runbook-wf2-wf3-qc-v2.md`) hold the per-node detail and failure tables. Apply ONE set, once.

## 2. Prerequisites (before any n8n step)

1. Migration `supabase/migrations/20260930_studio_21_style_card_v2.sql` applied (columns `settings.reference_roles`, `settings.qc_subject_regen`, `cards.reference_roles`, `client_references.meta`, `style_draft_requests.raw`; trigger `style_draft_requests_require_brief`; template rows inserted INACTIVE). Check:
   ```sql
   select slug, version, active from public.prompt_templates
    where slug in ('style_sheet','style_profiler','analysis_prompt','tier_rules','text_rules','defects','background_rule','style_card_render','qc_prompt')
    order by slug, version;
   -- expected new rows, all active = false: style_sheet 1, style_profiler 3, analysis_prompt 3, tier_rules 2, text_rules 2, defects 2, background_rule 2, style_card_render 2, qc_prompt 2
   select column_name from information_schema.columns where table_name = 'style_draft_requests' and column_name = 'raw';  -- 1 row
   ```
2. Edge Functions deployed FIRST, project `voatrqhfsdfjomyajovi`, all with verify_jwt off (they check `x-studio-secret` themselves):
   `prompt-engine` (v8), `qc-judge` (v2), `style-card-check` (new). `supabase/config.toml` has `verify_jwt = false` blocks for prompt-engine and qc-judge only - the backend owner adds `[functions.style-card-check] verify_jwt = false` (or deploys it with `--no-verify-jwt`).
   ```sh
   supabase functions deploy style-card-check --project-ref voatrqhfsdfjomyajovi --no-verify-jwt
   supabase functions deploy prompt-engine    --project-ref voatrqhfsdfjomyajovi --no-verify-jwt
   supabase functions deploy qc-judge         --project-ref voatrqhfsdfjomyajovi --no-verify-jwt
   ```
   (or the Supabase MCP `deploy_edge_function`). Probe - `SB=https://voatrqhfsdfjomyajovi.supabase.co`, `ANON=sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I`, `SECRET` = `select value from private.secrets where key = 'studio_secret'`:
   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SB/functions/v1/style-card-check" -H "apikey: $ANON" -H "x-studio-secret: wrong" -H 'content-type: application/json' -d '{}'
   # expected: not 200 (401/403 - the secret gate)
   curl -s -X POST "$SB/functions/v1/style-card-check" -H "apikey: $ANON" -H "x-studio-secret: $SECRET" -H 'content-type: application/json' \
     -d '{"card":{"medium":"x","palette":[]},"brief":{},"image_count":1,"sheets":null,"reference_ids":[],"client_garments":[]}'
   # expected: 200 with a non-empty "errors" array (palette count). A 404 means WF-1b will fail every draft.
   ```
3. n8n WF-0 Studio Config `vbyjWhK4ZRN9uZUM` has `studioSecret` and `openrouterKey` pasted (the WF-1b repair call is OpenRouter-only).
4. Confirm the live baselines have not moved: `get_workflow_details('<id>')` -> `versionId` equals the table in section 1 (or `get_workflow_history` shows no version after 2026-09-30T07:05Z). If a workflow drifted, export it to a fresh BEFORE file and regenerate its ops (section 7) before applying anything.
5. Repo checks are green: `node n8n/tools/check.js n8n/wf1b-style-draft.sdk.js n8n/wf1-intake.sdk.js n8n/wf2-generate.sdk.js n8n/wf3-edit.sdk.js` (each `valid: true  ok: true`), `node n8n/tools/test-wf1b-style.js`, `node n8n/tools/test-wf1-analysis.js`, `node n8n/tools/test-wf2-prompts.js` (each `all checks passed`).

Why the order matters (R1): the template token replacer leaves unknown `{{TOKENS}}` literally. A NEW template with an OLD workflow leaks tokens into a prompt; a NEW workflow with the OLD template is safe (WF-1b skips Pass A and renders style_profiler v2; WF-1 renders analysis_prompt v2; WF-2/3 append the v1 fallback paragraph). So for every step: apply ops -> publish -> activate templates, never the reverse.

## 3. Step A - WF-1b (`CsohPMosybjBoP8s`, in place) + style_sheet v1 + style_profiler v3

In-place update is preferred over swapping in the unpublished copy `baCsaUp7HdrrSf2i`: the webhook path `studio-style-draft` (bound by the DB trigger), the webhook id and the Error-workflow setting (`PIgUHDGkVJVg9FHj`, verified live) stay as they are. The ops are identical for both ids (diff-ops output against `before/wf1b-style-draft.base-baCsaUp7HdrrSf2i.sdk.js` is byte-identical); to swap instead, follow `docs/runbook-wf1b-style-card-v2.md` Path A.

1. `update_workflow('CsohPMosybjBoP8s', operations = <wf1b.ops.json>)` - one call. If the connector rejects the 30 KB payload, send the 9 lines of `wf1b.ops.split8.jsonl` one call each, in file order (adds first, then updates, then connection removes, the node remove, then connection adds - a reordered batch breaks).
2. `update_workflow('CsohPMosybjBoP8s', operations = <wf1b.sticky.ops.json>)` - the canvas note (target `Sticky Note 8350ba26`).
3. `validate_workflow('CsohPMosybjBoP8s')` -> no errors; `get_workflow_details` -> 37 functional nodes + 1 sticky, 56 connections, no node named `Get Template`, nodes `Check Style Card` / `Check Repaired Card` present, `Draft → done` method PATCH, settings.errorWorkflow still `PIgUHDGkVJVg9FHj`. Existing nodes keep their positions, new ones come from the file - press Tidy up once on the canvas.
4. `publish_workflow('CsohPMosybjBoP8s')`.
5. Activate the templates immediately, one transaction (the unique index `prompt_templates_one_active_idx` allows one active row per slug, so the old row goes inactive BEFORE the new one goes active):
   ```sql
   begin;
   update public.prompt_templates set active = false where slug = 'style_profiler' and version = 2;
   update public.prompt_templates set active = true  where slug = 'style_profiler' and version = 3;
   update public.prompt_templates set active = true  where slug = 'style_sheet'    and version = 1;
   commit;
   select slug, version, active from public.prompt_templates where slug in ('style_sheet','style_profiler') and active;  -- style_sheet 1, style_profiler 3
   ```
6. Smoke:
   - Wrong secret: `curl -s -X POST https://n8n.srv1202488.hstgr.cloud/webhook/studio-style-draft -H 'content-type: application/json' -H 'x-studio-secret: wrong' -d '{"request_id":"00000000-0000-0000-0000-000000000000","client_id":"00000000-0000-0000-0000-000000000000"}'` -> HTTP 200 `{"message":"Workflow was started"}` (responseMode onReceived answers before the check) and the n8n execution ends at the `Rejected` node; no row of `style_draft_requests` changes.
   - One Analyse on a prepared client: the E2E Test Client `df526fbe-20f4-4057-84fa-46b9677c4f4b` (or Chicken Happy Hour `f947a150-...`) with a brief that has a niche, at least one subject and one garment colour (the studio_21 trigger refuses otherwise) and 5+ ticked library images. Click Analyse in the wizard (or `insert into public.style_draft_requests (client_id, status, requested_by) values ('<client>', 'queued', auth.uid()) returning id;`). Cost about $0.05, 4-5 min. Then:
     ```sql
     select status, last_error, style_card_id, jsonb_array_length(raw->'sheets') as sheets, raw->'validation'->'errors' as errors, raw->'template_versions' as versions, raw->'repaired' as repaired
       from public.style_draft_requests order by created_at desc limit 1;
     select version, status, jsonb_array_length(json->'reference_ids') as refs, json->'validation'->'errors' as errors, json->>'source' as source, json->'typography'->>'case' as tcase, json->'linework'->>'weight' as weight
       from public.style_cards order by created_at desc limit 1;
     ```
     Expected: `status done`, `sheets` = number of ticked images, `errors []`, `versions {"sheet":1,"profiler":3}`; card `source library`, `refs` = the same count, `tcase` in UPPER|lower|Title|Mixed, `weight` in none|hairline|fine|medium|bold|heavy, no string outside `brand_text` matching `@|handle`. In the execution, `Build Style Request` text contains the SHEETS_JSON array and the REFERENCE_NOTES lines, no `{{`.

## 4. Step B - WF-1 (`CrpmkqYiaWBtvto6`) + analysis_prompt v3, and the prompt-engine v8 templates

prompt-engine v8 must already be deployed (section 2) - tier_rules v2 carries `{{niche}}`, which only v8 fills. The in-place rewrites of the still-inactive rows must be applied first: `20261001_studio_26_art_style_wins.sql` (tier_rules v2, qc_prompt v2, analysis_prompt v3; applied 2026-10-01) and `20261001_studio_27_defects_art_style.sql` (defects v2: distress, halftone and maturity measured against the ART STYLE reference when one is attached; applied 2026-10-01). Check: `select md5(body) from public.prompt_templates where slug = 'defects' and version = 2;` = `179f6b9cc20c01ced59871f6119be8e7` (not `ba9965e7d7cbb8d4f5860a7fdb1a684f`, the studio_21 body). The other edited inactive rows as of 2026-10-01: tier_rules v2 `5960ba23eacfef0700898d9b6b0177e3`, qc_prompt v2 `265cddb91ac705c3d40abbabf45ad0b3`, analysis_prompt v3 `65a24f004cb70bddc39ca8e20be323f0`.

1. `update_workflow('CrpmkqYiaWBtvto6', operations = <wf1.ops.json>)` (one call; or `node n8n/tools/diff-ops.js n8n/ops/before/wf1-intake.sdk.js n8n/wf1-intake.sdk.js --split 8` for batches, in order).
2. `update_workflow('CrpmkqYiaWBtvto6', operations = <wf1.sticky.ops.json>)` (target `Sticky Note ae342437`).
3. `validate_workflow('CrpmkqYiaWBtvto6')` -> no errors; 28 functional nodes + 1 sticky, 38 connections; wiring after Save Analysis: `Get Style Cards -> Has Style Card? [0] Card → review / [1] Count Library -> Library Has Refs? [0] Request Style Draft -> Draft Requested? [0] Card → review / [1] Card → review (no Style Card); Library Has Refs? [1] -> Card → review (no Style Card)`; errorWorkflow still `PIgUHDGkVJVg9FHj`.
4. `publish_workflow('CrpmkqYiaWBtvto6')`.
5. Activate, one transaction:
   ```sql
   begin;
   update public.prompt_templates set active = false where slug = 'analysis_prompt'  and version = 2;
   update public.prompt_templates set active = true  where slug = 'analysis_prompt'  and version = 3;
   update public.prompt_templates set active = false where slug = 'tier_rules'       and version = 1;
   update public.prompt_templates set active = true  where slug = 'tier_rules'       and version = 2;
   update public.prompt_templates set active = false where slug = 'text_rules'       and version = 1;
   update public.prompt_templates set active = true  where slug = 'text_rules'       and version = 2;
   update public.prompt_templates set active = false where slug = 'defects'          and version = 1;
   update public.prompt_templates set active = true  where slug = 'defects'          and version = 2;
   update public.prompt_templates set active = false where slug = 'background_rule'  and version = 1;
   update public.prompt_templates set active = true  where slug = 'background_rule'  and version = 2;
   update public.prompt_templates set active = false where slug = 'style_card_render' and version = 1;  -- reference only, not sent to a model
   update public.prompt_templates set active = true  where slug = 'style_card_render' and version = 2;
   commit;
   select slug, version from public.prompt_templates where active and slug in ('analysis_prompt','tier_rules','text_rules','defects','background_rule','style_card_render') order by slug;
   ```
6. Smoke:
   - Wrong secret: `curl -s -X POST https://n8n.srv1202488.hstgr.cloud/webhook/studio-intake -H 'content-type: application/json' -H 'x-studio-secret: wrong' -d '{"card_id":"00000000-0000-0000-0000-000000000000","client_id":"00000000-0000-0000-0000-000000000000"}'` -> 200, execution ends at `Rejected`, no card touched.
   - One card: submit the public brief form of the E2E Test Client with three deliberately different images (a design, a differently drawn design, a lettering-heavy one), or New card from the board. Then:
     ```sql
     select stage, jsonb_array_length(reference_analysis->'references') as slots, reference_analysis->'roles' as roles, reference_analysis->>'template_version' as tv, reference_analysis->>'subject_structure' as subject
       from public.cards order by created_at desc limit 1;  -- review, 3, ["subject","art_style","typography"], 3, a reading of image 1 only
     ```
     In the execution, the Analyze References body contains `IMAGE 1 - WHAT TO MAKE`, `IMAGE 2 - ART STYLE`, `IMAGE 3 - LETTERING`, the brief text, no `{{`. The card page ReferencesPanel shows a read under each slot.
   - A client with an EMPTY library: the card ends at review with the note `no Style Card yet - finish onboarding (brief, analyse, lock) before approving`; `style_cards` count unchanged; no `style_draft_requests` row.

## 5. Step C - WF-2 (`KVLDYPaWZZZtOoir`) + WF-3 (`V83NWHjzDdyiqtNP`) + qc_prompt v2

qc-judge v2 deployed first (section 2); otherwise `style_match` stays null and the request degrades gracefully.

1. `update_workflow('KVLDYPaWZZZtOoir', operations = <wf2.ops.json>)`; `update_workflow('KVLDYPaWZZZtOoir', operations = <wf2.sticky.ops.json>)` (target `Sticky Note e40f5e01`); `validate_workflow('KVLDYPaWZZZtOoir')`.
2. `update_workflow('V83NWHjzDdyiqtNP', operations = <wf3.ops.json>)`; `update_workflow('V83NWHjzDdyiqtNP', operations = <wf3.sticky.ops.json>)` (target `Sticky Note b3ad825a`); `validate_workflow('V83NWHjzDdyiqtNP')`.
3. `publish_workflow` both. Settings untouched (errorWorkflow `PIgUHDGkVJVg9FHj` on both).
4. Activate, only after BOTH are published, one transaction:
   ```sql
   begin;
   update public.prompt_templates set active = false where slug = 'qc_prompt' and version = 1;
   update public.prompt_templates set active = true  where slug = 'qc_prompt' and version = 2;
   commit;
   select version from public.prompt_templates where slug = 'qc_prompt' and active;  -- 2
   ```
5. Smoke:
   - Wrong secret: `curl -s -X POST https://n8n.srv1202488.hstgr.cloud/webhook/studio-generate -H 'content-type: application/json' -H 'x-studio-secret: wrong' -d '{"card_id":"00000000-0000-0000-0000-000000000000"}'` and the same against `/webhook/studio-edit` with `-d '{"generation_id":"00000000-0000-0000-0000-000000000000","card_id":"00000000-0000-0000-0000-000000000000","kind":"edit_text"}'` -> 200, executions end at `Rejected`, no generation touched.
   - One card: Approve the card from step B (client with a locked Style Card) or run the wizard test render. Within about 3 minutes:
     ```sql
     select status, qc_report->'style_match' as style_match, qc_report->>'corrective_instruction' as corrective,
            (rendered_prompt like '%..%') as dbl_period, (rendered_prompt ~ 'NICHE') as niche_leak, (rendered_prompt like '%as_typed%') as as_typed
       from public.generations order by created_at desc limit 1;
     -- style_match non-null (spec 2.3 acceptance); dbl_period / niche_leak / as_typed all false (prompt-engine v8 + v2 templates)
     ```
     In the execution, `Build QC Request` output has `expected_subject`, `template_version` 2, and its text contains `EXPECTED SUBJECT: "`, `FORBID: 1. `, the pruned one-line card JSON, no `{{`, no `Add two keys to your JSON` (the v1 paragraph), no `@` / `handle`.
     Art style override (prompt-engine v8): on a card whose Art style slot holds an analysed reference, `Build QC Request` output has `style_card.source` = `art_reference`, its card JSON line starts with `{"source":"art_reference"` and carries the reference medium and palette (not the Style Card hexes), the `palette_ok` sentence matches the client `palette_mode`, and the `QC Judge` request body carries the same `style_card`; on a card with an empty Art style slot `source` is `style_card`; a `style_test` card is always `style_card`.
   - WF-3: Edit text on that generation -> the same checks on its `Build QC Request`; when a corrective pass runs, `Build Corrective Prompt` output starts with `CRITICAL CORRECTIONS` exactly once and has no `..`.

## 6. Rollback (per step; templates and workflow in the same step, reverse order of section 2's rule does not matter here because both go back together)

- WF-1b: `restore_workflow_version('CsohPMosybjBoP8s', '5ae44133-6c67-4196-a5a6-236f152bf49d')` then `publish_workflow`, and in the same step
  ```sql
  begin;
  update public.prompt_templates set active = false where slug = 'style_profiler' and version = 3;
  update public.prompt_templates set active = true  where slug = 'style_profiler' and version = 2;
  update public.prompt_templates set active = false where slug = 'style_sheet'    and version = 1;
  commit;
  ```
  Columns `raw` / `meta` may stay (the old workflow ignores them); drafts already stored with schema 2 render through prompt-engine v8's lint unchanged.
- WF-1: `restore_workflow_version('CrpmkqYiaWBtvto6', 'e5d2cb76-d4e6-4da9-9727-cfc15de759a2')`, publish, and
  ```sql
  begin;
  update public.prompt_templates set active = false where slug = 'analysis_prompt' and version = 3;
  update public.prompt_templates set active = true  where slug = 'analysis_prompt' and version = 2;
  commit;
  ```
  (tier_rules / text_rules / defects / background_rule v2 belong to prompt-engine v8; roll them back to v1 only together with a prompt-engine v7 redeploy - the same two-statement pattern per slug.) Rows written by the new Parse Analysis keep the flat compat keys, so nothing needs migrating back.
- WF-2 / WF-3: `restore_workflow_version('KVLDYPaWZZZtOoir', '53073bc3-253c-4fcf-af39-202e9db63330')`, `restore_workflow_version('V83NWHjzDdyiqtNP', '1fbb0856-b853-4458-b181-03d5a7bc0fcd')`, publish both, and
  ```sql
  begin;
  update public.prompt_templates set active = false where slug = 'qc_prompt' and version = 2;
  update public.prompt_templates set active = true  where slug = 'qc_prompt' and version = 1;
  commit;
  ```
  Template-only rollback is also safe on its own: the new Code nodes append the v1 fallback paragraph again.
- Alternative to restore_workflow_version: `node n8n/tools/diff-ops.js n8n/<after>.sdk.js n8n/ops/before/<before>.sdk.js` (arguments reversed) prints the ops that restore the BEFORE parameters.

## 7. Regenerate / verify

```sh
cd /Users/macbookair/projects/dm-studio/n8n/tools
node diff-ops.js ../ops/before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js ../wf1b-style-draft.sdk.js > ../ops/wf1b.ops.json
node diff-ops.js ../ops/before/wf1b-style-draft.live-CsohPMosybjBoP8s.sdk.js ../wf1b-style-draft.sdk.js --split 8 > ../ops/wf1b.ops.split8.jsonl
node diff-ops.js ../ops/before/wf1-intake.sdk.js   ../wf1-intake.sdk.js   > ../ops/wf1.ops.json
node diff-ops.js ../ops/before/wf2-generate.sdk.js ../wf2-generate.sdk.js > ../ops/wf2.ops.json
node diff-ops.js ../ops/before/wf3-edit.sdk.js     ../wf3-edit.sdk.js     > ../ops/wf3.ops.json
node sticky-ops.js ../wf1b-style-draft.sdk.js "Sticky Note 8350ba26" > ../ops/wf1b.sticky.ops.json   # live sticky names from get_workflow_details
node sticky-ops.js ../wf1-intake.sdk.js       "Sticky Note ae342437" > ../ops/wf1.sticky.ops.json
node sticky-ops.js ../wf2-generate.sdk.js     "Sticky Note e40f5e01" > ../ops/wf2.sticky.ops.json
node sticky-ops.js ../wf3-edit.sdk.js         "Sticky Note b3ad825a" > ../ops/wf3.sticky.ops.json
node check.js ../wf1b-style-draft.sdk.js ../wf1-intake.sdk.js ../wf2-generate.sdk.js ../wf3-edit.sdk.js
node test-wf1b-style.js && node test-wf1-analysis.js && node test-wf2-prompts.js
```
The BEFORE copies come from git: `git show 2c90fc2:n8n/wf1b-style-draft.sdk.js` (live WF-1b) and `git show HEAD:n8n/<file>` (WF-1, WF-2, WF-3); if a live workflow drifts, replace its BEFORE copy with an export of the live version before regenerating.

## 8. Not covered here

- Frontend Phase 4 (labels, editor normalize fix R2 - ship before opening a v3 draft in the editor), step-4 hand-offs: other owners.
- `supabase/config.toml` block for style-card-check and the migration itself: backend owner (this session must not edit `supabase/`).
- After the smoke tests: update `docs/STATUS.md` (Ongoing -> Done) and the auto-memory note that names `CsohPMosybjBoP8s` as the live WF-1b (unchanged when updated in place).
