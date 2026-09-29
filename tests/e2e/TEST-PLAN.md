# DM Studio — end-to-end test plan (2026-09-28)

System under test: the live stack. App http://localhost:3100 (repo /Users/macbookair/projects/dm-studio, `npm run dev`, Browser pane config `dm-studio`),
Supabase project voatrqhfsdfjomyajovi, n8n https://n8n.srv1202488.hstgr.cloud (all nine DM Studio workflows published).
Fixtures: tests/e2e/fixtures (lib-1..6.jpg = one client's established look; ref-1..3.png = a brief's references; bulk-1..2.jpg).

## Stages (run in order; each depends on the previous)

| Stage | What | Pipeline | Pass criteria |
|---|---|---|---|
| S1 Onboarding | Create client "E2E Test Client" in Clients (lead); open its panel; upload lib-1..6 to the reference library; click "Draft Style Card from library"; open the draft; review; lock | WF-1b | style_draft_requests row → done; a draft style_cards row whose json has every schema key filled (medium, linework, shading, texture, palette with hex, composition, typography, background, mood, subjects, forbid, signature_moves, garment_colors); lock creates locked v1; n8n WF-1b execution success |
| S2 Intake | (a) Client form: signed out, open the client's form link, attach ref-1..3, description, text "WILD & FREE" / "MOUNTAIN BEAR", garment black, placement front_chest, submit. (b) Board New card with ref-1 + ref-2, text "SUMMIT BOUND". (c) Board "New cards from images" with bulk-1 + bulk-2 | WF-1 | each card reaches review within 3 min with reference_analysis populated; card lands in the right client's panel only; n8n WF-1 executions success |
| S3 Generate | Approve the form card (a) | WF-2 → prompt-engine → Kie GPT Image 2.5 → QC → qc-judge | needs_review within ~10 min; generation has image_path (image in gens), rendered_prompt containing "WILD & FREE" once and at least one Style Card palette hex and the medium, qc_report with ≥ 9 checks; card page shows image, QC report, rendered prompt, chips |
| S4 Edits | On the S3 card: Edit text (change "MOUNTAIN BEAR" → "MOUNTAIN BEARS"), then Edit region (rectangle), then Regenerate with a reason | WF-3 (+ WF-2 for regenerate) | each creates a child generation of the right kind that returns to needs_review with an image and QC; parent keeps its image; history strip shows all |
| S5 Deliver | Accept the current generation | WF-4 finisher | delivered; finals/<card>/<gen>-final.png exists, PNG with alpha, pHYs = 300 DPI, larger than the source; Completed page shows the tile with px + 300 DPI; single download works; zip download works |
| S6 Ops | Park/Resume; Pause pipeline blocks Approve (then unpause); Retry on the failed card a5e8ed3d shows the error and requeues; Duplicate card; Delete a delivered/test card; Settings save; Lessons: reject a generation with a reason, trigger WF-7 (SQL `select public.studio_notify('studio-lessons', '{"event":"manual"}'::jsonb)`), proposed lesson appears in Settings > Lessons, turn it on | WF-7 | each behaves as the SOP says; no console errors |

## Rules for testers
- Evidence for every pass/fail: DB query result, n8n execution id + failing node + error, screenshot or read_page text.
- Every bug goes into tests/e2e/BUGS.md: id, stage, severity (blocker/major/minor), steps, expected, actual, evidence, root cause, fix, retest result.
- Fix in the source of truth: n8n/*.sdk.js AND the live workflow (update_workflow, then publish_workflow — edits to a published workflow only go live after publishing again); SQL as a saved migration in supabase/migrations AND applied live; Edge Functions in supabase/functions AND redeployed; frontend with tsc + lint + build clean.
- Never modify n8n DcdygzBz5GAoy2Zg (T-Shirt Engine), qQF8ZwNPGXNAgbku (DM Finisher) or Vi8LELQs076uE7jD; never touch other Supabase projects; never print or commit the studio secret or vendor keys; never type the password into the login form.
