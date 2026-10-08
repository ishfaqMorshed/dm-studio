-- studio_31 (2026-10-08, hosting prep): trigger functions are not RPCs. PostgreSQL checks EXECUTE on a trigger function only
-- when the trigger is created, never when it fires, so dropping the PUBLIC grant changes nothing for the app or n8n and
-- silences the security advisor's "anon / authenticated can execute SECURITY DEFINER function" warnings for these two.
-- The remaining anon-executable SECURITY DEFINER functions are by design (public brief form: resolve_form_token, start_brief,
-- submit_brief, refs_upload_ok; workers guarded by studio_secret_ok(); is_staff / is_lead) and each checks inside.
revoke execute on function public.brief_parse_notify() from public, anon, authenticated;
revoke execute on function public.style_draft_requests_require_brief() from public, anon, authenticated;
do $$ begin
  if has_function_privilege('anon', 'public.brief_parse_notify()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.style_draft_requests_require_brief()', 'EXECUTE') then
    raise exception 'studio_31: a trigger function is still executable through the API';
  end if;
end $$;
