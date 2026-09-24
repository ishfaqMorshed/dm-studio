# DM T-Shirt Engine — prompt & pipeline extract

**Source:** n8n workflow `DcdygzBz5GAoy2Zg` — "DM T-Shirt Engine [Main Copy] - 10 Branch copy 2"  
**Snapshot:** versionId `880d6084-7940-475c-8f96-b79362ba3814` (active), updatedAt `2026-09-21T05:33:53.226Z`, createdAt `2026-07-02T11:30:37.003Z`, active=True, 106 nodes (13 sticky notes, 93 functional), 4 triggers.  
**Settings:** `{"executionOrder": "v1", "timeSavedMode": "fixed", "callerPolicy": "workflowsFromSameOwner", "availableInMCP": true, "binaryMode": "separate"}` · meta `{"aiBuilderAssisted": true, "builderVariant": "mcp", "templateCredsSetupCompleted": true}`  
**Extracted:** 2026-09-24 via read-only `get_workflow_details`. Nothing was modified. Companion file: [`workflow.raw.json`](./workflow.raw.json) (full export, secrets replaced with `<REDACTED>`).

**Triggers (from n8n triggerInfo):**
- `Slack Slash Command` — POST `https://n8n.srv1202488.hstgr.cloud/webhook/9f0005c4-0d67-41a7-883c-3c5a12757a32`
- `Worker Webhook` — POST `https://n8n.srv1202488.hstgr.cloud/webhook/1697db60-117c-4305-9cb8-1babc5762e4f`
- `Finisher Webhook` — POST `https://n8n.srv1202488.hstgr.cloud/webhook/design-finisher`
- `Learn Schedule` — every 12 hours

**How to read the prompt sections.** Every prompt in this workflow is assembled inside a Code node by string concatenation. Section 3 shows the *rendered* prompt text, produced by executing each node's real `jsCode` under mocked n8n globals; runtime values are shown as `{{PLACEHOLDER}}`. The literal wording is byte-for-byte what the code emits. Section 4 holds every Code node's `jsCode` verbatim and is the ultimate source of truth.

**Redaction note.** Replaced with `<REDACTED>`: the Supabase anon JWT (was inline in 38 HTTP nodes and two Code nodes as `SB_KEY`), the Kie API key (inline `Authorization: Bearer …` header on the `Kie Ai` node), the ModelsLab key (`Finisher Config.mlKey`) and the Ideogram key (`Ideogram Config.ideogramKey`). Kept because they are resource identifiers, not credentials: Google Sheet id, Drive folder ids, n8n webhook paths, the old Supabase project ref `izjziiseuaewrhetbnkb`. The other Kie calls use an n8n `httpHeaderAuth` credential ("Kie Bearer") whose value is not part of the export.

---

## 1. Pipeline overview

```
Slack /gen ─► Parse Command ─► Valid? ─► Find/Create niche Drive folder ─► Read Niche Tab ─► Filter Not Generated
   ─► Build Worker Payloads ─┬─► SB Insert (generations: queued)
                             └─► Fire To Worker (HTTP POST to own Worker Webhook, one call per row)

Worker Webhook ─► Parse Worker Input ─► SB Analyzing ─► Build Analyze Request ─► Analyze Image Node (Gemini 3.1 Pro vision)
   ─► Build Intelligence Request (user msg) ─► Build Claude Request (system msg + approved lessons) ─► Kie Ai (gpt-5-6-terra)
   ─► Parse Claude (text + ASPECT) ─► Build Kie Gen Request ─► Check Cancel ─► Cancelled? ─► Kie Create Task
   ─► Task Created? ─► SB Generating ─► [Wait Gen 8s ─► Kie Poll ─► Eval Poll ─► Route Poll]* (4-min ceiling)
   ─► Parse Result ─► Build QC Request ─► QC Check (Gemini 3.1 Pro) ─► Parse QC ─► Route QC
        pass  ─► Download Result ─► Upload To Drive ─► SB Done ─► Mark Generated
        retry ─► Build Corrective Gen Request ─► Kie Create Task (one corrective pass, then QC again with attempt=2)
        fail  ─► Mark Failed ─► SB Failed          (every error edge in the worker also lands on Mark Failed)

Finisher Webhook ─► Parse Finish Input ─► Finish Valid? ─► Finisher Config ─► Archive Only?
   no  ─► SB Finishing ─► Fetch Gen ─► Fit 1024 ─► Store Prep ─► Build Upscale Req ─► ML Upscale ─► Eval Upscale ─► Route Upscale
             done ─► SB Upscaled ─► Ideogram Config ─► Download Upscaled ─► Ideogram RemoveBG ─► Parse Ideogram ─► Ideogram OK? ─► (archive path)
             wait ─► Wait Upscale 6s ─► Fetch Upscale ─► Eval Upscale · resubmit ─► Wait Resub Up 20s ─► ML Upscale · fail ─► Finish Failed
   yes ─► (archive path): Find PR Folder ─► Pick PR Folder ─► Create PR? ─► Download Final ─► Set 300 DPI ─┬─► Store Final ─► SB Finished
                                                                                                        └─► Upload Final Drive ─► SB Drive Saved

Learn Schedule (12h) ─► Fetch Feedback ─► Fetch Rulebook ─► Build Distill Request ─► Has Feedback?
   ─► Kie Claude Distill (claude-sonnet-4-6) ─► Parse Distill ─┬─► SB Insert Lessons (proposed)
                                                             ├─► Split Updates ─► SB Bump Freq
                                                             └─► Distill OK? ─► SB Mark Processed
```

---

## 2. Node inventory

Columns: **In** = upstream nodes; **Out** = downstream nodes, prefixed with the output label (`true/false`, switch key, or `ok/error` when the node has `continueErrorOutput`). **Err/retry** = onError, retryOnFail, alwaysOutputData.


### A · Intake / batch fan-out (Slack + Sheets + Drive) — DM-POD specific

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Slack Slash Command** | webhook | 2 | Webhook for Slack `/gen <N> <Niche> [similarity]` (POST /webhook/9f0005c4-…). | (trigger) | Parse Command | - |
| **Parse Command** | code | 2 | Parse N, niche (whitelist of 15), optional similarity 10-100; cap N at 50. | Slack Slash Command | Valid? | - |
| **Valid?** | if | 2 | Route valid command vs usage error. | Parse Command | true→Find Niche Folder; false→Notify Invalid | - |
| **Notify Invalid** | slack | 2.3 | Slack usage/error message back to channel. | Valid? | (none) | - |
| **Notify Start** | slack | 2.3 | Slack "Started" message. DISABLED and not wired. | (none) | (none) | DISABLED |
| **Find Niche Folder** | httpRequest | 4.2 | Drive API search for the niche folder under the DM root folder. | Valid? | Niche Folder Exists? | - |
| **Niche Folder Exists?** | if | 2 | Branch on Drive search hit. | Find Niche Folder | true→Set Folder ID; false→Create Niche Folder | - |
| **Create Niche Folder** | googleDrive | 3 | Create the niche folder in Drive. | Niche Folder Exists? | Set Folder ID | - |
| **Set Folder ID** | code | 2 | Stash resolved folder id in workflow static data. | Niche Folder Exists?; Create Niche Folder | Read Niche Tab | - |
| **Read Niche Tab** | googleSheets | 4.5 | Read the niche tab of "Niche Image Master Sheet". | Set Folder ID | Filter Not Generated | - |
| **Filter Not Generated** | code | 2 | Pick eligible rows (blank / Not Generated / Failed <3), first N. | Read Niche Tab | Build Worker Payloads | - |
| **Build Worker Payloads** | code | 2 | Mint batch_id + generation_id per row; resolve similarity precedence (row > command > 85). | Filter Not Generated | SB Insert; Fire To Worker | - |
| **SB Insert** | httpRequest | 4.2 | Supabase POST generations (status=queued). | Build Worker Payloads | (none) | continueRegularOutput |
| **Fire To Worker** | httpRequest | 4.2 | POST each payload to this workflow's own Worker Webhook (fan-out, one execution per design). | Build Worker Payloads | (none) | - |

### B · Worker intake / reference analysis

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Worker Webhook** | webhook | 2 | Per-design entry point (POST /webhook/1697db60-…). Also used by the frontend for regen (regen_feedback/regen_mode). | (trigger) | Parse Worker Input | - |
| **Parse Worker Input** | code | 2 | Unpack payload; derive regen_mode = tweak | reference. | Worker Webhook | SB Analyzing | - |
| **SB Analyzing** | httpRequest | 4.2 | Supabase PATCH status=analyzing. | Parse Worker Input | Build Analyze Request | continueRegularOutput, alwaysOutput |
| **Build Analyze Request** | code | 2 | Build Gemini vision request: describe reference + transcribe typography image. | SB Analyzing | Analyze Image Node | - |
| **Analyze Image Node** | httpRequest | 4.2 | Kie gemini-3.1-pro chat/completions (vision). | Build Analyze Request | ok→Build Intelligence Request; error→Mark Failed | continueErrorOutput, retry 3x/5000ms |

### C · Prompt engine

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Build Intelligence Request** | code | 2 | Assemble the prompt-engine USER message (niche, similarity, quote, instruction, regen block, analysis). | Analyze Image Node | Build Claude Request | - |
| **Build Claude Request** | code | 2 | Assemble the prompt-engine SYSTEM prompt (tiers, rules, defects, learned lessons) + Responses-API body; fetches approved design_lessons from Supabase. | Build Intelligence Request | Kie Ai | - |
| **Kie Ai** | httpRequest | 4.2 | Kie /codex/v1/responses, model gpt-5-6-terra (the prompt engine call). | Build Claude Request | ok→Parse Claude; error→Mark Failed | continueErrorOutput, retry 5x/5000ms |
| **Parse Claude** | code | 2 | Extract text from SSE/JSON response; pull + strip the ASPECT line. | Kie Ai | ok→Build Kie Gen Request; error→Mark Failed | continueErrorOutput |

### D · Generation (Kie createTask + poll loop)

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Build Kie Gen Request** | code | 2 | Build Kie createTask body (i2i / t2i / nano-banana-edit); aspect constancy from stored aspect_ratio; snap to Kie enum. | Parse Claude | Check Cancel | - |
| **Check Cancel** | httpRequest | 4.2 | Supabase GET generations id,archived (cancel check). | Build Kie Gen Request | Eval Cancel | continueRegularOutput, alwaysOutput |
| **Eval Cancel** | code | 2 | Cancelled if row deleted or archived (fail-open). | Check Cancel | Cancelled? | - |
| **Cancelled?** | if | 2.2 | Skip or proceed. | Eval Cancel | true→Skip Cancelled; false→Kie Create Task | - |
| **Skip Cancelled** | noOp | 1 | No-op terminal. | Cancelled? | (none) | - |
| **Kie Create Task** | httpRequest | 4.2 | Kie POST /api/v1/jobs/createTask. | Build Corrective Gen Request; Cancelled? | ok→Task Created?; error→Mark Failed | continueErrorOutput, retry 3x/5000ms |
| **Task Created?** | if | 2 | code===200 && data.taskId. | Kie Create Task | true→SB Generating; false→Mark Failed | - |
| **SB Generating** | httpRequest | 4.2 | Supabase PATCH status=generating. | Task Created? | Wait Gen | continueRegularOutput, alwaysOutput |
| **Wait Gen** | wait | 1.1 | Wait 8 s. | Route Poll; SB Generating | Kie Poll | - |
| **Kie Poll** | httpRequest | 4.2 | Kie GET /api/v1/jobs/recordInfo?taskId=. | Wait Gen | ok→Eval Poll; error→Mark Failed | continueErrorOutput, retry 3x/2500ms |
| **Eval Poll** | code | 2 | success / wait / fail; 4-min ceiling from data.createTime. | Kie Poll | Route Poll | - |
| **Route Poll** | switch | 3 | Switch on _decision. | Eval Poll | success→Parse Result; wait→Wait Gen; fail→Mark Failed | - |
| **Parse Result** | code | 2 | Extract resultUrls[0] from data.resultJson. | Route Poll | ok→Build QC Request; error→Mark Failed | continueErrorOutput |

### E · Quality control (9-point)

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Build QC Request** | code | 2 | Build the 9-point QC inspection request (expected text from sheet or analysis). | Parse Result | QC Check | - |
| **QC Check** | httpRequest | 4.2 | Kie gemini-3.1-pro chat/completions (vision QC). | Build QC Request | Parse QC | continueRegularOutput, retry 3x/2500ms, alwaysOutput |
| **Parse QC** | code | 2 | Parse verdict JSON; qc_score; pass / retry / fail; fail-open as unverified. | QC Check | Route QC | - |
| **Route QC** | switch | 3 | Switch on decision. | Parse QC | pass→Download Result; retry→Build Corrective Gen Request; fail→Mark Failed | - |

### F · Corrective regeneration

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Build Corrective Gen Request** | code | 2 | Append CRITICAL CORRECTIONS to the original gen prompt; re-enter Kie Create Task once. | Route QC | Kie Create Task | - |

### G · Deliver & record

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Download Result** | httpRequest | 4.2 | GET generated image as binary. | Route QC | ok→Upload To Drive; error→Mark Failed | continueErrorOutput |
| **Upload To Drive** | googleDrive | 3 | Upload PNG to the niche Drive folder. | Download Result | ok→SB Done; error→Mark Failed | continueErrorOutput |
| **SB Done** | httpRequest | 4.2 | Supabase PATCH status=done + image_url, prompt_used, cost_gen, similarity, qc_*, aspect_ratio. | Upload To Drive | Mark Generated | continueRegularOutput, alwaysOutput |
| **Mark Generated** | googleSheets | 4.5 | Sheet row Status=Generated. | SB Done | (none) | - |

### H · Fail lane

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Mark Failed** | googleSheets | 4.5 | Sheet row Status=Failed (n+1). | Analyze Image Node; Upload To Drive; Kie Create Task; Kie Poll; Parse Result; Download Result; Parse Claude; Task Created?; Route Poll; Route QC; Kie Ai | SB Failed | - |
| **SB Failed** | httpRequest | 4.2 | Supabase PATCH status=failed + qc_*, cost_gen, error (QC reason or Kie failMsg). | Mark Failed | (none) | continueRegularOutput |

### I · Finisher (upscale → remove-bg → 300 DPI → store → archive)

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Finisher Webhook** | webhook | 2 | POST /webhook/design-finisher (frontend ✨ finish / ☁ archive). | (trigger) | Parse Finish Input | - |
| **Parse Finish Input** | code | 2 | Validate id + image_url/final_url; archive_only; fileName. | Finisher Webhook | Finish Valid? | - |
| **Finish Valid?** | if | 2.2 | Gate. | Parse Finish Input | true→Finisher Config | - |
| **Finisher Config** | set | 3.4 | Set: mlKey (REDACTED), upscaleModel=ultra_resolution (unused), upscaleScale=4. | Finish Valid? | Archive Only? | - |
| **Archive Only?** | if | 2.2 | archive_only → skip processing, go straight to archive. | Finisher Config | true→Find PR Folder; false→SB Finishing | - |
| **SB Finishing** | httpRequest | 4.2 | Supabase PATCH finish_status=finishing. | Archive Only? | Fetch Gen | continueRegularOutput, alwaysOutput |
| **Fetch Gen** | httpRequest | 4.2 | GET image_url as binary. | SB Finishing | Fit 1024 | - |
| **Fit 1024** | editImage | 1 | Resize to max 1024×1024 (onlyIfLarger) so ×4 = 4096. | Fetch Gen | Store Prep | - |
| **Store Prep** | httpRequest | 4.2 | Supabase Storage POST finals/prep_<ts>.png (public URL for ModelsLab). | Fit 1024 | Build Upscale Req | - |
| **Build Upscale Req** | code | 2 | ModelsLab super_resolution body (RealESRGAN_x4plus_anime_6B, scale 4). | Store Prep | ML Upscale | - |
| **ML Upscale** | httpRequest | 4.2 | ModelsLab POST /api/v6/image_editing/super_resolution. | Build Upscale Req; Wait Resub Up | ok→Eval Upscale; error→Finish Failed | continueErrorOutput, retry 2x/3000ms |
| **Eval Upscale** | code | 2 | done / wait / fail / resubmit (rate-limit); up to 50 polls. | ML Upscale; Fetch Upscale | Route Upscale | - |
| **Route Upscale** | switch | 3 | Switch on decision. | Eval Upscale | done→SB Upscaled; wait→Wait Upscale; fail→Finish Failed; resubmit→Wait Resub Up | - |
| **Wait Upscale** | wait | 1.1 | Wait 6 s. | Route Upscale | Fetch Upscale | - |
| **Fetch Upscale** | httpRequest | 4.2 | ModelsLab POST fetch/<id> {key}. | Wait Upscale | Eval Upscale | continueRegularOutput, retry 2x/2000ms |
| **Wait Resub Up** | wait | 1.1 | Wait 20 s then resubmit upscale. | Route Upscale | ML Upscale | - |
| **SB Upscaled** | httpRequest | 4.2 | Supabase PATCH finish_status=removing_bg, cost_upscale=0.02. | Route Upscale | Ideogram Config | continueRegularOutput, alwaysOutput |
| **Ideogram Config** | set | 3.4 | Set: ideogramKey (REDACTED), removebgUsd=0.01. | SB Upscaled | Download Upscaled | - |
| **Download Upscaled** | httpRequest | 4.2 | GET upscaled image as binary. | Ideogram Config | ok→Ideogram RemoveBG; error→Finish Failed | continueErrorOutput, retry 2x/3000ms |
| **Ideogram RemoveBG** | httpRequest | 4.2 | Ideogram POST /v1/remove-background (multipart). | Download Upscaled | Parse Ideogram | continueRegularOutput, retry 3x/5000ms |
| **Parse Ideogram** | code | 2 | data[0].url; is_image_safe. | Ideogram RemoveBG | Ideogram OK? | - |
| **Ideogram OK?** | if | 2.2 | Gate. | Parse Ideogram | true→Find PR Folder; false→Finish Failed | - |
| **Find PR Folder** | httpRequest | 4.2 | Drive API search "Musketeer Print Ready" (result ignored by Pick PR Folder). | Archive Only?; Ideogram OK? | Pick PR Folder | continueRegularOutput, retry 2x/2000ms, alwaysOutput |
| **Pick PR Folder** | code | 2 | Hard-coded print-ready folder id; needCreate=false. | Find PR Folder | Create PR? | - |
| **Create PR?** | if | 2.2 | Never true in practice. | Pick PR Folder | true→Create PR Folder; false→Download Final | - |
| **Create PR Folder** | httpRequest | 4.2 | Drive API create folder (dead path). | Create PR? | Download Final | continueRegularOutput, retry 2x/2000ms |
| **Download Final** | httpRequest | 4.2 | GET transparent PNG (Ideogram url) or existing final_url (archive-only). | Create PR?; Create PR Folder | Set 300 DPI | continueRegularOutput, retry ?x/?ms |
| **Set 300 DPI** | code | 2 | Write pHYs chunk (300 DPI) into the PNG; pass binary through. | Download Final | Store Final; Upload Final Drive | - |
| **Store Final** | httpRequest | 4.2 | Supabase Storage POST finals/<ts>_<fileName> (permanent final). | Set 300 DPI | SB Finished | continueRegularOutput, alwaysOutput |
| **SB Finished** | httpRequest | 4.2 | Supabase PATCH finish_status=finished, final_url, cost_removebg. | Store Final | (none) | continueRegularOutput, alwaysOutput |
| **Upload Final Drive** | googleDrive | 3 | Upload final PNG to Musketeer Print Ready Drive folder. | Set 300 DPI | ok→SB Drive Saved | continueErrorOutput, retry 2x/3000ms |
| **SB Drive Saved** | httpRequest | 4.2 | Supabase PATCH drive_saved=true. | Upload Final Drive | (none) | continueRegularOutput, alwaysOutput |
| **Finish Failed** | httpRequest | 4.2 | Supabase PATCH finish_status=finish_failed + error. | ML Upscale; Route Upscale; Download Upscaled; Ideogram OK? | (none) | continueRegularOutput, alwaysOutput |

### J · Self-learning / lessons distill (scheduled)

| Node | Type | Ver | Purpose | In | Out | Err/retry |
|---|---|---|---|---|---|---|
| **Learn Schedule** | scheduleTrigger | 1.2 | Every 12 h. | (trigger) | Fetch Feedback | - |
| **Fetch Feedback** | httpRequest | 4.2 | Supabase GET generations rejected/needs_regen with feedback, learn_processed=false (limit 200). | Learn Schedule | Fetch Rulebook | continueRegularOutput, alwaysOutput |
| **Fetch Rulebook** | httpRequest | 4.2 | Supabase GET design_lessons status in (approved,proposed) (limit 100). | Fetch Feedback | Build Distill Request | continueRegularOutput, alwaysOutput |
| **Build Distill Request** | code | 2 | Build Claude distill request (system + rulebook/feedback user message). | Fetch Rulebook | Has Feedback? | - |
| **Has Feedback?** | if | 2.2 | skip==true → nothing to learn. | Build Distill Request | true→Nothing To Learn; false→Kie Claude Distill | - |
| **Nothing To Learn** | noOp | 1 | No-op terminal. | Has Feedback? | (none) | - |
| **Kie Claude Distill** | httpRequest | 4.2 | Kie /claude/v1/messages, model claude-sonnet-4-6. | Has Feedback? | Parse Distill | continueRegularOutput, retry 3x/5000ms |
| **Parse Distill** | code | 2 | Parse {updates,new_lessons}; distillOk only on parseable JSON. | Kie Claude Distill | SB Insert Lessons; Split Updates; Distill OK? | - |
| **SB Insert Lessons** | httpRequest | 4.2 | Supabase POST design_lessons (status=proposed). | Parse Distill | (none) | continueRegularOutput, alwaysOutput |
| **Split Updates** | code | 2 | One item per freq update. | Parse Distill | SB Bump Freq | - |
| **SB Bump Freq** | httpRequest | 4.2 | Supabase PATCH design_lessons freq. | Split Updates | (none) | continueRegularOutput, alwaysOutput |
| **Distill OK?** | if | 2.2 | Gate marking feedback processed. | Parse Distill | true→SB Mark Processed | - |
| **SB Mark Processed** | httpRequest | 4.2 | Supabase PATCH generations learn_processed=true. | Distill OK? | (none) | continueRegularOutput, alwaysOutput |

### Sticky notes (documentation only, no connections)

| Note | Position |
|---|---|
| SETUP GUIDE | [752, -160] |
| Sec 1 · Command Intake | [-1248, 144] |
| Sec 2 · Drive Folder | [-544, -560] |
| Sec 3 · Rows & Fan-out | [-192, 64] |
| Sec 4 · Worker Intake | [-1744, 832] |
| Sec 5 · Analyze | [-1248, 1376] |
| Sec 6 · Prompt Engine | [-368, 864] |
| Sec 7 · Generate | [752, 464] |
| Sec 8 · Quality Control | [1728, 1248] |
| Sec 9 · Deliver & Record | [1728, 704] |
| Sec 10 · Fail Lane | [1056, 1408] |
| Sec 11 · Finisher | [-1216, 1760] |
| Sec 12 · Self-Learning | [-1216, 2400] |

---

## 3. LLM prompts (verbatim, rendered from the node code)

Placeholders: `{{NICHE}}`, `{{QUOTE}}`, `{{DESIGN_INSTRUCTION}}`, `{{NOTES}}`, `{{GEMINI_ANALYSIS_TEXT}}`, `{{REGEN_FEEDBACK}}`, `{{AGENT_INPUT}}`, `{{REFERENCE_IMAGE_URL}}`, `{{TYPOGRAPHY_IMAGE_URL}}`, `{{GENERATED_IMAGE_URL}}`, `{{EXPECTED_TEXT}}`, `{{APPROVED_LESSON_n}}` stand for runtime values. Numbers such as `85%` are the rendered value of `effSim` for the variant shown.

### 3.1 Vision / reference analysis prompt — node `Build Analyze Request` → `Analyze Image Node` (Kie `gemini-3.1-pro`)

Sent as the single `text` part of one user message, followed by 1–2 `image_url` parts (IMAGE 1 = reference `Image`; IMAGE 2 = `Typography Image`, only when present). The "IMAGE 2 …" paragraph is included only when a typography image exists.

**Variant A — with typography image:**

```text
You are a precise visual analyst for a "{{NICHE}}" print-on-demand design.

IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

IMAGE 1 is the DESIGN TO RE-CREATE (the output must copy it ~80-90%). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.

IMAGE 2 is the TYPOGRAPHY / TEXT REFERENCE. Transcribe its text EXACTLY, word for word, preserving line breaks and casing. Note its font style.

Return EXACTLY this structure and nothing else:
STYLE:
<full description for re-creation>

TYPOGRAPHY_TEXT:
<exact transcribed text from IMAGE 2, or NONE>

TYPOGRAPHY_STYLE:
<font description, or NONE>
```

**Variant B — no typography image** (identical except the IMAGE 2 paragraph is omitted):

```text
You are a precise visual analyst for a "{{NICHE}}" print-on-demand design.

IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

IMAGE 1 is the DESIGN TO RE-CREATE (the output must copy it ~80-90%). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.

Return EXACTLY this structure and nothing else:
STYLE:
<full description for re-creation>

TYPOGRAPHY_TEXT:
<exact transcribed text from IMAGE 2, or NONE>

TYPOGRAPHY_STYLE:
<font description, or NONE>
```

**Request body shape** (OpenAI chat-completions style, model chosen by URL path):

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "You are a precise visual analyst for a \"{{NICHE}}\" print-on-demand design.\n\nIMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.\n\nIMAGE 1 is the DESIGN TO RE-CREATE (the output must copy it ~80-90%). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.\n\nIMAGE 2 is the TYPOGRAPHY / TEXT REFERENCE. Transcribe its text EXACTLY, word for word, preserving line breaks and casing. Note its font style.\n\nReturn EXACTLY this structure and nothing else:\nSTYLE:\n<full description for re-creation>\n\nTYPOGRAPHY_TEXT:\n<exact transcribed text from IMAGE 2, or NONE>\n\nTYPOGRAPHY_STYLE:\n<font description, or NONE>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "{{REFERENCE_IMAGE_URL}}"
          }
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "{{TYPOGRAPHY_IMAGE_URL}}"
          }
        }
      ]
    }
  ]
}
```

Downstream use: `choices[0].message.content` is passed whole into the prompt-engine user message; `Build QC Request` regex-extracts the `TYPOGRAPHY_TEXT:` block when the sheet has no quote (`NONE` → no text expected).

### 3.2 Prompt-engine USER message template — node `Build Intelligence Request`

**Normal run (quote present):**

```text
NICHE: {{NICHE}}
TARGET SIMILARITY TO REFERENCE: 85% (follow the similarity policy in your instructions)
QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): {{QUOTE}}
DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): {{DESIGN_INSTRUCTION}}
NOTES: {{NOTES}}

REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):
{{GEMINI_ANALYSIS_TEXT}}
```

**No quote in the sheet** (only the QUOTE line differs):

```text
NICHE: {{NICHE}}
TARGET SIMILARITY TO REFERENCE: 85% (follow the similarity policy in your instructions)
QUOTE / ON-DESIGN TEXT: (none in the sheet) - use the exact words under TYPOGRAPHY_TEXT in the analysis; if that is NONE, render no text at all.
DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): {{DESIGN_INSTRUCTION}}
NOTES: {{NOTES}}

REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):
{{GEMINI_ANALYSIS_TEXT}}
```

**Regeneration, mode `tweak`** (adds the REGENERATION block and changes the description label):

```text
NICHE: {{NICHE}}
TARGET SIMILARITY TO REFERENCE: 85% (follow the similarity policy in your instructions)
QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): {{QUOTE}}
DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): {{DESIGN_INSTRUCTION}}
REGENERATION - TARGETED EDIT: the client reviewed the attached previous version of this design and requested ONLY the following changes. Apply them precisely; everything NOT mentioned must stay EXACTLY as it is in the previous version - same composition, elements, colors, lettering and placement:
"{{REGEN_FEEDBACK}}"
NOTES: {{NOTES}}

PREVIOUS VERSION DESCRIPTION (this is the image being edited - use it to name elements precisely; keep everything not mentioned in the edit request identical):
{{GEMINI_ANALYSIS_TEXT}}
```

**Regeneration, mode `reference`:**

```text
NICHE: {{NICHE}}
TARGET SIMILARITY TO REFERENCE: 85% (follow the similarity policy in your instructions)
QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): {{QUOTE}}
DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): {{DESIGN_INSTRUCTION}}
REGENERATION - MATCH THE REFERENCE BETTER: the client compared the previous attempt against the ORIGINAL REFERENCE (described below and attached) and found it missed or misrepresented elements of that reference. Re-create it at the target similarity, and make absolutely sure to capture the following:
"{{REGEN_FEEDBACK}}"
NOTES: {{NOTES}}

REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):
{{GEMINI_ANALYSIS_TEXT}}
```

### 3.3 Prompt-engine SYSTEM prompt — node `Build Claude Request` → `Kie Ai` (Kie `/codex/v1/responses`, model `gpt-5-6-terra`)

This is the "GPT-5.6-terra prompt engine with 5 similarity tiers". The system text is sent twice: as the Responses-API `instructions` field **and** as an `input[]` message with `role: "system"` (the code comment says `instructions` overrides Kie's injected Codex coding persona). The user message is the §3.2 text.

**Full system prompt — generation mode, similarity 85 (FAITHFUL tier), image-to-image, two approved lessons present:**

```text
You are a POD design prompt engine. You output ONE final image-generation prompt (a single dense paragraph) for a downstream image model that ALSO receives the STYLE REFERENCE image directly. Output ONLY the instruction - no preamble, no markdown, no quotes.

PRIMARY RULE - SIMILARITY POLICY:
- FAITHFUL RE-CREATION (~85%): reproduce the reference's overall composition, layout, structure, hero subject and how it is drawn, color palette, art technique/medium, texture, and overall vibe closely - the result must clearly read as the same design. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.
- The reference may be a rough draft, a shirt mockup, angled, folded, or a screenshot - work from the flat design artwork only, straightened and cleaned up.

TEXT - EXACT, NOTHING ELSE:
- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.
- State the quote once in quotation marks and once spelled out letter by letter so the image model cannot misspell it.
- Match the lettering style and weight to the reference's typography (adapt placement if the similarity policy allows re-composition).
- If no quote is provided, render no text at all.

BACKGROUND (keep it effortless - never let it affect the design):
- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.
- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.
- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.

DESIGN INSTRUCTION: if one is provided, apply it on top (it never overrides the exact-text, background, or no-shadow rules).

KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):
- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.
- OVERALL DISTRESS: overall distress/texture is never heavier than the reference; when in doubt, use less.
- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.
- STRAIGHT BASELINES: if the reference text is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the reference clearly does.
- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.
- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.
- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the reference itself uses halftone, applied as an even, deliberate pattern.
- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.
- STYLE MATURITY: match the reference's rendering maturity - never drift more cartoonish or childish than the reference.

RENDER QUALITY: crisp vector-sharp edges, clean linework, flat solid inks, high contrast, print-ready. No watermark, no signature, no border or frame, no extra icons.

LEARNED CLIENT PREFERENCES (distilled from this client's past rejections - treat every one as a hard requirement):
- {{APPROVED_LESSON_1}}
- {{APPROVED_LESSON_2}}

Output: ONE image-generation prompt as a single dense paragraph that follows the similarity policy at ~85% to the reference, carries the exact quote text exactly once, avoids every known defect above, on a solid flat neutral-grey background with no shadows. Then on a NEW final line output exactly: ASPECT: <ratio> - the tightest canvas that comfortably contains the design you just described, chosen ONLY from 1:1, 3:4, 4:3, 9:16, 16:9. Most tall stacked tee designs fit 3:4; only a genuinely very tall narrow stack fits 9:16; wide layouts fit 4:3; only a true wide banner strip fits 16:9; near-square art is 1:1. Pick the ratio that leaves the least empty grey around the design. Format strictly: that line contains ONLY the word ASPECT, a colon, one space, and the ratio - no punctuation, no asterisks, no extra words. Nothing else after that line.
```

**What changes between variants** (everything else is identical to the block above):

*Line 1 — `refLine`, chosen by whether the image model gets the reference (`i2i`):*
- i2i (`isEdit || (mode==='reference' && hasImg) || (effSim >= 60 && hasImg)`): `for a downstream image model that ALSO receives the STYLE REFERENCE image directly.`
- t2i (otherwise): `for a downstream image model that will NOT receive the reference image - your prompt alone must fully describe the design, so be complete and concrete.`
- edit: `for a downstream image EDITING model that receives the PREVIOUS VERSION of this design directly and edits it in place.`

*`PRIMARY RULE` bullet — the 5 similarity tiers (`effSim` is the number requested; `{{n}}` below is rendered as e.g. `95` / `~85`):*

**effSim ≥ 90 — NEAR-EXACT**

```text
NEAR-EXACT RE-CREATION ({{n}}%): reproduce the reference's composition, layout, structure, hero subject and exactly how it is drawn, every supporting element and its placement, the color palette, art technique, texture and overall vibe as close to identical as possible. The ONLY intentional change is the on-design text.
```

**75 ≤ effSim < 90 — FAITHFUL**

```text
FAITHFUL RE-CREATION (~{{n}}%): reproduce the reference's overall composition, layout, structure, hero subject and how it is drawn, color palette, art technique/medium, texture, and overall vibe closely - the result must clearly read as the same design. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.
```

**55 ≤ effSim < 75 — INSPIRED REMIX**

```text
INSPIRED REMIX (~{{n}}%): keep the reference's hero concept, art technique, color palette family and overall vibe, but you MAY re-compose the layout, redraw the hero in the same style, and swap or simplify supporting elements. It should feel like a sibling design from the same collection - clearly related, not a copy.
```

**effSim < 55 — LOOSE INSPIRATION**

```text
LOOSE INSPIRATION (~{{n}}%): use the reference ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic, leaning more on the NICHE for subject matter. It should feel like the same artist made a different design for the same audience.
```

**isEdit (regen_mode = tweak with an image) — TARGETED EDIT (replaces the tier; header becomes `PRIMARY RULE - TARGETED EDIT:`)**

```text
TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or "improve" anything that was not explicitly asked to change.
```

*Second PRIMARY RULE bullet* — present in generation mode only: `- The reference may be a rough draft, a shirt mockup, angled, folded, or a screenshot - work from the flat design artwork only, straightened and cleaned up.`

*`TEXT - EXACT, NOTHING ELSE` bullets 2–3* — generation mode uses the two lines shown above (`State the quote once in quotation marks and once spelled out letter by letter …` and `Match the lettering style and weight …`); edit mode replaces them with the single line `- Keep the lettering style, size and placement exactly as in the previous version unless the requested change is specifically about the text.`

*`LEARNED CLIENT PREFERENCES` block* — appended after RENDER QUALITY only when Supabase returns ≥1 approved lesson (`GET /rest/v1/design_lessons?status=eq.approved&or=(scope.eq.global,niche.eq.<niche>)&order=freq.desc&limit=10&select=text`). On any fetch error the block is silently omitted.

*`Output:` line* — generation mode is the ASPECT-bearing line shown above (with `~{{n}}%` rendered). Edit mode uses:

```text
Output: ONE short imperative edit instruction (1 to 3 sentences maximum) for an image editing model. State ONLY the requested changes, precisely and concretely - name the exact element, the exact change, exact colors where relevant. If the change involves text, spell the new text exactly once, letter by letter. End with exactly this sentence: "Keep everything else exactly the same, including all lettering, layout, colors, textures, and the flat grey background, with no shadows." Nothing else - no preamble, no description of the rest of the design.
```

**Full system prompt — edit mode (`regen_mode = tweak`), for completeness:**

```text
You are a POD design prompt engine. You output ONE short edit instruction for a downstream image EDITING model that receives the PREVIOUS VERSION of this design directly and edits it in place. Output ONLY the instruction - no preamble, no markdown, no quotes.

PRIMARY RULE - TARGETED EDIT:
- TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or "improve" anything that was not explicitly asked to change.

TEXT - EXACT, NOTHING ELSE:
- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.
- Keep the lettering style, size and placement exactly as in the previous version unless the requested change is specifically about the text.
- If no quote is provided, render no text at all.

BACKGROUND (keep it effortless - never let it affect the design):
- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.
- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.
- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.

DESIGN INSTRUCTION: if one is provided, apply it on top (it never overrides the exact-text, background, or no-shadow rules).

KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):
- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.
- OVERALL DISTRESS: overall distress/texture is never heavier than the reference; when in doubt, use less.
- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.
- STRAIGHT BASELINES: if the reference text is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the reference clearly does.
- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.
- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.
- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the reference itself uses halftone, applied as an even, deliberate pattern.
- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.
- STYLE MATURITY: match the reference's rendering maturity - never drift more cartoonish or childish than the reference.

RENDER QUALITY: crisp vector-sharp edges, clean linework, flat solid inks, high contrast, print-ready. No watermark, no signature, no border or frame, no extra icons.

LEARNED CLIENT PREFERENCES (distilled from this client's past rejections - treat every one as a hard requirement):
- {{APPROVED_LESSON_1}}
- {{APPROVED_LESSON_2}}

Output: ONE short imperative edit instruction (1 to 3 sentences maximum) for an image editing model. State ONLY the requested changes, precisely and concretely - name the exact element, the exact change, exact colors where relevant. If the change involves text, spell the new text exactly once, letter by letter. End with exactly this sentence: "Keep everything else exactly the same, including all lettering, layout, colors, textures, and the flat grey background, with no shadows." Nothing else - no preamble, no description of the rest of the design.
```

**Request body shape** (OpenAI Responses API via Kie):

```json
{
  "model": "gpt-5-6-terra",
  "max_output_tokens": 4096,
  "reasoning": {
    "effort": "medium"
  },
  "stream": false,
  "instructions": "<SYSTEM>",
  "input": [
    {
      "role": "system",
      "content": [
        {
          "type": "input_text",
          "text": "<SYSTEM>"
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "{{AGENT_INPUT}}"
        }
      ]
    }
  ]
}
```

### 3.4 Exact-text rules (verbatim lines, from `Build Claude Request`)

```text
TEXT - EXACT, NOTHING ELSE:
- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.
- State the quote once in quotation marks and once spelled out letter by letter so the image model cannot misspell it.
- Match the lettering style and weight to the reference's typography (adapt placement if the similarity policy allows re-composition).
- If no quote is provided, render no text at all.
```

Reinforced on the user side by `Build Intelligence Request`: `QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): {{QUOTE}}` and, when absent, `QUOTE / ON-DESIGN TEXT: (none in the sheet) - use the exact words under TYPOGRAPHY_TEXT in the analysis; if that is NONE, render no text at all.` Enforced after generation by QC checks 1–4 (§3.8) and by the corrective prompt's letter-spaced spelling (§3.9).

### 3.5 Flat grey background rule (verbatim, from `Build Claude Request`)

```text
BACKGROUND (keep it effortless - never let it affect the design):
- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.
- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.
- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.
```

Also: `DESIGN INSTRUCTION: if one is provided, apply it on top (it never overrides the exact-text, background, or no-shadow rules).` and `RENDER QUALITY: crisp vector-sharp edges, clean linework, flat solid inks, high contrast, print-ready. No watermark, no signature, no border or frame, no extra icons.` The Kie gen request additionally sets `background: 'opaque'`; the grey is later removed by Ideogram in the finisher.

### 3.6 Known print defects list (verbatim, from `Build Claude Request`)

```text
KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):
- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.
- OVERALL DISTRESS: overall distress/texture is never heavier than the reference; when in doubt, use less.
- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.
- STRAIGHT BASELINES: if the reference text is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the reference clearly does.
- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.
- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.
- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the reference itself uses halftone, applied as an even, deliberate pattern.
- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.
- STYLE MATURITY: match the reference's rendering maturity - never drift more cartoonish or childish than the reference.
```

### 3.7 Aspect-ratio pick logic

1. **Prompt engine picks** (tail of the generation-mode `Output:` line): `Then on a NEW final line output exactly: ASPECT: <ratio> - the tightest canvas that comfortably contains the design you just described, chosen ONLY from 1:1, 3:4, 4:3, 9:16, 16:9. Most tall stacked tee designs fit 3:4; only a genuinely very tall narrow stack fits 9:16; wide layouts fit 4:3; only a true wide banner strip fits 16:9; near-square art is 1:1. Pick the ratio that leaves the least empty grey around the design. Format strictly: that line contains ONLY the word ASPECT, a colon, one space, and the ratio - no punctuation, no asterisks, no extra words. Nothing else after that line.`
2. **`Parse Claude` extracts** the *last* match of `/ASPECT(?:\s*RATIO)?\s*[:=]\s*(\d{1,2})\s*[:xX\/]\s*(\d{1,2})/gi`, validates it against `['1:1','3:2','2:3','4:3','3:4','16:9','9:16','2:1','1:2','3:1','1:3','21:9','9:21','5:4','4:5']` (else `1:1`), and strips that line (whole line if ≤40 chars, else just the match) from the prompt text. Output: `{ output, aspect_ratio }`.
3. **`Build Kie Gen Request` snaps** to Kie's enum `['1:1','3:4','4:3','9:16','16:9']` by nearest `|log(r/c)|` (`snapAspect`), and applies **aspect constancy**: `GET generations?id=eq.<id>&select=aspect_ratio` — a stored value always wins (snapped), then the prompt engine's pick, then `1:1`. Edit mode (`nano-banana-edit`) sends no aspect (canvas inherits the source image) and records `aspect_used = snapAspect(stored) || undefined`.
4. **`SB Done` persists** `aspect_ratio: aspect_used` so subsequent runs of the same card never flip canvas.

### 3.8 9-point QC prompt — node `Build QC Request` → `QC Check` (Kie `gemini-3.1-pro`)

Expected text = sheet `Typography Text`, else the `TYPOGRAPHY_TEXT:` block of the analysis (`NONE` → empty). Sent as `text` + one `image_url` (the generated image).

**With expected text:**

```text
You are a strict print-on-demand quality inspector. Inspect the attached generated design image.

EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""

Perform these checks:
1. text_matches: read ALL text in the image. Spelling, wording and word order must equal the expected text EXACTLY (letter case and lettering style may differ). If expected is none, there must be zero text.
2. text_once: the expected text appears exactly ONCE - not repeated, echoed, mirrored or duplicated anywhere in the design.
3. extra_text: true if there are ANY additional words, taglines, watermarks, signatures, logos or numbers beyond the expected text.
4. text_legible: every letter is fully formed with complete, unbroken strokes and clean edges; the text is instantly readable; lettering is not eroded or over-distressed, and the baseline is not accidentally wavy or warped.
5. no_halos: there are NO white shades, glows, halos, light outlines or fringes around the text or graphic edges - edges meet the background in clean solid color.
6. background_ok: the background is ONE solid, flat, even neutral grey - not white, not a color, no gradient, no texture, no scene.
7. no_shadows: there are no drop shadows, cast shadows or ambient shadows anywhere.
8. flat_artwork: it is flat printed artwork, NOT a t-shirt/garment/product mockup or photograph of an object.
9. edges_clean: all graphic outlines are continuous and unbroken (no fragmented, jagged or crumbling edges) and there are NO stray dots, specks, noise or floating marks.

Return ONLY this JSON object - no markdown fences, no commentary:
{"text_found":"<all text you can read in the image>","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["<short imperative correction for each failed check>"],"pass":true}
pass must be true ONLY if every single check is satisfied.
```

**No expected text** (only the EXPECTED line differs):

```text
EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)
```

**Verdict handling (`Parse QC`)** — fail-open: unparseable/missing verdict → `decision=pass, qc_status=unverified`. `qc_score = round(ok/9*100)` where `ok` counts `text_matches===true`, `text_once!==false`, `extra_text===false`, `text_legible!==false`, `no_halos!==false`, `background_ok===true`, `no_shadows===true`, `flat_artwork===true`, `edges_clean!==false`. `attempt` is 2 iff `Build Corrective Gen Request` already executed. `pass===true` → `pass` (`pass_after_retry` on attempt 2); fail on attempt 1 → `retry` (`retrying`); fail on attempt 2 → `fail` with `qc_fail_reason = 'QC failed: ' + issues.join('; ')`. `qc_issues` is stored as `issues.join(' | ')`.

### 3.9 Corrective-regeneration prompt — node `Build Corrective Gen Request`

Appends to the **original** Kie `input.prompt` (same model/aspect/inputs as the first attempt) and re-enters `Kie Create Task`. Rendered with example values `FAMILY FIRST` and two issues:

```text
{{ORIGINAL_MASTER_PROMPT}}

CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: {{ISSUE_1}}; {{ISSUE_2}}. The ONLY text in the image must read exactly: "FAMILY FIRST" - spelled letter for letter (F A M I L Y   F I R S T) - with no other words, watermarks or signatures anywhere.
```

No issues parsed and no expected text (fallback wording):

```text
{{ORIGINAL_MASTER_PROMPT}}

CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: render the text perfectly, keep the background one flat solid grey, remove all shadows. The image must contain NO text at all - no words, letters, watermarks or signatures.
```

Template pieces (verbatim from code): `'\n\nCRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: '` + `issues.join('; ')` (fallback `'render the text perfectly, keep the background one flat solid grey, remove all shadows'`) + either `'. The ONLY text in the image must read exactly: "' + expected + '" - spelled letter for letter (' + expected.split('').join(' ') + ') - with no other words, watermarks or signatures anywhere.'` or `'. The image must contain NO text at all - no words, letters, watermarks or signatures.'`.

### 3.10 Lessons distill prompt (every 12 h) — node `Build Distill Request` → `Kie Claude Distill` (Kie `/claude/v1/messages`, `claude-sonnet-4-6`, `max_tokens 1200`)

**System:**

```text
You maintain a small rulebook of design lessons for an AI print-on-demand design engine, learned from client rejection feedback. Cluster the feedback notes into general, reusable lessons. Each lesson: ONE sentence, soft client-preference phrasing (e.g. "The client prefers..." or "Avoid..."), actionable for an image-prompt writer, generalized (never mention a specific quote or one-off detail). scope is "global" unless the note is clearly specific to one niche. If a note matches an EXISTING lesson's meaning, do NOT duplicate it - instead report it in updates with that lesson id and its new absolute freq (existing freq + number of matching notes). Propose at most 5 new lessons per run. Return ONLY this JSON, no markdown: {"updates":[{"id":"<existing lesson id>","freq":3}],"new_lessons":[{"scope":"global","niche":null,"text":"..."}]}
```

**User** (one `- id:<id> [<scope>[:<niche>]] (freq <n>) <text>` line per existing lesson, `(none yet)` if empty; one `- [<niche or general>] <feedback sliced to 200 chars>` line per unprocessed feedback row):

```text
EXISTING RULEBOOK:
- id:{{LESSON_ID}} [global] (freq 2) {{EXISTING_LESSON_TEXT}}

NEW REJECTION FEEDBACK:
- [{{NICHE}}] {{REJECTION_FEEDBACK}}
```

**Body shape** (Anthropic Messages API):

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1200,
  "system": "<SYSTEM>",
  "messages": [
    {
      "role": "user",
      "content": "<USER>"
    }
  ]
}
```

`Parse Distill`: lenient JSON extraction from `content[].text`; `updates` capped at 20 (`freq = max(1, int)`), `new_lessons` capped at 5 → rows `{ scope: (niche && scope!=='global') ? 'niche' : 'global', niche, text (≤220 chars), freq: 1, status: 'proposed' }`. Feedback rows are marked `learn_processed=true` only when the JSON parsed (`distillOk`).

### 3.11 Rulebook / architecture notes (sticky notes, verbatim)

**Sticky `SETUP GUIDE`**

```markdown
## 🖼️ DM T-Shirt Engine v2 — QC + Similarity

**Trigger:** `/gen <N> <Niche> [similarity 10-100]` → e.g. `/gen 20 Family 70`. Similarity precedence: sheet `Similarity` column → command value → default **85**.

**Similarity tiers (prompt policy):** 90–100 near-exact · 75–89 faithful (classic behavior) · 55–74 inspired remix · 10–54 loose inspiration. Below **60** the generator switches image-to-image → **text-to-image** so low similarity can genuinely diverge.

**QC gate (after every generation):** Gemini 3.1 Pro checks exact quote spelling, no extra text/watermarks, single flat grey background, no shadows, not a mockup, clean glyphs. 1st fail → one corrective regen with the fixes appended; 2nd fail → `Failed` with reason. QC breakage never blocks production: passes as `unverified` (fail-open).

**Models:** analyzer + QC `gemini-3.1-pro` · prompt `claude-sonnet-4-6` · image `gpt-image-2` (i2i / t2i).

**Credentials to attach on this copy:** Kie Bearer → Analyze Image Node, Kie Claude, Kie Create Task, Kie Poll, **QC Check** · Sheets → Read Niche Tab, Mark Generated, Mark Failed · Drive → Upload To Drive, Find Niche Folder, Create Niche Folder · Slack → Notify Start / Invalid.

**Supabase:** insert `queued` → `analyzing` → `generating` → `done` / `failed`, plus `similarity`, `qc_status`, `qc_issues`, prompt + image url (project izjziiseuaewrhetbnkb).

**Notes:** batch size 1 required (`.first()` refs) · poll 8s, 4-min/task ceiling · worker path = this copy's own `/webhook/1697db60-…` (fixed — no longer cross-wired to main).
```

**Sticky `Sec 1 · Command Intake`**

```markdown
## 🟠 1 · COMMAND INTAKE
Slack `/gen <N> <Niche> [similarity 10-100]` lands here → parsed & validated → start / usage message back to the channel.
```

**Sticky `Sec 2 · Drive Folder`**

```markdown
## 🟡 2 · DRIVE FOLDER
Finds (or creates) the niche folder in Drive and stashes its id for the final upload.
```

**Sticky `Sec 3 · Rows & Fan-out`**

```markdown
## 🟣 3 · ROWS & FAN-OUT
Reads the niche tab, picks eligible rows (blank / Not Generated / Failed <3), applies similarity precedence (row `Similarity` column → command → 85), mints batch + generation ids, inserts `queued` rows into Supabase, then fires one worker per row.
```

**Sticky `Sec 4 · Worker Intake`**

```markdown
## ⚪ 4 · WORKER INTAKE
Each design runs as its own execution: unpack the payload (row, niche, similarity, ids).
```

**Sticky `Sec 5 · Analyze`**

```markdown
## 🔵 5 · ANALYZE REFERENCE
Supabase → `analyzing`. Gemini 3.1 Pro describes the flat design artwork in full + transcribes the typography exactly.
```

**Sticky `Sec 6 · Prompt Engine`**

```markdown
## 🟤 6 · PROMPT ENGINE
Claude writes ONE master prompt following the similarity policy: **90+** near-exact · **75–89** faithful (classic) · **55–74** inspired remix · **<55** loose inspiration. Exact quote spelled twice, grey-ramp background, no shadows, halftone shading, print-sharp edges.
```

**Sticky `Sec 7 · Generate`**

```markdown
## 🟠 7 · GENERATE
GPT-Image-2 on Kie: **image-to-image** when similarity ≥ 60 (reference as anchor, aspect auto) · **text-to-image** below 60 (3:4) so low similarity can truly diverge. Supabase → `generating`, then the 8s poll loop (4-min ceiling).
```

**Sticky `Sec 8 · Quality Control`**

```markdown
## 🟣 8 · QUALITY CONTROL (9-point)
Gemini 3.1 Pro inspects the finished image against the client's known rejection causes: exact quote spelling · quote appears once · no extra text/watermark · letters legible & unbroken (not over-distressed, not wavy) · no white halos/fringes · one flat grey background · no shadows · not a mockup · clean continuous edges, no stray dots. **Fail #1** → ONE corrective regeneration with the fixes appended. **Fail #2** → failed with reason. QC outage → fail-open as `unverified`. qc_score = checks passed / 9.
```

**Sticky `Sec 9 · Deliver & Record`**

```markdown
## 🟡 9 · DELIVER & RECORD
Download the QC-passed image → upload to the niche Drive folder → Supabase `done` (+ qc status, similarity, prompt, image url) → Sheet row `Generated`.
```

**Sticky `Sec 10 · Fail Lane`**

```markdown
## 🔴 FAIL LANE
Any error routes here: Sheet → `Failed (n)` (3 strikes, then skipped) and Supabase → `failed` with the real reason (Kie failMsg or the QC verdict).
```

**Sticky `Sec 11 · Finisher`**

```markdown
## 🟤 11 · FINISHER (drag to ✨ → print-ready)
**ModelsLab** upscale ×4 (`realesr-general-x4v3`, rate-limit auto-resubmit) → **Ideogram** background removal (`/v1/remove-background`, ~$0.01, typography-grade edges) → **300 DPI stamp** (pHYs chunk written into the PNG) → permanent copy to **Supabase Storage** (`finals` bucket = the card's final_url) → Supabase `finished` + costs (`cost_upscale`, `cost_removebg`) → archive to the **Musketeer Print Ready** Drive folder (+ `drive_saved` receipt).
**Keys:** ModelsLab → 'Finisher Config' node · Ideogram → 'Ideogram Config' node.
Any error → `finish_failed` + reason (↻ retry on the card). Archive-only (☁ button) re-uploads existing finals — now re-stamped to 300 DPI — without re-processing or re-charging.
```

**Sticky `Sec 12 · Self-Learning`**

```markdown
## 🔵 12 · SELF-LEARNING (distill)
Every 12h: pulls NEW rejection/flag feedback (learn_processed=false) + the existing rulebook → Claude clusters it into general lessons (soft client-preference phrasing, global or per-niche) → new lessons land as **proposed** in `design_lessons`, repeats bump `freq`, feedback is marked processed. **Approve lessons in the frontend 🎓 Lessons drawer** → the top 10 approved (by freq) are injected live into every prompt by 'Build Claude Request'. The engine literally stops repeating approved mistakes.
```


---

## 4. Code nodes — `jsCode` verbatim

All Code nodes are `n8n-nodes-base.code` v2. `mode: runOnceForEachItem` is noted where set (otherwise "run once for all items"). Secrets inside code are already `<REDACTED>`.


### Intake / fan-out

#### `Parse Command` (mode: runOnceForAllItems; onError: stop)

```javascript
// Parse Slack slash command: "/gen 20 Family" or "/gen 20 Family 70" (optional similarity 10-100)
const body = $json.body || {};
const text = (body.text || '').trim();
const channel_id = body.channel_id || '';
const NICHES = ["Faith", "Family", "Humor", "Interests & Hobbies", "Jobs", "Outdoors", "Patriotic", "Sports", "Animals & Pets", "Events", "Holidays", "Hometown Pride", "Careers & Trades", "Vehicles", "Causes & Awareness"];
const parts = text.split(/\s+/).filter(Boolean);
const rawN = parseInt(parts[0], 10);
let rest = parts.slice(1);
let similarity = null;
if (rest.length > 1) {
  const last = String(rest[rest.length - 1]).replace('%', '');
  if (/^\d{1,3}$/.test(last)) {
    similarity = Math.max(10, Math.min(100, parseInt(last, 10)));
    rest = rest.slice(0, -1);
  }
}
const niche = rest.join(' ').trim();
let valid = true, error = '';
if (!Number.isInteger(rawN) || rawN < 1) {
  valid = false; error = 'Usage: /gen <number> <niche> [similarity 10-100].  Example: /gen 20 Family 70';
} else if (!NICHES.includes(niche)) {
  valid = false; error = 'Unknown niche "' + niche + '". Valid: ' + NICHES.join(', ');
}
const n = Math.min(rawN || 0, 50);
return [{ json: { n, niche, channel_id, valid, error, similarity } }];
```

#### `Set Folder ID` (mode: runOnceForAllItems; onError: stop)

```javascript
// Stash the resolved niche folder id for Upload To Drive (handles search hit or create)
const item = $input.first();
const j = (item && item.json) || {};
let id = '';
if (j.files && j.files.length) { id = j.files[0].id; }
else if (j.id) { id = j.id; }
const s = $getWorkflowStaticData('global');
s.nicheFolderId = String(id || '');
return [{ json: { nicheFolderId: s.nicheFolderId } }];
```

#### `Filter Not Generated` (mode: runOnceForAllItems; onError: stop)

```javascript
// Eligible rows: blank / Not Generated / Failed with < 3 attempts. Top-to-bottom, first N.
const rows = $input.all();
const niche = $('Parse Command').first().json.niche;
const N = $('Parse Command').first().json.n;
function eligible(st){
  const s = String(st || '').trim().toLowerCase();
  if (s === '' || s === 'not generated') return true;
  if (s.indexOf('fail') === 0) {
    const m = s.match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 0;
    return n < 3;
  }
  return false;
}
const filtered = rows.filter(r => eligible(r.json.Status)).slice(0, N);
const s = $getWorkflowStaticData('global');
s.batchCount = filtered.length; s.requested = N; s.niche = niche;
return filtered.map((r, i) => ({ json: r.json, pairedItem: { item: i } }));
```

#### `Build Worker Payloads` (mode: runOnceForAllItems; onError: stop)

```javascript
// Build worker payloads. Mint a batch_id (once) + a generation_id per row.
// Similarity precedence: row 'Similarity' column > batch (slash command) > 85 default.
const rows = $input.all();
const niche = $('Parse Command').first().json.niche;
const channel_id = $('Parse Command').first().json.channel_id;
const batchSim = $('Parse Command').first().json.similarity; // null or 10-100
const folderId = $('Set Folder ID').first().json.nicheFolderId || '1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7';
function uuid(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}
const batch_id = uuid();
const s = $getWorkflowStaticData('global');
s.dispatched = rows.length; s.niche = niche; s.requested = $('Parse Command').first().json.n; s.batch_id = batch_id;
return rows.map((r, i) => {
  const row = r.json;
  const rowSimRaw = parseInt(String(row['Similarity'] || '').replace('%', ''), 10);
  const rowSim = Number.isInteger(rowSimRaw) ? Math.max(10, Math.min(100, rowSimRaw)) : null;
  const similarity = (rowSim !== null ? rowSim : (batchSim !== null && batchSim !== undefined ? batchSim : 85));
  return { json: {
    generation_id: uuid(),
    batch_id,
    niche, folderId, channel_id,
    similarity,
    row_number: row.row_number,
    Image: row['Image'] || '',
    'Typography Image': row['Typography Image'] || '',
    'Typography Text': row['Typography Text'] || '',
    'Design Instruction': row['Design Instruction'] || '',
    Comment: row['Comment'] || '',
    Status: row['Status'] || ''
  }, pairedItem: { item: i } };
});
```


### Worker intake / analysis

#### `Parse Worker Input` (mode: runOnceForEachItem; onError: stop)

```javascript
const b = $json.body || {};
const fb = String(b.regen_feedback || '').trim();
const rm = String(b.regen_mode || '').trim().toLowerCase();
return { json: {
  generation_id: b.generation_id || '',
  batch_id: b.batch_id || '',
  niche: b.niche || '',
  folderId: b.folderId || '',
  channel_id: b.channel_id || '',
  similarity: Number(b.similarity) || 85,
  regen_feedback: fb,
  regen_mode: fb ? (rm === 'reference' ? 'reference' : 'tweak') : '',
  row_number: b.row_number,
  Image: b['Image'] || '',
  'Typography Image': b['Typography Image'] || '',
  'Typography Text': b['Typography Text'] || '',
  'Design Instruction': b['Design Instruction'] || '',
  Comment: b['Comment'] || '',
  Status: b['Status'] || ''
}};
```

#### `Build Analyze Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// Gemini vision: describe the reference fully (for 80-90% re-creation) + transcribe typography text
const row = $('Parse Worker Input').first().json;
const niche = $('Parse Worker Input').first().json.niche;
const hasTypoImg = !!(row['Typography Image'] && String(row['Typography Image']).trim());
let ask = 'You are a precise visual analyst for a "' + niche + '" print-on-demand design.\n\n';
ask += 'IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.\n\n';
ask += 'IMAGE 1 is the DESIGN TO RE-CREATE (the output must copy it ~80-90%). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.\n';
if (hasTypoImg) {
  ask += '\nIMAGE 2 is the TYPOGRAPHY / TEXT REFERENCE. Transcribe its text EXACTLY, word for word, preserving line breaks and casing. Note its font style.\n';
}
ask += '\nReturn EXACTLY this structure and nothing else:\nSTYLE:\n<full description for re-creation>\n\nTYPOGRAPHY_TEXT:\n<exact transcribed text from IMAGE 2, or NONE>\n\nTYPOGRAPHY_STYLE:\n<font description, or NONE>';
const content = [{ type: 'text', text: ask }];
if (row['Image']) content.push({ type: 'image_url', image_url: { url: row['Image'] } });
if (hasTypoImg) content.push({ type: 'image_url', image_url: { url: row['Typography Image'] } });
const body = { messages: [{ role: 'user', content }] };
return { json: { body } };
```


### Prompt engine

#### `Build Intelligence Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// Assemble input for the prompt engine. Two regeneration modes:
//  tweak     -> targeted edit of the previous output (change ONLY what was asked)
//  reference -> re-create from the ORIGINAL reference at the USER-CHOSEN similarity
const analysis = (($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '').trim();
const row = $('Parse Worker Input').first().json;
const niche = row.niche;
const sim = Number(row.similarity) || 85;
const regen = String(row.regen_feedback || '').trim();
const mode = row.regen_mode || '';
const effSim = sim;
const quote = String(row['Typography Text'] || '').trim();
const quoteLine = quote
  ? ('QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): ' + quote)
  : 'QUOTE / ON-DESIGN TEXT: (none in the sheet) - use the exact words under TYPOGRAPHY_TEXT in the analysis; if that is NONE, render no text at all.';
let regenBlock = '';
if (regen && mode === 'tweak') {
  regenBlock = 'REGENERATION - TARGETED EDIT: the client reviewed the attached previous version of this design and requested ONLY the following changes. Apply them precisely; everything NOT mentioned must stay EXACTLY as it is in the previous version - same composition, elements, colors, lettering and placement:\n"' + regen + '"\n';
} else if (regen && mode === 'reference') {
  regenBlock = 'REGENERATION - MATCH THE REFERENCE BETTER: the client compared the previous attempt against the ORIGINAL REFERENCE (described below and attached) and found it missed or misrepresented elements of that reference. Re-create it at the target similarity, and make absolutely sure to capture the following:\n"' + regen + '"\n';
}
const descLabel = (regen && mode === 'tweak')
  ? 'PREVIOUS VERSION DESCRIPTION (this is the image being edited - use it to name elements precisely; keep everything not mentioned in the edit request identical):'
  : 'REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):';
const agentInput = 'NICHE: ' + niche + '\n' +
  'TARGET SIMILARITY TO REFERENCE: ' + effSim + '% (follow the similarity policy in your instructions)\n' +
  quoteLine + '\n' +
  'DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): ' + (row['Design Instruction'] || '(none)') + '\n' +
  regenBlock +
  'NOTES: ' + (row['Comment'] || '(none)') + '\n\n' +
  descLabel + '\n' + analysis;
return { json: { agentInput } };
```

#### `Build Claude Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// Build Anthropic Messages body for Kie Claude (POD re-creation engine)
// similarity-aware + known-defect guardrails + learned lessons.
// Regen modes: 'tweak' -> SHORT imperative edit instruction for the nano-banana edit model;
//              'reference' -> full re-creation from the original reference at the user-chosen similarity (image always attached).
// MODEL: gpt-5-6-terra via Kie /codex/v1/responses. stream:false requested (endpoint may still reply as SSE; Parse Claude handles both). instructions overrides Kie's injected Codex coding persona; system is also sent as an input[] system message.
const agentInput = $json.agentInput || '';
const SB_URL = 'https://izjziiseuaewrhetbnkb.supabase.co';
const SB_KEY = '<REDACTED>';
const wi = $('Parse Worker Input').first().json;
const sim = Number(wi.similarity) || 85;
const mode = wi.regen_mode || '';
const effSim = sim;
const hasImg = !!(String(wi.Image || '').trim());
const regen = String(wi.regen_feedback || '').trim();
const isEdit = !!(regen && mode === 'tweak' && hasImg);
const i2i = isEdit || (mode === 'reference' && hasImg) || ((effSim >= 60) && hasImg);
let tier;
if (isEdit) {
  tier = 'TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or "improve" anything that was not explicitly asked to change.';
} else if (effSim >= 90) {
  tier = 'NEAR-EXACT RE-CREATION (' + effSim + '%): reproduce the reference\'s composition, layout, structure, hero subject and exactly how it is drawn, every supporting element and its placement, the color palette, art technique, texture and overall vibe as close to identical as possible. The ONLY intentional change is the on-design text.';
} else if (effSim >= 75) {
  tier = 'FAITHFUL RE-CREATION (~' + effSim + '%): reproduce the reference\'s overall composition, layout, structure, hero subject and how it is drawn, color palette, art technique/medium, texture, and overall vibe closely - the result must clearly read as the same design. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.';
} else if (effSim >= 55) {
  tier = 'INSPIRED REMIX (~' + effSim + '%): keep the reference\'s hero concept, art technique, color palette family and overall vibe, but you MAY re-compose the layout, redraw the hero in the same style, and swap or simplify supporting elements. It should feel like a sibling design from the same collection - clearly related, not a copy.';
} else {
  tier = 'LOOSE INSPIRATION (~' + effSim + '%): use the reference ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic, leaning more on the NICHE for subject matter. It should feel like the same artist made a different design for the same audience.';
}
const refLine = isEdit
  ? 'for a downstream image EDITING model that receives the PREVIOUS VERSION of this design directly and edits it in place.'
  : (i2i
    ? 'for a downstream image model that ALSO receives the STYLE REFERENCE image directly.'
    : 'for a downstream image model that will NOT receive the reference image - your prompt alone must fully describe the design, so be complete and concrete.');
let lessonsBlock = '';
try {
  const niche = String(wi.niche || '');
  const url = SB_URL + '/rest/v1/design_lessons?status=eq.approved&or=(scope.eq.global,niche.eq.' + encodeURIComponent(niche) + ')&order=freq.desc&limit=10&select=text';
  const res = await this.helpers.httpRequest({ method: 'GET', url, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, json: true, timeout: 10000 });
  const arr = Array.isArray(res) ? res : [];
  const lines = arr.map(l => '- ' + String((l && l.text) || '').trim()).filter(s => s.length > 2);
  if (lines.length) lessonsBlock = '\n\nLEARNED CLIENT PREFERENCES (distilled from this client\'s past rejections - treat every one as a hard requirement):\n' + lines.join('\n');
} catch (e) { lessonsBlock = ''; }
const defects = 'KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):\n' +
'- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.\n' +
'- OVERALL DISTRESS: overall distress/texture is never heavier than the reference; when in doubt, use less.\n' +
'- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.\n' +
'- STRAIGHT BASELINES: if the reference text is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the reference clearly does.\n' +
'- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.\n' +
'- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.\n' +
'- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the reference itself uses halftone, applied as an even, deliberate pattern.\n' +
'- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.\n' +
'- STYLE MATURITY: match the reference\'s rendering maturity - never drift more cartoonish or childish than the reference.\n';
const primaryHeader = isEdit ? 'PRIMARY RULE - TARGETED EDIT:' : 'PRIMARY RULE - SIMILARITY POLICY:';
const outputLine = isEdit
  ? 'Output: ONE short imperative edit instruction (1 to 3 sentences maximum) for an image editing model. State ONLY the requested changes, precisely and concretely - name the exact element, the exact change, exact colors where relevant. If the change involves text, spell the new text exactly once, letter by letter. End with exactly this sentence: "Keep everything else exactly the same, including all lettering, layout, colors, textures, and the flat grey background, with no shadows." Nothing else - no preamble, no description of the rest of the design.'
  : ('Output: ONE image-generation prompt as a single dense paragraph that follows the similarity policy at ~' + effSim + '% to the reference, carries the exact quote text exactly once, avoids every known defect above, on a solid flat neutral-grey background with no shadows. Then on a NEW final line output exactly: ASPECT: <ratio> - the tightest canvas that comfortably contains the design you just described, chosen ONLY from 1:1, 3:4, 4:3, 9:16, 16:9. Most tall stacked tee designs fit 3:4; only a genuinely very tall narrow stack fits 9:16; wide layouts fit 4:3; only a true wide banner strip fits 16:9; near-square art is 1:1. Pick the ratio that leaves the least empty grey around the design. Format strictly: that line contains ONLY the word ASPECT, a colon, one space, and the ratio - no punctuation, no asterisks, no extra words. Nothing else after that line.');
const system = 'You are a POD design prompt engine. You output ' + (isEdit ? 'ONE short edit instruction ' : 'ONE final image-generation prompt (a single dense paragraph) ') + refLine + ' Output ONLY the instruction - no preamble, no markdown, no quotes.\n\n' +
primaryHeader + '\n' +
'- ' + tier + '\n' +
(isEdit ? '' : '- The reference may be a rough draft, a shirt mockup, angled, folded, or a screenshot - work from the flat design artwork only, straightened and cleaned up.\n') + '\n' +
'TEXT - EXACT, NOTHING ELSE:\n' +
'- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.\n' +
(isEdit ? '- Keep the lettering style, size and placement exactly as in the previous version unless the requested change is specifically about the text.\n' : '- State the quote once in quotation marks and once spelled out letter by letter so the image model cannot misspell it.\n- Match the lettering style and weight to the reference\'s typography (adapt placement if the similarity policy allows re-composition).\n') +
'- If no quote is provided, render no text at all.\n\n' +
'BACKGROUND (keep it effortless - never let it affect the design):\n' +
'- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.\n' +
'- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.\n' +
'- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.\n\n' +
'DESIGN INSTRUCTION: if one is provided, apply it on top (it never overrides the exact-text, background, or no-shadow rules).\n\n' +
defects + '\n' +
'RENDER QUALITY: crisp vector-sharp edges, clean linework, flat solid inks, high contrast, print-ready. No watermark, no signature, no border or frame, no extra icons.' + lessonsBlock + '\n\n' +
outputLine;
const body = { model: 'gpt-5-6-terra', max_output_tokens: 4096, reasoning: { effort: 'medium' }, stream: false, instructions: system, input: [ { role: 'system', content: [{ type: 'input_text', text: system }] }, { role: 'user', content: [{ type: 'input_text', text: agentInput }] } ] };
return { json: { body } };
```

#### `Parse Claude` (mode: runOnceForEachItem; onError: continueErrorOutput)

```javascript
// Kie /codex/v1/responses can reply as an SSE stream (event:/data: lines) or as plain JSON.
// Extract final text from: SSE response.completed / output_text events, plain Responses output[],
// Anthropic content[] (Claude fallback), or chat choices[].
function textFromResponsesObj(resp) {
  if (!resp || typeof resp !== 'object') return '';
  var out = '';
  if (Array.isArray(resp.output)) {
    out = resp.output
      .filter(function(it) { return it && it.type === 'message' && Array.isArray(it.content); })
      .map(function(it) {
        return it.content
          .filter(function(c) { return c && (c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string'; })
          .map(function(c) { return c.text; })
          .join('');
      })
      .join('')
      .trim();
  }
  if (!out && typeof resp.output_text === 'string') out = resp.output_text.trim();
  return out;
}

let text = '';
try {
  const raw = $json;
  const payload = (raw.data !== undefined) ? raw.data : raw;

  if (typeof payload === 'string' && payload.indexOf('data:') !== -1 && payload.indexOf('event:') !== -1) {
    // SSE stream
    var events = [];
    payload.split(/\r?\n/).forEach(function(line) {
      line = line.trim();
      if (line.indexOf('data:') === 0) {
        var body = line.slice(5).trim();
        if (body && body !== '[DONE]') {
          try { events.push(JSON.parse(body)); } catch (e1) {}
        }
      }
    });
    for (var i = events.length - 1; i >= 0 && !text; i--) {
      var ev = events[i];
      if (ev && ev.type === 'response.completed' && ev.response) text = textFromResponsesObj(ev.response);
    }
    if (!text) {
      text = events
        .filter(function(ev) { return ev && ev.type === 'response.output_text.done' && typeof ev.text === 'string'; })
        .map(function(ev) { return ev.text; })
        .join('')
        .trim();
    }
    if (!text) {
      text = events
        .filter(function(ev) { return ev && ev.type === 'response.output_text.delta' && typeof ev.delta === 'string'; })
        .map(function(ev) { return ev.delta; })
        .join('')
        .trim();
    }
    if (!text) {
      for (var k = events.length - 1; k >= 0 && !text; k--) {
        if (events[k] && events[k].response) text = textFromResponsesObj(events[k].response);
      }
    }
  } else {
    let inner = (typeof payload === 'string') ? JSON.parse(payload) : (payload || raw);
    if (inner && typeof inner.data === 'string') { try { inner = JSON.parse(inner.data); } catch (e2) {} }
    else if (inner && inner.data && typeof inner.data === 'object') { inner = inner.data; }

    text = textFromResponsesObj(inner);
    if (!text && inner && Array.isArray(inner.content)) {
      text = inner.content
        .filter(function(b) { return b && b.type === 'text'; })
        .map(function(b) { return b.text; })
        .join('')
        .trim();
    }
    if (!text && inner && typeof inner.content === 'string') {
      text = inner.content.trim();
    }
    if (!text && inner && Array.isArray(inner.choices) && inner.choices[0] && inner.choices[0].message) {
      const mc = inner.choices[0].message.content;
      text = (Array.isArray(mc)
        ? mc.filter(function(c) { return c && typeof c.text === 'string'; }).map(function(c) { return c.text; }).join('')
        : String(mc || '')).trim();
    }
  }
} catch (e) {
  throw new Error('Parse Claude failed: ' + e.message + ' | raw: ' + JSON.stringify($json).slice(0, 300));
}
if (!text) {
  throw new Error('No text extracted. raw: ' + JSON.stringify($json).slice(0, 400));
}

// Pull the ASPECT ratio marker (added by the prompt engine). Tolerant of punctuation, markdown,
// wording variants (ASPECT RATIO, =, x, /) and placement; validate against Kie's enum; strip it.
let aspect = '1:1';
const ALLOWED_AR = ['1:1','3:2','2:3','4:3','3:4','16:9','9:16','2:1','1:2','3:1','1:3','21:9','9:21','5:4','4:5'];
const arRe = /ASPECT(?:\s*RATIO)?\s*[:=]\s*([0-9]{1,2})\s*[:xX\/]\s*([0-9]{1,2})/gi;
let last = null, mm;
while ((mm = arRe.exec(text)) !== null) last = { index: mm.index, len: mm[0].length, a: mm[1], b: mm[2] };
if (last) {
  const cand = last.a + ':' + last.b;
  if (ALLOWED_AR.indexOf(cand) !== -1) aspect = cand;
  const lineStart = text.lastIndexOf('\n', last.index);
  let lineEnd = text.indexOf('\n', last.index);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart + 1, lineEnd);
  if (line.trim().length <= 40) {
    text = (text.slice(0, Math.max(lineStart, 0)) + text.slice(lineEnd)).trim();
  } else {
    text = (text.slice(0, last.index) + text.slice(last.index + last.len)).trim();
  }
}
return { json: { output: text, aspect_ratio: aspect } };
```


### Generation

#### `Build Kie Gen Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// Build Kie createTask body.
// tweak regen  -> google/nano-banana-edit (surgical single-change edits; canvas inherits the source image)
// reference regen -> gpt-image-2.5 Sunburst i2i on the ORIGINAL reference at the user-chosen similarity (image always attached)
// normal runs  -> gpt-image-2.5 Sunburst (i2i when sim >= 60 and a reference image exists); resolution 1K feeds the x4 upscaler as before
// ASPECT CONSTANCY: once a card has generated successfully its aspect_ratio is stored on the
// generations row and is ALWAYS reused on every later run of that card, so the canvas can never
// flip between runs. First run (or legacy rows with no stored value): the prompt engine's
// validated pick is used, fallback 1:1.
const masterPrompt = ($json.output || '').toString().trim();
// KIE CLAMP (2026-08-28): Kie narrowed the gpt-image-2 aspect_ratio options. Anything outside the
// allowed set (including legacy stored ratios like 4:5 or 2:3) is snapped to the nearest allowed canvas.
const KIE_ALLOWED = ['1:1','3:4','4:3','9:16','16:9'];
function ratioVal(s){ const m = /^(\d+):(\d+)$/.exec(String(s || '').trim()); if (!m) return 0; const a = Number(m[1]), b = Number(m[2]); if (!a || !b) return 0; return a / b; }
function snapAspect(s){ const r = ratioVal(s); if (!r) return ''; let best = '', bd = Infinity; for (const c of KIE_ALLOWED) { const d = Math.abs(Math.log(r / ratioVal(c))); if (d < bd) { bd = d; best = c; } } return best; }
const terraAspect = snapAspect($json.aspect_ratio);
const row = $('Parse Worker Input').first().json;
const SB_URL = 'https://izjziiseuaewrhetbnkb.supabase.co';
const SB_KEY = '<REDACTED>';
let storedAspect = '';
try {
  if (row.generation_id) {
    const res = await this.helpers.httpRequest({ method: 'GET', url: SB_URL + '/rest/v1/generations?id=eq.' + encodeURIComponent(row.generation_id) + '&select=aspect_ratio', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, json: true, timeout: 10000 });
    const v = (Array.isArray(res) && res[0]) ? String(res[0].aspect_ratio || '') : '';
    if (ratioVal(v)) storedAspect = v;
  }
} catch (e) { storedAspect = ''; }
const aspect = snapAspect(storedAspect) || terraAspect || '1:1';
const niche = row.niche;
const sim = Number(row.similarity) || 85;
const mode = row.regen_mode || '';
const effSim = sim;
const hasImg = !!(String(row['Image'] || '').trim());
const isEdit = !!(String(row.regen_feedback || '').trim() && mode === 'tweak' && hasImg);
const useI2I = isEdit || (mode === 'reference' && hasImg) || ((effSim >= 60) && hasImg);
const fileName = niche.replace(/[^A-Za-z0-9]+/g, '-') + '_' + (row.row_number || 'x') + '_' + Date.now() + '.png';
let body;
if (isEdit) {
  body = { model: 'google/nano-banana-edit', input: { prompt: masterPrompt, image_urls: [row['Image']], output_format: 'png' } };
} else {
  const input = { prompt: masterPrompt, aspect_ratio: aspect, resolution: '1K', background: 'opaque' };
  if (useI2I) input.input_urls = [row['Image']];
  body = { model: useI2I ? 'gpt-image-2-5-sunburst-image-to-image' : 'gpt-image-2-5-sunburst-text-to-image', input };
}
const aspect_used = isEdit ? (snapAspect(storedAspect) || undefined) : aspect;
return { json: { body, fileName, aspect_used } };
```

#### `Eval Cancel` (mode: runOnceForEachItem; onError: stop)

```javascript
// Cancelled if the Supabase row was deleted (or archived). FAIL-OPEN: a Supabase
// glitch must never block generation, so errors count as not-cancelled.
// Also forwards the generation request so Kie Create Task receives body/fileName intact.
const j = $json;
let cancelled = false;
try {
  if (j && j.error) cancelled = false;
  else if (j && j.id) cancelled = (j.archived === true);
  else cancelled = true; // empty item -> row deleted from the board
} catch (e) { cancelled = false; }
let body = null, fileName = '';
try { const g = $('Build Kie Gen Request').first().json; body = g.body; fileName = g.fileName; } catch (e) {}
return { json: { cancelled, body, fileName } };
```

#### `Eval Poll` (mode: runOnceForEachItem; onError: stop)

```javascript
// Decide poll outcome. Uses the task's own createTime for the timeout ceiling
// (static data does NOT survive the Wait node, so we can't count tries that way).
const j = $json || {};
const data = j.data;
const state = (data && data.state) || '';
const created = (data && data.createTime) ? Number(data.createTime) : 0;
const ageMs = created ? (Date.now() - created) : 0;
const TIMEOUT_MS = 4 * 60 * 1000; // 4 min hard ceiling per task
let decision;
if (j.code === 200 && state === 'success') decision = 'success';
else if (j.code !== 200 || !data || state === 'fail') decision = 'fail';
else if (created && ageMs > TIMEOUT_MS) decision = 'fail';
else decision = 'wait';
const failMsg = decision === 'fail' ? ((data && data.failMsg) || j.msg || ('poll ended state=' + state)) : '';
return { json: Object.assign({}, j, { _decision: decision, _failMsg: failMsg }) };
```

#### `Parse Result` (mode: runOnceForEachItem; onError: continueErrorOutput)

```javascript
// Extract the generated image URL from the Kie poll result
let urls = [];
try { urls = JSON.parse(($json.data && $json.data.resultJson) || '{}').resultUrls || []; } catch (e) {}
if (!urls.length) { throw new Error('Kie returned no result URL'); }
const fileName = $('Build Kie Gen Request').first().json.fileName;
return { json: { imageUrl: urls[0], fileName } };
```


### QC + corrective

#### `Build QC Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// Build the QC inspection request: generated image + strict 9-point checklist -> JSON verdict
const gen = $json; // { imageUrl, fileName }
const row = $('Parse Worker Input').first().json;
const sheetQuote = String(row['Typography Text'] || '').trim();
let expected = sheetQuote;
if (!expected) {
  try {
    const a = ($('Analyze Image Node').first().json.choices[0].message.content) || '';
    const m = a.match(/TYPOGRAPHY_TEXT:\s*([\s\S]*?)(?:\n\s*\nTYPOGRAPHY_STYLE:|\nTYPOGRAPHY_STYLE:|$)/);
    let t = m ? m[1].trim() : '';
    if (/^none$/i.test(t)) t = '';
    expected = t;
  } catch (e) { expected = ''; }
}
const checklist = 'You are a strict print-on-demand quality inspector. Inspect the attached generated design image.\n\n' +
  'EXPECTED ON-DESIGN TEXT: ' + (expected ? '"""' + expected + '"""' : '(none - the image must contain NO text at all)') + '\n\n' +
  'Perform these checks:\n' +
  '1. text_matches: read ALL text in the image. Spelling, wording and word order must equal the expected text EXACTLY (letter case and lettering style may differ). If expected is none, there must be zero text.\n' +
  '2. text_once: the expected text appears exactly ONCE - not repeated, echoed, mirrored or duplicated anywhere in the design.\n' +
  '3. extra_text: true if there are ANY additional words, taglines, watermarks, signatures, logos or numbers beyond the expected text.\n' +
  '4. text_legible: every letter is fully formed with complete, unbroken strokes and clean edges; the text is instantly readable; lettering is not eroded or over-distressed, and the baseline is not accidentally wavy or warped.\n' +
  '5. no_halos: there are NO white shades, glows, halos, light outlines or fringes around the text or graphic edges - edges meet the background in clean solid color.\n' +
  '6. background_ok: the background is ONE solid, flat, even neutral grey - not white, not a color, no gradient, no texture, no scene.\n' +
  '7. no_shadows: there are no drop shadows, cast shadows or ambient shadows anywhere.\n' +
  '8. flat_artwork: it is flat printed artwork, NOT a t-shirt/garment/product mockup or photograph of an object.\n' +
  '9. edges_clean: all graphic outlines are continuous and unbroken (no fragmented, jagged or crumbling edges) and there are NO stray dots, specks, noise or floating marks.\n\n' +
  'Return ONLY this JSON object - no markdown fences, no commentary:\n' +
  '{"text_found":"<all text you can read in the image>","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["<short imperative correction for each failed check>"],"pass":true}\n' +
  'pass must be true ONLY if every single check is satisfied.';
const body = { messages: [{ role: 'user', content: [ { type: 'text', text: checklist }, { type: 'image_url', image_url: { url: gen.imageUrl } } ] }] };
return { json: { body, imageUrl: gen.imageUrl, fileName: gen.fileName, expected } };
```

#### `Parse QC` (mode: runOnceForEachItem; onError: stop)

````javascript
// Parse the QC verdict. FAIL-OPEN: if QC itself breaks, the design passes as 'unverified'
// so a QC outage can never block production. qc_score = 0-100 across the 9 checks.
let verdict = null;
try {
  const content = ($json.choices && $json.choices[0] && $json.choices[0].message && $json.choices[0].message.content) || '';
  const cleaned = String(content).replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  verdict = JSON.parse(m ? m[0] : cleaned);
} catch (e) { verdict = null; }
let attempt = 1;
try { $('Build Corrective Gen Request').first(); attempt = 2; } catch (e) { attempt = 1; }
let qc_score = null;
if (verdict && typeof verdict.pass !== 'undefined') {
  let ok = 0;
  ok += verdict.text_matches === true ? 1 : 0;
  ok += verdict.text_once !== false ? 1 : 0;
  ok += verdict.extra_text === false ? 1 : 0;
  ok += verdict.text_legible !== false ? 1 : 0;
  ok += verdict.no_halos !== false ? 1 : 0;
  ok += verdict.background_ok === true ? 1 : 0;
  ok += verdict.no_shadows === true ? 1 : 0;
  ok += verdict.flat_artwork === true ? 1 : 0;
  ok += verdict.edges_clean !== false ? 1 : 0;
  qc_score = Math.round((ok / 9) * 100);
}
let decision, qc_status, qc_fail_reason = '', issues = [];
if (!verdict || typeof verdict.pass === 'undefined') {
  decision = 'pass'; qc_status = 'unverified';
} else {
  issues = Array.isArray(verdict.issues) ? verdict.issues.filter(Boolean).map(String) : [];
  if (verdict.pass === true) {
    decision = 'pass'; qc_status = (attempt > 1) ? 'pass_after_retry' : 'pass';
  } else if (attempt === 1) {
    decision = 'retry'; qc_status = 'retrying';
  } else {
    decision = 'fail'; qc_status = 'fail';
    qc_fail_reason = 'QC failed: ' + (issues.join('; ') || 'quality checks failed');
  }
}
const prev = $('Build QC Request').first().json;
return { json: { decision, qc_status, qc_score, qc_issues: issues.join(' | '), qc_fail_reason, imageUrl: prev.imageUrl, fileName: prev.fileName, text_found: verdict ? (verdict.text_found || '') : '' } };
````

#### `Build Corrective Gen Request` (mode: runOnceForEachItem; onError: stop)

```javascript
// One corrective regeneration: original prompt + explicit fixes from QC
const orig = $('Build Kie Gen Request').first().json;
const issues = ($json.qc_issues || '').split(' | ').filter(Boolean);
const expected = ($('Build QC Request').first().json.expected || '').trim();
let add = '\n\nCRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: ';
add += issues.length ? issues.join('; ') : 'render the text perfectly, keep the background one flat solid grey, remove all shadows';
if (expected) {
  add += '. The ONLY text in the image must read exactly: "' + expected + '" - spelled letter for letter (' + expected.split('').join(' ') + ') - with no other words, watermarks or signatures anywhere.';
} else {
  add += '. The image must contain NO text at all - no words, letters, watermarks or signatures.';
}
const body = JSON.parse(JSON.stringify(orig.body));
body.input.prompt = (body.input.prompt || '') + add;
return { json: { body, fileName: orig.fileName } };
```


### Finisher

#### `Parse Finish Input` (mode: runOnceForEachItem; onError: stop)

```javascript
const b = $json.body || {};
const id = String(b.id || '').trim();
const image_url = String(b.image_url || '').trim();
const final_url = String(b.final_url || '').trim();
const archive_only = (b.archive_only === true || b.archive_only === 'true');
const folder_id = String(b.folder_id || '').trim() || '1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7';
const niche = String(b.niche || 'design').trim();
const quote = String(b.quote || '').trim();
const valid = !!(id && (/^https?:\/\//.test(image_url) || (archive_only && /^https?:\/\//.test(final_url))));
const safe = (quote || niche).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'design';
const fileName = safe + '_final_' + id.slice(0, 8) + '.png';
return { json: { id, image_url, final_url, archive_only, folder_id, niche, quote, fileName, valid } };
```

#### `Build Upscale Req` (mode: runOnceForEachItem; onError: stop)

```javascript
// Upscale request -> ModelsLab v6 super_resolution, RealESRGAN_x4plus_anime_6B, scale 4.
// The input is the PREP copy: every generation is fitted to max 1024px (Fit 1024 node)
// before upscaling, because ModelsLab caps output at 4096 per side and silently degrades
// scale for bigger inputs. 1024 in guarantees the full x4 = 4096 out, for ANY card.
const cfg = $('Finisher Config').first().json;
const prepKey = $('Store Prep').first().json.Key;
const initUrl = 'https://izjziiseuaewrhetbnkb.supabase.co/storage/v1/object/public/' + prepKey;
const body = { key: cfg.mlKey, init_image: initUrl, model_id: 'RealESRGAN_x4plus_anime_6B', scale: 4, face_enhance: 'false', webhook: null, track_id: null };
return { json: { body } };
```

#### `Eval Upscale` (mode: runOnceForEachItem; onError: stop)

```javascript
// Evaluate ModelsLab upscale. Poll URL remembered from the ORIGINAL submission.
// Rate-limited submissions are RESUBMITTED with backoff instead of failing.
const r = $json;
const key = $('Finisher Config').first().json.mlKey;
const runs = (typeof $runIndex === 'number') ? $runIndex : 0;
const BASE = 'https://modelslab.com/api/v6/image_editing/fetch/';
function fetchOf(x){ if (!x) return ''; if (x.fetch_result) return x.fetch_result; if (x.id !== undefined && x.id !== null && x.id !== '') return BASE + x.id; return ''; }
let orig = null; try { orig = $('ML Upscale').first().json; } catch (e) {}
let decision = 'fail', url = '', fetchUrl = '', error = '';
if (r && r.status === 'success') {
  const o = Array.isArray(r.output) ? r.output[0] : (typeof r.output === 'string' ? r.output : '');
  if (o) { decision = 'done'; url = o; }
  else { decision = 'fail'; error = 'upscale: success without output'; }
} else if (r && (r.status === 'processing' || r.status === 'queued')) {
  if (runs > 50) { decision = 'fail'; error = 'upscale timed out'; }
  else {
    decision = 'wait';
    fetchUrl = fetchOf(r) || fetchOf(orig);
    if (!fetchUrl) { decision = 'fail'; error = 'upscale: lost the job id'; }
  }
} else {
  const msg = String((r && (r.message || r.messege)) || 'ModelsLab error');
  if (/rate ?limit/i.test(msg) && runs <= 50) { decision = 'resubmit'; }
  else { error = 'upscale: ' + msg; }
}
return { json: { decision, url, fetchUrl, key, error } };
```

#### `Parse Ideogram` (mode: runOnceForEachItem; onError: stop)

```javascript
// Parse Ideogram remove-background response (synchronous: { created, data: [{ url, is_image_safe }] })
let ok = false, url = '', error = '';
try {
  const d = $json || {};
  const item = (d.data && d.data[0]) || null;
  if (item && item.url) {
    ok = true; url = String(item.url);
    if (item.is_image_safe === false) { ok = false; error = 'ideogram flagged the image'; }
  } else {
    const raw = (d && (d.error || d.message || d.detail)) || 'no output';
    error = 'ideogram: ' + (typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 220);
  }
} catch (e) { error = 'ideogram parse error'; }
return { json: { ok, url, error } };
```

#### `Pick PR Folder` (mode: runOnceForEachItem; onError: stop)

```javascript
// Print-ready archive folder is FIXED by the user:
// https://drive.google.com/drive/folders/1_g-VR5ZaV6Esw7UZHLrvMM5yudo_K9JK
// Every final (both the ✦ finish path and the ☁ archive path) saves here.
return { json: { prFolderId: '1_g-VR5ZaV6Esw7UZHLrvMM5yudo_K9JK', needCreate: false } };
```

#### `Set 300 DPI` (mode: runOnceForAllItems; onError: stop)

```javascript
// ONE JOB: write 300 DPI metadata (pHYs chunk) into the PNG and pass it through.
// Never throws. Never judges size. Fail-open on anything unexpected.
const item = $input.item || $input.all()[0];
const binKey = Object.keys(item.binary || {})[0] || 'data';
const buf = Buffer.from(await this.helpers.getBinaryDataBuffer(0, binKey));
const SIG = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
let out = buf, w = 0, h = 0;
try {
  if (buf.length > 33 && buf.subarray(0,8).equals(SIG)) {
    w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);
    const T = new Int32Array(256);
    for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); T[n]=c; }
    const crc32 = (b)=>{ let c=-1; for(let i=0;i<b.length;i++) c=T[(c^b[i])&0xFF]^(c>>>8); return (c^-1)>>>0; };
    const ppm = 11811; // 300 dpi in pixels per metre
    const data = Buffer.alloc(9); data.writeUInt32BE(ppm,0); data.writeUInt32BE(ppm,4); data[8]=1;
    const typeAndData = Buffer.concat([Buffer.from('pHYs'), data]);
    const chunk = Buffer.alloc(4 + typeAndData.length + 4);
    chunk.writeUInt32BE(9,0); typeAndData.copy(chunk,4); chunk.writeUInt32BE(crc32(typeAndData), 4 + typeAndData.length);
    const parts = [buf.subarray(0,33), chunk];
    let pos = 33;
    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString('ascii', pos+4, pos+8);
      const end = pos + 12 + len;
      if (type !== 'pHYs') parts.push(buf.subarray(pos, Math.min(end, buf.length)));
      pos = end;
    }
    out = Buffer.concat(parts);
  }
} catch (e) { out = buf; }
const fileName = ((item.binary && item.binary[binKey] && item.binary[binKey].fileName) || 'final.png');
let stampedBinary = null;
try {
  if (this.helpers && typeof this.helpers.prepareBinaryData === 'function') {
    stampedBinary = await this.helpers.prepareBinaryData(out, fileName, 'image/png');
  }
} catch (e) { stampedBinary = null; }
if (!stampedBinary) {
  const meta = Object.assign({}, (item.binary && item.binary[binKey]) || {});
  delete meta.id;
  meta.data = out.toString('base64');
  meta.mimeType = 'image/png';
  meta.fileName = fileName;
  meta.fileExtension = 'png';
  stampedBinary = meta;
}
const binOut = Object.assign({}, item.binary || {});
binOut[binKey] = stampedBinary;
return { json: Object.assign({}, item.json, { final_w: w, final_h: h, dpi: 300 }), binary: binOut };
```


### Lessons distill

#### `Build Distill Request` (mode: runOnceForAllItems; onError: stop)

```javascript
// Gather unprocessed rejection feedback + existing rulebook -> Claude distill request
const lessons = $input.all().map(i => i.json).filter(j => j && j.id);
const fb = $('Fetch Feedback').all().map(i => i.json).filter(j => j && j.id && j.feedback && String(j.feedback).trim());
if (!fb.length) return [{ json: { skip: true, ids: [], idsCsv: '' } }];
const ids = fb.map(f => f.id);
const notes = fb.map(f => '- [' + (f.niche || 'general') + '] ' + String(f.feedback).trim().slice(0, 200)).join('\n');
const existing = lessons.length ? lessons.map(l => '- id:' + l.id + ' [' + l.scope + (l.niche ? ':' + l.niche : '') + '] (freq ' + (l.freq || 1) + ') ' + l.text).join('\n') : '(none yet)';
const system = 'You maintain a small rulebook of design lessons for an AI print-on-demand design engine, learned from client rejection feedback. Cluster the feedback notes into general, reusable lessons. Each lesson: ONE sentence, soft client-preference phrasing (e.g. "The client prefers..." or "Avoid..."), actionable for an image-prompt writer, generalized (never mention a specific quote or one-off detail). scope is "global" unless the note is clearly specific to one niche. If a note matches an EXISTING lesson\'s meaning, do NOT duplicate it - instead report it in updates with that lesson id and its new absolute freq (existing freq + number of matching notes). Propose at most 5 new lessons per run. Return ONLY this JSON, no markdown: {"updates":[{"id":"<existing lesson id>","freq":3}],"new_lessons":[{"scope":"global","niche":null,"text":"..."}]}';
const user = 'EXISTING RULEBOOK:\n' + existing + '\n\nNEW REJECTION FEEDBACK:\n' + notes;
const body = { model: 'claude-sonnet-4-6', max_tokens: 1200, system, messages: [{ role: 'user', content: user }] };
return [{ json: { skip: false, body, ids, idsCsv: ids.join(',') } }];
```

#### `Parse Distill` (mode: runOnceForAllItems; onError: stop)

````javascript
// Parse the distiller's JSON (lenient). distillOk=true ONLY when Claude answered with
// parseable JSON - feedback is marked processed only in that case, so a missing
// credential or outage never burns unlearned feedback.
let out = { updates: [], newRows: [] };
let distillOk = false;
try {
  let payload = $json;
  if (payload && typeof payload.data === 'string') { try { payload = JSON.parse(payload.data); } catch (e) {} }
  const txt = ((payload && payload.content) || []).filter(c => c && c.type === 'text').map(c => c.text).join('\n');
  const cleaned = String(txt).replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  const v = JSON.parse(m ? m[0] : cleaned);
  distillOk = true;
  const ups = Array.isArray(v.updates) ? v.updates : [];
  out.updates = ups.filter(u => u && u.id).map(u => ({ id: String(u.id), freq: Math.max(1, parseInt(u.freq, 10) || 1) })).slice(0, 20);
  const nl = Array.isArray(v.new_lessons) ? v.new_lessons : [];
  out.newRows = nl.filter(l => l && l.text).slice(0, 5).map(l => ({ scope: (l.niche && l.scope !== 'global') ? 'niche' : 'global', niche: l.niche || null, text: String(l.text).trim().slice(0, 220), freq: 1, status: 'proposed' }));
} catch (e) { out = { updates: [], newRows: [] }; distillOk = false; }
const src = $('Build Distill Request').first().json;
return [{ json: { updates: out.updates, newRows: out.newRows, idsCsv: src.idsCsv || '', distillOk } }];
````

#### `Split Updates` (mode: runOnceForAllItems; onError: stop)

```javascript
const u = ($('Parse Distill').first().json.updates) || [];
return u.map(x => ({ json: x }));
```


---

## 5. Vendor call shapes (HTTP Request nodes)

Header values are redacted; only names are listed. "credential" = n8n `httpHeaderAuth` credential ("Kie Bearer" per the setup note) or `googleDriveOAuth2Api`; its header is not in the export. Timeouts are `options.timeout` in ms.

### 5.1 Machine-generated table of every HTTP Request node

| Node | Method | URL | Auth / headers | Body | Timeout | onError | Retry |
|---|---|---|---|---|---|---|---|
| Analyze Image Node | POST | `https://api.kie.ai/gemini-3.1-pro/v1/chat/completions` | credential:httpHeaderAuth | ={{ JSON.stringify($json.body) }} | 120000 | continueErrorOutput | 3x/5000ms |
| Kie Create Task | POST | `https://api.kie.ai/api/v1/jobs/createTask` | credential:httpHeaderAuth | ={{ JSON.stringify($json.body \|\| $('Build Kie Gen Request').first().json.body) }} | 60000 | continueErrorOutput | 3x/5000ms |
| Kie Poll | GET | `=https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{ $('Kie Create Task').first().json.data.taskId }}` | credential:httpHeaderAuth | - | 60000 | continueErrorOutput | 3x/2500ms |
| Download Result | GET | `={{ $json.imageUrl }}` | - | - · response=file | - | continueErrorOutput | - |
| Find Niche Folder | GET | `https://www.googleapis.com/drive/v3/files` | credential:googleDriveOAuth2Api | query: q=={{ "name='" + $('Parse Command').first().json.niche + "' and mimeType='application/vnd.google-apps.folder' and '1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7' in parents and trashed=false" }}; fields=files(id,name); pageSize=1; supportsAllDrives=true; includeItemsFromAllDrives=true | - | stop | - |
| Fire To Worker | POST | `https://n8n.srv1202488.hstgr.cloud/webhook/1697db60-117c-4305-9cb8-1babc5762e4f` | - | ={{ JSON.stringify($json) }} | 15000 | stop | - |
| SB Analyzing | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Worker Input').first().json.generation_id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Prefer=return=minimal | ={{ JSON.stringify({ status: 'analyzing' }) }} | 15000 | continueRegularOutput | - |
| SB Generating | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Worker Input').first().json.generation_id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Prefer=return=minimal | ={{ JSON.stringify({ status: 'generating' }) }} | 15000 | continueRegularOutput | - |
| SB Done | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Worker Input').first().json.generation_id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Prefer=return=minimal | ={{ JSON.stringify({ status: 'done', review_state: 'pending', image_url: $('Parse Result').first().json.imageUrl, prompt_used: $('Parse Claude').first().json.output, cost_gen: +((((($('Kie Poll').first().json.data && $('Kie Poll').first().json.data.creditsConsumed) ? ($('Kie Poll').first().json.data.creditsConsumed * 0.01) : 0.062)) * ($('Build Corrective Gen Request').isExecuted ? 2 : 1)) + 0.01).toFixed(4), similarity: ($('Parse Worker Input').first().json.similarity \|\| 85), qc_status: $('Parse QC').first().json.qc_status, qc_issues: $('Parse QC').first().json.qc_issues, qc_score: ($('Parse QC').first().json.qc_score ?? null), aspect_ratio: ($('Build Kie Gen Request').first().json.aspect_used \|\| undefined) }) }} | 15000 | continueRegularOutput | - |
| SB Failed | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Worker Input').first().json.generation_id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Prefer=return=minimal | ={{ JSON.stringify({ status: 'failed', qc_status: ($('Parse QC').isExecuted ? ($('Parse QC').first().json.qc_status \|\| null) : null), qc_issues: ($('Parse QC').isExecuted ? ($('Parse QC').first().json.qc_issues \|\| '') : ''), qc_score: ($('Parse QC').isExecuted ? ($('Parse QC').first().json.qc_score ?? null) : null), cost_gen: ($('Kie Poll').isExecuted ? +((((($('Kie Poll').first().json.data && $('Kie Poll').first().json.data.creditsConsumed) ? ($('Kie Poll').first().json.data.creditsConsumed * 0.01) : 0.062)) * ($('Build Corrective Gen Request').isExecuted ? 2 : 1)) + 0.01).toFixed(4) : 0.01), error: (($('Parse QC').isExecuted && ($('Parse QC').first().json.qc_fail_reason \|\| '')) \|\| ($('Eval Poll').isExecuted && ($('Eval Poll').first().json._failMsg \|\| '')) \|\| 'generation failed') }) }} | 15000 | continueRegularOutput | - |
| SB Insert | POST | `https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations` | apikey=<REDACTED>; Authorization=<REDACTED>; Prefer=return=minimal | ={{ JSON.stringify({ id: $json.generation_id, batch_id: $json.batch_id, niche: $json.niche, quote: $json['Typography Text'], reference_image: $json.Image, design_instruction: $json['Design Instruction'], similarity: $json.similarity, folder_id: $json.folderId, status: 'queued', review_state: 'pending', sheet_row: $json.niche + '!' + ($json.row_number \|\| '') }) }} | 15000 | continueRegularOutput | - |
| QC Check | POST | `https://api.kie.ai/gemini-3.1-pro/v1/chat/completions` | credential:httpHeaderAuth | ={{ JSON.stringify($json.body) }} | 120000 | continueRegularOutput | 3x/2500ms |
| SB Finishing | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Finish Input').first().json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ finish_status: 'finishing' }) }} | - | continueRegularOutput | - |
| ML Upscale | POST | `https://modelslab.com/api/v6/image_editing/super_resolution` | - | ={{ JSON.stringify($json.body \|\| $('Build Upscale Req').first().json.body) }} | 120000 | continueErrorOutput | 2x/3000ms |
| Fetch Upscale | POST | `={{ $json.fetchUrl \|\| $('ML Upscale').first().json.fetch_result \|\| ('https://modelslab.com/api/v6/image_editing/fetch/' + $('ML Upscale').first().json.id) }}` | - | ={{ JSON.stringify({ key: $json.key }) }} | 60000 | continueRegularOutput | 2x/2000ms |
| SB Finished | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Finish Input').first().json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify(Object.assign({ finish_status: 'finished', final_url: (($('Store Final').isExecuted && $('Store Final').first().json.Key) ? ('https://izjziiseuaewrhetbnkb.supabase.co/storage/v1/object/public/' + $('Store Final').first().json.Key) : (($('Parse Ideogram').isExecuted && $('Parse Ideogram').first().json.url) \|\| $('Parse Finish Input').first().json.final_url)) }, ($('Parse Finish Input').first().json.archive_only ? {} : { cost_removebg: (Number($('Ideogram Config').first().json.removebgUsd) \|\| 0.01) }))) }} | - | continueRegularOutput | - |
| Download Final | GET | `={{ ($('Parse Ideogram').isExecuted ? ($('Parse Ideogram').first().json.url \|\| '') : '') \|\| $('Parse Finish Input').first().json.final_url }}` | - | - · response=file | - | continueRegularOutput | ?x/?ms |
| Finish Failed | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Finish Input').first().json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ finish_status: 'finish_failed', error: String(($json.error && ($json.error.message \|\| $json.error)) \|\| $json.message \|\| 'finishing failed').slice(0, 300) }) }} | - | continueRegularOutput | - |
| Check Cancel | GET | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Worker Input').first().json.generation_id }}&select=id,archived` | apikey=<REDACTED>; Authorization=<REDACTED> | - | 15000 | continueRegularOutput | - |
| Fetch Feedback | GET | `https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?select=id,niche,feedback&review_state=in.(rejected,needs_regen)&feedback=not.is.null&learn_processed=is.false&order=created_at.desc&limit=200` | apikey=<REDACTED>; Authorization=<REDACTED> | - | 20000 | continueRegularOutput | - |
| Fetch Rulebook | GET | `https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/design_lessons?select=id,scope,niche,text,freq&status=in.(approved,proposed)&limit=100` | apikey=<REDACTED>; Authorization=<REDACTED> | - | 20000 | continueRegularOutput | - |
| Kie Claude Distill | POST | `https://api.kie.ai/claude/v1/messages` | credential:httpHeaderAuth; anthropic-version=2023-06-01 | ={{ JSON.stringify($json.body) }} | 120000 | continueRegularOutput | 3x/5000ms |
| SB Insert Lessons | POST | `https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/design_lessons` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify($json.newRows \|\| []) }} | - | continueRegularOutput | - |
| SB Bump Freq | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/design_lessons?id=eq.{{ $json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ freq: $json.freq }) }} | - | continueRegularOutput | - |
| SB Mark Processed | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=in.({{ $('Parse Distill').first().json.idsCsv }})` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ learn_processed: true }) }} | - | continueRegularOutput | - |
| SB Upscaled | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Finish Input').first().json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ finish_status: 'removing_bg', cost_upscale: 0.02 }) }} | - | continueRegularOutput | - |
| Find PR Folder | GET | `https://www.googleapis.com/drive/v3/files` | credential:googleDriveOAuth2Api | query: q=name='Musketeer Print Ready' and '1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false; fields=files(id,name) | 20000 | continueRegularOutput | 2x/2000ms |
| Create PR Folder | POST | `https://www.googleapis.com/drive/v3/files` | credential:googleDriveOAuth2Api | {"name":"Musketeer Print Ready","mimeType":"application/vnd.google-apps.folder","parents":["1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7"]} | 20000 | continueRegularOutput | 2x/2000ms |
| SB Drive Saved | PATCH | `=https://izjziiseuaewrhetbnkb.supabase.co/rest/v1/generations?id=eq.{{ $('Parse Finish Input').first().json.id }}` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=application/json; Prefer=return=minimal | ={{ JSON.stringify({ drive_saved: true }) }} | - | continueRegularOutput | - |
| Download Upscaled | GET | `={{ $('Eval Upscale').first().json.url }}` | - | - · response=file | 120000 | continueErrorOutput | 2x/3000ms |
| Ideogram RemoveBG | POST | `https://api.ideogram.ai/v1/remove-background` | Api-Key=={{ $('Ideogram Config').first().json.ideogramKey }} | multipart: image←binary `data` | 120000 | continueRegularOutput | 3x/5000ms |
| Store Final | POST | `=https://izjziiseuaewrhetbnkb.supabase.co/storage/v1/object/finals/{{ $now.toMillis() }}_{{ $('Parse Finish Input').first().json.fileName }}` | apikey=<REDACTED>; Authorization=<REDACTED>; x-upsert=true; Content-Type=image/png | binary field `data` | 60000 | continueRegularOutput | - |
| Fetch Gen | GET | `={{ $('Parse Finish Input').first().json.image_url }}` | - | - · response=file | 120000 | stop | - |
| Store Prep | POST | `=https://izjziiseuaewrhetbnkb.supabase.co/storage/v1/object/finals/prep_{{ $now.toMillis() }}.png` | apikey=<REDACTED>; Authorization=<REDACTED>; Content-Type=image/png; x-upsert=true | binary field `data` | 120000 | stop | - |
| Kie Ai | POST | `https://api.kie.ai/codex/v1/responses` | Authorization=<REDACTED> | ={{ JSON.stringify($json.body) }} | 120000 | continueErrorOutput | 5x/5000ms |

### 5.2 Per-vendor patterns

**Kie.ai — Gemini vision (`Analyze Image Node`, `QC Check`)**
- `POST https://api.kie.ai/gemini-3.1-pro/v1/chat/completions`, auth = httpHeaderAuth credential. Body = OpenAI chat-completions: `{ messages:[{ role:'user', content:[{type:'text',text}, {type:'image_url', image_url:{url}}…] }] }` (no `model` field; model is in the path). Images are passed by public URL (the Sheet's image URL / Kie result URL), not base64.
- Response used: `choices[0].message.content` (plain text; QC returns JSON text which `Parse QC` extracts with `/\{[\s\S]*\}/` after stripping ``` fences).
- Analyze: timeout 120 s, `continueErrorOutput` (error → Mark Failed), retry 3×/5 s. QC: timeout 120 s, `continueRegularOutput` + `alwaysOutputData` (fail-open), retry 3×/2.5 s.

**Kie.ai — prompt engine (`Kie Ai`)**
- `POST https://api.kie.ai/codex/v1/responses`, header `Authorization: Bearer <REDACTED>` (inline key, *not* a credential). Body = OpenAI Responses API: `{ model:'gpt-5-6-terra', max_output_tokens:4096, reasoning:{effort:'medium'}, stream:false, instructions:<system>, input:[{role:'system',content:[{type:'input_text',text:<system>}]},{role:'user',content:[{type:'input_text',text:<user>}]}] }`. Timeout 120 s, `continueErrorOutput`, retry 5×/5 s.
- Response: may be SSE text (`event:`/`data:` lines) or JSON, optionally wrapped in `data`. `Parse Claude` tries, in order: `response.completed` event → `response.output[].content[].text`; `response.output_text.done`; concatenated `response.output_text.delta`; then plain `output[]`/`output_text`; Anthropic `content[].text`; string `content`; chat `choices[0].message.content`. Then ASPECT extraction (§3.7). Output `{ output, aspect_ratio }`.

**Kie.ai — image generation (`Kie Create Task` + `Kie Poll`)**
- Create: `POST https://api.kie.ai/api/v1/jobs/createTask`, credential auth, body `{ model, input }` from `Build Kie Gen Request` (or `Build Corrective Gen Request`). Timeout 60 s, `continueErrorOutput`, retry 3×/5 s. Success test (`Task Created?`): `code===200 && data.taskId`.
  - i2i: `{ model:'gpt-image-2-5-sunburst-image-to-image', input:{ prompt, aspect_ratio, resolution:'1K', background:'opaque', input_urls:[<reference image url>] } }`
  - t2i: `{ model:'gpt-image-2-5-sunburst-text-to-image', input:{ prompt, aspect_ratio, resolution:'1K', background:'opaque' } }`
  - edit: `{ model:'google/nano-banana-edit', input:{ prompt, image_urls:[<previous version url>], output_format:'png' } }`
- Poll: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<taskId>`, credential auth, timeout 60 s, `continueErrorOutput`, retry 3×/2.5 s. Loop: `SB Generating → Wait Gen (8 s) → Kie Poll → Eval Poll → Route Poll`; `wait` re-enters `Wait Gen`. Fields used: `code`, `data.state` (`success` | `fail` | other=still running), `data.createTime` (epoch ms; **4-minute ceiling** measured from it, because static data does not survive the Wait node), `data.failMsg` / `msg` (error text), `data.resultJson` (JSON string → `resultUrls[0]`), `data.creditsConsumed` (cost: `creditsConsumed*0.01`, default 0.062).
- Cost recorded: `cost_gen = ((creditsConsumed*0.01 || 0.062) * (corrective ? 2 : 1) + 0.01).toFixed(4)` (the +0.01 is the QC call).

**Kie.ai — Claude (`Kie Claude Distill`)**
- `POST https://api.kie.ai/claude/v1/messages`, credential auth + header `anthropic-version: 2023-06-01`. Body = Anthropic Messages `{ model:'claude-sonnet-4-6', max_tokens:1200, system, messages:[{role:'user',content}] }`. Timeout 120 s, `continueRegularOutput`, retry 3×/5 s. Response used: `content[].text` (also tolerates a `data` string wrapper).

**ModelsLab (`ML Upscale`, `Fetch Upscale`)**
- Submit: `POST https://modelslab.com/api/v6/image_editing/super_resolution`, no header auth — key in body: `{ key:<mlKey>, init_image:<public Supabase URL of the 1024-fitted prep copy>, model_id:'RealESRGAN_x4plus_anime_6B', scale:4, face_enhance:'false', webhook:null, track_id:null }`. Timeout 120 s, `continueErrorOutput` (→ Finish Failed), retry 2×/3 s.
- Poll: `POST <fetch_result | https://modelslab.com/api/v6/image_editing/fetch/<id>>` body `{ key }`, timeout 60 s, `continueRegularOutput`, retry 2×/2 s, every 6 s (`Wait Upscale`), up to `$runIndex > 50`. `Eval Upscale`: `status==='success'` → `output[0]` (or string) = done; `processing|queued` → wait; message matching `/rate ?limit/i` → `resubmit` after 20 s (`Wait Resub Up` → `ML Upscale`); else fail.
- Discrepancies: `Finisher Config.upscaleModel='ultra_resolution'` is never read; the sticky note says `realesr-general-x4v3`; code uses `RealESRGAN_x4plus_anime_6B`. `cost_upscale` is a hard-coded 0.02.

**Ideogram (`Ideogram RemoveBG`)**
- `POST https://api.ideogram.ai/v1/remove-background`, header `Api-Key: <ideogramKey>`, multipart form field `image` ← binary `data` (the downloaded 4096px upscale). Timeout 120 s, `continueRegularOutput`, retry 3×/5 s. Synchronous response `{ created, data:[{ url, is_image_safe }] }`; `is_image_safe===false` → treated as failure. `cost_removebg` = `removebgUsd` (0.01).

**Google Drive REST (`Find Niche Folder`, `Find PR Folder`, `Create PR Folder`)** and Drive/Sheets/Slack nodes — `googleDriveOAuth2Api` credential; `q=name='<niche>' and mimeType='application/vnd.google-apps.folder' and '<root>' in parents and trashed=false`, `fields=files(id,name)`. DM-POD specific (see §9).

**Self-call (`Fire To Worker`)** — `POST https://n8n.srv1202488.hstgr.cloud/webhook/1697db60-117c-4305-9cb8-1babc5762e4f` with `JSON.stringify($json)` per row, timeout 15 s (webhook responds immediately, so this is fire-and-forget fan-out).

**Binary downloads** — `Download Result`, `Fetch Gen`, `Download Upscaled`, `Download Final`: plain GET with `responseFormat: file` (binary in field `data`).

**Supabase** — see §7.

Not present in this workflow (despite being mentioned in the task brief): no direct OpenAI endpoint, no imgbb, no literal `gpt-image-2` model id (the code uses `gpt-image-2-5-sunburst-*`; the sticky note calls it "gpt-image-2"), no separate nano-banana HTTP node (it is a `model` value on Kie createTask).

---

## 6. Similarity tiers

Similarity precedence: sheet row `Similarity` column → slash-command value → default **85** (`Build Worker Payloads`); regen calls pass the user-chosen value through the worker webhook. Clamped to 10–100. `effSim = sim` (no other adjustment).

| Requested similarity | Prompt tier (`Build Claude Request`) | Image model (`Build Kie Gen Request`) | Reference passed to image model? |
|---|---|---|---|
| 90–100 | NEAR-EXACT RE-CREATION | `gpt-image-2-5-sunburst-image-to-image` (if a reference image exists) | Yes — 1 image (`input_urls:[Image]`) |
| 75–89 | FAITHFUL RE-CREATION ("classic behavior") | image-to-image | Yes — 1 image |
| 60–74 | INSPIRED REMIX | image-to-image | Yes — 1 image |
| 55–59 | INSPIRED REMIX (tier text) **but** system line 1 says the model will NOT receive the reference | `gpt-image-2-5-sunburst-text-to-image` | No |
| 10–54 | LOOSE INSPIRATION | text-to-image | No |
| any, `regen_mode=reference` | tier by similarity as above; line 1 = "ALSO receives the STYLE REFERENCE" | **always** image-to-image | Yes — 1 image (the original reference) |
| any, `regen_mode=tweak` (needs an image) | TARGETED EDIT (replaces the tier; short 1–3 sentence edit instruction) | `google/nano-banana-edit` | Yes — 1 image (`image_urls:[Image]` = the previous output; no aspect) |

Notes:
- The tier thresholds (90/75/55) and the i2i switch (60) are deliberately different: the setup note says "Below 60 the generator switches image-to-image → text-to-image so low similarity can genuinely diverge"; the 55–59 band therefore gets the remix wording with a fully self-describing prompt.
- Without a reference image (`Image` empty) every run is text-to-image and edit mode is impossible.
- The vision analysis always sees the reference (plus the typography image when present) regardless of tier; the tier only governs what the prompt engine writes and whether the image model also gets the pixel reference. Never more than one image is passed to the image model.
- For `tweak`, the frontend must send the previous output as `Image` (the analyzer then describes it as the "PREVIOUS VERSION"); for `reference` it sends the original reference. (Inferred from the prompts; the payload builder is outside this workflow.)

---

## 7. Supabase storage model (old DM-POD project `izjziiseuaewrhetbnkb`)

All calls are PostgREST / Storage over HTTP with headers `apikey`, `Authorization: Bearer <same anon JWT>`, `Prefer: return=minimal` (+ `Content-Type: application/json` on the finisher/distill nodes). No RPCs are used. The two Code nodes that read Supabase (`Build Claude Request`, `Build Kie Gen Request`) use `this.helpers.httpRequest` with the same headers.

### `generations` (one row per design attempt; `id` = worker `generation_id`)

| Column | Written by | Values / notes |
|---|---|---|
| `id` | SB Insert | uuid minted in Build Worker Payloads |
| `batch_id` | SB Insert | one per `/gen` command |
| `niche` | SB Insert | sheet tab name |
| `quote` | SB Insert | sheet `Typography Text` |
| `reference_image` | SB Insert | sheet `Image` URL |
| `design_instruction` | SB Insert | sheet `Design Instruction` |
| `similarity` | SB Insert, SB Done | 10–100 |
| `folder_id` | SB Insert | Drive niche folder (DM-POD only) |
| `status` | SB Insert / SB Analyzing / SB Generating / SB Done / SB Failed | `queued` → `analyzing` → `generating` → `done` \| `failed` |
| `review_state` | SB Insert, SB Done; read by Fetch Feedback | `pending` written; `rejected`, `needs_regen` read (set by the frontend) |
| `sheet_row` | SB Insert | `<niche>!<row_number>` (DM-POD only) |
| `archived` | read by Check Cancel | `true` → generation skipped (frontend sets) |
| `image_url` | SB Done | Kie result URL |
| `prompt_used` | SB Done | Parse Claude `output` (ASPECT line stripped) |
| `cost_gen` | SB Done, SB Failed | see §5.2 formula |
| `qc_status` | SB Done, SB Failed | `pass` \| `pass_after_retry` \| `retrying` \| `fail` \| `unverified` |
| `qc_issues` | SB Done, SB Failed | issues joined with ` \| ` |
| `qc_score` | SB Done, SB Failed | 0–100 or null |
| `aspect_ratio` | SB Done; read by Build Kie Gen Request | Kie enum value; aspect constancy |
| `error` | SB Failed, Finish Failed | QC reason / Kie failMsg / finisher error (≤300 chars) |
| `feedback` | read by Fetch Feedback | free text from frontend review |
| `learn_processed` | SB Mark Processed | boolean |
| `finish_status` | SB Finishing / SB Upscaled / SB Finished / Finish Failed | `finishing` → `removing_bg` → `finished` \| `finish_failed` |
| `final_url` | SB Finished; read by Parse Finish Input (archive-only) | public Storage URL |
| `cost_upscale` | SB Upscaled | 0.02 |
| `cost_removebg` | SB Finished | 0.01 (skipped when archive_only) |
| `drive_saved` | SB Drive Saved | boolean (DM-POD only) |
| `created_at` | (default) | used for Fetch Feedback ordering |

### `design_lessons` (the self-learning rulebook)

| Column | Notes |
|---|---|
| `id` | referenced by distill `updates[].id` |
| `scope` | `global` \| `niche` |
| `niche` | null for global |
| `text` | one-sentence lesson (≤220 chars) |
| `freq` | bumped by SB Bump Freq; used for `order=freq.desc` |
| `status` | `proposed` (inserted by distill) \| `approved` (set in the frontend; only approved lessons are injected into prompts, top 10 by freq, global + niche-matched) |

### Storage bucket `finals` (public)
- `prep_<ms>.png` — 1024-fitted copy handed to ModelsLab (`Store Prep`, `x-upsert: true`).
- `<ms>_<safeQuoteOrNiche>_final_<id8>.png` — the 300-DPI transparent final (`Store Final`); public URL = `https://<ref>.supabase.co/storage/v1/object/public/<Key>` → `generations.final_url`.

### Webhook payload contracts (what a replacement caller must send)
- **Worker Webhook** body: `generation_id, batch_id, niche, folderId, channel_id, similarity, regen_feedback, regen_mode ('tweak'|'reference'), row_number, Image, 'Typography Image', 'Typography Text', 'Design Instruction', Comment, Status`.
- **Finisher Webhook** body: `id, image_url, final_url, archive_only, folder_id, niche, quote`. Valid iff `id` and (`image_url` is http(s), or `archive_only` and `final_url` is http(s)).

---

## 8. Model / version facts worth pinning

| Role | Endpoint | Model id in code | Note |
|---|---|---|---|
| Reference analysis (vision) | Kie `gemini-3.1-pro/v1/chat/completions` | (path) | up to 2 images |
| Prompt engine | Kie `codex/v1/responses` | `gpt-5-6-terra`, `reasoning.effort: medium`, `max_output_tokens: 4096` | sticky note still says "claude-sonnet-4-6" for this role — code wins |
| Image gen | Kie `jobs/createTask` | `gpt-image-2-5-sunburst-image-to-image` / `-text-to-image`, `resolution: 1K`, `background: opaque` | sticky note says "gpt-image-2" |
| Targeted edit | Kie `jobs/createTask` | `google/nano-banana-edit`, `output_format: png` | |
| QC (vision) | Kie `gemini-3.1-pro/v1/chat/completions` | (path) | 1 image |
| Lessons distill | Kie `claude/v1/messages` | `claude-sonnet-4-6`, `max_tokens: 1200` | |
| Upscale ×4 | ModelsLab `super_resolution` | `RealESRGAN_x4plus_anime_6B` | config/sticky disagree (see §5.2) |
| Background removal | Ideogram `v1/remove-background` | — | |

---

## 9. Porting notes for DM Studio

**Preserve verbatim (these are the tuned prompt-engineering assets):**
1. `Build Analyze Request` — the vision analysis prompt and its `STYLE / TYPOGRAPHY_TEXT / TYPOGRAPHY_STYLE` output contract (§3.1). Downstream regexes depend on those exact labels.
2. `Build Intelligence Request` — the user-message template incl. the two REGENERATION blocks and the two description labels (§3.2).
3. `Build Claude Request` — the entire system prompt: role line + `refLine` variants, the 5 tier strings and their thresholds (90/75/55) and the TARGETED EDIT tier, the exact-text rules, the grey-background rule with its 10-hex palette, the DESIGN INSTRUCTION line, the 9 KNOWN PRINT DEFECTS, RENDER QUALITY, the LEARNED CLIENT PREFERENCES header, and both `Output:` lines incl. the ASPECT instruction (§3.3–3.7). Also the request-body quirk of sending the system text as both `instructions` and a system `input` message.
4. `Parse Claude` — ASPECT extraction/validation/stripping; `Build Kie Gen Request` — `snapAspect`, the i2i/t2i/edit selection and aspect constancy.
5. `Build QC Request` — the 9-point checklist and JSON verdict schema; `Parse QC` — scoring rules, fail-open `unverified`, one-retry policy (§3.8).
6. `Build Corrective Gen Request` — the CRITICAL CORRECTIONS suffix with letter-spaced spelling (§3.9).
7. `Build Distill Request` / `Parse Distill` — the rulebook system prompt, the user-message line formats, the `{updates,new_lessons}` schema, caps (5 new / 20 updates / 220 chars), `proposed` → `approved` gating, and the top-10-by-freq injection query (§3.10).
8. Operational semantics: 8 s poll / 4-min ceiling from `createTime`, fail-open cancel check, `cost_gen` formula, `Set 300 DPI` pHYs stamping, `Fit 1024` before ×4 upscale, ModelsLab rate-limit resubmit, Ideogram `is_image_safe` check.

**DM-POD specific — drop or replace:**
- Slack intake: `Slack Slash Command`, `Parse Command` (hard-coded 15-niche whitelist, N≤50), `Valid?`, `Notify Invalid`, `Notify Start` (already disabled), `channel_id`.
- Google Sheets: `Read Niche Tab`, `Filter Not Generated` (Status column state machine: blank / Not Generated / Failed (n) with 3 strikes), `Mark Generated`, `Mark Failed`, `sheet_row`, `row_number`, the sheet column names `Image / Typography Image / Typography Text / Design Instruction / Comment / Status / Similarity`.
- Google Drive: `Find Niche Folder`, `Niche Folder Exists?`, `Create Niche Folder`, `Set Folder ID`, `Upload To Drive`, `Find PR Folder`, `Pick PR Folder`, `Create PR?`, `Create PR Folder`, `Upload Final Drive`, `SB Drive Saved`; columns `folder_id`, `drive_saved`; the root folder `1-x-_PcYlbP9Ig40nUDXF9oof-yBwaWQ7` and print-ready folder `1_g-VR5ZaV6Esw7UZHLrvMM5yudo_K9JK`.
- Fan-out via HTTP self-call (`Fire To Worker` → `Worker Webhook`) and `$getWorkflowStaticData` bookkeeping — replace with DM Studio's job queue / orchestration.
- Old Supabase project `izjziiseuaewrhetbnkb` and its anon key baked into 40 nodes; the DM Studio project is `voatrqhfsdfjomyajovi` (per memory) — re-point and move keys to credentials/env. Likewise the inline Kie key on `Kie Ai`, `Finisher Config.mlKey`, `Ideogram Config.ideogramKey`.
- Table/column mapping: `generations` ≈ DM Studio's generation/attempt record (map `status`, `review_state`, `qc_*`, `aspect_ratio`, `prompt_used`, `image_url`, `final_url`, `finish_status`, cost columns, `feedback`, `learn_processed`); `design_lessons` ≈ Style-Card / lessons table (`scope`, `niche`, `text`, `freq`, `status`). Storage bucket `finals` → DM Studio's finals bucket.

**Known inconsistencies to decide on when porting:** sticky-note model names vs code (§8); `upscaleModel` config unused; tier threshold 55 vs i2i threshold 60 (§6); `Create PR?` branch is dead code; `Find PR Folder` result is ignored; `Upload Final Drive` error output is unconnected (Drive failure after `Store Final` is silent); `Notify Start` disabled.
