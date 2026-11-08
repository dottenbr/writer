insert into storage.buckets(id,name,public,file_size_limit) values('bookkit-assets','bookkit-assets',false,16777216);
create table public.bookkit_assets (
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null check(path !~ '(^/|(^|/)\.\.(/|$))' and position(chr(92) in path)=0),
 size_bytes bigint not null check(size_bytes>=0),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 unix_mode integer not null default 33188,
 chunks jsonb not null check(jsonb_typeof(chunks)='array'),
 created_at timestamptz not null default now(),
 primary key(project_id,path)
);
alter table public.bookkit_assets enable row level security;
create policy assets_read on public.bookkit_assets for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy assets_insert on public.bookkit_assets for insert to authenticated with check(public.has_project_access(project_id,'editor'));
create policy assets_update on public.bookkit_assets for update to authenticated using(public.has_project_access(project_id,'editor')) with check(public.has_project_access(project_id,'editor'));
create policy assets_delete on public.bookkit_assets for delete to authenticated using(public.has_project_access(project_id,'owner'));
create policy bookkit_storage_read on storage.objects for select to authenticated using(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(name,'/',1) and public.has_project_access(p.id,'viewer')));
create policy bookkit_storage_insert on storage.objects for insert to authenticated with check(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(name,'/',1) and public.has_project_access(p.id,'editor')));
alter table public.bookkit_documents add column unix_mode integer not null default 33188;
