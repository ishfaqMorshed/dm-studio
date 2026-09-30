-- studio_16 · Retry re-runs intake
-- Retry on a card that failed during intake moves it back to 'intake' (retry_card → move_card), but the intake
-- webhook only fired on INSERT, so the card sat in intake forever (E2E-014). Fire it on any move INTO intake as well.
create or replace function public.cards_notify_intake()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.stage = 'intake' and (tg_op = 'INSERT' or old.stage is distinct from 'intake') then
    perform public.studio_notify('studio-intake', jsonb_build_object(
      'event', case when tg_op = 'INSERT' then 'card.created' else 'card.retried' end,
      'card_id', new.id, 'client_id', new.client_id));
  end if;
  return new;
end $function$;

drop trigger if exists cards_notify_intake on public.cards;
create trigger cards_notify_intake
  after insert or update of stage on public.cards
  for each row execute function public.cards_notify_intake();
