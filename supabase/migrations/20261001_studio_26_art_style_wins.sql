-- studio_26 · The Art style reference wins for its card (follows 20260930_studio_21_style_card_v2.sql).
-- WHAT WAS WRONG (live card 72354a02, 3 roled references): the Art style reference (slot 2) was effectively ignored.
-- The live analysis_prompt v2 described IMAGE 1 only; the prompt labelled Images 1-3 together as style/subject
-- references next to 3 client_look library images; tier_rules v1 said keep "the reference's" art technique and palette;
-- the locked Style Card said use ONLY its colours. The v8 design (studio_21 rows, not active yet) still put the Style
-- Card above the art-style reference.
-- USER DECISION (2026-10-01): when a card has an analysed ART STYLE reference, that card is drawn in that image's
-- medium, realism, linework, shading, texture, edge finish and palette; the Style Card fills in only what the image does
-- not show and its never-do list stays a hard negative; the similarity tier applies to the WHAT TO MAKE reference
-- (subject / composition) only, never to art technique; QC judges the look against the JSON it receives
-- (magic_prompt_json.effective_style from prompt-engine v8). Style-test cards keep the Style Card. Code side:
-- supabase/functions/prompt-engine (render.ts, index.ts), WF-2/WF-3 Build QC Request.
--
-- This migration rewrites three template rows IN PLACE. studio_21 inserted them INACTIVE and they were never
-- activated; nothing reads them until they are activated with their consumers (prompt-engine v8, WF-1 v3, WF-2/WF-3):
--   tier_rules v2      - the tiers address the WHAT TO MAKE reference for subject / composition only; art technique and
--                        colours come from the ART STYLE reference when one is attached, else from the Style Card.
--                        Same JSON keys 1..5 + edit, same tokens {{n}} / {{niche}}, the edit rule unchanged. Full body.
--   qc_prompt v2       - the style tail judges against "the style JSON below" (the Art style reference's look when its
--                        "source" is "art_reference", else the Style Card) instead of "the card". Sentence edits with
--                        replace(), every placeholder kept.
--   analysis_prompt v3 - one added sentence: the ART STYLE image fills every look key, realism and edge_finish never
--                        empty, palette = the artwork's colours only. Every placeholder kept.
-- GUARD: each row must exist, be inactive and never have been activated (activated_at and activated_by null) - else the
-- migration raises and changes nothing. No row is activated or deactivated here; one active row per slug is unchanged.
-- Re-runnable: tier_rules v2 is set to the same body again; a sentence edit already applied is skipped.
-- No secrets, keys or URLs appear in this file.

do $guard$
declare r record; t public.prompt_templates;
begin
  for r in select * from (values ('tier_rules', 2), ('qc_prompt', 2), ('analysis_prompt', 3)) v(slug, version) loop
    select * into t from public.prompt_templates where slug = r.slug and version = r.version;
    if not found then
      raise exception 'studio_26: template % v% is missing (apply studio_21 first)', r.slug, r.version;
    end if;
    if t.active or t.activated_at is not null or t.activated_by is not null then
      raise exception 'studio_26: template % v% is or was active - refusing to rewrite it in place; ship a new version instead', r.slug, r.version;
    end if;
  end loop;
end $guard$;

-- tier_rules v2 - full body (JSON keyed 1..5 + edit).
update public.prompt_templates
   set body = $tiers26${"1":"LOOSE INSPIRATION (~{{n}}%): use the WHAT TO MAKE reference (or the Style Card when none is attached) ONLY as a loose idea for the kind of subject, layout and mood. Create a NEW composition with new supporting elements - the SUBJECT block below names what to draw. The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference. It should feel like the same artist made a different design for the same audience ({{niche}}).","2":"LOOSE INSPIRATION (~{{n}}%): use the WHAT TO MAKE reference (or the Style Card when none is attached) ONLY as a loose idea for the kind of subject, layout and mood. Create a NEW composition with new supporting elements - the SUBJECT block below names what to draw. The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference. It should feel like the same artist made a different design for the same audience ({{niche}}).","3":"INSPIRED REMIX (~{{n}}%): keep the hero concept and overall vibe of the WHAT TO MAKE reference (or the Style Card when none is attached), but you MAY re-compose the layout, redraw the hero and swap or simplify supporting elements. The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference. It should feel like a sibling design from the same collection - clearly related, not a copy.","4":"FAITHFUL RE-CREATION (~{{n}}%): reproduce the overall composition, layout, structure, hero subject and its pose, and the supporting elements of the WHAT TO MAKE reference (or the Style Card when none is attached) closely - the result must clearly read as the same design. The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.","5":"NEAR-EXACT RE-CREATION ({{n}}%): reproduce the composition, layout, structure, hero subject and its exact pose, and every supporting element and its placement of the WHAT TO MAKE reference (or the Style Card when none is attached) as close to identical as possible. The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference. Apart from that look, the ONLY intentional change is the on-design text.","edit":"TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or \"improve\" anything that was not explicitly asked to change."}$tiers26$,
       consumer = 'Edge Function prompt-engine v8 (required). JSON keyed 1..5 + edit; the card similarity_tier picks the text. The tiers apply to the WHAT TO MAKE reference (subject / composition) only; art technique and colours come from the ART STYLE reference when attached, else the Style Card (studio_26). Placeholders n, tier and niche (v8 fills niche from clients.style_brief.niche, else "this client''s usual subject matter"). Activate after prompt-engine v8 is deployed; v1 stays active until then.'
 where slug = 'tier_rules' and version = 2 and not active and activated_at is null and activated_by is null;

-- qc_prompt v2 - the style tail judges against the style JSON it is given.
do $qc$
declare
  b text;
  e1_old constant text := $s$STYLE CARD (the client's locked look, JSON below) and EXPECTED SUBJECT:$s$;
  e1_new constant text := $s$STYLE (the look this design must have, JSON below: the Art style reference's look when its "source" is "art_reference", else the client's Style Card) and EXPECTED SUBJECT:$s$;
  e2_old constant text := $s$Add a key "style" judged against the card only, never against taste:$s$;
  e2_new constant text := $s$Add a key "style" judged against the style JSON below only, never against taste:$s$;
  e3_old constant text := $s$(drawn in the card's medium, linework and shading method)$s$;
  e3_new constant text := $s$(drawn in the medium, realism, linework, shading and texture of the style JSON below)$s$;
  e4_old constant text := $s$(letterform style and placement match the card's typography; letter case is NOT judged)$s$;
  e4_new constant text := $s$(letterform style and placement match the typography of the style JSON below; letter case is NOT judged)$s$;
  e5_old constant text := $s$(matches the card's composition; always true when it is a guide)$s$;
  e5_new constant text := $s$(matches the composition of the style JSON below; always true when it is a guide)$s$;
  pair text[];
begin
  select body into b from public.prompt_templates where slug = 'qc_prompt' and version = 2;
  foreach pair slice 1 in array array[[e1_old, e1_new], [e2_old, e2_new], [e3_old, e3_new], [e4_old, e4_new], [e5_old, e5_new]] loop
    if position(pair[2] in b) > 0 then continue; end if; -- already applied
    if position(pair[1] in b) = 0 then raise exception 'studio_26: qc_prompt v2 sentence not found: %', pair[1]; end if;
    b := replace(b, pair[1], pair[2]);
  end loop;
  update public.prompt_templates
     set body = b,
         consumer = 'WF-2 Studio Generate + WF-3 Studio Edit > Vision QC (Kie gemini-3.1-pro or the OpenRouter twin, JSON mode); result normalised by Edge Function qc-judge (the 9 checks plus style_match from the "style" key). Placeholders EXPECTED_TEXT, EXPECTED_SUBJECT (magic_prompt_json.subject.text), PALETTE_RULE (strict/flexible sentence, from effective_style.palette_mode when present), FORBID_LIST (numbered), STYLE_CARD_JSON (magic_prompt_json.effective_style when present - the Art style reference look with source art_reference - else the pruned Style Card). Activate together with the updated WF-2/WF-3 (R1); v1 stays active until then.'
   where slug = 'qc_prompt' and version = 2 and not active and activated_at is null and activated_by is null;
end $qc$;

-- analysis_prompt v3 - the ART STYLE image fills every look key.
do $an$
declare
  b text;
  anchor constant text := $s$If all images are the same artwork (mockups or angles of one design)$s$;
  added constant text := $s$The ART STYLE image (role art_style) decides how this design will be drawn, so fill every one of its keys from what you see: medium, realism, line_weight, line_style, shading, texture and edge_finish are never left empty - when realism or edge_finish is not obvious, give the closest value from its list - and palette lists every colour of the artwork itself (never the garment, mockup or photo background) as uppercase hex with a role.$s$;
begin
  select body into b from public.prompt_templates where slug = 'analysis_prompt' and version = 3;
  if position(added in b) > 0 then return; end if; -- already applied
  if position(anchor in b) = 0 then raise exception 'studio_26: analysis_prompt v3 anchor sentence not found'; end if;
  update public.prompt_templates
     set body = replace(b, anchor, added || chr(10) || anchor)
   where slug = 'analysis_prompt' and version = 3 and not active and activated_at is null and activated_by is null;
end $an$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Self-check: the migration refuses to finish half-applied.
-- ---------------------------------------------------------------------------------------------------------------------
do $chk$
declare r record; tiers jsonb; k text;
begin
  for r in select * from (values ('tier_rules', 2), ('qc_prompt', 2), ('analysis_prompt', 3)) v(slug, version) loop
    if not exists (select 1 from public.prompt_templates where slug = r.slug and version = r.version and not active and activated_at is null) then
      raise exception 'studio_26: template % v% is missing or active after the rewrite', r.slug, r.version;
    end if;
    if (select count(*) from public.prompt_templates where slug = r.slug and active) <> 1 then
      raise exception 'studio_26: slug % must keep exactly one active row', r.slug;
    end if;
  end loop;
  select body::jsonb into tiers from public.prompt_templates where slug = 'tier_rules' and version = 2;
  if not (tiers ?& array['1', '2', '3', '4', '5', 'edit']) then raise exception 'studio_26: tier_rules v2 is not JSON keyed 1..5 + edit'; end if;
  foreach k in array array['1', '2', '3', '4', '5'] loop
    if position('the WHAT TO MAKE reference (or the Style Card when none is attached)' in tiers->>k) = 0
       or position('come from the ART STYLE reference when one is attached, else from the Style Card' in tiers->>k) = 0
       or position('{{n}}' in tiers->>k) = 0 then
      raise exception 'studio_26: tier_rules v2 tier % lost the WHAT TO MAKE / ART STYLE wording or {{n}}', k;
    end if;
  end loop;
  if exists (select 1 from public.prompt_templates where slug = 'tier_rules' and version = 2 and position('NICHE' in body) > 0) then
    raise exception 'studio_26: tier_rules v2 contains the bare word NICHE';
  end if;
  if position('{{niche}}' in tiers->>'1') = 0 or position('the SUBJECT block below names what to draw' in tiers->>'1') = 0 then
    raise exception 'studio_26: tier_rules v2 tier 1 lost {{niche}} or the SUBJECT pointer';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and version = 2
                  and body like '%EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""%' and body like '%{{EXPECTED_SUBJECT}}%'
                  and body like '%{{PALETTE_RULE}}%' and body like '%{{FORBID_LIST}}%' and body like '%{{STYLE_CARD_JSON}}%'
                  and body like '%judged against the style JSON below only%' and body not like '%the card''s %') then
    raise exception 'studio_26: qc_prompt v2 lost a placeholder or still judges against "the card"';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'analysis_prompt' and version = 3
                  and body like '%{{SLOT_BLOCKS}}%' and body like '%{{BRIEF}}%' and body like '%{{TEXT_LINES}}%' and body like '%{{CLIENT_NAME}}%'
                  and body like '%"same_design"%' and body like '%realism or edge_finish is not obvious%') then
    raise exception 'studio_26: analysis_prompt v3 lost a placeholder or the ART STYLE sentence';
  end if;
end $chk$;
