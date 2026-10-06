-- studio_29 · Fix an area = GPT Image 2.5 Sunburst (OpenRouter), locked outside. The model regenerates the whole design;
-- Edge Function region-composite keeps only the change (new pixels inside the box, linear fade across a ring of
-- settings.region_ring_pct % of the width, parent byte-identical beyond). Extend / full re-use the stored raw regeneration ($0).
alter table public.generations
  add column if not exists raw_image_path text,
  add column if not exists region_metrics jsonb,
  add column if not exists composite_mode text;
alter table public.generations drop constraint if exists generations_composite_mode_check;
alter table public.generations add constraint generations_composite_mode_check
  check (composite_mode is null or composite_mode in ('locked', 'extend', 'full'));
comment on column public.generations.raw_image_path is 'edit_region only: gens path of the untouched full regeneration (<card_id>/<generation_id>.raw.png); extend/full children reuse their source''s path';
comment on column public.generations.region_metrics is 'edit_region only: region-composite measurements, version 1 (shift, colour offset, raw drift, overflow + suggested_rect, seam ratios, gate)';
comment on column public.generations.composite_mode is 'edit_region only: locked | extend | full';

alter table public.settings add column if not exists region_ring_pct numeric not null default 3;
alter table public.settings drop constraint if exists settings_region_ring_pct_check;
alter table public.settings add constraint settings_region_ring_pct_check check (region_ring_pct >= 1 and region_ring_pct <= 10);
comment on column public.settings.region_ring_pct is 'Fix an area: soft-blend ring around the box, % of the image width; ring_px = max(8, round(pct/100 * width))';

alter table public.settings alter column openrouter_models set default
  '{"vision": "google/gemini-3.1-pro-preview", "image": "openai/gpt-image-2.5-sunburst", "edit": "google/gemini-2.5-flash-image", "region": "openai/gpt-image-2.5-sunburst", "text": "anthropic/claude-sonnet-4.6"}'::jsonb;
update public.settings set openrouter_models = openrouter_models || '{"region": "openai/gpt-image-2.5-sunburst"}'::jsonb
 where not (openrouter_models ? 'region');
comment on column public.settings.openrouter_models is 'OpenRouter model id per job: {vision, image, edit, region, text} - edit = Edit text (Nano Banana), region = Fix an area (GPT Image 2.5 Sunburst, locked outside)';

create or replace function public.region_child(
  p_source_generation_id uuid, p_child_id uuid, p_mode text, p_mask_rect jsonb,
  p_image_path text, p_region_metrics jsonb, p_drift_pct numeric default null)
 returns public.generations
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare s public.generations; c public.cards; child public.generations;
begin
  if not (public.is_staff() or public.studio_secret_ok()) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('extend', 'full') then raise exception 'mode must be extend or full (is %)', p_mode; end if;
  select * into s from public.generations where id = p_source_generation_id;
  if not found then raise exception 'generation not found'; end if;
  if s.kind <> 'edit_region' or s.status <> 'done' or s.raw_image_path is null or s.parent_generation_id is null then
    raise exception 'generation % has no stored full regeneration to re-use', s.id;
  end if;
  select * into c from public.cards where id = s.card_id for update;
  if c.stage <> 'needs_review' then raise exception 'card must be in needs_review (is %)', c.stage; end if;
  if jsonb_typeof(p_mask_rect) <> 'object' then raise exception 'mask_rect must be an object'; end if;
  if p_image_path is distinct from (s.card_id::text || '/' || p_child_id::text || '.png') then
    raise exception 'image_path must be <card_id>/<child_id>.png';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'gens' and name = p_image_path) then
    raise exception 'image % was not uploaded', p_image_path;
  end if;
  insert into public.generations (id, card_id, parent_generation_id, kind, status, attempt,
      style_card_id, style_card_version, style_card_snapshot, brief_snapshot, magic_prompt_json, final_prompt, rendered_prompt,
      model, vendor, platform, aspect_ratio, resolution, reference_urls, edit_instruction, mask_path, mask_rect,
      raw_image_path, composite_mode, region_metrics, drift_pct, image_path, started_at, finished_at)
  values (p_child_id, s.card_id, s.parent_generation_id, 'edit_region', 'done', 1,
      s.style_card_id, s.style_card_version, s.style_card_snapshot, s.brief_snapshot, s.magic_prompt_json, s.final_prompt, s.rendered_prompt,
      s.model, s.vendor, s.platform, s.aspect_ratio, s.resolution, s.reference_urls, s.edit_instruction,
      case when p_mode = 'full' then s.mask_path else null end,
      case when p_mode = 'full' then s.mask_rect else p_mask_rect end,
      s.raw_image_path, p_mode, p_region_metrics, p_drift_pct, p_image_path, now(), now())
  returning * into child;
  update public.cards set current_generation_id = child.id where id = c.id;
  return child;
end $function$;
revoke all on function public.region_child(uuid, uuid, text, jsonb, text, jsonb, numeric) from public;
grant execute on function public.region_child(uuid, uuid, text, jsonb, text, jsonb, numeric) to authenticated, anon, service_role;
comment on function public.region_child(uuid, uuid, text, jsonb, text, jsonb, numeric) is 'Fix an area extend/full: inserts the finished child (status done, so no WF-3 trigger) after region-composite uploaded its PNG, and makes it current';
