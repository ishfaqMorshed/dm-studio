-- studio_22 · Locking an older draft must make it the contract.
-- current_style_card() = the locked card with the highest version. Locking v3 after v4 was locked left v4 current
-- although the wizard promised "every new brief uses v3". Now, when the version being locked is below the current
-- locked version, the lock creates the next version (a copy of that draft's json) and locks it, so the newest locked
-- version is always the one the designer chose. The old draft row stays as history.

create or replace function public.lock_style_card(p_style_card_id uuid, p_note text default null)
 returns public.style_cards
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare sc public.style_cards; cur public.style_cards; nv int; copy public.style_cards;
begin
  if not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into sc from public.style_cards where id = p_style_card_id for update;
  if not found then raise exception 'style card not found'; end if;
  if sc.status = 'locked' then return sc; end if;
  if sc.json = '{}'::jsonb then raise exception 'style card is empty'; end if;
  cur := public.current_style_card(sc.client_id);
  if cur.id is not null and cur.version > sc.version then
    -- an older draft chosen after a newer lock: re-issue it as the next version so it becomes current
    select coalesce(max(version), 0) + 1 into nv from public.style_cards where client_id = sc.client_id;
    insert into public.style_cards (client_id, version, status, json, created_by, locked_by, locked_at, note)
    values (sc.client_id, nv, 'locked', sc.json, auth.uid(), auth.uid(), now(),
            coalesce(p_note, 'locked from v' || sc.version))
    returning * into copy;
    return copy;
  end if;
  update public.style_cards
     set status = 'locked', locked_by = auth.uid(), locked_at = now(), note = coalesce(p_note, note)
   where id = p_style_card_id returning * into sc;
  return sc;
end $function$;
