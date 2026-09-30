# DM Studio E2E bugs (run of 2026-09-28)

Format: id, stage, severity, steps, expected, actual, evidence, root cause, fix, retest.

---

## E2E-001 · S1 (also S2, S3, S4) · blocker · Worker HTTP nodes that ask PostgREST for a single object get an unparsed string

- **Steps:** Clients → E2E Test Client panel → upload lib-1..6 → "Draft Style Card from library".
- **Expected:** style_draft_requests → done, and a draft style_cards row.
- **Actual:** the request went to `failed` about 1 s later with last_error `no active style_profiler template [line 3]` (request 0a8cb339-31f4-4bf7-bc64-07111365b2d0).
- **Evidence:** n8n WF-1b execution 87669. Node "Get Template" output is `{ "data": "{\"slug\":\"style_profiler\",...}" }`: the JSON arrives as a string under `data`, so `tpl.body` is undefined and "Build Style Request" throws. The template row itself exists and is active (prompt_templates 350ff2da…, slug style_profiler v1). WF-2 execution 87620 shows the same problem: "Get Generation" output is `{ "data": "<json string>" }`, and the run ended in "Card → failed" (card a5e8ed3d).
- **Root cause:** the nodes send `Accept: application/vnd.pgrst.object+json`. PostgREST answers with that content type, and n8n HTTP Request v4.2 in autodetect mode only parses `application/json`, so it returns the body as text. Seven nodes are affected:
  - WF-1 Intake `CrpmkqYiaWBtvto6`: "Get Card", "Save Analysis"
  - WF-1b Style Draft `CsohPMosybjBoP8s`: "Get Template"
  - WF-2 Generate `KVLDYPaWZZZtOoir`: "Get Generation", "Save Image Path"
  - WF-3 Edit `V83NWHjzDdyiqtNP`: "Get Generation", "Save Image Path"

  This breaks S1 (draft), S2 (intake: Get Card) and S3/S4 (generate/edit).
- **Fix:** force JSON parsing on each of those nodes with `options: { timeout: 15000, response: { response: { responseFormat: 'json' } } }`.
  - Source of truth: done in n8n/wf1b-style-draft.sdk.js, wf1-intake.sdk.js, wf2-generate.sdk.js, wf3-edit.sdk.js. `node check.js` reports valid/ok for all four.
  - Live: `update_workflow` was applied to the DRAFT of WF-1b ("Get Template"), WF-1 ("Get Card", "Save Analysis") and WF-3 ("Get Generation", "Save Image Path"). `publish_workflow` for WF-1b was **denied by the permission classifier**. The WF-2 `update_workflow` was **also denied**. Nothing is live yet. See "needs main session" below.
- **Retest:** blocked until the workflows are published. After publishing: click "Draft Style Card from library" again on the E2E Test Client panel. It should reach `done` with a new style_cards draft v1.

### needs main session (E2E-001)
The permission system denied these calls. They were not retried. The user or the main session must run them in this order (each one after the previous succeeds):
1. `update_workflow {workflowId: "KVLDYPaWZZZtOoir", operations: [{type: "setNodeParameter", nodeName: "Get Generation", path: "/options", value: {timeout: 15000, response: {response: {responseFormat: "json"}}}}, {type: "setNodeParameter", nodeName: "Save Image Path", path: "/options", value: {timeout: 15000, response: {response: {responseFormat: "json"}}}}]}`
2. `publish_workflow {workflowId: "CsohPMosybjBoP8s"}` (WF-1b; its draft already holds the fix)
3. `publish_workflow {workflowId: "CrpmkqYiaWBtvto6"}` (WF-1; its draft already holds the fix)
4. `publish_workflow {workflowId: "KVLDYPaWZZZtOoir"}` (WF-2, after step 1)
5. `publish_workflow {workflowId: "V83NWHjzDdyiqtNP"}` (WF-3; its draft already holds the fix)

Or do the same in the n8n UI: on each listed node, Options → Response → Response Format = JSON, then Publish.

---

## E2E-002 · S1 · major · Style Card editor is missing `subjects`, `signature_moves` and `typography.case`, and drops `typography.case` on save

- **Steps:** open any Style Card in /clients/:id/style and look at the form. Edit and save a draft whose json has `typography.case`.
- **Expected:** the form covers every key of the Style Card schema (docs/generation-spec.md §2). prompt-engine render.ts reads `typography.case`, `subjects` and `signature_moves`.
- **Actual:** the form had no Subjects, Signature moves or Typography case fields. `normalizeStyleCard` kept only typography.vibe/placement, so saving a WF-1b draft silently deleted `typography.case`. `subjects` and `signature_moves` survived only as "keys outside the schema", editable in raw JSON only. The palette role suggestions also lacked `secondary`, which the style_profiler emits.
- **Evidence:** src/components/style/styleCardSchema.ts KNOWN_KEYS and StyleCardDoc (older SOP §7.1 shape). get_page_text of /clients/df526fbe…/style listed only Mood, Forbid, Garment colours in that section.
- **Root cause:** the frontend schema module predates the 2026-09-24 Style Card contract.
- **Fix (frontend):** styleCardSchema.ts adds `subjects`, `signature_moves` and `typography.case` to the doc, KNOWN_KEYS, normalize and toJson, and adds `secondary` to PALETTE_WEIGHTS. StyleCardForm.tsx adds Typography case (3-column type row), Subjects and Signature moves tag inputs. tsc -b clean, oxlint src clean, vite build OK.
- **Retest:** PASS for rendering. /clients/df526fbe-20f4-4057-84fa-46b9677c4f4b/style shows the "Typography case", "Subjects" and "Signature moves" fields, with no console errors after reload. The TypeErrors seen once came from HMR holding the old doc shape mid-edit and do not recur on a fresh load. Save/lock round-trip with a real WF-1b draft is still pending because E2E-001 blocks the draft.
- **Note:** TagInput splits on commas, so a signature move typed with a comma becomes two tags. Existing values with commas display intact.

---

## E2E-003 · S1 · minor · Style Card editor empty-state copy describes the old flow

- **Actual:** /clients/:id/style said "A draft is created from the client's first card automatically", and the version list said "One is drafted from the client's first card". Neither mentions the reference-library draft, which is now the primary flow.
- **Fix:** copy updated in src/pages/StyleCardPage.tsx and src/components/style/VersionList.tsx to point to "Draft Style Card from library" on the client panel. tsc/lint/build clean.
- **Retest:** PASS (text change only).

---

## E2E-004 · all stages · major (security) · n8n keeps WF-0 secrets in plain text in every saved execution

- **Evidence:** get_execution 87669 (WF-1b) with includeData returns the full "Load Config" output (studio secret and vendor keys) and the webhook's `x-studio-secret` header in clear. Values are not reproduced here. This applies to every DM Studio workflow that runs Load Config, and executions are saved on success.
- **Impact:** anyone with read access to n8n executions (or the MCP connector) can read the studio secret and the Ideogram / imgbb / ML keys.
- **Suggested fix (needs user decision; not applied):** per workflow, set `saveDataSuccessExecution: "none"` (or enable execution data redaction) on WF-1, WF-1b, WF-2, WF-3, WF-4, WF-7, and republish. Alternatively, have Load Config return only the fields each workflow needs. After that, rotate the studio secret and the vendor keys, since they are already stored in existing executions.
- **Retest:** not done (no change applied).

---

## Observations (not bugs)
- client_references rows from one upload batch share an identical created_at (e.g. all six at 2026-09-28T06:05:46.797141Z), so "oldest first" order in the panel and `order=created_at.desc` in WF-1b List Library are not deterministic within a batch. This is harmless for drafting.
- The Supabase MCP (execute_sql) did not respond during this stage ("server isn't responding", twice). DB checks were done through REST with the test lead's access token instead.

---

## Run 2 (2026-09-28 → 29): Kie outage, OpenRouter lane, S1–S6 completed

## E2E-005 · S1/S2 · major · Kie Gemini outage showed as "Unknown error [line 6]"
- **Actual:** Kie `gemini-3.1-pro` chat/completions answered HTTP 200 with `{"code":500,"msg":"internal error, please try again later."}` for every request (text-only included; gemini-3-pro, 2.5-pro and the flash models also refused). The Code nodes then failed on a missing `choices` and the card/draft showed "Unknown error [line 6]".
- **Fix:** Parse Analysis / Parse Style Card (WF-1, WF-1b) and Fail Message (WF-2, WF-3) detect a vendor error body and say "Vision service unavailable (Kie error 500 - …). Nothing was changed; try again in a few minutes." Live and published.
- **Retest:** PASS: style draft 3b3b8e24/b89bbbcd showed the readable message while Kie was down.

## E2E-006 · all · minor · settings.vision_model was ignored
- **Fix:** WF-1 reads it (new node "Get Vision Model"), WF-1b reads it from Get Settings, WF-2/WF-3 QC read it from prompt-engine (which now returns `vision_model`). **Retest:** PASS (URLs resolve from settings).

## E2E-007 · S3 · major · the prompt told the model NOT to reproduce the text it had to print
- **Steps:** client form with references that already show "WILD & FREE" / "MOUNTAIN BEAR" (a mockup of the wanted design; common).
- **Actual:** prompt-engine listed every reference text under "Text seen in the reference (do NOT reproduce it)" and then asked for the same words in the exact-text block.
- **Fix:** prompt-engine v4 drops reference text that matches a print-text line (case/space/punctuation-insensitive). **Retest:** PASS: generation ce33d224 prompt has no do-not-reproduce line; "WILD & FREE" appears once.

## E2E-008 · all · minor · n8n cut thrown error messages at the last colon
- **Actual:** "Vision service unavailable (Kie 500: internal error…)" reached the card as "internal error, please try again later.). Nothing was changed…".
- **Fix:** every thrown message in the 7 workflows reworded without ':' (15 messages). **Retest:** PASS.

## E2E-009 · S4 · minor (UX) · Edit region pixel fields append to their current value
- **Steps:** Edit region → type X=200, Y=480, then W=300, H=260.
- **Actual:** after X/Y the W/H fields hold the remaining size (824/544) and Y shows "0480"; typed digits append, so W/H stay at the maximum. Select-all + type works.
- **Fix:** open (select the field content on focus, or don't prefill W/H). Workaround: select the value before typing, or drag on the image.

## E2E-010 · S4 · major · QC checked edits against the text frozen at approval
- **Steps:** Edit text "MOUNTAIN BEAR" → "MOUNTAIN BEARS" (with "Also update this line in the brief"), then Edit region.
- **Actual:** QC for the region edit expected "MOUNTAIN BEAR", failed the correct image, and its corrective instruction said "Remove the 'S' from 'BEARS'". In WF-2 that corrective retry runs automatically, so a Regenerate after a text edit could have reverted the client's change.
- **Root cause:** WF-2/WF-3 "Build QC Request" read `generations.brief_snapshot.print_text` (frozen at approval); the single-line Edit text updated `cards.print_text` only.
- **Fix:** QC now expects exactly the text slot of the prompt it judged (`Prompt Engine → magic_prompt_json.text.lines`, brief snapshot as fallback), live in WF-2 and WF-3; the single-line Edit text also patches `cards.brief_snapshot` (frontend), like the multi-line path already did.
- **Retest:** PASS: regenerate 4018db0c QC expected and found "WILD & FREE / MOUNTAIN BEARS".

## E2E-011 · S4 · major · Regenerate after an edit inherited the TARGETED EDIT rule
- **Actual:** a regenerate built on an edit_text / edit_region parent kept "TARGETED EDIT: the image the model receives IS the previous version" as its similarity rule, but a regenerate sends the original references, not the previous image.
- **Fix:** prompt-engine v5 resets the similarity rule to the card's tier rule for regenerates. **Retest:** PASS (prompt has SIMILARITY POLICY, no TARGETED EDIT).

## E2E-012 · S4 · major · Regenerate note never reached the model
- **Actual:** the dialog sent the note only as `rejection_note` (for lessons); prompt-engine rendered "a fresh attempt was requested".
- **Fix:** CardPage sends the note as `instruction` too. **Retest:** PASS: regenerate cc9b27c5 prompt carries "REGENERATION - MATCH THE REFERENCE BETTER … Make all the pine trees rust red instead of green"; the trees changed.

## Observations (run 2)
- OpenRouter `openai/gpt-image-2.5-sunburst` returns 1024×1024 although `resolution: "2K"` is sent; the finisher then outputs 3072×3072 (10.2 in at 300 DPI). Kie returned 2K. Worth testing `size`/`quality` on OpenRouter if larger prints are needed.
- Approve dialog shows "$0.60 per card" (Settings price); a full OpenRouter card cost about $0.09 image+QC ($0.07 + $0.016) plus $0.012 intake.
- Nano Banana (OpenRouter `google/gemini-2.5-flash-image`) treats the region mask as a hint: 3 of 4 trees recoloured and one outside the rectangle changed.
- Duplicate copies the reference analysis, so the copy lands in review without a second vision call (the api.ts comment says "intake").
- Not clicked in the browser by the tester (left to the user): Completed → Download PNG / Download all (the same file was fetched and verified through Storage), and Delete (permanent).
- E2E-004 (secrets stored in n8n executions) is still open, waiting for a decision.

---

## Run 3 (2026-09-30): the user's first own card

## E2E-013 · S2 · blocker · intake failed when the references were three unrelated designs
- **Steps:** Board → New card with 3 references that are different designs (a labrador, a panda, two pitbulls), brief "Make a racoon in a happy mood", 3 text lines.
- **Actual:** the vision model answered with a JSON **array** (one analysis per image) instead of one object; Parse Analysis only accepted an object → "reference analysis is neither JSON nor a STYLE block - reply was [" → card failed (WF-1 exec 92321).
- **Fix:** Parse Analysis parses the whole reply first; an array is reduced to IMAGE 1 (the design to re-create) with the other images summarised in `notes` as supporting references. Live + published. **Retest:** PASS — card 6e54e616 reached review with the analysis.

## E2E-014 · S6 · blocker · Retry on a card that failed during intake never re-ran intake
- **Actual:** retry_card moved the card back to `intake` ("retried") but the intake webhook trigger was `AFTER INSERT` only, so nothing happened; the card sat in Intake for 18 h.
- **Fix:** migration studio_16: `cards_notify_intake` fires `after insert or update of stage` when a card enters intake (event `card.retried`). **Retest:** the stuck card was re-notified by hand and reached review; a new Retry now fires by itself.

---

## Run 4 (2026-09-30): the user's own edits, then the card-page redesign

## E2E-015 · S4 · blocker · Changing several text lines re-rendered the whole design
- **Steps:** on a generated card, Edit text → change two lines → Apply.
- **Actual:** the multi-line path updated the brief and queued a *regenerate*, so the subject, layout and style changed together with the text (the user's screenshot: "when i changed the text it also changed the image style").
- **Fix:** multi-line edits are an in-place `edit_text` on the current image (prompt-engine v6: old/new text empty = the lines are already rewritten in the magic prompt; WF-3 receives the previous image). **Retest:** PASS — only the lettering changed.

## E2E-016 · S4 · major · A region edit changed pixels outside the marked rectangle
- **Actual:** the edit model (Nano Banana / gpt-image) treats the mask as a hint; trees outside the rectangle were recoloured.
- **Fix:** WF-3 now pastes the edited rectangle back onto the parent image (Edit Image nodes: information → resize to the original size → crop to the scaled `mask_rect` → composite at x,y; `generations.mask_rect`, migration studio_17). **Retest:** PASS — 0 px differ outside the rectangle.

## E2E-017 · S3 · major · QC verdict flipped between near-identical generations
- **Actual:** gen 1 failed on "palette contains an extra colour" and "text is upper case", gen 2 passed; the judge was free-texting style compliance.
- **Fix:** Build QC Request sends a structured STYLE CARD block; `palette_ok` strictness comes from `card.rules.palette_mode` (strict / flexible); letter case is never a violation (the client's text-case rule is applied at intake). **Retest:** PASS on the same card.

## Card-page redesign (commit 2c90fc2) — QA leftovers, all minor
- Multi-line Apply button still reads "Apply text changes" when only the brief lines changed (wording).
- After Apply, focus is lost while the generations list refreshes (returns to the body; should stay on the picture).
- At 560 px the auto-scroll to the edit form stops ~16 px short of the form's top edge.
- The status line under the picture is empty for a moment while generations load (shows nothing instead of "Loading…").

## Onboarding (2026-09-30)
- Backend live (migration studio_18): `clients.style_brief`, `client_references.excluded`, text case at intake, `approve_card(p_card_id, p_platform, p_style_card_id)`, `create_style_test_card`, style_profiler v2 with `rules` + `evidence`. Verified: draft v3 for the E2E client carries rules/evidence; test card 262c5998 rendered with the draft card and passed QC.
- Wizard UI (drop → brief → analyse → test render → lock; hide `source='style_test'` cards from Board/Completed/counts) built by workflow wf_6f58a798-47e — see REPORT.md once it lands.
- Harness note: subagents cannot call `preview_start` ("Dev servers are not available for this session") and the attempt stops the running dev server; start it from the main session and tell subagents to `navigate` only.

---

## Run 5 (2026-09-30): onboarding wizard (workflow wf_6f58a798-47e - 2 designs, judge, implementer, spec + code review, browser QA, fix, QA re-check)

Built: `/clients/:id/onboard` with 4 steps (Drop the designs → Written brief & lock parameters → Analyse → Test & lock), URL-addressable (`?step=`, `?draft=`), reachable from the client panel ("Onboard client" is the primary action until a Style Card is locked). QA on the E2E client: uploads via DataTransfer, notes, tick/untick with the 4-of-8 warning, brief save + reload, one Analyse (draft v4, $0.02), one Test render (card 1f250bbe, QC Pass, $0.10), style_test cards absent from Board / Completed / counts, no console errors, no horizontal scroll at 560 px. Test client restored afterwards (uploads deleted, brief and ticks back).

Fixed before merge (12): Lock unreachable while a test card sat in review/stuck; a re-analysis hidden behind a pinned `?draft=`; cleared Notes not saved (RPC coalesce → always send `p_notes`); 1 Hz re-render of the whole wizard; a 30 s poll reverting an optimistic tick/note; step flash + focus steal before data loaded; stuck test card with no way out (Skip); failed strip drawn at the wrong phase; "locked" success text for a superseded version.

Left as follow-ups:
- WF-1b `reference_ids` (needs the WF-1b swap, see below); until then the evidence panel reconstructs the order and shows the "uploaded together" caveat; remove the caveat in DesignsStep.tsx / EvidencePanel.tsx afterwards.
- Coverage gap (not driven for real): over-cap "Not read" badge (needs 17+ images), failed-analysis panel, paused pipeline, designer (non-lead) session, one real Lock. Exercise once on a throwaway client.
- Post-QA fixes applied by hand: a failed test render from another session now shows its error + Retry in step 4 (hook falls back to the newest failed card); lock line wording under a failed render.

## WF-1b swap (pending the user)
The corrected WF-1b (`baCsaUp7HdrrSf2i`: library order `created_at.desc,id.desc`, `reference_ids` written into the draft, hard fail when an image cannot be signed) is created and verified but unpublished; `CsohPMosybjBoP8s` is still live. Swap = deactivate old, set Error workflow = WF-6 on the new one, activate new; then run one Analyse and confirm `style_cards.json.reference_ids` is present.

## E2E-018 · onboarding · major · The test render's subject was dictated by the headline text
- **Steps:** onboard a real client (Happy Hour Farm, typed as "Chicken Happy Hour"; Style Card draft v2 subjects = Highland cows) → step 4 Test render.
- **Actual:** three chickens. The test card's headline was the client's NAME in upper case, so the prompt carried "CHICKEN HAPPY HOUR" and the model drew what the words named; the Style Card's subjects were only a soft hint ("pick a subject from their usual subject matter").
- **Also:** the render used the unlocked draft, so the user could not tell whether they were judging "the actual Style Card".
- **Fix:** migration studio_20 — `create_style_test_card(p_client_id, p_subject, p_lines, p_style_card_id)`: an explicit SUBJECT (designer's, else the card's subjects[0]), editable text lines (1–3), and a brief that says the lettering must never change the subject; validation messages tested via REST. Frontend: step 4 becomes **Lock & test** — the draft is locked first, the render uses the locked card, the dialog asks for subject + text lines (workflow wf_81f6dc5d-07f).
- **Retest (Lock & test, workflow wf_81f6dc5d-07f):** PASS — step 4 locks first ("Lock v4 & test render"), the dialog asks for the subject (prefilled from the card's subjects, chips for the others) and the text lines; QA locked v4 and rendered "a highland cow wearing sunglasses / QA LOCK TEST" (card a48971c1, QC pass, ~60 s); the render is labelled with the version it used; superseded versions get no render action.

## E2E-019 · onboarding · major · Locking an older draft did not make it the contract
- **Steps:** v4 locked; select draft v3 in step 3 → step 4 "Lock v3 & test render".
- **Actual:** v3 got status locked, but `current_style_card()` picks the highest locked version, so v4 stayed current while the wizard said "every new brief uses v3".
- **Fix:** migration studio_22 — `lock_style_card` re-issues an older draft as the next version (copy of its json, locked, note "locked from vN") when a newer version is already locked, so the newest locked version is always the chosen one.
