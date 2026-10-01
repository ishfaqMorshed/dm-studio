-- studio_21 · Style Card v2 - reference roles, brief gate, additive Style Card JSON v2, per-slot reference analysis,
-- two-pass profiler and Style-Card-aware QC. Spec: docs/stylecard-v2-spec.md sections 1.1, 1.2, 1.3 (docs) and 1.4.
--
-- SHIP ORDER (spec R1 and "Order"): this file first -> prompt-engine v8 deployed -> WF-1b / WF-1 / WF-2+3 published ->
-- ONLY THEN the new template versions are activated, each in the same step as its consumer, e.g.
--   update public.prompt_templates set active = (version = 3) where slug = 'style_profiler';
-- Every prompt_templates row below is inserted INACTIVE and nothing is deactivated: the currently active rows keep
-- serving the live workflows and prompt-engine v7, and the unique index prompt_templates_one_active_idx (one active row
-- per slug) is never touched. The token replacer leaves unknown {{TOKENS}} literal, so activating a v3/v2 row before its
-- consumer knows the new tokens would leak them into a prompt.
--
-- Re-runnable: columns are "if not exists", template rows are guarded by "not exists", functions are create or replace
-- (create_card_as_designer changes signature, so its old overload is dropped "if exists" and the new one is created or
-- replaced, then its grants are restated), the trigger is dropped "if exists" before it is created.
-- No secrets, keys or URLs with credentials appear in this file.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1.1 Columns
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.settings add column if not exists reference_roles jsonb not null default '["subject","art_style","typography"]'::jsonb;
comment on column public.settings.reference_roles is
  'Ordered roles of the brief reference slots: subject = What to make (hero, layout), art_style = Art style, typography = Lettering. Stamped onto cards.reference_roles by submit_brief / create_card_as_designer, read by WF-1 (SLOT_BLOCKS) and the forms (labels). Swapping the order is one UPDATE, no deploy.';

alter table public.settings add column if not exists qc_subject_regen boolean not null default true;
comment on column public.settings.qc_subject_regen is
  'qc-judge: when true and the generation has an explicit expected subject, a judge verdict style.subject_ok = false sets needs_regen (one automatic attempt 2 that draws the subject, not the thing the text names).';

alter table public.cards add column if not exists reference_roles text[];
comment on column public.cards.reference_roles is
  'Role per reference_paths slot (subject | art_style | typography), same length and order as reference_paths. null = legacy card without roles: prompt-engine treats every reference as style_reference and WF-1 falls back to settings.reference_roles.';

alter table public.client_references add column if not exists meta jsonb not null default '{}'::jsonb;
comment on column public.client_references.meta is
  'Library image tags for the profiler: {kind: design|mockup|draft, garment: text, best_for: [lettering|linework|palette|layout], outlier: bool}. WF-1b renders them into REFERENCE_NOTES; an outlier sheet is excluded from agreement.';

alter table public.style_draft_requests add column if not exists raw jsonb;
comment on column public.style_draft_requests.raw is
  'WF-1b working data kept for audit and re-runs: {sheets (Pass A per-image sheets), card (the checked Style Card), validation, template_versions}. sheets are kept when Pass B fails so a re-run costs only Pass B.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 1.2 RPCs
-- ---------------------------------------------------------------------------------------------------------------------

-- The settings order, cut to the number of attached references. One place validates the settings value so that both
-- card-creating RPCs (and the step-4 test card, later) stamp the same roles.
create or replace function public.default_reference_roles(p_count int)
 returns text[]
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare roles text[];
begin
  if coalesce(p_count, 0) < 1 then return null; end if;
  select array_agg(e.value order by e.ord) into roles
    from public.settings s
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(s.reference_roles) = 'array' then s.reference_roles else '[]'::jsonb end) with ordinality as e(value, ord)
   where s.id = 1 and e.ord <= p_count;
  if coalesce(array_length(roles, 1), 0) <> p_count then
    raise exception 'settings.reference_roles must list at least % roles (subject, art_style, typography)', p_count;
  end if;
  if exists (select 1 from unnest(roles) r where r not in ('subject', 'art_style', 'typography')) then
    raise exception 'settings.reference_roles contains an unknown role (allowed subject, art_style, typography)';
  end if;
  return roles;
end $function$;

revoke all on function public.default_reference_roles(int) from public, anon;
grant execute on function public.default_reference_roles(int) to authenticated, service_role;

-- submit_brief: unchanged validation; the new card and its client_submission carry the settings roles.
-- Same signature as the live function, so create or replace keeps the owner and the anon/authenticated grants.
create or replace function public.submit_brief(p_token text, p_card_id uuid, p_brief text, p_print_text jsonb, p_reference_paths text[], p_garment_color text, p_placement text, p_due_on date default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare cid uuid; n int; uploaded int; roles text[];
begin
  select id into cid from public.clients where form_token = p_token and active;
  if cid is null then raise exception 'invalid or expired form link' using errcode = '42501'; end if;
  if not exists (select 1 from private.upload_grants where card_id = p_card_id and client_id = cid and expires_at > now() - interval '1 hour') then
    raise exception 'upload session expired; reload the form' using errcode = '42501';
  end if;
  select count(*) into n from public.cards where client_id = cid and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'daily submission limit reached for this client'; end if;
  if coalesce(array_length(p_reference_paths, 1), 0) <> 3 then raise exception 'exactly 3 reference images are required'; end if;
  if length(coalesce(p_brief, '')) = 0 or length(p_brief) > 400 then raise exception 'description must be 1 to 400 characters'; end if;
  if exists (select 1 from unnest(p_reference_paths) p where p not like cid::text || '/' || p_card_id::text || '/%') then
    raise exception 'reference paths must belong to this card';
  end if;
  select count(*) into uploaded from storage.objects where bucket_id = 'refs' and name = any(p_reference_paths);
  if uploaded <> 3 and coalesce(current_setting('studio.skip_upload_check', true), '') <> '1' then
    raise exception 'all 3 reference images must be uploaded before submitting (% found)', uploaded;
  end if;
  -- the three public-form slots carry the settings roles, in slot order (default subject, art_style, typography)
  roles := public.default_reference_roles(array_length(p_reference_paths, 1));
  insert into public.cards (id, client_id, stage, brief_text, print_text, reference_paths, reference_roles, garment_color, placement, due_on, client_submission)
  values (p_card_id, cid, 'intake', p_brief, coalesce(p_print_text, '[]'::jsonb), p_reference_paths, roles, p_garment_color, p_placement, p_due_on,
          jsonb_build_object('brief_text', p_brief, 'print_text', p_print_text, 'reference_paths', p_reference_paths, 'reference_roles', to_jsonb(roles),
                             'garment_color', p_garment_color, 'placement', p_placement, 'due_on', p_due_on, 'submitted_at', now()));
  delete from private.upload_grants where card_id = p_card_id;
  return p_card_id;
end $function$;

-- create_card_as_designer: new trailing argument p_reference_roles (null = the first k settings roles, k = number of paths).
-- The signature changes, so the old 10-argument overload is dropped and the grants are restated (live ACL: authenticated,
-- service_role). "create or replace" keeps the file re-runnable: on a second apply the drop is a no-op and the 11-argument
-- function is replaced in place instead of failing with 42723 (function already exists with same argument types).
drop function if exists public.create_card_as_designer(uuid, uuid, text, jsonb, text[], text, text, date, text, integer);
create or replace function public.create_card_as_designer(
  p_card_id uuid, p_client_id uuid, p_brief text, p_print_text jsonb, p_reference_paths text[], p_garment_color text, p_placement text,
  p_due_on date default null, p_avoid_notes text default null, p_similarity_tier integer default null, p_reference_roles text[] default null)
 returns public.cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.cards; uploaded int; k int; roles text[];
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.clients where id = p_client_id and active) then raise exception 'client not found or inactive'; end if;
  k := coalesce(array_length(p_reference_paths, 1), 0);
  if k not between 1 and 3 then raise exception 'provide 1 to 3 reference images'; end if;
  if length(coalesce(p_brief, '')) = 0 then raise exception 'description is required'; end if;
  if exists (select 1 from unnest(p_reference_paths) p where p not like p_client_id::text || '/' || p_card_id::text || '/%') then
    raise exception 'reference paths must belong to this card';
  end if;
  select count(*) into uploaded from storage.objects where bucket_id = 'refs' and name = any(p_reference_paths);
  if uploaded <> k then raise exception 'reference images are not uploaded yet'; end if;
  -- roles: the designer's (one per attached image), else the first k roles of the settings order
  if p_reference_roles is null then
    roles := public.default_reference_roles(k);
  else
    if coalesce(array_length(p_reference_roles, 1), 0) <> k then
      raise exception 'reference_roles must have one role per reference image (% roles for % images)', coalesce(array_length(p_reference_roles, 1), 0), k;
    end if;
    if exists (select 1 from unnest(p_reference_roles) r where r is null or r not in ('subject', 'art_style', 'typography')) then
      raise exception 'reference_roles values must be subject, art_style or typography';
    end if;
    roles := p_reference_roles;
  end if;
  insert into public.cards (id, client_id, stage, source, brief_text, print_text, reference_paths, reference_roles, garment_color, placement, due_on, avoid_notes, similarity_tier, client_submission)
  values (p_card_id, p_client_id, 'intake', 'designer', p_brief, coalesce(p_print_text, '[]'::jsonb), p_reference_paths, roles, p_garment_color, p_placement, p_due_on, p_avoid_notes, p_similarity_tier,
          jsonb_build_object('source', 'designer', 'created_by', auth.uid(), 'brief_text', p_brief, 'print_text', p_print_text,
                             'reference_paths', p_reference_paths, 'reference_roles', to_jsonb(roles), 'submitted_at', now()))
  returning * into c;
  return c;
end $function$;

revoke all on function public.create_card_as_designer(uuid, uuid, text, jsonb, text[], text, text, date, text, integer, text[]) from public, anon;
grant execute on function public.create_card_as_designer(uuid, uuid, text, jsonb, text[], text, text, date, text, integer, text[]) to authenticated, service_role;

-- save_onboarding_brief: the brief gains subjects[], brand_text[] (arrays of strings) and typography_note (text).
-- A JSON null counts as "not given" (the same as an absent key). Same signature, create or replace keeps the grants.
create or replace function public.save_onboarding_brief(
  p_client_id uuid, p_style_brief jsonb, p_default_similarity_tier int default null,
  p_garment_colors text[] default null, p_notes text default null)
 returns public.clients
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.clients; k text;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_style_brief) <> 'object' then raise exception 'style_brief must be an object'; end if;
  if p_style_brief->>'palette_mode' is not null and p_style_brief->>'palette_mode' not in ('strict', 'flexible') then
    raise exception 'palette_mode must be strict or flexible';
  end if;
  if p_style_brief->>'text_case' is not null and p_style_brief->>'text_case' not in ('as_typed', 'upper', 'title') then
    raise exception 'text_case must be as_typed, upper or title';
  end if;
  foreach k in array array['subjects', 'brand_text'] loop
    if p_style_brief ? k and jsonb_typeof(p_style_brief->k) <> 'null' and (
         jsonb_typeof(p_style_brief->k) <> 'array'
         or exists (select 1 from jsonb_array_elements(p_style_brief->k) e where jsonb_typeof(e) <> 'string')) then
      raise exception '% must be an array of strings', k;
    end if;
  end loop;
  if p_style_brief ? 'typography_note' and jsonb_typeof(p_style_brief->'typography_note') not in ('null', 'string') then
    raise exception 'typography_note must be text';
  end if;
  if p_default_similarity_tier is not null and p_default_similarity_tier not between 1 and 5 then
    raise exception 'default_similarity_tier must be 1..5';
  end if;
  update public.clients
     set style_brief = p_style_brief,
         default_similarity_tier = coalesce(p_default_similarity_tier, default_similarity_tier),
         garment_colors = coalesce(p_garment_colors, garment_colors),
         notes = coalesce(p_notes, notes)
   where id = p_client_id
   returning * into c;
  if not found then raise exception 'client not found'; end if;
  return c;
end $function$;

comment on column public.clients.style_brief is
  'Onboarding brief: {niche, audience, subjects: [text], brand_text: [text], typography_note, palette_mode: strict|flexible, text_case: as_typed|upper|title, must_have: [], avoid: [], lock_typography: bool, lock_composition: bool}. niche, one subject and one garment colour are required before a Style Card draft can be requested (trigger style_draft_requests_require_brief).';

-- Brief gate: no Style Card draft without a written brief. Server-side backstop for the wizard Analyse button and the
-- client-panel Draft button; WF-1 Request Style Draft continues on this error (spec 2.2). security definer like
-- style_draft_notify so the worker role's RLS on clients cannot hide the row and misfire the gate.
create or replace function public.style_draft_requests_require_brief()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cl public.clients; n_subjects int := 0;
begin
  select * into cl from public.clients where id = new.client_id;
  if not found then return new; end if;  -- the foreign key reports a missing client
  if jsonb_typeof(cl.style_brief->'subjects') = 'array' then
    select count(*) into n_subjects from jsonb_array_elements(cl.style_brief->'subjects') e
     where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') <> '';
  end if;
  if nullif(btrim(coalesce(cl.style_brief->>'niche', '')), '') is null
     or n_subjects < 1
     or coalesce(array_length(cl.garment_colors, 1), 0) < 1 then
    raise exception 'write the onboarding brief first - niche, at least one subject and one garment colour are required';
  end if;
  return new;
end $function$;

drop trigger if exists style_draft_requests_require_brief on public.style_draft_requests;
create trigger style_draft_requests_require_brief before insert on public.style_draft_requests
  for each row execute function public.style_draft_requests_require_brief();

-- style_cards: no change (json is jsonb; the v2 keys are additive).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1.4 prompt_templates rows - ALL INACTIVE. Each versioned row is built from its previous version with the
-- jsonb_populate_record pattern of studio_18 (so it inherits every column the table may gain later) and overrides id,
-- version, active=false, activated_by/at=null, created_at, body and consumer. style_sheet is a new slug (plain insert).
-- ---------------------------------------------------------------------------------------------------------------------

-- style_sheet v1 - WF-1b Pass A: one fixed-vocabulary sheet per library image (makes agreement computable).
insert into public.prompt_templates (slug, version, body, active, consumer)
select 'style_sheet', 1, $sheet$Attached are {{IMAGE_COUNT}} past designs of one print-on-demand client, IMAGE 1 .. IMAGE {{IMAGE_COUNT}} in the order attached. Describe EACH image separately as flat printed artwork (ignore garment, body, folds, glare, perspective, app UI). Where a list of allowed values is given use ONLY one of them; free-text fields have the word limit shown. Transcribe every word you see exactly.
Per-image notes from the studio (garment, mockup, outlier):
{{REFERENCE_NOTES}}
Return ONLY {"sheets":[...]} with exactly one object per image, in order, no markdown fences:
{"image":1,"quality":"clean|draft|mockup|screenshot|low_res","garment_seen":"black|white|heather|navy|tan|other|none","colorway":"dark_garment|light_garment|unknown","medium":"<=8 words","realism":"iconic|stylised|detailed|realistic","line_weight":"none|hairline|fine|medium|bold|heavy","line_style":"<=8 words","outline":"none|thin|thick|keyline","shading":"none|flat|hatching|stipple|halftone|cel|painterly|gradient","texture":"<=6 words","edge_finish":"clean|rough|distressed|stamped","layout":"stacked|badge|arched_lockup|split_panel|scene|text_only|other","hero":{"subject":"<=6 words","framing":"chest_up|full_figure|head_only|scene|object|none","scale":"small|medium|large|fills"},"supporting_elements":["<=4 words"],"swatches":[{"hex":"#RRGGBB","role":"line|fill|text|disc|accent","area":"dominant|secondary|accent"}],"text":[{"text":"exact transcription","role":"headline|sub|handle|est|tagline|brand|other","family":"slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other","weight":"light|regular|bold|black","case":"UPPER|lower|Title|Mixed","effects":["arched","inline_hatching","outline","banner","drop_line","distressed"],"placement":"above_hero|below_hero|on_hero|bottom_margin|inside_badge|none"}],"mood":["<=2 words"],"off_style":false}$sheet$,
  false,
  'WF-1b Studio Style Draft > Describe Designs, Pass A (all library images in ONE vision call; Kie gemini-3.1-pro or the OpenRouter twin, JSON mode) - returns {sheets:[one per image]} that Pass B (style_profiler v3) and the validator (style-card-check agreement, palette snap) consume. Placeholders IMAGE_COUNT, REFERENCE_NOTES. Activate together with the new WF-1b (R1).'
where not exists (select 1 from public.prompt_templates where slug = 'style_sheet' and version = 1);

-- style_profiler v3 - WF-1b Pass B: brief-first Style Card v2 with fixed vocabularies and per-image sheets as evidence.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 3, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'WF-1b Studio Style Draft > Profile Style, Pass B (library images + the Pass A sheets; Kie gemini-3.1-pro or the OpenRouter twin, JSON mode) - returns Style Card JSON v2 (schema 2), checked by Edge Function style-card-check before it is stored. WF-1b only: the WF-1 fallback draft from card references is retired. Placeholders IMAGE_COUNT, CLIENT_NAME, NICHE, SUBJECTS, BRAND_TEXT, GARMENT_COLORS, CLIENT_NOTES, MUST_HAVE, AVOID, TYPOGRAPHY_NOTE, PALETTE_MODE, TEXT_CASE, LOCK_TYPOGRAPHY, LOCK_COMPOSITION, REFERENCE_NOTES, SHEETS_JSON. Activate together with the new WF-1b (R1); v2 stays active until then.',
           'body', $profiler$You are a precise visual analyst building the STYLE CARD for one print-on-demand client. Attached are {{IMAGE_COUNT}} of this client's PAST DESIGNS, numbered in the order attached (IMAGE 1 .. IMAGE {{IMAGE_COUNT}}). Describe the client's recurring visual identity - the look that makes every design recognisable - NOT any single design.

IMPORTANT: an image may be a rough draft, a shirt mockup, worn, angled, folded, a screenshot or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare and app UI.

CLIENT BRIEF from the studio. The brief is ground truth for WHAT the client makes (subjects), the brand text, the garments and the rules; the images are ground truth for HOW things are drawn.
- Client: {{CLIENT_NAME}}. Niche / audience: {{NICHE}}
- Subjects the client sells designs about: {{SUBJECTS}}
- Brand text that recurs on designs (a handle, an EST. line, a tagline): {{BRAND_TEXT}}
- Garments the client prints on: {{GARMENT_COLORS}}
- Notes: {{CLIENT_NOTES}}
- Must-have signature moves: {{MUST_HAVE}}
- Never do: {{AVOID}}
- Typography note: {{TYPOGRAPHY_NOTE}}
- Studio rules, for your information only - NEVER write these words into any field: palette {{PALETTE_MODE}}, text case {{TEXT_CASE}}, typography {{LOCK_TYPOGRAPHY}}, composition {{LOCK_COMPOSITION}}.
Per-image notes from the studio:
{{REFERENCE_NOTES}}

PER-IMAGE SHEETS - a first pass already described each image with a fixed vocabulary. Use them as your evidence and cite their IMAGE numbers:
{{SHEETS_JSON}}

RULES
1. A claim enters the card only when it holds for the MAJORITY of images whose sheet is not off_style and whose quality is clean or draft; record every exception in evidence.
2. subjects = every brief subject first, in the client's words, then the recurring subjects you see. Never drop a brief subject because the images lack it. Fill subject_sources with brief, images or both for each entry.
3. Brand text is TEXT, not style. Put every recurring handle, EST. line, brand name or tagline into brand_text.items with its usual placement and NOWHERE else. composition, typography, signature_moves and forbid describe only what is DRAWN. A forbid entry names a visual thing that must never appear - never something that must be present.
4. Vocabulary: linework.weight is exactly one of none|hairline|fine|medium|bold|heavy; shading_method one of none|flat|hatching|stipple|halftone|cel|painterly; edge_finish one of clean|rough|distressed|stamped; realism one of iconic|stylised|detailed|realistic; typography.case is the case the images actually use: UPPER|lower|Title|Mixed; lettering family one of slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other.
5. Lengths: medium, shading, texture and linework.style at most 12 words; composition at most 40 words, naming no subject (write "the hero") and no words from the designs; each forbid and signature move at most 10 words; no trailing periods anywhere.
6. Colours: 3 to 8 palette entries, hex as #RRGGBB uppercase, exactly one dominant listed first, each with a role (line|fill|text|disc|accent|highlight) and the IMAGE numbers it appears in. When the images split into colourways (for example white ink on dark garments and full colour on light garments) add one palette_variants entry per garment side.
7. must_have: fold an item into signature_moves ONLY when you see it in at least two images; list the others under brief_check.must_have_not_seen verbatim. Never write an avoid item into evidence unless you saw it - then cite it under brief_check.avoid_seen_in.
8. For every field you fill, list in field_evidence the IMAGE numbers that support it and those that contradict it. representative_images = the 3 IMAGE numbers that best show the whole look.
9. BACKGROUND is always exactly "flat mid-grey #808080, isolated artwork". garment_colors = the brief's garments when given; infer only when it says not given.
10. EVIDENCE: 5 to 15 short notes, each starting with "IMAGE n" (or "IMAGE n, m"), one claim each, plus one "IMAGE n: exception - ..." per image that disagrees with the majority.

Return ONLY this JSON object - no markdown fences, no commentary, every key present, no keys renamed:
{"schema":2,"medium":"","realism":"","linework":{"weight":"","style":"","outline":""},"shading":"","shading_method":"","texture":"","edge_finish":"","palette":[{"name":"","hex":"#RRGGBB","weight":"","role":"","images":[1]}],"palette_variants":[],"composition":"","hero":{"framing":"","scale":""},"typography":{"vibe":"","placement":"","case":"","headline":{"family":"","weight":"","effects":[]},"secondary":{"family":"","weight":"","effects":[]}},"background":"flat mid-grey #808080, isolated artwork","mood":["",""],"subjects":[""],"subject_sources":{},"brand_text":{"items":[],"always_present":false},"forbid":["",""],"signature_moves":[""],"garment_colors":[""],"representative_images":[1,2,3],"field_evidence":{},"brief_check":{"must_have_seen":[],"must_have_not_seen":[],"avoid_seen_in":[]},"evidence":["IMAGE n: short note"]}$profiler$))).*
  from public.prompt_templates t where t.slug = 'style_profiler' and t.version = 2
  and not exists (select 1 from public.prompt_templates where slug = 'style_profiler' and version = 3);

-- analysis_prompt v3 - WF-1: each attached reference is read ONLY for its role (SLOT_BLOCKS from cards.reference_roles), one call.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 3, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'WF-1 Studio Intake > Analyze References (per-slot roles from cards.reference_roles, fallback settings.reference_roles; ONE vision call; Kie gemini-3.1-pro or the OpenRouter twin, JSON mode) - returns {references:[one per attached slot with role-specific keys], same_design, notes}; WF-1 Parse Analysis stores it and flattens the v2 compat keys. Placeholders NICHE (clients.style_brief.niche, else the client name), CLIENT_NAME, BRIEF, TEXT_LINES, SLOT_BLOCKS (one line per attached image, built by WF-1). Activate together with the updated WF-1 (R1); v2 stays active until then.',
           'body', $analysis$You are a precise visual analyst for a "{{NICHE}}" print-on-demand design for the client {{CLIENT_NAME}}.

IMPORTANT: a reference may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

The brief for this design: {{BRIEF}}
The text that WILL be printed on this design (for your information - it is not in the images): {{TEXT_LINES}}

Each attached image has ONE job. Read every image ONLY for its job and ignore everything else about it:
{{SLOT_BLOCKS}}
If all images are the same artwork (mockups or angles of one design) set same_design true and fill every block from that one design. Transcribe every word you see into that image's text_detected only - never into any other key.

Return ONLY this JSON object - no markdown fences, one object per attached image in slot order with the role given above, omitting slots that are not attached:
{"references":[{"slot":1,"role":"subject","hero":{"subject":"","pose":"","framing":"chest_up|full_figure|head_only|scene|object|none","scale":"small|medium|large|fills"},"supporting_elements":[""],"layout":"stacked|badge|arched_lockup|split_panel|scene|text_only|other","text_zones":"","text_detected":[]},{"slot":2,"role":"art_style","medium":"","realism":"iconic|stylised|detailed|realistic","line_weight":"none|hairline|fine|medium|bold|heavy","line_style":"","shading":"none|flat|hatching|stipple|halftone|cel|painterly|gradient","texture":"","edge_finish":"clean|rough|distressed|stamped","palette":[{"name":"","hex":"#RRGGBB","role":"line|fill|text|disc|accent"}],"text_detected":[]},{"slot":3,"role":"typography","headline":{"family":"slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other","weight":"light|regular|bold|black","effects":[]},"secondary":{"family":"","weight":"","effects":[]},"placement":"","case":"UPPER|lower|Title|Mixed","text_detected":[]}],"same_design":false,"notes":""}$analysis$))).*
  from public.prompt_templates t where t.slug = 'analysis_prompt' and t.version = 2
  and not exists (select 1 from public.prompt_templates where slug = 'analysis_prompt' and version = 3);

-- tier_rules v2 - same JSON shape. Tiers 1-2: the bare word NICHE is gone (the SUBJECT block names what to draw; the audience
-- is {{niche}}, filled by prompt-engine v8 from clients.style_brief.niche); all five tiers say "the WHAT TO MAKE reference
-- (or the Style Card when none is attached)" instead of "the reference". The edit rule is unchanged.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'Edge Function prompt-engine v8 (required). JSON keyed 1..5 + edit; the card similarity_tier picks the text. Placeholders n, tier and niche (v8 fills niche from clients.style_brief.niche, else "this client''s usual subject matter"). Activate after prompt-engine v8 is deployed; v1 stays active until then.',
           'body', $tiers${"1":"LOOSE INSPIRATION (~{{n}}%): use the WHAT TO MAKE reference (or the Style Card when none is attached) ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic - the SUBJECT block below names what to draw. It should feel like the same artist made a different design for the same audience ({{niche}}).","2":"LOOSE INSPIRATION (~{{n}}%): use the WHAT TO MAKE reference (or the Style Card when none is attached) ONLY as a style, technique, palette and mood guide. Create a NEW composition with new supporting elements in that same aesthetic - the SUBJECT block below names what to draw. It should feel like the same artist made a different design for the same audience ({{niche}}).","3":"INSPIRED REMIX (~{{n}}%): keep the hero concept of the WHAT TO MAKE reference (or the Style Card when none is attached), the art technique, color palette family and overall vibe, but you MAY re-compose the layout, redraw the hero in the same style, and swap or simplify supporting elements. It should feel like a sibling design from the same collection - clearly related, not a copy.","4":"FAITHFUL RE-CREATION (~{{n}}%): reproduce the overall composition, layout, structure, hero subject and how it is drawn, color palette, art technique/medium, texture, and overall vibe of the WHAT TO MAKE reference (or the Style Card when none is attached) closely - the result must clearly read as the same design. Minor cleanup and small detail variation are fine. The on-design text changes to the QUOTE.","5":"NEAR-EXACT RE-CREATION ({{n}}%): reproduce the composition, layout, structure, hero subject and exactly how it is drawn, every supporting element and its placement, the color palette, art technique, texture and overall vibe of the WHAT TO MAKE reference (or the Style Card when none is attached) as close to identical as possible. The ONLY intentional change is the on-design text.","edit":"TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or \"improve\" anything that was not explicitly asked to change."}$tiers$))).*
  from public.prompt_templates t where t.slug = 'tier_rules' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'tier_rules' and version = 2);

-- text_rules v2 - line 3: one typography authority (the Style Card Typography line; the LETTERING reference only when the
-- card typography is a GUIDE, and never its words). Lines 1, 2 and 4 verbatim from v1.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'Edge Function prompt-engine v8 (required). Exact-text block of magic_prompt_json. The typography authority is the Style Card Typography line (rendered once); a LETTERING reference contributes only when the card typography is a GUIDE. Activate after prompt-engine v8 is deployed; v1 stays active until then.',
           'body', $textrules$TEXT - EXACT, NOTHING ELSE:
- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly. Do NOT add, remove, translate, or invent any other words, taglines, signatures, or symbols. The ONLY text in the image is that quote, exactly once.
- State the quote once in quotation marks and once spelled out letter by letter so the image model cannot misspell it.
- Set every text line in the Style Card Typography line above. When a LETTERING reference is attached and the Style Card typography is a GUIDE, match its lettering style, weight and effects - never its words.
- If no quote is provided, render no text at all.$textrules$))).*
  from public.prompt_templates t where t.slug = 'text_rules' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'text_rules' and version = 2);

-- defects v2 - every "the reference" now reads "the Style Card and the attached references" (grammar adjusted); nothing else changes.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'Edge Function prompt-engine (required). Rendered into the print_rules block of magic_prompt_json after background_rule. v2 measures distress, baselines, halftone and maturity against the Style Card and the attached references instead of "the reference". Activate with prompt-engine v8; v1 stays active until then.',
           'body', $defects$KNOWN PRINT DEFECTS - NEVER PRODUCE ANY OF THESE (compiled from real client rejections):
- TEXT DISTRESS: any distress/vintage texture on lettering stays SUBTLE - letters remain solid, crisp and fully legible. Never let grunge eat into, erode, or fragment letterforms.
- OVERALL DISTRESS: overall distress/texture is never heavier than the Style Card and the attached references; when in doubt, use less.
- NO HALOS: absolutely no white shades, glows, halos, outlines or light fringes around text or graphics - letter and graphic edges meet the background directly in clean solid color.
- STRAIGHT BASELINES: if the text in the Style Card and the attached references is straight, render perfectly straight, level baselines - never accidental waviness, wobble or warping. Only arch or curve text when the Style Card and the attached references clearly do.
- SAY IT ONCE: the quote appears EXACTLY ONCE in the design - never repeated, echoed, mirrored, or duplicated anywhere.
- COMPLETE LETTERS: every letter fully formed with complete, unbroken strokes and clean edges - instantly readable at a glance from print distance.
- NO STRAY DOTS: no random dots, specks, noise or floating marks anywhere. Halftone dot shading ONLY where the Style Card and the attached references themselves use halftone, applied as an even, deliberate pattern.
- CLEAN GRAPHIC EDGES: every graphic outline continuous and unbroken - no fragmented, jagged, or crumbling edges.
- STYLE MATURITY: match the rendering maturity of the Style Card and the attached references - never drift more cartoonish or childish than they are.$defects$))).*
  from public.prompt_templates t where t.slug = 'defects' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'defects' and version = 2);

-- background_rule v2 - the grey set gains #808080, the mid-grey every Style Card names as its background.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'Edge Function prompt-engine (required). Rendered into the print_rules block of magic_prompt_json together with defects. v2 grey set includes the Style Card mid-grey #808080. Activate with prompt-engine v8; v1 stays active until then.',
           'body', $bg$BACKGROUND (keep it effortless - never let it affect the design):
- Place the finished design on a SOLID, FLAT, EVEN GREY background - never a color, gradient, texture, or pattern. Use a neutral grey from this set: #1C1C1C, #333333, #4A4A4A, #616161, #787878, #808080, #8F8F8F, #A6A6A6, #BDBDBD, #D4D4D4, #EBEBEB. Default to a mid-light grey; only lean lighter or darker if the design is itself heavily grey.
- Do NOT optimize, analyze, or labor over the background, and NEVER modify, simplify, or compromise the design to suit it - the artwork is the priority and the grey is only a neutral backdrop.
- NO shadows anywhere - no drop shadows, cast shadows, or ambient shadows. Flat print-ready artwork only; never a mockup, garment, or product photo.$bg$))).*
  from public.prompt_templates t where t.slug = 'background_rule' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'background_rule' and version = 2);

-- style_card_render v2 - reference only: renderStyleCard v2 (spec 3.2) and the complete Style Card JSON v2 key list (spec 1.3).
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'reference only - documents how Edge Function prompt-engine v8 (render.ts renderStyleCard) turns a Style Card JSON (schema 1 or 2) into the CLIENT STYLE CARD block, and lists the Style Card JSON v2 keys (the same list as docs/generation-spec.md section 2 and docs/sop.html 7.1). Not sent to any model; the code is the source of truth. Activate when v8 is deployed so the Settings page shows the current rendering.',
           'body', $render$STYLE CARD RENDERING v2 - how Edge Function prompt-engine v8 (render.ts renderStyleCard) turns the Style Card JSON into the CLIENT STYLE CARD block of the image prompt. Reference only; the code is the source of truth. Render deterministically: one line per key, in exactly this order, each line starting with "- ", plain prose, no markdown, no JSON, no key names in snake_case, NO trailing periods; every value goes through clean() first (strips trailing punctuation and the rule prefixes "Locked:" / "Guide:" that early drafts carried); skip a line ONLY when its value is empty. Copy values verbatim (hex codes uppercase); never invent, soften or embellish a value. Lists are joined with "; " (mood with ", "). The block works for schema 1 cards too: lines whose v2 keys are absent are simply skipped.

HEADER (the status is the style_cards row status, so a draft used for a test render is labelled draft):
CLIENT STYLE CARD v{version} ({locked|draft}) - the LOOK of every design for this client. Every line is a hard requirement unless it says GUIDE:
- Medium: {medium}
- Rendering: {realism} realism; {edge_finish} edges
- Linework: {linework.weight} weight, {linework.style}; {linework.outline} outline
- Shading: {shading_method} - {shading}
- Texture: {texture}
- Palette (STRICT - use ONLY these colours plus the flat grey background, no other hue): {name #HEX (role, weight); ...}   -- or, when rules.palette_mode is flexible:   Palette (FLEXIBLE - lead with these colours; small natural accents in other hues are allowed): ...
  The entries come from the palette_variants entry whose garment side matches the card's garment colour (dark for black, navy, charcoal, dark heather; light otherwise) when one exists, else from palette; ordered dominant, secondary, accent, outline.
- Composition (LOCKED - follow it): {composition}   -- or, when rules.lock_composition is false:   Composition (GUIDE - adapt it to the brief): ...
- Hero framing: {hero.framing}, {hero.scale}
- Typography (LOCKED): headline {typography.headline.family} {typography.headline.weight} ({typography.headline.effects}); secondary {typography.secondary.family} {typography.secondary.weight}; placed {typography.placement}; letter case {UPPER CASE|lower case|Title Case|mixed case} - every on-design text line is set in this lettering
  GUIDE instead of LOCKED when rules.lock_typography is false; falls back to {typography.vibe} when headline is absent (schema 1); the letter-case clause is omitted when case is empty or not one of UPPER|lower|Title|Mixed (so "as_typed" never reaches the prompt). Typography is rendered ONCE: the QUOTE header only says "set in the Style Card Typography line above" - or, when the card typography is a GUIDE and a LETTERING reference is attached, "in the lettering of the LETTERING reference (Image k), within the Style Card typography".
- Background: {background}
- Mood: {mood}
- Signature moves: {signature_moves} - at least one must be visibly present
- NEGATIVE - never: {forbid}; never a colour outside the palette above; never shadows, halos, gradients, a garment, a mockup or a photo
  Always last and always present; "never a colour outside the palette above" only in STRICT mode; when forbid is empty only the fixed tail is rendered.

NOT RENDERED HERE: subjects (the SUBJECT block names the one hero of the design and lists the pool as supporting elements only), garment_colors (the BRIEF block states the garment once), brand_text (never drawn unless a brief's text lines contain it; never sent to QC as forbid), subject_sources, representative_images, field_evidence, brief_check, evidence, validation, reference_ids, source, rules, schema. The PRECEDENCE line (exact text > print rules > SUBJECT > Style Card > similarity policy > reference descriptions > brief prose) is the last line of the print-rules block, not of this block.

STYLE CARD JSON v2 - the complete key list (additive: the 14 schema 1 keys keep their types). This list is identical to docs/generation-spec.md section 2 and docs/sop.html 7.1:
schema: 2
medium: string (<=12 words)
realism: iconic|stylised|detailed|realistic
linework: { weight: none|hairline|fine|medium|bold|heavy, style: string (<=12 words), outline: none|thin|thick|keyline }
shading: string (<=12 words)            shading_method: none|flat|hatching|stipple|halftone|cel|painterly
texture: string (<=12 words)            edge_finish: clean|rough|distressed|stamped
palette: [{ name, hex: #RRGGBB, weight: dominant|secondary|accent|outline, role: line|fill|text|disc|accent|highlight, images: [n], snapped_from?: hex }]  (3..8, exactly one dominant, listed first)
palette_variants: [{ garment: dark|light|any, hexes: [hex], images: [n] }]  (optional)
composition: string (<=40 words, no subject nouns)      hero: { framing: chest_up|full_figure|head_only|scene|object|none, scale: small|medium|large|fills }
typography: { vibe, placement, case: UPPER|lower|Title|Mixed|'', headline: { family: FAMILY, weight: light|regular|bold|black, effects: [arched|inline_hatching|outline|banner|drop_line|distressed] }, secondary: { family, weight, effects } }
  FAMILY = slab_serif|display_serif|condensed_sans|grotesk_sans|script|brush|blackletter|woodtype|stencil|hand_lettered|other
background: 'flat mid-grey #808080, isolated artwork'   mood: [string]
subjects: [string]        subject_sources: { '<subject>': brief|images|both }
brand_text: { items: [{ text, role: handle|est|tagline|brand, placement }], always_present: boolean }   (NEVER rendered into the prompt, never sent to QC as forbid)
forbid: [string (<=10 words)] (2..8)   signature_moves: [string (<=10 words)]   garment_colors: [string]
representative_images: [n, n, n]       field_evidence: { '<path>': { images: [n], contradicts: [n], agreement?: 0..1 } }
brief_check: { must_have_seen: [], must_have_not_seen: [], avoid_seen_in: ['IMAGE n: ...'] }
evidence: ['IMAGE n: note'] (5..15)    rules: { palette_mode, text_case, lock_typography, lock_composition }   reference_ids: [uuid]   source: 'library'
validation: { errors: [], warnings: [], fixes: [], checked_at }

EXAMPLE - a locked v3 card with rules {palette_mode strict, lock_typography true, lock_composition false}, garment black, no palette_variants:
{"schema":2,"medium":"screen-print style vector illustration","realism":"stylised","linework":{"weight":"bold","style":"uniform black outlines","outline":"thick"},"shading":"two-tone halftone on the hero","shading_method":"halftone","texture":"light paper grain on fills","edge_finish":"clean","palette":[{"name":"cream","hex":"#F2E8D5","weight":"dominant","role":"fill","images":[1,2,3]},{"name":"rust","hex":"#B5482A","weight":"secondary","role":"accent","images":[1,3]},{"name":"teal","hex":"#2F6F73","weight":"accent","role":"accent","images":[2]},{"name":"ink black","hex":"#1C1C1C","weight":"outline","role":"line","images":[1,2,3]}],"composition":"centred badge, the hero inside a circle, text arched above and stacked below","hero":{"framing":"chest_up","scale":"large"},"typography":{"vibe":"condensed bold sans","placement":"arched above and stacked below the hero","case":"UPPER","headline":{"family":"condensed_sans","weight":"bold","effects":["arched"]},"secondary":{"family":"slab_serif","weight":"regular","effects":[]}},"background":"flat mid-grey #808080, isolated artwork","mood":["nostalgic","confident"],"subjects":["Highland cows","chickens"],"forbid":["gradients","photo-realism","thin hairlines"],"signature_moves":["a single teal accent per design","halftone only on the hero"]}
renders:
CLIENT STYLE CARD v3 (locked) - the LOOK of every design for this client. Every line is a hard requirement unless it says GUIDE:
- Medium: screen-print style vector illustration
- Rendering: stylised realism; clean edges
- Linework: bold weight, uniform black outlines; thick outline
- Shading: halftone - two-tone halftone on the hero
- Texture: light paper grain on fills
- Palette (STRICT - use ONLY these colours plus the flat grey background, no other hue): cream #F2E8D5 (fill, dominant); rust #B5482A (accent, secondary); teal #2F6F73 (accent, accent); ink black #1C1C1C (line, outline)
- Composition (GUIDE - adapt it to the brief): centred badge, the hero inside a circle, text arched above and stacked below
- Hero framing: chest_up, large
- Typography (LOCKED): headline condensed_sans bold (arched); secondary slab_serif regular; placed arched above and stacked below the hero; letter case UPPER CASE - every on-design text line is set in this lettering
- Background: flat mid-grey #808080, isolated artwork
- Mood: nostalgic, confident
- Signature moves: a single teal accent per design; halftone only on the hero - at least one must be visibly present
- NEGATIVE - never: gradients; photo-realism; thin hairlines; never a colour outside the palette above; never shadows, halos, gradients, a garment, a mockup or a photo$render$))).*
  from public.prompt_templates t where t.slug = 'style_card_render' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'style_card_render' and version = 2);

-- qc_prompt v2 - the v1 body verbatim + the Style Card tail. The {{STYLE_CARD_JSON}} token switches off the hard-coded
-- palette paragraph in WF-2/WF-3 Build QC Request (existing condition); qc-judge turns the "style" key into style_match.
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', false, 'activated_by', null, 'activated_at', null, 'created_at', now(),
           'consumer', 'WF-2 Studio Generate + WF-3 Studio Edit > Vision QC (Kie gemini-3.1-pro or the OpenRouter twin, JSON mode); result normalised by Edge Function qc-judge (the 9 checks plus style_match from the "style" key). Placeholders EXPECTED_TEXT, EXPECTED_SUBJECT (magic_prompt_json.subject.text), PALETTE_RULE (strict/flexible sentence), FORBID_LIST (numbered), STYLE_CARD_JSON (pruned card). Activate together with the updated WF-2/WF-3 (R1); v1 stays active until then.',
           'body', $qc$You are a strict print-on-demand quality inspector. Inspect the attached generated design image.

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
pass must be true ONLY if every single check is satisfied.

STYLE CARD (the client's locked look, JSON below) and EXPECTED SUBJECT: "{{EXPECTED_SUBJECT}}".
Add a key "style" judged against the card only, never against taste: {"subject_seen":"two or three words naming the hero","subject_ok":true|false|null (true only when the hero clearly IS the expected subject; false when it is something else, for example the thing the text names; null when no subject is given),"palette_ok":true|false ({{PALETTE_RULE}}),"off_palette_colours":[{"name":"","hex":"#RRGGBB","area":"large|small"}],"medium_ok":true|false (drawn in the card's medium, linework and shading method),"typography_ok":true|false (letterform style and placement match the card's typography; letter case is NOT judged),"composition_ok":true|false (matches the card's composition; always true when it is a guide),"forbid_hits":[numbers of FORBID items visibly present],"case_seen":"UPPER|lower|Title|Mixed","text_height_ok":true|false (the smallest expected text line is at least 3% of the image height),"min_text_height_frac":0.0,"cropped":true|false (artwork touches or leaves the frame)}. These keys never change "pass" or the 9 checks. Letter case, font and wording of the text are defined ONLY by the EXPECTED ON-DESIGN TEXT above - never report them as an issue.
FORBID: {{FORBID_LIST}}
{{STYLE_CARD_JSON}}$qc$))).*
  from public.prompt_templates t where t.slug = 'qc_prompt' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and version = 2);

-- ---------------------------------------------------------------------------------------------------------------------
-- Self-check: the migration refuses to finish half-applied.
-- ---------------------------------------------------------------------------------------------------------------------
do $chk$
declare r record; n int;
begin
  -- 1.1 the five columns exist
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and (table_name, column_name) in
     (('settings', 'reference_roles'), ('settings', 'qc_subject_regen'), ('cards', 'reference_roles'), ('client_references', 'meta'), ('style_draft_requests', 'raw'));
  if n <> 5 then raise exception 'studio_21: expected 5 new columns, found %', n; end if;
  if not exists (select 1 from public.settings where id = 1 and jsonb_typeof(reference_roles) = 'array' and jsonb_array_length(reference_roles) = 3) then
    raise exception 'studio_21: settings.reference_roles is not a 3-role array';
  end if;
  -- 1.2 the trigger and the new RPC signature exist
  if not exists (select 1 from pg_trigger where tgname = 'style_draft_requests_require_brief' and tgrelid = 'public.style_draft_requests'::regclass) then
    raise exception 'studio_21: trigger style_draft_requests_require_brief is missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                  where ns.nspname = 'public' and p.proname = 'create_card_as_designer' and pg_get_function_identity_arguments(p.oid) like '%p_reference_roles text[]') then
    raise exception 'studio_21: create_card_as_designer lost its p_reference_roles argument';
  end if;
  -- 1.4 every new template row exists and is inactive; every slug still has exactly one active row (nothing deactivated)
  for r in select * from (values ('style_sheet', 1), ('style_profiler', 3), ('analysis_prompt', 3), ('tier_rules', 2), ('text_rules', 2),
                                 ('defects', 2), ('background_rule', 2), ('style_card_render', 2), ('qc_prompt', 2)) v(slug, version) loop
    if not exists (select 1 from public.prompt_templates where slug = r.slug and version = r.version and not active) then
      raise exception 'studio_21: template % v% is missing or was inserted active', r.slug, r.version;
    end if;
    if r.slug <> 'style_sheet' and (select count(*) from public.prompt_templates where slug = r.slug and active) <> 1 then
      raise exception 'studio_21: slug % must keep exactly one active row', r.slug;
    end if;
  end loop;
  -- template contracts the tests assert against (spec 3.5) and the tokens the consumers fill
  if exists (select 1 from public.prompt_templates where slug = 'tier_rules' and version = 2 and position('NICHE' in body) > 0) then
    raise exception 'studio_21: tier_rules v2 still contains the bare word NICHE';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'tier_rules' and version = 2 and (body::jsonb) ?& array['1', '2', '3', '4', '5', 'edit']) then
    raise exception 'studio_21: tier_rules v2 is not JSON keyed 1..5 + edit';
  end if;
  if exists (select 1 from public.prompt_templates where slug = 'text_rules' and version = 2 and body ilike '%reference''s typography%') then
    raise exception 'studio_21: text_rules v2 still hands typography to the reference';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'background_rule' and version = 2 and body like '%#808080%') then
    raise exception 'studio_21: background_rule v2 lacks #808080';
  end if;
  if exists (select 1 from public.prompt_templates where slug = 'defects' and version = 2 and body like '%the reference%') then
    raise exception 'studio_21: defects v2 still says "the reference"';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'qc_prompt' and version = 2
                  and body like '%EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""%' and body like '%{{EXPECTED_SUBJECT}}%'
                  and body like '%{{PALETTE_RULE}}%' and body like '%{{FORBID_LIST}}%' and body like '%{{STYLE_CARD_JSON}}%') then
    raise exception 'studio_21: qc_prompt v2 lost a placeholder';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'style_profiler' and version = 3
                  and body like '%{{IMAGE_COUNT}}%' and body like '%{{SUBJECTS}}%' and body like '%{{BRAND_TEXT}}%' and body like '%{{GARMENT_COLORS}}%'
                  and body like '%{{TYPOGRAPHY_NOTE}}%' and body like '%{{SHEETS_JSON}}%' and body like '%"schema":2%') then
    raise exception 'studio_21: style_profiler v3 lost a placeholder or the schema 2 contract';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'analysis_prompt' and version = 3
                  and body like '%{{SLOT_BLOCKS}}%' and body like '%{{BRIEF}}%' and body like '%{{TEXT_LINES}}%' and body like '%{{CLIENT_NAME}}%' and body like '%"same_design"%') then
    raise exception 'studio_21: analysis_prompt v3 lost a placeholder or the references contract';
  end if;
  if not exists (select 1 from public.prompt_templates where slug = 'style_sheet' and version = 1
                  and body like '%{{IMAGE_COUNT}}%' and body like '%{{REFERENCE_NOTES}}%' and body like '%"sheets"%') then
    raise exception 'studio_21: style_sheet v1 lost a placeholder or the sheets contract';
  end if;
end $chk$;
