-- prompt_templates v1 fix for DM Studio (project voatrqhfsdfjomyajovi) - follows 20260924_prompt_templates_v1.sql.
--
-- WHAT WAS WRONG. WF-1 Intake (n8n/wf1-intake.sdk.js) reads the reference-analysis prompt from prompt_templates, sends it in
-- JSON mode (response_format json_object) and its Parse Analysis node - and prompt-engine render.ts readReference() - consume a
-- JSON object with keys art_style, palette[{name,hex}], subject_structure, typography_transcription, text_detected[],
-- composition, notes (generation-spec.md section 3 / section 4 WF-1). The v1 row 'analysis_prompt' (EXTRACT.md section 3.1,
-- verbatim) instead demands the T-Shirt Engine's plain-text 'STYLE: / TYPOGRAPHY_TEXT: / TYPOGRAPHY_STYLE:' structure and
-- speaks of IMAGE 1 (design) + IMAGE 2 (typography image), while the studio attaches 1-3 card references and no separate
-- typography image. WF-1 also requested a slug ('reference_analysis') that was never seeded.
--
-- DECISION (recorded here, mirrored in WF-1): keep ONE slug, 'analysis_prompt'. WF-1 now fetches 'analysis_prompt' and
-- renders {{NICHE}} (client name). Version 1 stays in the table as the untouched verbatim EXTRACT reference but is made
-- inactive; this version 2 becomes the active row. v2 keeps the analyst sentence, the IMPORTANT paragraph and the
-- description checklist of EXTRACT.md section 3.1 byte-for-byte, rewrites the IMAGE 1 / IMAGE 2 paragraph for 1-3 card
-- references, and replaces the return-structure paragraph with the JSON contract WF-1 and prompt-engine consume.
-- Belt and braces: WF-1 Parse Analysis still accepts a v1-style STYLE:/TYPOGRAPHY_TEXT: text reply and maps it to
-- {art_style, typography_transcription, text_detected}, so re-activating v1 degrades gracefully instead of failing.
--
-- The other two slug/placeholder mismatches found in review were fixed on the consumer side, NOT here, so the seeded
-- EXTRACT wording stays verbatim: WF-2 now requests 'corrective_suffix' (not 'corrective') and supplies
-- {{EXPECTED_TEXT_SPACED}} (EXPECTED_TEXT_SPELLED kept as an alias), trims the suffix's leading blank lines so exactly one
-- blank line separates the master prompt from CRITICAL CORRECTIONS, and produces the documented no-text variants for both
-- qc_prompt (whole EXPECTED line replaced) and corrective_suffix (tail replaced from '. The ONLY text in the image must
-- read exactly:'). WF-2 passes {{EXPECTED_TEXT}} as the bare joined lines; the template's own triple quotes wrap it once.
--
-- PLACEHOLDERS in analysis_prompt v2: {{NICHE}} client name / niche (WF-1 also substitutes CLIENT_NAME, BRIEF, TEXT_LINES,
-- IMAGE_COUNT, CLIENT_NOTES, GARMENT_COLORS when present). No secrets, keys or URLs with credentials appear in this file.

-- prompt_templates_one_active_idx allows one active row per slug: retire v1 BEFORE inserting the active v2.
update public.prompt_templates set active = false where slug = 'analysis_prompt' and version = 1;

insert into public.prompt_templates (slug, version, body, active) values
  ('analysis_prompt', 2, $body$You are a precise visual analyst for a "{{NICHE}}" print-on-demand design.

IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

IMAGE 1-3 are the references attached to this brief (IMAGE 1 is the DESIGN TO RE-CREATE; any further image is a supporting reference for the same design). Describe it in enough detail to reproduce it: overall composition and layout, the hero/central subject and exactly how it is drawn, every supporting element and its placement, the full color palette (name the key colors), the art technique/medium, the texture/shading method, and the lettering style. Be concrete and complete.

If the references carry any text, transcribe it EXACTLY, word for word, preserving line breaks and casing, and note its font style.

Fill the keys as follows: art_style = art technique/medium, texture/shading method and rendering maturity; palette = the key colors with the closest 6-digit uppercase hex; subject_structure = the hero subject, exactly how it is drawn, and every supporting element with its placement; typography_transcription = the lettering style (font description, or "" when there is no text); text_detected = every distinct text line transcribed exactly ([] when there is no text); composition = overall composition and layout; notes = anything else needed to reproduce it (mockup/angle/distortion you ignored, distress level, halftone use).

Return ONLY this JSON object - no markdown fences: {"art_style":"","palette":[{"name":"","hex":"#RRGGBB"}],"subject_structure":"","typography_transcription":"","text_detected":[],"composition":"","notes":""}$body$, true)
on conflict (slug, version) do update set body = excluded.body, active = excluded.active;

do $chk$
declare n int;
begin
  select count(*) into n from public.prompt_templates where slug = 'analysis_prompt' and active;
  if n <> 1 then raise exception 'prompt_templates fix: expected exactly one active analysis_prompt row, found %', n; end if;
  if not exists (select 1 from public.prompt_templates where slug = 'analysis_prompt' and version = 2 and active and body like '%"text_detected":[]%' and body like '%{{NICHE}}%') then
    raise exception 'prompt_templates fix: analysis_prompt v2 lost its JSON contract or NICHE placeholder';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'corrective_suffix' and active and body like '%{{EXPECTED_TEXT_SPACED}}%')
     or not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and active and body like '%EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""%') then
    raise exception 'prompt_templates fix: qc_prompt / corrective_suffix are no longer the verbatim EXTRACT rows WF-2 was aligned to';
  end if;
end $chk$;
