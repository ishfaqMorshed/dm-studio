-- studio_28 · QC sees the Art style reference (follows 20261001_studio_27_defects_art_style.sql).
-- WHAT WAS MISSING: since studio_26 ("the Art style reference wins for its card") prompt-engine v8 draws an art-reference
-- card in that image's look and WF-2/WF-3 hand QC the look as text (magic_prompt_json.effective_style). The vision QC call
-- sees ONLY the generated image, never the Art style reference, so "drawn in the reference's style" was judged from text at
-- best - and not at all for a value-less override (stamped art_style slot but no per-slot reading, e.g. live card
-- 72354a02: effective_style.source art_reference with an empty look, palette / medium not judged).
-- USER REQUEST (2026-10-02): "at the same time we maybe need the qc to understand that as well".
-- DECISION: WF-2 attaches the signed Art style reference (effective_style.reference_path, signed by Sign Input) as the
-- SECOND image of the vision QC call and fills {{ART_REFERENCE_ATTACHED}} with yes / no (WF-3 edits always no - an edit is
-- judged against its previous version). The judge then adds style.art_match; qc-judge v2.2 turns it into the style_match
-- check 'art_style' and regenerates once when overall is 'different' and settings.qc_art_regen is on.
-- This migration:
--   1. appends one paragraph to qc_prompt v2 (in place; the row was inserted INACTIVE by studio_21, edited by studio_26
--      and never activated). Every existing placeholder stays; the new one is {{ART_REFERENCE_ATTACHED}}.
--   2. adds settings.qc_art_regen boolean not null default true.
-- GUARD: qc_prompt v2 must exist, be inactive and never have been activated (activated_at and activated_by null) - else
-- the migration raises and changes nothing. No row is activated or deactivated here; one active row per slug is unchanged.
-- Re-runnable: the paragraph is appended once (skipped when present); the column is added if missing. No INSERT.
-- No secrets, keys or URLs appear in this file.

do $guard$
declare t public.prompt_templates;
begin
  select * into t from public.prompt_templates where slug = 'qc_prompt' and version = 2;
  if not found then
    raise exception 'studio_28: template qc_prompt v2 is missing (apply studio_21 first)';
  end if;
  if t.active or t.activated_at is not null or t.activated_by is not null then
    raise exception 'studio_28: template qc_prompt v2 is or was active - refusing to rewrite it in place; ship a new version instead';
  end if;
end $guard$;

-- 1. qc_prompt v2 - the Art style reference paragraph (appended after {{STYLE_CARD_JSON}}, one blank line between)
do $qc28$
declare
  b text;
  art_tail constant text := $s$ART STYLE REFERENCE ATTACHED: {{ART_REFERENCE_ATTACHED}}.
When yes, TWO images are attached: the FIRST is the generated design, the SECOND is the client's Art style reference for this design. The 9 checks, "text_found", "issues" and every other "style" key judge the FIRST image only - never take text, a subject or colours for them from the SECOND image. Compare the two ONLY for how the design is drawn - medium, linework weight and style, shading method, texture and distress, edge finish, colour palette - never its subject, layout or words, and add to "style" the key "art_match": {"medium_ok":true|false,"linework_ok":true|false (line weight, line style and edge finish),"shading_ok":true|false (shading method),"texture_ok":true|false (texture and distress),"palette_ok":true|false (the FIRST image uses the colour palette of the SECOND),"overall":"same|close|different" (different = a viewer would say the FIRST image is drawn in another style than the SECOND),"notes":"25 words or fewer naming what differs, empty when nothing does"}. art_match never changes "pass" or the 9 checks.
When no, only the generated design is attached: omit "art_match".$s$;
begin
  select body into b from public.prompt_templates where slug = 'qc_prompt' and version = 2;
  if position(art_tail in b) > 0 then return; end if; -- already applied
  if position('{{ART_REFERENCE_ATTACHED}}' in b) > 0 then
    raise exception 'studio_28: qc_prompt v2 already carries ART_REFERENCE_ATTACHED in other wording - refusing to append a second paragraph';
  end if;
  if right(b, length('{{STYLE_CARD_JSON}}')) <> '{{STYLE_CARD_JSON}}' then
    raise exception 'studio_28: qc_prompt v2 no longer ends with the STYLE_CARD_JSON placeholder - review the body before appending';
  end if;
  update public.prompt_templates
     set body = b || chr(10) || chr(10) || art_tail,
         consumer = 'WF-2 Studio Generate + WF-3 Studio Edit > Vision QC (Kie gemini-3.1-pro or the OpenRouter twin, JSON mode); result normalised by Edge Function qc-judge (the 9 checks plus style_match from the "style" key; style.art_match -> the art_style check, studio_28). Placeholders EXPECTED_TEXT, EXPECTED_SUBJECT (magic_prompt_json.subject.text), PALETTE_RULE (strict/flexible sentence, from effective_style.palette_mode when present), FORBID_LIST (numbered), STYLE_CARD_JSON (magic_prompt_json.effective_style when present - the Art style reference look with source art_reference - else the pruned Style Card), ART_REFERENCE_ATTACHED (yes when WF-2 attached the signed Art style reference, effective_style.reference_path, as the SECOND image; no otherwise and always in WF-3). Activate together with the updated WF-2/WF-3 (R1); v1 stays active until then.'
   where slug = 'qc_prompt' and version = 2 and not active and activated_at is null and activated_by is null;
end $qc28$;

-- 2. settings.qc_art_regen - the one corrective retry for a design drawn in another style than its Art style reference
alter table public.settings add column if not exists qc_art_regen boolean not null default true;
comment on column public.settings.qc_art_regen is
  'qc-judge: one corrective retry when QC sees the design drawn in a different style than the attached Art style reference (WF-2 attached it as the second QC image and the judge reports style.art_match.overall = different). Attempt 2 never retries; close never retries. About $0.08 per retry.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Self-check: the migration refuses to finish half-applied.
-- ---------------------------------------------------------------------------------------------------------------------
do $chk$
begin
  if not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and version = 2 and not active and activated_at is null and activated_by is null) then
    raise exception 'studio_28: template qc_prompt v2 is missing or active after the rewrite';
  end if;
  if (select count(*) from public.prompt_templates where slug = 'qc_prompt' and active) <> 1 then
    raise exception 'studio_28: slug qc_prompt must keep exactly one active row';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and version = 2
                  and body like '%EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""%' and body like '%{{EXPECTED_SUBJECT}}%'
                  and body like '%{{PALETTE_RULE}}%' and body like '%{{FORBID_LIST}}%' and body like '%{{STYLE_CARD_JSON}}%'
                  and body like '%judged against the style JSON below only%'
                  and body like '%ART STYLE REFERENCE ATTACHED: {{ART_REFERENCE_ATTACHED}}.%'
                  and body like '%add to "style" the key "art_match"%'
                  and body like '%"overall":"same|close|different"%'
                  and body like '%When no, only the generated design is attached: omit "art_match".'
                  and body not like '%the card''s %') then
    raise exception 'studio_28: qc_prompt v2 lost a placeholder or lacks the ART STYLE REFERENCE paragraph';
  end if;
  if (select count(*) from regexp_matches((select body from public.prompt_templates where slug = 'qc_prompt' and version = 2), 'ART_REFERENCE_ATTACHED', 'g')) <> 1 then
    raise exception 'studio_28: qc_prompt v2 must carry the ART_REFERENCE_ATTACHED placeholder exactly once';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settings'
                  and column_name = 'qc_art_regen' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'true') then
    raise exception 'studio_28: settings.qc_art_regen is missing or not boolean not null default true';
  end if;
end $chk$;
