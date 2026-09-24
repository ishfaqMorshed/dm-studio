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
5. Edge Function calls (prompt-engine, qc-judge): POST <sbUrl>/functions/v1/<name> with the same two headers.
6. Self-calls between workflows (dispatcher → worker webhook, ping): header x-studio-secret from config.
7. Ideogram: header Api-Key = ideogramKey. imgbb: query key = imgbbKey. ModelsLab: key inside JSON body = mlKey.
8. No Code node over 20 lines except the owner's frozen "Set 300 DPI" and the two verbatim ModelsLab evaluators.
9. Sub-workflow ids: WF-5 Poll id → const `pollWorkflowId` (placeholder REPLACE_WITH_WF5_POLL_ID); WF-2's worker webhook path is
   `studio-generate-worker`; WF-3 re-uses it for regenerate by POSTing {generation_id} there.

## Workflow set and create order (all in folder QKT7A5gRiL349k8X, projectId i0N36mu4STExMeN4, never publish from code)
WF-0 Studio Config → WF-5 Poll → WF-2 Generate → WF-3 Edit → WF-1 Intake → WF-1b Style Draft → WF-4 Finisher → WF-6 Error → WF-7 Lessons

## Frontend ⇄ workflow bindings (already deployed DB triggers; nothing to change in the app)
form submit / New card → cards insert (stage intake) → /webhook/studio-intake → WF-1
Draft Style Card button → style_draft_requests insert → /webhook/studio-style-draft → WF-1b
Approve → approve_card → cards.stage=approved → /webhook/studio-generate → WF-2 (+ 5-min pg_cron nudge)
Edit text / Edit region / Regenerate → request_edit → generations insert kind≠generate → /webhook/studio-edit → WF-3
Accept → accept_generation → fin_jobs queued → /webhook/finisher-dispatch → WF-4
pg_cron 02:00 UTC → /webhook/studio-lessons → WF-7
Retry → retry_card requeues the generation / fin_job → same webhooks

## WF-3 Edit (new, file n8n/wf3-edit.sdk.js)
Webhook studio-edit {generation_id, card_id, kind} → Load Config → Secret OK? → Get Generation(+card) → branch on kind:
- regenerate: POST <n8nBaseUrl>/webhook/studio-generate-worker {generation_id} (WF-2 worker does prompt-engine → Kie → QC) and stop.
- edit_text / edit_region: PATCH generation working → prompt-engine (returns rendered_prompt for the edit, input_paths: previous_version + optional mask)
  → sign the parent image (gens) and the mask if present → Kie createTask model 'google/nano-banana-edit' (request shape from docs/tshirt-engine/EXTRACT.md
  "tweak" path: input image URLs + prompt; add the mask as a second input and say in the prompt that only the white region may change)
  → WF-5 Poll → download result → upload gens/<card_id>/<generation_id>.png → PATCH image_path/vendor_job_id → Gemini QC (qc_prompt) → qc-judge
  → PATCH status done, cards.current_generation_id → move_card(needs_review). Failure → PATCH failed + move_card(failed).
  (drift_pct pixel diff is out of scope for v1; leave the column null.)

## WF-7 Lessons (new, file n8n/wf7-lessons.sdk.js)
Webhook studio-lessons → Load Config → Secret OK? → GET generations rejected in the last 24 h (rejection_reason not null, reviewed_at > now-1d) with card client_id
→ group per client (Code ≤ 20 lines) → per client: Kie claude-sonnet-4-6 messages call with distill_system / distill_user templates (fetched from prompt_templates)
→ parse up to 3 rules → INSERT design_lessons (client_id, category, rule, active=false, source_generation_ids) → Slack "DM HR" digest message (continueRegularOutput).
