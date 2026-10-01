-- studio_24 · start_brief carries the reference slot order (spec docs/stylecard-v2-spec.md section 4.5).
-- The public brief form runs anonymously and public.settings is readable by staff and workers only, so the form
-- could not relabel its three slots from settings.reference_roles: it showed the recorded default while
-- submit_brief stamps the LIVE settings order (default_reference_roles(3)). After one UPDATE on settings the client
-- would have uploaded "What to make" into a slot the card records as something else. The grant start_brief already
-- returns is the one read the form has, so the order rides along as 'reference_roles' (the settings jsonb when it
-- is an array, else the recorded default). The frontend (src/lib/api.ts BriefStart.reference_roles, BriefForm)
-- reads it and falls back to the default order for an older start_brief without the key.
-- Same signature as before, so create or replace keeps the owner; the grants are restated (anon and authenticated
-- execute, as today). Re-runnable. No secrets, keys or URLs appear in this file.

create or replace function public.start_brief(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare c public.clients; n int; cid uuid; roles jsonb;
begin
  select * into c from public.clients where form_token = p_token and active;
  if c.id is null then raise exception 'invalid or expired form link' using errcode = '42501'; end if;
  select count(*) into n from private.upload_grants where client_id = c.id and created_at > now() - interval '24 hours';
  if n >= 40 then raise exception 'daily submission limit reached for this client'; end if;
  delete from private.upload_grants where expires_at < now() - interval '1 day';
  cid := gen_random_uuid();
  insert into private.upload_grants (card_id, client_id, expires_at) values (cid, c.id, now() + interval '15 minutes');
  -- the slot order the form labels with and submit_brief stamps (settings.reference_roles, else the recorded default)
  select case when jsonb_typeof(s.reference_roles) = 'array' and jsonb_array_length(s.reference_roles) >= 3
              then s.reference_roles else '["subject","art_style","typography"]'::jsonb end
    into roles from public.settings s where s.id = 1;
  return jsonb_build_object(
    'card_id', cid, 'client_id', c.id, 'client_name', c.name, 'garment_colors', c.garment_colors,
    'expires_at', now() + interval '15 minutes',
    'reference_roles', coalesce(roles, '["subject","art_style","typography"]'::jsonb));
end $function$;

revoke all on function public.start_brief(text) from public;
grant execute on function public.start_brief(text) to anon, authenticated, service_role;
