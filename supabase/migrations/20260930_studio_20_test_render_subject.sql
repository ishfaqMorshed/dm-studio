-- studio_20 · Test render with an explicit subject and editable text lines.
-- The first test renders used the client's NAME as the headline, and the image model drew the animal named in the
-- text (client "Chicken Happy Hour" → chickens) although the Style Card's subjects were Highland cows. The subject now
-- comes from the Style Card (or the designer), and the brief says the lettering must not change it.

drop function if exists public.create_style_test_card(uuid);
create function public.create_style_test_card(
  p_client_id uuid, p_subject text default null, p_lines jsonb default null, p_style_card_id uuid default null)
 returns public.cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare cl public.clients; sc public.style_cards; c public.cards; refs text[]; lines jsonb; subject text; brief text; l jsonb;
        cid uuid := gen_random_uuid();
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cl from public.clients where id = p_client_id and active;
  if not found then raise exception 'client not found or inactive'; end if;
  select array_agg(path order by created_at desc, id desc) into refs
    from (select path, created_at, id from public.client_references where client_id = p_client_id and not excluded order by created_at desc, id desc limit 3) r;
  if coalesce(array_length(refs, 1), 0) = 0 then raise exception 'upload reference images to the library first'; end if;

  -- subject: the designer's, else the first subject of the chosen (or the locked) Style Card
  subject := nullif(btrim(coalesce(p_subject, '')), '');
  if subject is null then
    if p_style_card_id is not null then
      select * into sc from public.style_cards where id = p_style_card_id and client_id = p_client_id;
    else
      sc := public.current_style_card(p_client_id);
    end if;
    if sc.id is not null and jsonb_typeof(sc.json->'subjects') = 'array' then subject := nullif(btrim(sc.json->'subjects'->>0), ''); end if;
  end if;
  if subject is null then raise exception 'give the test render a subject (the Style Card has none)'; end if;
  if length(subject) > 200 then raise exception 'subject is too long (200 characters max)'; end if;

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
  insert into public.cards (id, client_id, stage, source, brief_text, print_text, reference_paths, garment_color, placement, similarity_tier, client_submission)
  values (cid, p_client_id, 'intake', 'style_test', brief, lines, refs, coalesce(cl.garment_colors[1], 'black'), 'front_chest', 1,
          jsonb_build_object('source', 'style_test', 'created_by', auth.uid(), 'subject', subject, 'style_card_id', p_style_card_id,
                             'brief_text', brief, 'print_text', lines, 'reference_paths', refs, 'submitted_at', now()))
  returning * into c;
  return c;
end $function$;

revoke all on function public.create_style_test_card(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.create_style_test_card(uuid, text, jsonb, uuid) to authenticated, service_role;
