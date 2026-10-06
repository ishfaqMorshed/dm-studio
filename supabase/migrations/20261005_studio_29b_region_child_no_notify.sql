-- studio_29b · Fix an area: Extend area / Use full regeneration must never start WF-3 (review finding, 2026-10-06).
-- rpc region_child (studio_29) inserts the recombined child with status 'done' and relies on the edit trigger firing only
-- for status 'queued'. Until now that gate lived only inside the phase-1 body of generations_notify_edit() (applied from
-- the 2026-09-16 session, no file under supabase/migrations) and the trigger itself had no WHEN clause - nothing in the
-- repo owned, showed or verified it. Had the gate been missing, every Extend area / Use full regeneration would have
-- POSTed /webhook/studio-edit for the child: WF-3 would PATCH it back to working, bill one Sunburst call (~$0.07),
-- overwrite <card>/<child>.raw.png and <card>/<child>.png, and the "$0, no AI" promise would be false.
-- This migration takes ownership with two independent gates: the function keeps its body test (kind <> generate AND
-- status = queued) and the trigger gets the same condition as a WHEN clause, visible in pg_get_triggerdef. The DO block
-- at the end refuses to finish unless both are in place. Existing paths are unchanged: request_edit inserts status
-- 'queued' (fires as before), approve_card inserts kind 'generate' (never fired), retry_card UPDATEs status (an AFTER
-- INSERT trigger never saw it; the 2-min sweep requeues). Idempotent; harmless to the live WF-3.
create or replace function public.generations_notify_edit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Only a freshly queued edit starts WF-3. region_child's extend / full children arrive with status 'done' ($0, no AI)
  -- and must never be re-rendered; this test and the trigger's WHEN clause are two independent gates.
  if new.kind <> 'generate' and new.status = 'queued' then
    perform public.studio_notify('studio-edit', jsonb_build_object('event', 'edit.requested', 'generation_id', new.id, 'card_id', new.card_id, 'kind', new.kind));
  end if;
  return new;
end $function$;
revoke execute on function public.generations_notify_edit() from public, anon, authenticated;
comment on function public.generations_notify_edit() is 'AFTER INSERT on generations: POSTs /webhook/studio-edit (WF-3) only when kind <> generate AND status = queued (the trigger WHEN clause repeats the gate, studio_29b); region_child children (status done) never fire';

drop trigger if exists generations_notify_edit on public.generations;
create trigger generations_notify_edit
  after insert on public.generations
  for each row
  when (new.kind <> 'generate' and new.status = 'queued')
  execute function public.generations_notify_edit();

comment on function public.region_child(uuid, uuid, text, jsonb, text, jsonb, numeric) is 'Fix an area extend/full: inserts the finished child (status done - generations_notify_edit fires only for status queued, gate owned by studio_29b) after region-composite uploaded its PNG, and makes it current';

-- Self-check: the migration fails loudly unless both gates are visible.
do $$
declare def text; src text;
begin
  select pg_get_triggerdef(t.oid) into def
    from pg_trigger t
   where t.tgrelid = 'public.generations'::regclass and t.tgname = 'generations_notify_edit' and not t.tgisinternal;
  if def is null or def !~* 'new\.status\s*=\s*''queued''' then
    raise exception 'studio_29b: trigger generations_notify_edit lacks the status = queued gate: %', coalesce(def, '<missing>');
  end if;
  if def !~* 'after insert on public\.generations' then
    raise exception 'studio_29b: trigger generations_notify_edit is not AFTER INSERT: %', def;
  end if;
  select pg_get_functiondef('public.generations_notify_edit()'::regprocedure) into src;
  if src !~* 'new\.status\s*=\s*''queued''' then
    raise exception 'studio_29b: function generations_notify_edit() lacks the status = queued gate';
  end if;
end $$;
