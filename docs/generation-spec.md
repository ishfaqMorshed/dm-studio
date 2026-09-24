# DM Studio — generation system spec (phases 5–8)

Read with: docs/tshirt-engine/EXTRACT.md (verbatim prompts to reuse), docs/kie-gpt-image-2-5.md (engine contract),
docs-frontend-spec.md (app contract). Supabase project voatrqhfsdfjomyajovi. n8n folder "Print on demand" (QKT7A5gRiL349k8X, project i0N36mu4STExMeN4).
Rule: n8n owns sequence and visibility; Edge Functions own decisions; Postgres owns state, concurrency and time.
No Code node over 20 lines except owner-frozen code. No secrets in Set nodes, expressions or stickies.

## 0. Product decisions (2026-09-24)
- Style memory = per-client **Style Card** (locked, versioned JSON) drafted by vision analysis of the client's **reference library**
  (5–15 past designs uploaded once on the client panel) and edited/locked by a designer. Selecting a client anywhere means
  "use this client's locked Style Card". Card references describe that design's subject/inspiration only.
- Engine = Kie.ai **GPT Image 2.5 Sunburst**, image-to-image, model `gpt-image-2-5-sunburst-image-to-image`.
  References are BOTH read by vision into the prompt AND attached as `input_urls` (signed URLs), labelled per similarity tier.
- Designers can create a card from the board with a client dropdown (`create_card_as_designer`). The board is client-scoped:
  a client selector in the header filters everything to that client (its own panel); "All clients" shows everything.
- Each client panel has: form link (copy / rotate), reference library uploader, Style Card status + editor link,
  "Draft Style Card from library" button, New card button.

## 1. Data (already deployed, migrations studio_01..11)
- clients(id, name, form_token, active, garment_colors[], target_px_w/h, default_similarity_tier, model_override, notes)
- client_references(id, client_id, path 'refs/<client_id>/library/<uuid>.<ext>' stored WITHOUT the bucket prefix: '<client_id>/library/<uuid>.<ext>', note)
- style_cards(id, client_id, version, status draft|locked, json, note, locked_at) — append-only; current = max locked version
- style_draft_requests(id, client_id, status queued|dispatched|working|done|failed, style_card_id, last_error) — insert → pg_net → /webhook/studio-style-draft
- cards(id, client_id, stage, source form|designer|duplicate, brief_text, print_text [{role,text}], reference_paths[3], reference_analysis jsonb,
  garment_color, placement, due_on, avoid_notes, similarity_tier, client_submission, current_generation_id, style_card_id/version, brief_snapshot, last_error, n8n_execution_id)
- generations(id, card_id, parent_generation_id, kind, status queued|dispatched|working|done|failed, attempt, magic_prompt_json, final_prompt, rendered_prompt,
  model, vendor, vendor_job_id, aspect_ratio, resolution, reference_urls, style_card_id/version/snapshot, brief_snapshot, edit_instruction, old_text, new_text, mask_path,
  image_path 'gens/<card_id>/<generation_id>.png', qc_report, needs_regen, text_elements, drift_pct, rejection_reason/note, reviewed_by/at, n8n_execution_id, last_error)
- design_lessons(client_id nullable, category, rule, active), prompt_templates(slug, version, body, active)
- settings(pipeline_paused, per_card_price_usd, max_active_generations 3, max_active_finish 2, n8n_base_url, generation_model, generation_resolution '2K', vision_model, max_style_refs 12)
- Worker RPCs (anon + x-studio-secret): claim_generations(), move_card(card_id, stage, note), new_style_card_version(client_id, json), style_draft_update(request_id, status, style_card_id, error, execution_id), current_style_card(client_id)
- Storage: refs (staff insert/select/delete; worker select), gens (worker all; staff read/insert), finals. Storage forwards x-studio-secret, so the worker calls
  `POST /storage/v1/object/sign/<bucket>/<path>` body {"expiresIn":3600} with apikey + secret to get `{signedURL}` (prefix with `<sbUrl>/storage/v1`).
- Triggers already firing: cards insert (stage intake) → /webhook/studio-intake {card_id, client_id}; cards stage → approved → /webhook/studio-generate {card_id, generation_id};
  generations insert kind≠generate → /webhook/studio-edit; style_draft_requests insert → /webhook/studio-style-draft {request_id, client_id}; pg_cron 5-min sweep nudges studio-generate when queued rows exist.

## 2. Style Card JSON schema (the contract every prompt is built from)
{
  "medium": "", "linework": {"weight": "", "style": ""}, "shading": "", "texture": "",
  "palette": [{"name": "", "hex": "#RRGGBB", "weight": "dominant|secondary|accent|outline"}],
  "composition": "", "typography": {"vibe": "", "placement": "", "case": ""},
  "background": "flat mid-grey #808080, isolated artwork",
  "mood": ["", ""], "subjects": ["typical subject matter"], "forbid": ["", ""],
  "signature_moves": ["what makes this client recognisable"], "garment_colors": ["black"]
}
Vision drafting returns exactly this shape (JSON mode). Designers edit and lock; the pipeline refuses to generate without a locked card.

## 3. Edge Functions (Deno, pure, unit-tested with fixtures; verify_jwt off; they check x-studio-secret by calling rpc studio_secret_ok with the header forwarded)
### prompt-engine  POST {generation_id}
Loads: generation (kind, brief_snapshot, style_card_snapshot, magic_prompt_json for regenerate/edit, parent), card (reference_analysis, print_text, garment_color, placement, avoid_notes, similarity_tier), client (default tier), active design_lessons (client then global), up to 5 approved exemplars for the client (final_prompt of delivered cards, newest), active prompt_templates rows (slugs: print_rules, tier_rules, text_rules, defects, render_order).
Builds magic_prompt_json with keys in this order and renders rendered_prompt from it:
  1 print_rules (template) 2 style_card (prose rendered from the JSON; forbid → negatives) 3 lessons 4 exemplars (short, "in the manner of these approved prompts")
  5 reference_reading (from cards.reference_analysis: art style, palette, subject structure, typography transcription; role rule per tier)
  6 similarity_tier (1–5 text from template) 7 brief (description, garment colour, placement, avoid notes) 8 text (exact-text block: each line verbatim, once, in the Style Card typography; if no text: "no text anywhere")
Also returns: aspect_ratio from placement (docs/kie-gpt-image-2-5.md table), resolution from settings, input_urls plan: which reference paths to attach (card refs always; up to 3 library refs when tier ≥ 3) and the per-image role labels to put in the prompt ("Image 1–3: style/subject references for this design; Image 4–6: examples of the client's established look — match the look, never copy a subject").
Writes magic_prompt_json, rendered_prompt, final_prompt (= rendered_prompt unless a polish node changes it), aspect_ratio, resolution, model, vendor onto the generation row, and returns them. Fails 422 with a clear message when the client has no locked Style Card or the card has no reference_analysis.
The prompt texts (print rules, tier definitions, exact-text rules, defect list, QC checklist) are taken VERBATIM from docs/tshirt-engine/EXTRACT.md and seeded into prompt_templates v1 by a migration; the function reads them from the table so the lead can version them (P7).
### qc-judge  POST {generation_id, qc_raw}
Normalises the vision QC response into qc_report {checks:[{id, name, pass, note}], score, needs_regen, corrective_instruction, style_violations[], text_ok, min_text_height_frac}; adds the Style Card palette check and the "rules violated" list; writes qc_report/needs_regen/text_elements; returns it. Never throws on malformed JSON (returns needs_regen false with a parse_error note and flags for the designer).

## 4. n8n workflows (SDK code, create in the folder, bind credentials by id: worker secret = the credential the user created (look it up with list_credentials by name "DM Studio Worker Secret"), Kie = "GPT Image 2 [DM-Kie]" w0sDpl2nll4HkF6h (Authorization Bearer), Gemini via Kie = "Gemini 3.1 Pro [DM-Kie]" 0l2nHQUQNnsCAfTR unless EXTRACT.md shows the vision call uses another endpoint/credential)
### WF-1 Studio Intake  (/webhook/studio-intake, header auth)
Respond 200 → Get Card (+client) → sign the 3 reference paths → Vision read (the T-Shirt Engine's reference-analysis prompt verbatim, JSON mode; output: art_style, palette[{name,hex}], subject_structure, typography_transcription, text_detected[], composition, notes) → PATCH cards.reference_analysis → if the client has no locked Style Card AND no draft: insert style_draft_requests (so the library flow drafts one; if the library is empty, draft from these 3 refs instead: call the same drafting prompt with the 3 signed URLs and new_style_card_version) → move_card(review). Failure → move_card(failed, message).
### WF-1b Studio Style Draft  (/webhook/studio-style-draft)
Respond 200 → style_draft_update(working, execution id) → list client_references (limit settings.max_style_refs) → sign each → Vision "style profiler" prompt: returns the Style Card JSON schema exactly (section 2) with evidence notes → new_style_card_version(client_id, json) → style_draft_update(done, style_card_id). Failure → style_draft_update(failed, message).
### WF-2 Studio Generate  (/webhook/studio-generate; nudged by cron)
Respond 200 → claim_generations() → per generation (batch 1): move_card(generating) → PATCH generation status working + n8n_execution_id → prompt-engine → sign input paths → Kie createTask (model from settings, input_urls, aspect_ratio, resolution, background opaque, callBackUrl = the Wait node's resume URL) → Wait (resume on webhook, timeout 15 min) → on timeout poll recordInfo every 10 s via the shared Poll sub-workflow until success/fail (30-min cap) → parse resultJson.resultUrls[0] → download → upload to gens/<card_id>/<generation_id>.png (apikey + secret, x-upsert) → PATCH image_path, vendor_job_id → Vision QC (the 9-point prompt verbatim + palette/style-violations/text-height additions; JSON mode; inputs: the image signed URL, the exact text lines, the Style Card JSON) → qc-judge → if needs_regen and attempt = 1: insert corrective regen? NO — keep one generation row: PATCH attempt 2, append corrective_instruction to the prompt (template "corrective") and loop back to createTask once → PATCH status done, cards.current_generation_id → move_card(needs_review). Any failure → PATCH generation failed + last_error → move_card(failed, message).
### WF-5 Poll (sub-workflow) inputs {url, headersCredential?, interval ≥ 6 s, timeout} → returns the final JSON or throws. Reused by WF-2 (Kie) and later WF-3.
### WF-6 Error workflow: set as the error workflow on WF-1/1b/2/4; writes last_error + stage failed onto the card if it can find card_id in the failed execution's data; posts to Slack channel #dm-studio if the Slack credential "DM HR" is allowed, otherwise skip the Slack node.

## 5. Frontend changes (dm-studio repo)
- Header: client selector (All clients + each active client; persisted in localStorage and the URL ?client=); every page filters by it (board, completed, card list). Board title becomes the client name.
- Board (client scoped): New card button → dialog: client preselected (or dropdown when All), 1–3 references upload to refs/<client_id>/<card_id>/n.ext (staff insert policy), brief, text lines, garment colour, placement, deadline, avoid notes, tier → create_card_as_designer → navigate to /card/:id. Card lands in intake; WF-1 moves it to review.
- Client panel (/clients/:id): form link copy/rotate; reference library grid (upload multiple, delete; stored in client_references + refs bucket); Style Card status (locked vN / draft / none) with Open editor; "Draft Style Card from library" → insert style_draft_requests; live status of the request (Realtime) and a link to the resulting draft; New card button.
- Settings (lead): generation_model (text with the default), generation_resolution (1K/2K/4K), vision_model, max_style_refs.
- Card page: show rendered_prompt (read-only) and the magic_prompt_json sections; show reference_urls roles; the Approve dialog shows the model and resolution that will be used.

## 6. Acceptance (phase gate)
1. Upload 6 library images for Test Client → Draft Style Card → a draft appears with all schema keys filled → lock it.
2. New card from the board (client selected) with 2 references → card reaches review with reference_analysis populated.
3. Approve → within 3 minutes the card is in needs_review with an image in gens, a qc_report with ≥ 9 checks, rendered_prompt containing the exact text line and at least two Style Card tokens (a palette hex and the medium).
4. Accept → WF-4 finishes → delivered → Completed page shows the file at 300 DPI.
