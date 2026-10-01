-- studio_23 · Test render references with roles (spec docs/stylecard-v2-spec.md section 7, hand-off 1).
-- Until now create_style_test_card attached the 3 newest ticked library images with no roles, so the test render was
-- judged against pictures nobody chose. Now the references are, in this order of preference:
--   1. the representative_images of the Style Card the render uses (p_style_card_id, else the current locked one),
--      resolved through that card's reference_ids (1-based IMAGE numbers -> client_references.path; a removed or
--      unticked image is skipped). WF-1b v3 drafts carry both keys; older drafts carry neither and fall through.
--   2. a roled trio from client_references.meta.best_for, in the settings slot order (public.default_reference_roles,
--      default subject, art_style, typography): layout -> subject, linework or palette -> art_style, lettering ->
--      typography; newest tagged image first; never the same image twice; an outlier is never picked by tag; a slot
--      without a tagged image falls back to the newest ticked image not used yet (non-outliers first). With fewer than
--      3 ticked images the trio is shorter.
-- cards.reference_roles = default_reference_roles(k) for the k attached slots (the settings order, which is what WF-1
-- SLOT_BLOCKS and prompt-engine read for every card), and client_submission records the same roles. The subject
-- (client_submission.subject, studio_20) stays the explicit SUBJECT prompt-engine reads first.
-- Same signature as studio_20, so create or replace keeps the owner; the grants are restated. Re-runnable.
-- No secrets, keys or URLs appear in this file.

create or replace function public.create_style_test_card(
  p_client_id uuid, p_subject text default null, p_lines jsonb default null, p_style_card_id uuid default null)
 returns public.cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cl public.clients; sc public.style_cards; c public.cards; refs text[] := '{}'; roles text[]; lines jsonb; subject text; brief text; l jsonb;
        cid uuid := gen_random_uuid(); ref_ids text[]; n int; k int; avail int; v_path text; slot_role text; tags text[];
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cl from public.clients where id = p_client_id and active;
  if not found then raise exception 'client not found or inactive'; end if;
  select count(*) into avail from public.client_references where client_id = p_client_id and not excluded;
  if avail = 0 then raise exception 'upload reference images to the library first'; end if;

  -- the Style Card the render uses: the chosen one, else the current locked one
  if p_style_card_id is not null then
    select * into sc from public.style_cards where id = p_style_card_id and client_id = p_client_id;
  else
    sc := public.current_style_card(p_client_id);
  end if;

  -- subject: the designer's, else the first subject of that Style Card
  subject := nullif(btrim(coalesce(p_subject, '')), '');
  if subject is null and sc.id is not null and jsonb_typeof(sc.json->'subjects') = 'array' then
    subject := nullif(btrim(sc.json->'subjects'->>0), '');
  end if;
  if subject is null then raise exception 'give the test render a subject (the Style Card has none)'; end if;
  if length(subject) > 200 then raise exception 'subject is too long (200 characters max)'; end if;

  -- references 1: the card's representative images, resolved through its reference_ids (1-based IMAGE numbers)
  if sc.id is not null and jsonb_typeof(sc.json->'reference_ids') = 'array' and jsonb_typeof(sc.json->'representative_images') = 'array' then
    select array_agg(e.v order by e.ord) into ref_ids
      from jsonb_array_elements_text(sc.json->'reference_ids') with ordinality as e(v, ord);
    for n in select floor((e #>> '{}')::numeric)::int from jsonb_array_elements(sc.json->'representative_images') e where jsonb_typeof(e) = 'number' loop
      exit when coalesce(array_length(refs, 1), 0) >= 3;
      if n < 1 or n > coalesce(array_length(ref_ids, 1), 0) then continue; end if;
      if ref_ids[n] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
      v_path := null;
      select r.path into v_path from public.client_references r where r.id = ref_ids[n]::uuid and r.client_id = p_client_id and not r.excluded;
      if v_path is not null and not (v_path = any(refs)) then refs := refs || v_path; end if;
    end loop;
  end if;

  -- references 2: a roled trio from the "best example of" tags, in the settings slot order
  if coalesce(array_length(refs, 1), 0) = 0 then
    roles := public.default_reference_roles(least(3, avail));
    foreach slot_role in array roles loop
      tags := case slot_role when 'subject' then array['layout'] when 'art_style' then array['linework', 'palette'] else array['lettering'] end;
      v_path := null;
      select r.path into v_path from public.client_references r
       where r.client_id = p_client_id and not r.excluded and not (r.path = any(refs))
         and coalesce(r.meta->>'outlier', 'false') <> 'true'
         and jsonb_typeof(r.meta->'best_for') = 'array'
         and exists (select 1 from jsonb_array_elements_text(r.meta->'best_for') b where b = any(tags))
       order by r.created_at desc, r.id desc limit 1;
      if v_path is null then
        select r.path into v_path from public.client_references r
         where r.client_id = p_client_id and not r.excluded and not (r.path = any(refs))
         order by (coalesce(r.meta->>'outlier', 'false') = 'true'), r.created_at desc, r.id desc limit 1;
      end if;
      if v_path is not null then refs := refs || v_path; end if;
    end loop;
  end if;
  k := coalesce(array_length(refs, 1), 0);
  if k = 0 then raise exception 'upload reference images to the library first'; end if;
  roles := public.default_reference_roles(k);

  -- text lines: the designer's ({role, text} objects, 1..3, non-empty), else the client name + EST. line
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    if jsonb_array_length(p_lines) > 3 then raise exception 'at most 3 text lines'; end if;
    lines := '[]'::jsonb;
    for l in select * from jsonb_array_elements(p_lines) loop
      if jsonb_typeof(l) <> 'object' or nullif(btrim(coalesce(l->>'text', '')), '') is null then raise exception 'every text line needs text'; end if;
      lines := lines || jsonb_build_object('role', coalesce(nullif(l->>'role', ''), case when jsonb_array_length(lines) = 0 then 'headline' else 'sub' end), 'text', btrim(l->>'text'));
    end loop;
  else
    lines := jsonb_build_array(jsonb_build_object('role', 'headline', 'text', upper(cl.name)), jsonb_build_object('role', 'sub', 'text', 'EST. 2026'));
  end if;

  brief := 'Style Card test render. SUBJECT: ' || subject || ' - a brand-new design of this subject in this client''s established look. '
        || 'The text below is lettering only: draw the subject above, never the thing the words name.';
  insert into public.cards (id, client_id, stage, source, brief_text, print_text, reference_paths, reference_roles, garment_color, placement, similarity_tier, client_submission)
  values (cid, p_client_id, 'intake', 'style_test', brief, lines, refs, roles, coalesce(cl.garment_colors[1], 'black'), 'front_chest', 1,
          jsonb_build_object('source', 'style_test', 'created_by', auth.uid(), 'subject', subject, 'style_card_id', p_style_card_id,
                             'brief_text', brief, 'print_text', lines, 'reference_paths', refs, 'reference_roles', to_jsonb(roles), 'submitted_at', now()))
  returning * into c;
  return c;
end $function$;

revoke all on function public.create_style_test_card(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.create_style_test_card(uuid, text, jsonb, uuid) to authenticated, service_role;
