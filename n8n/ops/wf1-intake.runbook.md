# WF-1 Intake - Phase 2 runbook (spec 2.2: per-slot reference roles, analysis_prompt v3, fallback profiler retired)

Written 2026-09-30 by the WF-1 author session. This session could not apply n8n changes; every step below is for the operator
(user, or a session with n8n write tools). Nothing here is committed; review the diff first: `git diff -- n8n/wf1-intake.sdk.js n8n/tools docs/generation-spec.md`.

## Files

| file | what |
|---|---|
| `n8n/wf1-intake.sdk.js` | the AFTER source (validator: `node n8n/tools/check.js n8n/wf1-intake.sdk.js` -> valid: true ok: true, 29 nodes / 38 connections, no Code node over 20 lines) |
| `n8n/ops/before/wf1-intake.sdk.js` | the BEFORE source = `git show HEAD:n8n/wf1-intake.sdk.js`; verified equal in substance to live `CrpmkqYiaWBtvto6` versionId `e5d2cb76-d4e6-4da9-9727-cfc15de759a2` (updated 2026-09-30T07:05:25Z) - same 34 functional node names, parameters (up to n8n's omitted defaults and the condition ids / `typeValidation: strict` n8n adds to the Switch on save), settings and connections |
| `n8n/ops/wf1-intake.ops.json` | 22 `update_workflow` operations from `node n8n/tools/diff-ops.js n8n/ops/before/wf1-intake.sdk.js n8n/wf1-intake.sdk.js` (addNode 2, setNodeSettings 1, updateNodeParameters 6, removeConnection 1, removeNode 8, addConnection 4) |
| `n8n/ops/wf1-intake.sticky.ops.json` | 1 `updateNodeParameters` op for the canvas note `Sticky Note ae342437` (diff-ops skips stickies) |
| `n8n/tools/test-wf1-analysis.js` | unit test of Build Analysis Request + Parse Analysis (42 checks incl. spec cases a-d and the migration-vs-fixture identity check); `node n8n/tools/test-wf1-analysis.js` |
| `n8n/tools/fixtures/analysis_prompt_v3.txt` | analysis_prompt v3 body verbatim from the spec. The test reads the body from the migration that inserts it (`supabase/migrations/20260930_studio_21_style_card_v2.sql`, jsonb_populate_record form, `$analysis$` tag) through the shared helper `n8n/tools/template-from-migrations.js`, uses the fixture only when no migration inserts v3, and FAILS when the migration body differs from the fixture (update the fixture then) |
| `docs/generation-spec.md` | section 4 WF-1 paragraph, consumer rows analysis_prompt / style_profiler |

## What changes in the live workflow

| node | change |
|---|---|
| Get Vision Model | select adds `reference_roles` (`settings?id=eq.1&select=vision_model,ai_platform,openrouter_models,reference_roles`) |
| Get Templates | fetches only `slug=eq.analysis_prompt&active=is.true` (style_profiler is WF-1b only now) |
| Build Analysis Request | NICHE = `clients.style_brief.niche`, else the client name; roles = `cards.reference_roles`, else `settings.reference_roles`, else `subject, art_style, typography`, sliced to the attached images; `{{SLOT_BLOCKS}}` = one WHAT TO MAKE / ART STYLE / LETTERING line per image (spec 1.4 wording); BRIEF (`not given` when empty) and TEXT_LINES (`NONE` when empty) are now used by v3; output adds `roles` |
| Analyze References, OpenRouter Analyze | timeout 240000 (R4); retry / onError unchanged |
| Parse Analysis | accepts the v3 `{references:[...], same_design, notes}` reply: stores `references` (per-slot objects, role restored from the request when the model omits it), `roles`, `same_design`, `notes`, `template_version`, plus the flat compat keys each mapped from its OWN slot - `art_style`/`palette` <- ART STYLE, `subject_structure`/`composition` <- WHAT TO MAKE, `typography_transcription` <- LETTERING, `text_detected` = union; a slot that is not attached leaves its compat key `''`. Legacy v2 single-object / array replies and v1 STYLE:/TYPOGRAPHY_TEXT: replies keep today's handling. 20 lines |
| Draft Requested? (new IF) | after Request Style Draft: `$json.id` is a uuid -> Card → review; else (insert refused, e.g. the new `style_draft_requests_require_brief` trigger while the brief is incomplete) -> Card → review (no Style Card) |
| Card → review (no Style Card) (new) | `move_card(review, 'no Style Card yet - finish onboarding (brief, analyse, lock) before approving')`; fed by Library Has Refs? = false and Draft Requested? = false |
| removed | Build Style Request, Style Platform?, Profile Style, Kie Style Down?, OpenRouter Profile Style, Parse Style Card, Style Draft OK?, New Style Card Version - the single-brief fallback profiler; WF-1 never creates a style_cards row any more |
| unchanged | Request Style Draft keeps `onError: continueRegularOutput` + `alwaysOutputData` (the trigger may raise; the item continues into Draft Requested?), Card → review, Fail Message, Card → failed, the Kie / OpenRouter / Auto analysis lane |

## Preconditions (in this order)

1. Migration `supabase/migrations/20260930_studio_21_style_card_v2.sql` applied: `settings.reference_roles`, `cards.reference_roles`, the `style_draft_requests_require_brief` trigger, `analysis_prompt` v3 inserted with `active = false`.
   Without `settings.reference_roles` PostgREST answers 400 to Get Vision Model; the node continues with an error item, so `ai_platform` / `vision_model` read as undefined and every run takes the Kie lane with the default model. Apply the DB first.
2. prompt-engine v8 deployed (Phase 3). Not strictly required for WF-1: v7 reads only the flat compat keys, which WF-1 still writes; v8 renders the per-slot REFERENCES block from `reference_analysis.references`.
3. Confirm the live state has not moved: `get_workflow_details('CrpmkqYiaWBtvto6')` -> versionId `e5d2cb76-d4e6-4da9-9727-cfc15de759a2`. If it differs, export the live sources to a fresh BEFORE file and regenerate: `node n8n/tools/diff-ops.js <before> n8n/wf1-intake.sdk.js > n8n/ops/wf1-intake.ops.json`.

## Apply

1. `update_workflow('CrpmkqYiaWBtvto6', operations = <contents of n8n/ops/wf1-intake.ops.json>)`.
   If the tool rejects the payload size or count, regenerate in batches and send the lines in order (the order addNode -> update -> removeConnection -> removeNode -> addConnection matters):
   `node n8n/tools/diff-ops.js n8n/ops/before/wf1-intake.sdk.js n8n/wf1-intake.sdk.js --split 8`.
2. `update_workflow('CrpmkqYiaWBtvto6', operations = <contents of n8n/ops/wf1-intake.sticky.ops.json>)` - the canvas note.
3. `validate_workflow('CrpmkqYiaWBtvto6')` -> no errors; 28 functional nodes + 1 sticky, 38 connections. Expected wiring after Save Analysis:
   `Get Style Cards -> Has Style Card? [0] Card → review / [1] Count Library -> Library Has Refs? [0] Request Style Draft -> Draft Requested? [0] Card → review / [1] Card → review (no Style Card); Library Has Refs? [1] -> Card → review (no Style Card)`.
4. Check Settings -> Error workflow is still `DM Studio · WF-6 Error` (`PIgUHDGkVJVg9FHj`); the ops never touch workflow settings.
5. `publish_workflow('CrpmkqYiaWBtvto6')`.
6. Activate the template in the SAME step (R1 - the token replacer leaves unknown tokens literally, so the new WF-1 with v2 active would send `{{SLOT_BLOCKS}}` and the old WF-1 with v3 active would too), one transaction:
   ```sql
   begin;
   update public.prompt_templates set active = false where slug = 'analysis_prompt' and active;
   update public.prompt_templates set active = true  where slug = 'analysis_prompt' and version = 3;
   update public.prompt_templates set consumer = 'WF-1 Studio Intake > Analyze References (Kie gemini-3.1-pro or OpenRouter, JSON mode). v3 active (per-slot contract: references[] with one object per attached image, same_design, notes; tokens NICHE, CLIENT_NAME, BRIEF, TEXT_LINES, SLOT_BLOCKS); v2 and v1 inactive, kept for rollback.' where slug = 'analysis_prompt';
   update public.prompt_templates set consumer = 'WF-1b Studio Style Draft > Profile Style (Pass B) only. The WF-1 fallback draft from the card references was retired 2026-09-30.' where slug = 'style_profiler';
   commit;
   select slug, version, active from public.prompt_templates where slug = 'analysis_prompt' order by version;  -- exactly one active row, version 3
   ```

## Verify (spec 2.2 acceptance)

- Local: `node n8n/tools/check.js n8n/wf1-intake.sdk.js` (valid: true ok: true, exit 0) and `node n8n/tools/test-wf1-analysis.js` (all checks passed).
- Submit the E2E form card with three deliberately different images (a design, a differently drawn design, a lettering-heavy design):
  - the WF-1 execution's Analyze References body contains `IMAGE 1 - WHAT TO MAKE`, `IMAGE 2 - ART STYLE`, `IMAGE 3 - LETTERING` and the brief text; no `{{`;
  - `select jsonb_array_length(reference_analysis->'references'), reference_analysis->'roles', reference_analysis->>'template_version', reference_analysis->>'subject_structure' from public.cards where id = '<card>'` -> 3, the settings order, 3, a reading of image 1 only;
  - the card page ReferencesPanel shows a read under each slot (it renders `references[i]`).
- A designer card with one reference: `references` length 1, `typography_transcription` = `''`, `art_style` = `''`.
- Intake for a client with an EMPTY library: card ends at review with the note `no Style Card yet - finish onboarding (brief, analyse, lock) before approving`; `select count(*) from public.style_cards where client_id = '<client>'` unchanged; no `style_draft_requests` row.
- Intake for a client WITH a library but an incomplete brief: Request Style Draft shows the trigger error, Draft Requested? takes the false branch, same note; no `style_draft_requests` row.
- Swap `settings.reference_roles` by one UPDATE and re-run intake on a legacy card (null `cards.reference_roles`): the slot labels follow the new order without a deploy.

## Rollback

1. `restore_workflow_version('CrpmkqYiaWBtvto6', 'e5d2cb76-d4e6-4da9-9727-cfc15de759a2')` (or pick the version before the update in `get_workflow_history`), then publish.
2. Same step: `update public.prompt_templates set active = (version = 2) where slug = 'analysis_prompt';` - the old WF-1 renders v3's `{{SLOT_BLOCKS}}` literally otherwise.
3. Rows written by the new Parse Analysis stay valid for the old prompt-engine (the flat compat keys are present); nothing to migrate back.

## Owned elsewhere (not in this runbook)

- The migration (columns, trigger, template rows, the `consumer` texts above) - backend / Phase 1 owner.
- prompt-engine v8 per-slot rendering, SUBJECT block, `{{niche}}` - Phase 3 owner.
- Reference-role labels in the public form, New card dialog and card page; editable roles - Phase 4 owner.
- WF-1b (style_sheet + style_profiler v3, Check Style Card) and WF-2/WF-3 (qc_prompt v2) - their own ops files under `n8n/ops/`.
