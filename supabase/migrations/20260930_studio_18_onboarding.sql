-- studio_18 · Client onboarding: written brief + lock parameters, image tick/untick, text case at intake,
-- Style Card test render (approve with a draft card on a hidden style_test card).

-- 1. The written onboarding brief and lock parameters (inputs to the style profiler and to intake)
alter table public.clients add column if not exists style_brief jsonb not null default '{}'::jsonb;
comment on column public.clients.style_brief is
  'Onboarding brief: {niche, audience, palette_mode: strict|flexible, text_case: as_typed|upper|title, must_have: [], avoid: [], lock_typography: bool, lock_composition: bool}';

-- 2. Untick a library image before the profiler runs (WF-1b lists excluded=false only)
alter table public.client_references add column if not exists excluded boolean not null default false;

-- 3. Text case at intake: the client's preference is applied to the print text when a card is created.
--    client_submission keeps what was typed ("What the client sent" on the card page).
create or replace function public.apply_client_text_case()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare mode text; converted jsonb;
begin
  select coalesce(style_brief->>'text_case', 'as_typed') into mode from public.clients where id = new.client_id;
  if mode in ('upper', 'title') and jsonb_typeof(new.print_text) = 'array' then
    select coalesce(jsonb_agg(
             case when jsonb_typeof(l) = 'object' and l ? 'text'
                  then l || jsonb_build_object('text', case when mode = 'upper' then upper(l->>'text') else initcap(l->>'text') end)
                  else l end), '[]'::jsonb)
      into converted
      from jsonb_array_elements(new.print_text) l;
    new.print_text := converted;
  end if;
  return new;
end $function$;

drop trigger if exists cards_apply_text_case on public.cards;
create trigger cards_apply_text_case before insert on public.cards
  for each row execute function public.apply_client_text_case();

-- 4. approve_card can generate with a chosen (draft) Style Card: the onboarding test render
drop function if exists public.approve_card(uuid, text);
create function public.approve_card(p_card_id uuid, p_platform text default null, p_style_card_id uuid default null)
 returns public.cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.cards; sc public.style_cards; s public.settings; g uuid;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_platform is not null and p_platform not in ('kie', 'openrouter', 'auto') then
    raise exception 'unknown platform %', p_platform;
  end if;
  select * into s from public.settings where id = 1;
  if s.pipeline_paused then raise exception 'pipeline is paused'; end if;
  select * into c from public.cards where id = p_card_id for update;
  if not found then raise exception 'card not found'; end if;
  if c.stage <> 'review' then return c; end if;  -- idempotent: second click is a no-op
  if p_style_card_id is not null then
    select * into sc from public.style_cards where id = p_style_card_id and client_id = c.client_id;
    if sc.id is null then raise exception 'style card not found for this client'; end if;
    if sc.json = '{}'::jsonb then raise exception 'style card is empty'; end if;
  else
    sc := public.current_style_card(c.client_id);
    if sc.id is null then raise exception 'client has no locked Style Card'; end if;
  end if;

  update public.cards
     set style_card_id = sc.id,
         style_card_version = sc.version,
         brief_snapshot = jsonb_build_object(
           'brief_text', brief_text, 'print_text', print_text, 'garment_color', garment_color,
           'placement', placement, 'avoid_notes', avoid_notes,
           'similarity_tier', coalesce(similarity_tier, (select default_similarity_tier from public.clients where id = c.client_id)),
           'reference_paths', reference_paths, 'reference_analysis', reference_analysis),
         approved_by = auth.uid(), approved_at = now()
   where id = p_card_id;

  insert into public.generations (card_id, kind, status, style_card_id, style_card_version, style_card_snapshot, brief_snapshot, platform)
  select id, 'generate', 'queued', style_card_id, style_card_version, sc.json, brief_snapshot, coalesce(p_platform, s.ai_platform)
    from public.cards where id = p_card_id
  returning id into g;

  update public.cards set current_generation_id = coalesce(current_generation_id, g) where id = p_card_id;
  return public.move_card(p_card_id, 'approved', null);
end $function$;

revoke all on function public.approve_card(uuid, text, uuid) from public, anon;
grant execute on function public.approve_card(uuid, text, uuid) to authenticated, service_role;

-- 5. A hidden test card for the onboarding "Test render": a new design in the client's look, built from the
--    newest 3 library images, tier 1 (style only, new subject), text = the client's name + EST. line.
create or replace function public.create_style_test_card(p_client_id uuid)
 returns public.cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cl public.clients; c public.cards; refs text[]; lines jsonb; brief text; cid uuid := gen_random_uuid();
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cl from public.clients where id = p_client_id and active;
  if not found then raise exception 'client not found or inactive'; end if;
  select array_agg(path order by created_at desc) into refs
    from (select path, created_at from public.client_references where client_id = p_client_id and not excluded order by created_at desc limit 3) r;
  if coalesce(array_length(refs, 1), 0) = 0 then raise exception 'upload reference images to the library first'; end if;
  lines := jsonb_build_array(jsonb_build_object('role', 'headline', 'text', upper(cl.name)), jsonb_build_object('role', 'sub', 'text', 'EST. 2026'));
  brief := 'Style Card test render: a brand-new design in this client''s established look - pick a subject from their usual subject matter - with the text below.';
  insert into public.cards (id, client_id, stage, source, brief_text, print_text, reference_paths, garment_color, placement, similarity_tier, client_submission)
  values (cid, p_client_id, 'intake', 'style_test', brief, lines, refs, coalesce(cl.garment_colors[1], 'black'), 'front_chest', 1,
          jsonb_build_object('source', 'style_test', 'created_by', auth.uid(), 'brief_text', brief, 'print_text', lines, 'reference_paths', refs, 'submitted_at', now()))
  returning * into c;
  return c;
end $function$;

revoke all on function public.create_style_test_card(uuid) from public, anon;
grant execute on function public.create_style_test_card(uuid) to authenticated, service_role;

-- 6. style_profiler v2: reads the onboarding brief and the per-image notes (v1 kept, inactive)
update public.prompt_templates set active = false where slug = 'style_profiler' and version = 1;  -- one active per slug
insert into public.prompt_templates
select (jsonb_populate_record(null::public.prompt_templates,
         to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'version', 2, 'active', true, 'created_at', now(), 'body', $tpl$You are a precise visual analyst building the STYLE CARD for one print-on-demand client. Attached are 5 to 15 of this client's PAST DESIGNS, numbered in the order attached (IMAGE 1, IMAGE 2, ...). Describe the client's recurring visual identity - the look that makes every one of their designs recognisable - NOT any single design.

IMPORTANT: an image may be a rough draft, a shirt mockup, worn, angled, folded, wrinkled, a screenshot, or distorted. Judge ONLY the flat printed DESIGN ARTWORK as if seen flat and straight-on; ignore garment, body, background, perspective, folds, glare, and any app UI.

CLIENT BRIEF from the studio - treat it as ground truth wherever the images are ambiguous:
- Client: {{CLIENT_NAME}}. Niche / audience: {{NICHE}}
- Notes: {{CLIENT_NOTES}}
- Must-have signature moves the client insists on: {{MUST_HAVE}}
- Never do: {{AVOID}}
- Palette rule: {{PALETTE_MODE}} (strict = designs use only the palette colours; flexible = the palette leads and small natural accents are allowed)
- Text case rule: {{TEXT_CASE}} (as_typed = print briefs as written; upper / title = the studio converts every brief to that case)
- Typography is {{LOCK_TYPOGRAPHY}}; composition is {{LOCK_COMPOSITION}} (locked = every design must follow it; guide = adapt it to each brief)
Fold the must-haves into signature_moves and the never-dos into forbid, keeping the client's wording. When the text case rule is upper or title, set typography.case to it.
Per-image notes from the studio:
{{REFERENCE_NOTES}}

Look for what REPEATS across the whole set: the art medium and rendering technique, linework weight and style, shading method, texture and distress level, the recurring color palette, composition habits, lettering style and where text sits, mood, typical subject matter, and the signature moves this artist keeps coming back to. Subjects and quotes change from design to design - never describe one design's subject or text as the style. Where the set disagrees, describe the majority and record the exception in evidence. Be concrete and complete: an image model must be able to match this look from your words alone.

PALETTE: 3 to 8 colors that recur across the set. hex is the closest 6-digit uppercase value like #1C1C1C. weight is dominant, secondary, accent or outline - exactly one dominant, listed first.
TYPOGRAPHY: vibe = the lettering style (e.g. condensed bold sans, hand-drawn brush script, western slab); placement = where text sits relative to the art (e.g. arched above and stacked below the hero); case = UPPER, lower, Title or Mixed.
FORBID: 2 to 8 concrete, checkable things this client visibly never does (e.g. gradients, photo-realism, thin hairlines, drop shadows, heavy grunge eating into lettering). Never leave it empty.
BACKGROUND: always exactly "flat mid-grey #808080, isolated artwork" - the studio generates on flat grey; the backgrounds in the attached images are irrelevant.
GARMENT_COLORS: the garment colors the designs are evidently made for (e.g. black, white, heather, navy). If it cannot be told, ["black"].
EVIDENCE: 5 to 15 short notes, each naming the image numbers that support one claim (e.g. "IMAGE 1, 3, 5: two-tone halftone shading on every hero"). Include one note per image that disagrees with the majority ("IMAGE 4: exception - ...").

Return ONLY this JSON object - no markdown fences, no commentary. Every key present, every string non-empty, every array non-empty, no keys added or renamed:
{"medium":"","linework":{"weight":"","style":""},"shading":"","texture":"","palette":[{"name":"","hex":"#RRGGBB","weight":"dominant|secondary|accent|outline"}],"composition":"","typography":{"vibe":"","placement":"","case":""},"background":"flat mid-grey #808080, isolated artwork","mood":["",""],"subjects":["typical subject matter"],"forbid":["",""],"signature_moves":["what makes this client recognisable"],"garment_colors":["black"],"evidence":["IMAGE n: short note"]}$tpl$))).*
  from public.prompt_templates t where t.slug = 'style_profiler' and t.version = 1
  and not exists (select 1 from public.prompt_templates where slug = 'style_profiler' and version = 2);

-- 7. Staff can edit a library image's note and tick/untick it for the profiler (excluded)
drop policy if exists client_references_staff_update on public.client_references;
create policy client_references_staff_update on public.client_references
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- 8. cards.source accepts the hidden onboarding test cards
alter table public.cards drop constraint if exists cards_source_check;
alter table public.cards add constraint cards_source_check check (source = any (array['form'::text, 'designer'::text, 'duplicate'::text, 'style_test'::text]));
