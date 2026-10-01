# DM Studio n8n — config-node convention (decided 2026-09-24)

The user's convention: keys live in Set ("config") nodes, not in n8n credentials. To keep ONE paste location, every
studio workflow loads a shared sub-workflow **WF-0 Studio Config** on its first step.

## WF-0 Studio Config (sub-workflow, file n8n/wf0-config.sdk.js)
Execute Workflow Trigger (no inputs) → Set "Studio Config" (mode manual, includeOtherFields false) → returns ONE item:
  sbUrl        = 'https://voatrqhfsdfjomyajovi.supabase.co'          (prefilled)
  anonKey      = 'sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I'    (prefilled, public)
  n8nBaseUrl   = 'https://n8n.srv1202488.hstgr.cloud'                (prefilled)
  studioSecret = placeholder('Paste the studio secret: select value from private.secrets where key = studio_secret')
  ideogramKey  = placeholder('Paste your Ideogram API key')
  imgbbKey     = placeholder('Paste your imgbb API key')
  mlKey        = placeholder('Paste your ModelsLab API key')
  upscaleModel = 'ultra_resolution', upscaleScale = 4
Kie.ai keeps its EXISTING credentials (bind by id): images "GPT Image 2 [DM-Kie]" w0sDpl2nll4HkF6h, vision "Gemini 3.1 Pro [DM-Kie]" 0l2nHQUQNnsCAfTR. Slack keeps "DM HR" kZQVG6uMHQ7Xxu2B.

## Every other workflow
1. Trigger (Webhook, responseMode 'onReceived', NO authentication) or Execute Workflow Trigger / Schedule.
2. Node "Load Config": Execute Workflow (n8n-nodes-base.executeWorkflow v1.2), workflowId = WF-0 id (SDK const `configWorkflowId`,
   placeholder string REPLACE_WITH_WF0_CONFIG_ID substituted at create time), mode 'once', waitForSubWorkflow true, executeOnce true.
   Downstream expressions read config as `$('Load Config').first().json.<field>`.
3. For webhook workflows: node "Secret OK?" (IF) right after Load Config:
   leftValue expr("{{ $('<Webhook node name>').first().json.headers?.['x-studio-secret'] ?? '' }}") equals
   rightValue expr("{{ $('Load Config').first().json.studioSecret }}"), typeValidation loose; false branch → a Set "Rejected" (no-op end).
   pg_net triggers and self-calls always send the header, so the IF is the auth.
4. Supabase REST / RPC / Storage calls: HTTP Request WITHOUT credential; headers apikey = anonKey, x-studio-secret = studioSecret (+ Content-Type / Prefer as needed).
5. Edge Function calls (prompt-engine, qc-judge, style-card-check): POST <sbUrl>/functions/v1/<name> with the same two headers.
6. Self-calls between workflows (dispatcher → worker webhook, ping): header x-studio-secret from config.
7. Ideogram: header Api-Key = ideogramKey. imgbb: query key = imgbbKey. ModelsLab: key inside JSON body = mlKey.
8. No Code node over 20 lines except the owner's frozen "Set 300 DPI" and the two verbatim ModelsLab evaluators.
9. Sub-workflow ids: WF-5 Poll id → const `pollWorkflowId` (placeholder REPLACE_WITH_WF5_POLL_ID); WF-2's worker webhook path is
   `studio-generate-worker` and ONLY WF-2's dispatcher (Fire Worker) calls it. WF-3 regenerate POSTs the dispatcher
   `/webhook/studio-generate` instead (decided 2026-09-24 review): request_edit inserts the row as status queued, so a direct worker POST
   raced claim_generations() (fired by every other approval and the 2-min sweep) and could start two workers for one generation; going
   through claim_generations() is atomic and honours settings.max_active_generations.
10. Worker time budget: Wait For Callback 8 min + WF-5 Poll timeout 600 s (10 min) per pass, and the attempt-2 PATCH re-stamps
   generations.started_at, so every pass stays inside public.requeue_stale()'s 20-min window (status dispatched/working,
   coalesce(started_at, updated_at) < now()-20 min → requeued). Do not raise these without adding a started_at heartbeat.
11. PostgREST embeds from generations to cards must name the FK (`cards!generations_card_id_fkey(...)`): two relationships exist
   (generations_card_id_fkey and cards_current_generation_fk), and an unnamed embed answers 300 PGRST201. The response key stays `cards`.
12. cards.current_generation_id is written by an HTTP PATCH on cards (policy cards_worker_update, anon + studio_secret_ok()), not by rpc
   set_current_generation, which is staff-only (is_staff()) and returns 42501 to the worker.
13. WF-1b's final status is an HTTP PATCH on style_draft_requests (policy sdr_worker_all, anon + studio_secret_ok()) because rpc
   style_draft_update has no `raw` argument: "Draft → done" writes {status, style_card_id, n8n_execution_id, raw}, "Draft → failed" writes
   {status, last_error, n8n_execution_id, raw}; "Draft → working" still calls the RPC. raw = {sheets, card, validation, template_versions}
   (column added by studio_21). Vision HTTP nodes (Describe Designs, Profile Style and their OpenRouter twins) use timeout 240000.
14. WF-8 Brief Parse (`Cu7if7YfPpWjNVnL`, file n8n/wf8-brief-parse.sdk.js, created and published 2026-10-01): "Fill from text" in the
   onboarding Written brief step. brief_parse_requests insert (studio_25) → trigger brief_parse_requests_notify → POST
   /webhook/studio-brief-parse {request_id, client_id} + x-studio-secret → Load Config (WF-0) → Secret OK? → rpc brief_parse_update
   working → Get Request (single object, clients(name,style_brief)) → Get Settings (ai_platform, openrouter_models) → Get Template
   (prompt_templates brief_parser, the active row: v2 since studio_25b, v1 kept inactive) → Build Request (fills CLIENT_NAME, EXISTING_BRIEF = saved style_brief JSON minus source_text
   or "none", BRIEF_TEXT) → Text Platform? → Kie `/claude/v1/messages` (claude-sonnet-4-6, anthropic-version 2023-06-01, credential
   "GPT Image 2 [DM-Kie]" w0sDpl2nll4HkF6h, the WF-7 Distill endpoint) | OpenRouter chat/completions (settings.openrouter_models.text,
   response_format json_object); Auto = Kie, then OpenRouter via Kie Parse Down? → Parse (only the 15 result keys of studio_25, coerced
   and capped: strings 400 chars, lists 20 distinct items, enums palette_mode / text_case, locks, tier 1..5) → rpc brief_parse_update
   done + p_result, or Fail Message → rpc brief_parse_update failed + p_error (colon-free text). Writes ONLY brief_parse_requests; the
   client row changes only when the designer presses Save brief. Tests: `node n8n/tools/test-wf8-parse.js` (runs against the
   active template body from the migrations and checks v2 keeps the v1 output object and placeholders). The wizard applies the
   result as: niche / audience / typography note / choices replace, lists and notes only gain entries (studio_25b; brief_parser
   v2 returns saved wording for items a saved entry covers, so the merge does not add near-duplicates). A template change is a
   new prompt_templates version, never a WF-8 edit; WF-8 itself was not changed by studio_25b. Timing: the wizard keeps
   watching the row, says "slow" after 90 s (offers Stop waiting) and only gives up after 11 min (PARSE_GIVE_UP_MS in
   useBriefParse.ts), above the WF-8 worst case that still ends in done (model calls 2 x (2 x 120 s + 5 s) in Auto, plus the
   Supabase calls with retries, about 635 s). Raise PARSE_GIVE_UP_MS if WF-8 timeouts or tries ever grow.
15. SDK parser escaping rule (found on WF-8): the parser pre-scans the source for quotes before evaluating it, so an apostrophe (or any
   quote) in a builder-level `//` comment flips its string state and it then turns the escaped `\n` inside jsCode strings into real
   line breaks, which leaves a Code node with a syntax error live while check.js still says valid. Keep quotes out of top-level
   comments; test-wf8-parse.js compares every jsCode / sticky / string parameter with plain Node evaluation of the file to catch it.

## Workflow set and create order (all in folder QKT7A5gRiL349k8X, projectId i0N36mu4STExMeN4, never publish from code)
WF-0 Studio Config → WF-5 Poll → WF-2 Generate → WF-3 Edit → WF-1 Intake → WF-1b Style Draft → WF-4 Finisher → WF-6 Error → WF-7 Lessons → WF-8 Brief Parse (`Cu7if7YfPpWjNVnL`)

## Frontend ⇄ workflow bindings (already deployed DB triggers; nothing to change in the app)
form submit / New card → cards insert (stage intake) → /webhook/studio-intake → WF-1
Draft Style Card button → style_draft_requests insert → /webhook/studio-style-draft → WF-1b
Approve → approve_card → cards.stage=approved → /webhook/studio-generate → WF-2 (+ 2-min pg_cron nudge, studio_13_sweep_cadence)
Edit text / Edit region / Regenerate → request_edit → generations insert kind≠generate → /webhook/studio-edit → WF-3
Accept → accept_generation → fin_jobs queued → /webhook/studio-finisher-dispatch → WF-4
pg_cron 02:00 UTC → /webhook/studio-lessons → WF-7
Fill from text (onboarding, Written brief step) → brief_parse_requests insert → /webhook/studio-brief-parse → WF-8 (result back on the row via rpc brief_parse_update; the wizard watches it over Realtime)
Retry → retry_card requeues the generation / fin_job → same webhooks

Field names shared by WF-4 and the app (keep in sync):
- fin_jobs.metrics (WF-4 "Status -> done" p_fields.metrics) = { final_w, final_h, dpi } from the Set 300 DPI node; src/lib/types.ts
  parseFinalMetrics reads w|width|px_w|final_w, h|height|px_h|final_h and dpi, so the Completed tile shows "<w>×<h> px · 300 DPI".
- fin_jobs.final_path = <card_id>/<generation_id>-final.png (bucket finals); generations.image_path = <card_id>/<generation_id>.png (bucket gens).

## Error workflow binding (R99)
WF-1 Intake, WF-1b Style Draft, WF-2 Generate, WF-3 Edit and WF-4 Finisher must have Settings → Error workflow = DM Studio · WF-6 Error
(id PIgUHDGkVJVg9FHj). This is a LIVE-ONLY setting: the SDK parser used by create_workflow_from_code / check.js rejects `.settings()`
("not an allowed SDK method"), so it cannot be declared in the *.sdk.js sources, and n8n refuses to store it while WF-6 has no published
version ("has no published version, so n8n cannot run it"). Order: paste keys in WF-0 → publish WF-0 → publish WF-6 → on each of the five
workflows set Settings → Error workflow = WF-6 (or update_workflow setWorkflowSettings { errorWorkflow: 'PIgUHDGkVJVg9FHj' }) → publish
the rest. WF-5 Poll, WF-6 and WF-7 have no error workflow (WF-5 is a sub-workflow whose failure surfaces in the caller; WF-7 is a nightly
digest). Any re-create of these five workflows from code must repeat this step.

## Manual n8n steps (UI or connector), in order — status 2026-09-24
1. WF-0 `vbyjWhK4ZRN9uZUM` → node "Studio Config": paste studioSecret, ideogramKey, imgbbKey, mlKey (the only paste location).
2. Publish WF-0, then WF-5 Poll, then **WF-6 Error**, then WF-2, WF-3, WF-1, WF-1b, WF-4, WF-7.
3. Error workflow binding: WF-1, WF-1b, WF-2, WF-3, WF-4 → Settings → Error workflow → "DM Studio · WF-6 Error" (`PIgUHDGkVJVg9FHj`).
   n8n refuses to bind an error workflow that has no published version, so this step MUST come after WF-6 is published
   (verified 2026-09-24: `update_workflow` setWorkflowSettings.errorWorkflow on WF-2/3/4 answered "has no published version").
   WF-6 runs only for unhandled node crashes on production executions; the inline Fail Message paths stay the normal failure route.
   WF-5 (sub-workflow), WF-0, WF-6 and WF-7 get no error workflow. WF-8 Brief Parse (`Cu7if7YfPpWjNVnL`) should get WF-6 too (it is an
   interactive webhook like WF-1b); NOT yet set (2026-10-01: update_workflow is unavailable in the session that created it) - set it
   in Settings → Error workflow.
4. Delete the superseded copies `62DdRaJTr7rIsPFP` (old WF-4) and `3QD6HDEtWWcBYFbD` (stray WF-5); check every studio workflow sits in folder QKT7A5gRiL349k8X.
5. Then run the acceptance flow (docs/generation-spec.md section 6) — see docs/STATUS.md.
