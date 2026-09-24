-- current_style_card(p_client_id) is SECURITY DEFINER and executable by anon, so before this change any caller holding the
-- public apikey could read a client's locked Style Card JSON with no x-studio-secret (bypassing style_cards RLS).
-- Guard inside the function: only the worker (x-studio-secret validated by studio_secret_ok) or a staff user (is_staff)
-- gets a row; everyone else gets no row. Signature, return type and grants are unchanged so prompt-engine and the app
-- keep calling it the same way. No secret value appears here - the secret is compared inside studio_secret_ok.
create or replace function public.current_style_card(p_client_id uuid)
returns public.style_cards
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from public.style_cards
  where client_id = p_client_id
    and status = 'locked'
    and (public.studio_secret_ok() or public.is_staff())
  order by version desc
  limit 1;
$$;
