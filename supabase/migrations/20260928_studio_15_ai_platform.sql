-- studio_15 · AI platform switch (Kie / OpenRouter / Auto)
-- settings.ai_platform is the studio default: WF-1 intake, WF-1b style drafts and WF-7 lessons always use it, and the
-- card page preselects it for Approve / Edit text / Edit region / Regenerate. The designer's choice for one run is stored
-- on generations.platform (NULL = follow the default); generations.vendor records the platform that actually produced
-- the image ('kie' or 'openrouter' - with 'auto' a Kie outage moves the call to OpenRouter).
-- openrouter_models maps each job to the OpenRouter model id (same models as on Kie).

alter table public.settings
  add column if not exists ai_platform text not null default 'kie',
  add column if not exists openrouter_models jsonb not null default
    '{"vision": "google/gemini-3.1-pro-preview", "image": "openai/gpt-image-2.5-sunburst", "text": "anthropic/claude-sonnet-4.6"}'::jsonb;

alter table public.settings drop constraint if exists settings_ai_platform_check;
alter table public.settings add constraint settings_ai_platform_check check (ai_platform in ('kie', 'openrouter', 'auto'));

alter table public.generations add column if not exists platform text;
alter table public.generations drop constraint if exists generations_platform_check;
alter table public.generations add constraint generations_platform_check
  check (platform is null or platform in ('kie', 'openrouter', 'auto'));

comment on column public.settings.ai_platform is 'Studio default AI platform: kie | openrouter | auto (Kie first, OpenRouter when Kie reports it is down)';
comment on column public.settings.openrouter_models is 'OpenRouter model id per job: {vision, image, text}';
comment on column public.generations.platform is 'Platform the designer chose for this run (NULL = settings.ai_platform); vendor = platform that produced it';

-- approve_card: optional p_platform, stored on the first generation
drop function if exists public.approve_card(uuid);
create function public.approve_card(p_card_id uuid, p_platform text default null)
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
  sc := public.current_style_card(c.client_id);
  if sc.id is null then raise exception 'client has no locked Style Card'; end if;

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

revoke all on function public.approve_card(uuid, text) from public, anon;
grant execute on function public.approve_card(uuid, text) to authenticated, service_role;

-- request_edit: platform from p_payload->>'platform' (else the studio default), stored on the child generation
create or replace function public.request_edit(p_generation_id uuid, p_kind generation_kind, p_payload jsonb default '{}'::jsonb)
 returns public.generations
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare parent public.generations; c public.cards; child public.generations; plat text;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind = 'generate' then raise exception 'use approve_card for the first generation'; end if;
  plat := nullif(p_payload->>'platform', '');
  if plat is not null and plat not in ('kie', 'openrouter', 'auto') then raise exception 'unknown platform %', plat; end if;
  select * into parent from public.generations where id = p_generation_id;
  if not found then raise exception 'generation not found'; end if;
  select * into c from public.cards where id = parent.card_id for update;
  if c.stage <> 'needs_review' then raise exception 'card must be in needs_review (is %)', c.stage; end if;
  if (select pipeline_paused from public.settings where id = 1) then raise exception 'pipeline is paused'; end if;

  -- record the designer's verdict on the parent
  update public.generations
     set rejection_reason = coalesce((p_payload->>'rejection_reason')::public.rejection_reason, rejection_reason),
         rejection_note = coalesce(p_payload->>'rejection_note', rejection_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = parent.id;

  insert into public.generations (card_id, parent_generation_id, kind, status,
      style_card_id, style_card_version, style_card_snapshot, brief_snapshot,
      magic_prompt_json, edit_instruction, old_text, new_text, mask_path, platform)
  values (parent.card_id, parent.id, p_kind, 'queued',
      parent.style_card_id, parent.style_card_version, parent.style_card_snapshot, c.brief_snapshot,
      coalesce(p_payload->'magic_prompt_json', parent.magic_prompt_json),
      p_payload->>'instruction', p_payload->>'old_text', p_payload->>'new_text', p_payload->>'mask_path',
      coalesce(plat, (select ai_platform from public.settings where id = 1)))
  returning * into child;

  perform public.move_card(parent.card_id, 'editing', null);
  return child;
end $function$;

-- studio_15b · edits run on Nano Banana (Kie google/nano-banana-edit) → OpenRouter google/gemini-2.5-flash-image
alter table public.settings alter column openrouter_models set default
  '{"vision": "google/gemini-3.1-pro-preview", "image": "openai/gpt-image-2.5-sunburst", "edit": "google/gemini-2.5-flash-image", "text": "anthropic/claude-sonnet-4.6"}'::jsonb;
update public.settings set openrouter_models = openrouter_models || '{"edit": "google/gemini-2.5-flash-image"}'::jsonb
 where not (openrouter_models ? 'edit');
comment on column public.settings.openrouter_models is 'OpenRouter model id per job: {vision, image, edit, text} - same models as Kie (edit = Nano Banana, Kie google/nano-banana-edit)';
