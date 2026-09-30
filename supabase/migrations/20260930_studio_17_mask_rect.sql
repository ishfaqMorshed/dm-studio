-- studio_17 · Region edits keep their rectangle
-- The worker pastes the edited rectangle back onto the untouched parent image (WF-3 "Composite Region"), so everything
-- outside the rectangle stays pixel-identical. The frontend sends the rectangle in pixels of the parent image.
alter table public.generations add column if not exists mask_rect jsonb;
comment on column public.generations.mask_rect is 'edit_region only: {x,y,w,h,width,height} in pixels of the parent image (width/height = parent image size)';

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
      magic_prompt_json, edit_instruction, old_text, new_text, mask_path, mask_rect, platform)
  values (parent.card_id, parent.id, p_kind, 'queued',
      parent.style_card_id, parent.style_card_version, parent.style_card_snapshot, c.brief_snapshot,
      coalesce(p_payload->'magic_prompt_json', parent.magic_prompt_json),
      p_payload->>'instruction', p_payload->>'old_text', p_payload->>'new_text', p_payload->>'mask_path',
      case when jsonb_typeof(p_payload->'mask_rect') = 'object' then p_payload->'mask_rect' else null end,
      coalesce(plat, (select ai_platform from public.settings where id = 1)))
  returning * into child;

  perform public.move_card(parent.card_id, 'editing', null);
  return child;
end $function$;
