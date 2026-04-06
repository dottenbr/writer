alter table public.snapshots
  add column if not exists project_state jsonb not null default '{}'::jsonb;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select_project_members_only" on public.profiles for select
  using (
    public.profiles.id = auth.uid()
    or exists (
      select 1
      from public.project_members pm_self
      join public.project_members pm_other on pm_self.project_id = pm_other.project_id
      where pm_self.user_id = auth.uid()
        and pm_self.accepted_at is not null
        and pm_other.user_id = public.profiles.id
        and pm_other.accepted_at is not null
    )
    or exists (
      select 1
      from public.projects owned_by_me
      where owned_by_me.owner_id = auth.uid()
        and exists (
          select 1
          from public.project_members pm_other
          where pm_other.project_id = owned_by_me.id
            and pm_other.user_id = public.profiles.id
        )
    )
  );

drop policy if exists "llm_select" on public.llm_settings;
drop policy if exists "llm_insert" on public.llm_settings;
drop policy if exists "llm_update" on public.llm_settings;
create policy "llm_owner_only_select" on public.llm_settings for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "llm_owner_only_insert" on public.llm_settings for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "llm_owner_only_update" on public.llm_settings for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

drop policy if exists "inspiration_storage_select" on storage.objects;
drop policy if exists "inspiration_storage_insert" on storage.objects;
drop policy if exists "inspiration_storage_delete" on storage.objects;

create policy "inspiration_storage_select" on storage.objects for select
  using (
    bucket_id = 'inspiration'
    and has_project_access(split_part(name, '/', 1)::uuid, 'viewer')
  );

create policy "inspiration_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'inspiration'
    and has_project_access(split_part(name, '/', 1)::uuid, 'editor')
  );

create policy "inspiration_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'inspiration'
    and has_project_access(split_part(name, '/', 1)::uuid, 'editor')
  );
