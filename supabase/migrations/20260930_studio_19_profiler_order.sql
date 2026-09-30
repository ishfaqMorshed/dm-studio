-- studio_19 · Deterministic profiler image order + room for 16 onboarding designs.
-- A library batch is inserted in one statement, so its rows share created_at; ordering by created_at alone
-- returned ties in arbitrary order and the evidence "IMAGE n" numbers could not be trusted.
-- WF-1b lists the library with order=created_at.desc,id.desc and records reference_ids in the draft json;
-- the test card picks its 3 references the same way.

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
  select array_agg(path order by created_at desc, id desc) into refs
    from (select path, created_at, id from public.client_references where client_id = p_client_id and not excluded order by created_at desc, id desc limit 3) r;
  if coalesce(array_length(refs, 1), 0) = 0 then raise exception 'upload reference images to the library first'; end if;
  lines := jsonb_build_array(jsonb_build_object('role', 'headline', 'text', upper(cl.name)), jsonb_build_object('role', 'sub', 'text', 'EST. 2026'));
  brief := 'Style Card test render: a brand-new design in this client''s established look - pick a subject from their usual subject matter - with the text below.';
  insert into public.cards (id, client_id, stage, source, brief_text, print_text, reference_paths, garment_color, placement, similarity_tier, client_submission)
  values (cid, p_client_id, 'intake', 'style_test', brief, lines, refs, coalesce(cl.garment_colors[1], 'black'), 'front_chest', 1,
          jsonb_build_object('source', 'style_test', 'created_by', auth.uid(), 'brief_text', brief, 'print_text', lines, 'reference_paths', refs, 'submitted_at', now()))
  returning * into c;
  return c;
end $function$;

-- Onboarding asks for 10-15 designs; the profiler reads up to 16.
update public.settings set max_style_refs = 16 where id = 1 and max_style_refs < 16;

-- Any staff member can save the onboarding brief (clients rows stay lead-only for everything else, like
-- lock_style_card is already open to all staff). Only the four onboarding fields are written.
create or replace function public.save_onboarding_brief(
  p_client_id uuid, p_style_brief jsonb, p_default_similarity_tier int default null,
  p_garment_colors text[] default null, p_notes text default null)
 returns public.clients
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.clients;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_style_brief) <> 'object' then raise exception 'style_brief must be an object'; end if;
  if p_style_brief->>'palette_mode' is not null and p_style_brief->>'palette_mode' not in ('strict', 'flexible') then
    raise exception 'palette_mode must be strict or flexible';
  end if;
  if p_style_brief->>'text_case' is not null and p_style_brief->>'text_case' not in ('as_typed', 'upper', 'title') then
    raise exception 'text_case must be as_typed, upper or title';
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

revoke all on function public.save_onboarding_brief(uuid, jsonb, int, text[], text) from public, anon;
grant execute on function public.save_onboarding_brief(uuid, jsonb, int, text[], text) to authenticated, service_role;
