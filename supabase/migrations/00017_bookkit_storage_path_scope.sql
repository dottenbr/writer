-- Qualify the outer storage object name; projects also has a name column.
drop policy bookkit_storage_read on storage.objects;
drop policy bookkit_storage_insert on storage.objects;
create policy bookkit_storage_read on storage.objects for select to authenticated using(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(storage.objects.name,'/',1) and public.has_project_access(p.id,'viewer')));
create policy bookkit_storage_insert on storage.objects for insert to authenticated with check(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(storage.objects.name,'/',1) and public.has_project_access(p.id,'editor')));
