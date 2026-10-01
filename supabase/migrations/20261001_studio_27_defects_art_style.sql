-- studio_27 · defects v2 measures the look against the ART STYLE reference (follows 20261001_studio_26_art_style_wins.sql).
-- WHAT WAS WRONG: defects v2 (studio_21, inactive, activated together with prompt-engine v8) measured overall distress,
-- halftone and rendering maturity against "the Style Card and the attached references". The print rules rank above the
-- ART STYLE reference in the v8 PRECEDENCE line, so on an art-reference card these lines pulled the design back to the
-- Style Card look (the Style Card look lines are not even rendered there): e.g. "Halftone dot shading ONLY where the Style
-- Card ... use halftone" next to an ART STYLE block whose shading is halftone, or "the rendering maturity of the Style
-- Card" next to a stylised screen-print reference.
-- USER DECISION (2026-10-01, "the Art style reference wins for its card"): the look - medium, linework, shading, texture,
-- edge finish, palette - comes from the ART STYLE reference when one is attached, else from the Style Card (tier_rules v2
-- as rewritten by studio_26 says the same). So:
--   OVERALL DISTRESS, NO STRAY DOTS (halftone) and STYLE MATURITY measure against "the look this design is drawn in - the
--   ART STYLE reference when one is attached, else the Style Card";
--   STRAIGHT BASELINES is about lettering, which never comes from the ART STYLE reference (its words are ignored): it
--   keeps "the Style Card and the attached references" and names the ART STYLE reference as the exception.
-- Sentence edits with replace() on the never-activated defects v2 row; nothing else in the body changes.
-- GUARD: the row must exist, be inactive and never have been activated (activated_at and activated_by null) - else the
-- migration raises and changes nothing. No row is activated or deactivated here; one active row per slug is unchanged.
-- Re-runnable: a sentence edit already applied is skipped. No INSERT. No secrets, keys or URLs appear in this file.

do $guard$
declare t public.prompt_templates;
begin
  select * into t from public.prompt_templates where slug = 'defects' and version = 2;
  if not found then
    raise exception 'studio_27: template defects v2 is missing (apply studio_21 first)';
  end if;
  if t.active or t.activated_at is not null or t.activated_by is not null then
    raise exception 'studio_27: template defects v2 is or was active - refusing to rewrite it in place; ship a new version instead';
  end if;
end $guard$;

do $defects27$
declare
  b text;
  d1_old constant text := $s$- OVERALL DISTRESS: overall distress/texture is never heavier than the Style Card and the attached references; when in doubt, use less.$s$;
  d1_new constant text := $s$- OVERALL DISTRESS: overall distress/texture is never heavier than in the look this design is drawn in - the ART STYLE reference when one is attached, else the Style Card; when in doubt, use less.$s$;
  d2_old constant text := $s$- STRAIGHT BASELINES: if the text in the Style Card and the attached references is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the Style Card and the attached references clearly do.$s$;
  d2_new constant text := $s$- STRAIGHT BASELINES: if the text in the Style Card and the attached references (never the ART STYLE reference - its words are ignored) is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the Style Card or those references clearly do.$s$;
  d3_old constant text := $s$Halftone dot shading ONLY where the Style Card and the attached references themselves use halftone, applied as an even, deliberate pattern.$s$;
  d3_new constant text := $s$Halftone dot shading ONLY where the look this design is drawn in uses halftone - the ART STYLE reference when one is attached, else the Style Card - applied as an even, deliberate pattern.$s$;
  d4_old constant text := $s$- STYLE MATURITY: match the rendering maturity of the Style Card and the attached references - never drift more cartoonish or childish than they are.$s$;
  d4_new constant text := $s$- STYLE MATURITY: match the rendering maturity of the look this design is drawn in - the ART STYLE reference when one is attached, else the Style Card - never drift more cartoonish or childish than it is.$s$;
  pair text[];
begin
  select body into b from public.prompt_templates where slug = 'defects' and version = 2;
  foreach pair slice 1 in array array[[d1_old, d1_new], [d2_old, d2_new], [d3_old, d3_new], [d4_old, d4_new]] loop
    if position(pair[2] in b) > 0 then continue; end if; -- already applied
    if position(pair[1] in b) = 0 then raise exception 'studio_27: defects v2 sentence not found: %', pair[1]; end if;
    b := replace(b, pair[1], pair[2]);
  end loop;
  update public.prompt_templates
     set body = b,
         consumer = 'Edge Function prompt-engine (required). Rendered into the print_rules block of magic_prompt_json after background_rule. v2 measures overall distress, halftone and rendering maturity against the look the design is drawn in - the ART STYLE reference when one is attached, else the Style Card (studio_27) - and baselines against the Style Card and the attached references, never the ART STYLE reference (its words are ignored). Activate with prompt-engine v8; v1 stays active until then.'
   where slug = 'defects' and version = 2 and not active and activated_at is null and activated_by is null;
end $defects27$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Self-check: the migration refuses to finish half-applied.
-- ---------------------------------------------------------------------------------------------------------------------
do $chk$
begin
  if not exists (select 1 from public.prompt_templates where slug = 'defects' and version = 2 and not active and activated_at is null) then
    raise exception 'studio_27: template defects v2 is missing or active after the rewrite';
  end if;
  if (select count(*) from public.prompt_templates where slug = 'defects' and active) <> 1 then
    raise exception 'studio_27: slug defects must keep exactly one active row';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'defects' and version = 2
                  and body like '%never heavier than in the look this design is drawn in - the ART STYLE reference when one is attached, else the Style Card;%'
                  and body like '%(never the ART STYLE reference - its words are ignored)%'
                  and body like '%Halftone dot shading ONLY where the look this design is drawn in uses halftone%'
                  and body like '%match the rendering maturity of the look this design is drawn in%'
                  and body not like '%themselves use halftone%'
                  and body not like '%maturity of the Style Card and the attached references%'
                  and body not like '%the reference%') then
    raise exception 'studio_27: defects v2 does not carry the ART STYLE wording (or says "the reference" again)';
  end if;
end $chk$;
