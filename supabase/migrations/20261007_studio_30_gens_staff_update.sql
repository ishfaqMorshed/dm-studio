-- studio_30 · gens bucket: staff may REPLACE an object (2026-10-07).
-- Fix an area uploads the mask as gens/<card_id>/<generation_id>-mask.png with upsert so a second edit of the SAME
-- version replaces the earlier mask (src/components/card/mask.ts). The gens bucket had staff policies for SELECT,
-- INSERT and DELETE only (refs has refs_staff_update), so the replace failed with "new row violates row-level security
-- policy" and the dialog said "A mask for this generation already exists and could not be replaced". Staff can already
-- delete + insert, so an UPDATE policy with the same predicate adds no new capability. The worker (anon + studio
-- secret) keeps gens_worker_all. Idempotent.
drop policy if exists gens_staff_update on storage.objects;
create policy gens_staff_update on storage.objects
  for update to authenticated
  using (bucket_id = 'gens' and public.is_staff())
  with check (bucket_id = 'gens' and public.is_staff());

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'gens_staff_update' and cmd = 'UPDATE') then
    raise exception 'studio_30: policy gens_staff_update is missing';
  end if;
end $$;
