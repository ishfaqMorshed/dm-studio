# DM Studio — end-to-end test report (2026-09-29)

System under test: app http://localhost:3100, Supabase `voatrqhfsdfjomyajovi`, n8n WF-0…WF-7 (all published).
Kie Gemini was down for the whole run (HTTP 200 with `{"code":500}` on every vision call), so S1–S6 ran on the new
**OpenRouter lane** (same models: Gemini 3.1 Pro, GPT Image 2.5 Sunburst, Nano Banana, Claude Sonnet 4.6).
Bugs: [BUGS.md](BUGS.md) (E2E-001 … E2E-012). Plan: [TEST-PLAN.md](TEST-PLAN.md).

## Result

| Stage | Result | Evidence |
|---|---|---|
| S1 Onboarding | **PASS** | Library draft on OpenRouter: request → done in 30 s, Style Card v2 draft with all 13 keys, palette matches the library (cream/black/terracotta/mustard/pine). Manual Style Card v1 written in the editor, saved (typography.case kept) and locked (08eab4fe). |
| S2 Intake | **PASS** (form path) | Signed-out client form: 3 references, description, 2 text lines, black, front chest → card 96c79ea0 in review 9 s after submit (WF-1 exec 92217, OpenRouter Analyze). Analysis read the palette card's exact hexes and both text lines. Board "New card" / bulk intake not re-run (same WF-1 path; covered in run 1 up to the vendor call). |
| S3 Generate | **PASS** | Approve dialog (platform picker preselected) → needs_review in 40 s (WF-2 exec 92229: Image Platform? → OpenRouter Image → Decode → Upload; QC Platform? → OpenRouter QC). Prompt: text once, Style Card medium + 4 palette hexes. QC 11 checks, pass. Image on brief and on style. |
| S4 Edits | **PASS** after fixes | Edit text → "MOUNTAIN BEARS" in 20 s, rest untouched, QC pass. Edit region → mask correct, model mostly followed (E2E-010 found here). Regenerate ×2 → prompt correct after E2E-011/012 fixes, QC expects the new text. History strip shows every version. |
| S5 Deliver | **PASS** | Accept → finisher 170 s → delivered. finals/…-final.png: 3072×3072 RGBA, 43 % transparent, pHYs 11811 px/m = 300 DPI. Completed tile shows "3072×3072 px · 300 DPI". Browser download/delete left to the user. |
| S6 Ops | **PASS** | Duplicate → review; Park → waiting (note kept) → Resume → review; Pause → approve_card refused "pipeline is paused" → unpause; Retry on a5e8ed3d → re-ran and failed with a readable OpenRouter message (its refs are 1-px placeholders); Lessons (WF-7 exec 92299, OpenRouter Claude) proposed an inactive lesson that shows in Settings. No console errors on the pages visited. |

## Fixed during this run
E2E-005 readable vendor errors · E2E-006 vision_model setting honoured · E2E-007 reference text vs print text contradiction ·
E2E-008 error text cut at colons · E2E-010 QC stale text after edits · E2E-011 regenerate inherits the edit rule ·
E2E-012 regenerate note ignored. Plus the new Kie / OpenRouter / Auto platform switch (migration studio_15, prompt-engine v3–v5,
Switch + fallback branches in WF-1/1b/2/3/7, pickers in Settings and the four card dialogs).

## Open
- **E2E-004 (security, needs a decision):** n8n stores the WF-0 secret and vendor keys in every saved execution. Suggested: `saveDataSuccessExecution: none` on WF-1…WF-7, then rotate the studio secret and keys.
- **E2E-009 (minor UX):** Edit region pixel fields append to their prefilled value.
- OpenRouter image comes back 1024 px (Kie gave 2K) → finals are 3072 px (10.2 in at 300 DPI).
- Kie lane re-test once Kie Gemini recovers (the Kie branches are the unchanged original nodes).

## Cost of the run (OpenRouter)
Intake $0.012 · style draft ≈ $0.02 · generation ≈ $0.07 + QC $0.016 · edits ≈ $0.02–0.04 each · lessons $0.002.
