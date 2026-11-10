create policy bookkit_storage_owner_delete on storage.objects for delete to authenticated
 using(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(storage.objects.name,'/',1) and p.owner_id=auth.uid()));
