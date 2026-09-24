-- prompt_templates v1 seed for DM Studio (project voatrqhfsdfjomyajovi)
-- 14 rows, version 1, active = true. Bodies are dollar-quoted ($body$ ... $body$) so quotes and backslashes inside prompts are literal.
--
-- PROVENANCE. The verbatim rows are sliced byte-for-byte (not retyped) from docs/tshirt-engine/EXTRACT.md, the read-only extract of the
-- T-Shirt Engine workflow DcdygzBz5GAoy2Zg (never modified). Section references below point at that file:
--   analysis_prompt      §3.1 Variant A (with the IMAGE 2 typography paragraph). Vision read of the card references; output contract STYLE / TYPOGRAPHY_TEXT / TYPOGRAPHY_STYLE.
--                        When no typography image exists the caller drops the paragraph starting "IMAGE 2 is the TYPOGRAPHY / TEXT REFERENCE." (Variant B).
--   prompt_engine_system §3.3 full generation-mode system prompt (i2i refLine, FAITHFUL tier at ~85%, two lesson placeholders). Sent as BOTH the Responses-API
--                        "instructions" field and a role:"system" input message. Variant points the prompt-engine substitutes at runtime:
--                          line 1 refLine: t2i = "for a downstream image model that will NOT receive the reference image - your prompt alone must fully describe the design, so be complete and concrete."
--                                          edit = "for a downstream image EDITING model that receives the PREVIOUS VERSION of this design directly and edits it in place."
--                          PRIMARY RULE first bullet: replace with the tier text from tier_rules for the card's similarity_tier (edit kind: header becomes "PRIMARY RULE - TARGETED EDIT:" and the second bullet is dropped).
--                          TEXT bullets 2-3 in edit mode: "- Keep the lettering style, size and placement exactly as in the previous version unless the requested change is specifically about the text."
--                          LEARNED CLIENT PREFERENCES: one "- <lesson>" line per active design_lesson (client first, then global, max 10); omit the whole block when none.
--                          Output line in edit mode: see EXTRACT.md §3.3 (1-3 sentence edit instruction ending with the fixed "Keep everything else exactly the same..." sentence).
--   prompt_engine_user   §3.2 normal run (quote present). REGENERATION blocks for regenerate/edit kinds are in §3.2 and inserted between DESIGN INSTRUCTION and NOTES.
--   tier_rules           §3.3 the 5 tier strings. JSON {"1".."5","edit"} keyed by cards.similarity_tier (frontend labels: 1 style only/new subject, 2 loosely inspired, 3 balanced,
--                        4 close to the references, 5 as close as the model allows) → 1,2 LOOSE INSPIRATION; 3 INSPIRED REMIX; 4 FAITHFUL RE-CREATION; 5 NEAR-EXACT RE-CREATION;
--                        "edit" = TARGETED EDIT (kinds edit_text/edit_region, replaces the tier). Suggested {{n}} render per tier: 1→30, 2→50, 3→65, 4→85, 5→95 (source thresholds 90/75/55).
--   text_rules           §3.4   background_rule §3.5   defects §3.6 (the 9 KNOWN PRINT DEFECTS)
--   qc_prompt            §3.8 with-expected-text variant incl. the 9 checks and the JSON verdict schema. No-text variant replaces the EXPECTED line with
--                        'EXPECTED ON-DESIGN TEXT: (none - the image must contain NO text at all)'. qc-judge adds palette / style-violation / text-height checks on top.
--   corrective_suffix    §3.9 template pieces, appended to the ORIGINAL final prompt for the single corrective pass (attempt 2).
--                        No-text variant: replace everything from '. The ONLY text in the image must read exactly:' with '. The image must contain NO text at all - no words, letters, watermarks or signatures.'
--   distill_system       §3.10 system prompt (claude-sonnet-4-6 via Kie, max_tokens 1200)   distill_user §3.10 user-message line formats.
--   placement_aspect     docs/kie-gpt-image-2-5.md "Placement → aspect ratio" table (JSON placement → aspect_ratio).
--   style_profiler       NEW (WF-1b): 5-15 library images → Style Card JSON (generation-spec.md §2) + "evidence" array. WF-1b may strip "evidence" before new_style_card_version or keep it.
--   style_card_render    NEW (prompt-engine): deterministic rendering of the Style Card JSON into the CLIENT STYLE prose block + NEGATIVE line from forbid[].
--
-- PLACEHOLDERS (kept literally in the bodies; the caller substitutes them):
--   {{NICHE}} client name / niche · {{QUOTE}} exact on-design text (all print_text lines) · {{DESIGN_INSTRUCTION}} brief_text · {{NOTES}} avoid_notes
--   {{GEMINI_ANALYSIS_TEXT}} the vision read (cards.reference_analysis rendered) · {{APPROVED_LESSON_1}} {{APPROVED_LESSON_2}} active design_lessons
--   {{n}} similarity percentage for the tier · {{EXPECTED_TEXT}} exact expected text · {{EXPECTED_TEXT_SPACED}} expected.split('').join(' ')
--   {{ISSUES}} qc issues.join('; ') (fallback: 'render the text perfectly, keep the background one flat solid grey, remove all shadows')
--   {{LESSON_ID}} {{EXISTING_LESSON_TEXT}} {{REJECTION_FEEDBACK}} distill inputs (one line per lesson / feedback row; '(none yet)' when the rulebook is empty)
--   {{STYLE_CARD_JSON}} the locked Style Card JSON (style_card_render only; {single-brace} tokens inside it are JSON paths, not runtime placeholders)
-- No secrets, keys or URLs with credentials appear in this file.

insert into public.prompt_templates (slug, version, body, active) values
  ('analysis_prompt', 1, $body$You are a precise visual analyst for a "{{NICHE}}" print-on-demand design.

IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

IMAGE 1 is the DESIGN TO RE-CREATE (the output must copy it ~80-90%). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.

IMAGE 2 is the TYPOGRAPHY / TEXT REFERENCE. Transcribe its text EXACTLY, word for word, preserving line breaks and casing. Note its font style.

Return EXACTLY this structure and nothing else:
STYLE:
<full description for re-creation>

TYPOGRAPHY_TEXT:
<exact transcribed text from IMAGE 2, or NONE>

TYPOGRAPHY_STYLE:
<font description, or NONE>$body$, true),
  ('style_profiler', 1, $body$You are a precise visual analyst building the STYLE CARD for one print-on-demand client. Attached are 5 to 15 of this client's PAST DESIGNS, numbered in the order attached (IMAGE 1, IMAGE 2, ...). Describe the client's recurring visual identity - the look that makes every one of their designs recognisable - NOT any single design.

IMPORTANT: an image may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

Look for what REPEATS across the whole set: the art medium and rendering technique, linework weight and style, shading method, texture and distress level, the recurring color palette, composition habits, lettering style and where text sits, mood, typical subject matter, and the signature moves this artist keeps coming back to. Subjects and quotes change from design to design - never describe one design's subject or text as the style. Where the set disagrees, describe the majority and record the exception in evidence. Be concrete and complete: an image model must be able to match this look from your words alone.

PALETTE: 3 to 8 colors that recur across the set. hex is the closest 6-digit uppercase value like #1C1C1C. weight is dominant, secondary, accent or outline - exactly one dominant, listed first.
TYPOGRAPHY: vibe = the lettering style (e.g. condensed bold sans, hand-drawn brush script, western slab); placement = where text sits relative to the art (e.g. arched above and stacked below the hero); case = UPPER, lower, Title or Mixed.
FORBID: 2 to 8 concrete, checkable things this client visibly never does (e.g. gradients, photo-realism, thin hairlines, drop shadows, heavy grunge eating into lettering). Never leave it empty.
BACKGROUND: always exactly "flat mid-grey #808080, isolated artwork" - the studio generates on flat grey; the backgrounds in the attached images are irrelevant.
GARMENT_COLORS: the garment colors the designs are evidently made for (e.g. black, white, heather, navy). If it cannot be told, ["black"].
EVIDENCE: 5 to 15 short notes, each naming the image numbers that support one claim (e.g. "IMAGE 1, 3, 5: two-tone halftone shading on every hero").

Return ONLY this JSON object - no markdown fences, no commentary. Every key present, every string non-empty, every array non-empty, no keys added or renamed:
{"medium":"","linework":{"weight":"","style":""},"shading":"","texture":"","palette":[{"name":"","hex":"#RRGGBB","weight":"dominant|secondary|accent|outline"}],"composition":"","typography":{"vibe":"","placement":"","case":""},"background":"flat mid-grey #808080, isolated artwork","mood":["",""],"subjects":["typical subject matter"],"forbid":["",""],"signature_moves":["what makes this client recognisable"],"garment_colors":["black"],"evidence":["IMAGE n: short note"]}$body$, true),
  ('style_card_render', 1, $body$STYLE CARD RENDERING - turn the client's locked Style Card JSON into the CLIENT STYLE block of the image prompt. Render it deterministically: one line per key, in exactly this order, plain prose, each line starting with "- ", no markdown, no JSON, no key names left in snake_case. Copy every value from the JSON verbatim (hex codes uppercase, exactly as written); never invent, soften or embellish a value; skip a line ONLY when its value is empty. subjects and garment_colors are NOT rendered here - the subject comes from the brief and the card references, the garment colour is stated in the BRIEF block. A {single-brace} token is a JSON path; where it is a list, join the items with ", " (palette entries with "; ") in JSON order, except the palette, which is ordered dominant, secondary, accent, outline.

CLIENT STYLE (this client's locked look - every line is a hard requirement; the references describe the SUBJECT of this design, this block describes the LOOK of every design):
- Medium: {medium}.
- Linework: {linework.weight} weight, {linework.style}.
- Shading: {shading}.
- Texture: {texture}.
- Palette: {palette.name} {palette.hex} ({palette.weight}); ... - use ONLY these colors plus the flat grey background, no other hues.
- Composition: {composition}.
- Typography: {typography.vibe}, {typography.placement}, {typography.case} case - every on-design text line is set in this lettering style.
- Background: {background}.
- Mood: {mood}.
- Signature moves: {signature_moves} - at least one must be visibly present.
- NEGATIVE - never: {forbid}; never any color outside the palette above, never shadows, halos, gradients, a garment, a mockup or a photo.

The NEGATIVE line is always rendered last and is always present: when forbid[] is empty, render only the fixed tail after the semicolon. The finished block fills the style_card slot of the magic prompt (section 2, immediately after the print rules and before the client lessons).

Example - for {"medium":"screen-print style vector illustration","linework":{"weight":"bold","style":"uniform black outlines"},"shading":"two-tone halftone","texture":"light paper grain, no grunge on lettering","palette":[{"name":"cream","hex":"#F2E8D5","weight":"dominant"},{"name":"rust","hex":"#B5482A","weight":"secondary"},{"name":"teal","hex":"#2F6F73","weight":"accent"},{"name":"ink black","hex":"#1C1C1C","weight":"outline"}],"composition":"centered badge, hero inside a circle, text arched above and stacked below","typography":{"vibe":"condensed bold sans","placement":"arched above and stacked below the hero","case":"UPPER"},"background":"flat mid-grey #808080, isolated artwork","mood":["nostalgic","confident"],"forbid":["gradients","photo-realism","thin hairlines"],"signature_moves":["a single teal accent per design","halftone only on the hero"]} render:
- Medium: screen-print style vector illustration.
- Linework: bold weight, uniform black outlines.
- Shading: two-tone halftone.
- Texture: light paper grain, no grunge on lettering.
- Palette: cream #F2E8D5 (dominant); rust #B5482A (secondary); teal #2F6F73 (accent); ink black #1C1C1C (outline) - use ONLY these colors plus the flat grey background, no other hues.
- Composition: centered badge, hero inside a circle, text arched above and stacked below.
- Typography: condensed bold sans, arched above and stacked below the hero, UPPER case - every on-design text line is set in this lettering style.
- Background: flat mid-grey #808080, isolated artwork.
- Mood: nostalgic, confident.
- Signature moves: a single teal accent per design, halftone only on the hero - at least one must be visibly present.
- NEGATIVE - never: gradients, photo-realism, thin hairlines; never any color outside the palette above, never shadows, halos, gradients, a garment, a mockup or a photo.

STYLE CARD JSON:
{{STYLE_CARD_JSON}}$body$, true),
  ('prompt_engine_system', 1, $body$You are a POD design prompt engine. You output ONE final image-generation prompt (a single dense paragraph) for a downstream image model that ALSO receives the STYLE REFERENCE image directly. Output ONLY the instruction - no preamble, no markdown, no quotes.

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

Output: ONE image-generation prompt as a single dense paragraph that follows the similarity policy at ~85% to the reference, carries the exact quote text exactly once, avoids every known defect above, on a solid flat neutral-grey background with no shadows. Then on a NEW final line output exactly: ASPECT: <ratio> - the tightest canvas that comfortably contains the design you just described, chosen ONLY from 1:1, 3:4, 4:3, 9:16, 16:9. Most tall stacked tee designs fit 3:4; only a genuinely very tall narrow stack fits 9:16; wide layouts fit 4:3; only a true wide banner strip fits 16:9; near-square art is 1:1. Pick the ratio that leaves the least empty grey around the design. Format strictly: that line contains ONLY the word ASPECT, a colon, one space, and the ratio - no punctuation, no asterisks, no extra words. Nothing else after that line.$body$, true),
  ('prompt_engine_user', 1, $body$NICHE: {{NICHE}}
TARGET SIMILARITY TO REFERENCE: 85% (follow the similarity policy in your instructions)
QUOTE / ON-DESIGN TEXT (render EXACTLY this, and NO other text): {{QUOTE}}
DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): {{DESIGN_INSTRUCTION}}
NOTES: {{NOTES}}

REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):
{{GEMINI_ANALYSIS_TEXT}}$body$, true),
  ('tier_rules', 1, $body${"1":"LOOSE INSPIRATION (~{{n}}%): use the reference ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic, leaning more on the NICHE for subject matter. It should feel like the same artist made a different design for the same audience.","2":"LOOSE INSPIRATION (~{{n}}%): use the reference ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic, leaning more on the NICHE for subject matter. It should feel like the same artist made a different design for the same audience.","3":"INSPIRED REMIX (~{{n}}%): keep the reference's hero concept, art technique, color palette family and overall vibe, but you MAY re-compose the layout, redraw the hero in the same style, and swap or simplify supporting elements. It should feel like a sibling design from the same collection - clearly related, not a copy.","4":"FAITHFUL RE-CREATION (~{{n}}%): reproduce the reference's overall composition, layout, structure, hero subject and how it is drawn, color palette, art technique/medium, texture, and overall vibe closely - the result must clearly read as the same design. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.","5":"NEAR-EXACT RE-CREATION ({{n}}%): reproduce the reference's composition, layout, structure, hero subject and exactly how it is drawn, every supporting element and its placement, the color palette, art technique, texture and overall vibe as close to identical as possible. The ONLY intentional change is the on-design text.","edit":"TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or \"improve\" anything that was not explicitly asked to change."}$body$, true),
  ('text_rules', 1, $body$TEXT - EXACT, NOTHING ELSE:
- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.
- State the quote once in quotation marks and once spelled out letter by letter so the image model cannot misspell it.
- Match the lettering style and weight to the reference's typography (adapt placement if the similarity policy allows re-composition).
- If no quote is provided, render no text at all.$body$, true),
  ('background_rule', 1, $body$BACKGROUND (keep it effortless - never let it affect the design):
- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.
- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.
- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.$body$, true),
  ('defects', 1, $body$KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):
- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.
- OVERALL DISTRESS: overall distress/texture is never heavier than the reference; when in doubt, use less.
- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.
- STRAIGHT BASELINES: if the reference text is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the reference clearly does.
- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.
- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.
- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the reference itself uses halftone, applied as an even, deliberate pattern.
- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.
- STYLE MATURITY: match the reference's rendering maturity - never drift more cartoonish or childish than the reference.$body$, true),
  ('qc_prompt', 1, $body$You are a strict print-on-demand quality inspector. Inspect the attached generated design image.

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
pass must be true ONLY if every single check is satisfied.$body$, true),
  ('corrective_suffix', 1, $body$

CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: {{ISSUES}}. The ONLY text in the image must read exactly: "{{EXPECTED_TEXT}}" - spelled letter for letter ({{EXPECTED_TEXT_SPACED}}) - with no other words, watermarks or signatures anywhere.$body$, true),
  ('distill_system', 1, $body$You maintain a small rulebook of design lessons for an AI print-on-demand design engine, learned from client rejection feedback. Cluster the feedback notes into general, reusable lessons. Each lesson: ONE sentence, soft client-preference phrasing (e.g. "The client prefers..." or "Avoid..."), actionable for an image-prompt writer, generalized (never mention a specific quote or one-off detail). scope is "global" unless the note is clearly specific to one niche. If a note matches an EXISTING lesson's meaning, do NOT duplicate it - instead report it in updates with that lesson id and its new absolute freq (existing freq + number of matching notes). Propose at most 5 new lessons per run. Return ONLY this JSON, no markdown: {"updates":[{"id":"<existing lesson id>","freq":3}],"new_lessons":[{"scope":"global","niche":null,"text":"..."}]}$body$, true),
  ('distill_user', 1, $body$EXISTING RULEBOOK:
- id:{{LESSON_ID}} [global] (freq 2) {{EXISTING_LESSON_TEXT}}

NEW REJECTION FEEDBACK:
- [{{NICHE}}] {{REJECTION_FEEDBACK}}$body$, true),
  ('placement_aspect', 1, $body${"front_chest":"1:1","full_front":"4:5","back":"4:5","pocket":"1:1","tote":"4:5","mug":"3:2"}$body$, true)
on conflict (slug, version) do update set body = excluded.body, active = excluded.active;

do $chk$
declare n int; bad text;
begin
  select count(*) into n from public.prompt_templates where version = 1 and active and slug in ('analysis_prompt', 'style_profiler', 'style_card_render', 'prompt_engine_system', 'prompt_engine_user', 'tier_rules', 'text_rules', 'background_rule', 'defects', 'qc_prompt', 'corrective_suffix', 'distill_system', 'distill_user', 'placement_aspect');
  if n <> 14 then raise exception 'prompt_templates v1: expected 14 active rows, found %', n; end if;
  perform body::jsonb from public.prompt_templates where slug in ('tier_rules', 'placement_aspect') and version = 1;
  select string_agg(slug, ', ') into bad from public.prompt_templates where version = 1 and (body !~ 'TEXT - EXACT' ) and slug = 'prompt_engine_system';
  if bad is not null then raise exception 'prompt_templates v1: system prompt lost its text rules (%)', bad; end if;
end $chk$;
