-- studio_25c · brief_parser v3 (follows 20261001_studio_25b_brief_parse_fix.sql).
-- WHAT WAS WRONG (live parse 2afa6b2c on the E2E client, v2):
--   1. The text described a farm shop ("We're Happy Hour Farm, a small family farm shop ... tees about our Highland cows")
--      but niche came back as the SAVED "vintage outdoor badges for hikers": rule 3 ("saved wording wins") was applied to
--      a niche the text contradicts. v3: for niche and audience the saved wording is reused only when the text describes
--      the SAME product line / buyers; a different one is returned from the text and the conflict becomes one note.
--   2. "handle at the bottom" landed in must_have. Where brand text sits is lettering placement, not a visual rule, and
--      the Style Card validator treats such entries as text demands. v3: placement of brand text goes to
--      typography_note; must_have never names brand text or its position.
-- v3 is v2 with exactly these sentence edits (applied with replace() below, each one checked), same 15 output keys,
-- same placeholders, so WF-8 needs no change. One active row per slug: retire v2 before v3 is written active.
-- Re-runnable. No secrets, keys or URLs appear in this file.

do $v3$
declare
  v2 text;
  v3 text;
  r3_old constant text := 'The same holds for niche, audience and typography_note when the text says what the saved value says.';
  r3_new constant text := 'For audience and typography_note the same holds when the text says what the saved value says. For niche and audience, when the text describes a DIFFERENT product line or different buyers than the saved value, return the text''s version (never the saved one) and add one notes_for_designer entry naming both, for example "Text describes a farm shop; saved niche says vintage outdoor badges".';
  r4_old constant text := 'Brand text goes in brand_text; where it must sit is a must_have entry without the text itself (for example "handle at the bottom").';
  r4_new constant text := 'Brand text goes in brand_text; where it must sit (for example "handle at the bottom") goes in typography_note, never in must_have.';
  ty_old constant text := 'Lettering only, never colours, layout or subjects.';
  ty_new constant text := 'Also where recurring brand text sits on the design (for example "handle centred at the bottom"). Lettering only, never colours, artwork layout or subjects.';
  mh_old constant text := 'Not subjects, not brand text, not lettering (those have their own fields) and not business wishes.';
  mh_new constant text := 'Not subjects, not brand text or where it sits, not lettering (those have their own fields) and not business wishes.';
begin
  select body into v2 from public.prompt_templates where slug = 'brief_parser' and version = 2;
  if v2 is null then raise exception 'studio_25c - brief_parser v2 is missing (apply studio_25b first)'; end if;
  if exists (select 1 from public.prompt_templates where slug = 'brief_parser' and version = 3) then
    return; -- already applied
  end if;
  if position(r3_old in v2) = 0 then raise exception 'studio_25c - rule 3 sentence not found in v2'; end if;
  if position(r4_old in v2) = 0 then raise exception 'studio_25c - rule 4 sentence not found in v2'; end if;
  if position(ty_old in v2) = 0 then raise exception 'studio_25c - typography_note sentence not found in v2'; end if;
  if position(mh_old in v2) = 0 then raise exception 'studio_25c - must_have sentence not found in v2'; end if;
  v3 := replace(replace(replace(replace(v2, r3_old, r3_new), r4_old, r4_new), ty_old, ty_new), mh_old, mh_new);

  update public.prompt_templates set active = false where slug = 'brief_parser' and active;
  insert into public.prompt_templates (slug, version, body, active, activated_at, consumer)
  select 'brief_parser', 3, v3, true, now(),
         replace(consumer, 'v2 (studio_25b)', 'v3 (studio_25c): a niche/audience the text contradicts is taken from the text with a conflict note; brand-text placement goes to typography_note. v2 (studio_25b)')
    from public.prompt_templates where slug = 'brief_parser' and version = 2;
end $v3$;

do $chk$
declare n int; b text;
begin
  select count(*) into n from public.prompt_templates where slug = 'brief_parser' and active;
  if n <> 1 then raise exception 'studio_25c - expected exactly one active brief_parser row, found %', n; end if;
  select body into b from public.prompt_templates where slug = 'brief_parser' and version = 3 and active;
  if b is null then raise exception 'studio_25c - brief_parser v3 is missing or not the active row'; end if;
  if b not like '%{{CLIENT_NAME}}%' or b not like '%{{EXISTING_BRIEF}}%' or b not like '%{{BRIEF_TEXT}}%' then
    raise exception 'studio_25c - brief_parser v3 lacks a placeholder';
  end if;
  if b like '%where it must sit is a must_have entry%' then raise exception 'studio_25c - old rule 4 still present'; end if;
  if b not like '%DIFFERENT product line%' then raise exception 'studio_25c - niche conflict rule missing'; end if;
end $chk$;
