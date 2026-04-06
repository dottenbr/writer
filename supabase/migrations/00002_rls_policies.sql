-- ============================================================
-- Writer App: Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.acts enable row level security;
alter table public.chapters enable row level security;
alter table public.scenes enable row level security;
alter table public.characters enable row level security;
alter table public.character_relationships enable row level security;
alter table public.threads enable row level security;
alter table public.locations enable row level security;
alter table public.codex_entries enable row level security;
alter table public.comments enable row level security;
alter table public.comment_replies enable row level security;
alter table public.snapshots enable row level security;
alter table public.snapshot_chapters enable row level security;
alter table public.project_settings enable row level security;
alter table public.export_configs enable row level security;
alter table public.llm_settings enable row level security;
alter table public.inspiration_items enable row level security;

-- Helper: check if user has minimum role on a project
create or replace function public.has_project_access(p_project_id uuid, p_min_role public.project_role)
returns boolean as $$
begin
  -- Owner always has access
  if exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    return true;
  end if;
  -- Check membership
  return exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and accepted_at is not null
      and (
        p_min_role = 'viewer'
        or (p_min_role = 'editor' and role in ('editor', 'owner'))
        or (p_min_role = 'owner' and role = 'owner')
      )
  );
end;
$$ language plpgsql security definer stable;

-- ========== Profiles ==========
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (id = auth.uid());

-- ========== Projects ==========
create policy "projects_select" on public.projects for select
  using (has_project_access(id, 'viewer'));
create policy "projects_insert" on public.projects for insert
  with check (owner_id = auth.uid());
create policy "projects_update" on public.projects for update
  using (has_project_access(id, 'editor'));
create policy "projects_delete" on public.projects for delete
  using (owner_id = auth.uid());

-- ========== Project Members ==========
create policy "members_select" on public.project_members for select
  using (has_project_access(project_id, 'viewer'));
create policy "members_insert" on public.project_members for insert
  with check (exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()));
create policy "members_update" on public.project_members for update
  using (exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()));
create policy "members_delete" on public.project_members for delete
  using (exists (select 1 from public.projects where id = project_id and owner_id = auth.uid()));

-- ========== Acts ==========
create policy "acts_select" on public.acts for select using (has_project_access(project_id, 'viewer'));
create policy "acts_insert" on public.acts for insert with check (has_project_access(project_id, 'editor'));
create policy "acts_update" on public.acts for update using (has_project_access(project_id, 'editor'));
create policy "acts_delete" on public.acts for delete using (has_project_access(project_id, 'editor'));

-- ========== Chapters ==========
create policy "chapters_select" on public.chapters for select using (has_project_access(project_id, 'viewer'));
create policy "chapters_insert" on public.chapters for insert with check (has_project_access(project_id, 'editor'));
create policy "chapters_update" on public.chapters for update using (has_project_access(project_id, 'editor'));
create policy "chapters_delete" on public.chapters for delete using (has_project_access(project_id, 'editor'));

-- ========== Scenes ==========
create policy "scenes_select" on public.scenes for select
  using (exists (select 1 from public.chapters c where c.id = chapter_id and has_project_access(c.project_id, 'viewer')));
create policy "scenes_insert" on public.scenes for insert
  with check (exists (select 1 from public.chapters c where c.id = chapter_id and has_project_access(c.project_id, 'editor')));
create policy "scenes_update" on public.scenes for update
  using (exists (select 1 from public.chapters c where c.id = chapter_id and has_project_access(c.project_id, 'editor')));
create policy "scenes_delete" on public.scenes for delete
  using (exists (select 1 from public.chapters c where c.id = chapter_id and has_project_access(c.project_id, 'editor')));

-- ========== Characters ==========
create policy "characters_select" on public.characters for select using (has_project_access(project_id, 'viewer'));
create policy "characters_insert" on public.characters for insert with check (has_project_access(project_id, 'editor'));
create policy "characters_update" on public.characters for update using (has_project_access(project_id, 'editor'));
create policy "characters_delete" on public.characters for delete using (has_project_access(project_id, 'editor'));

-- ========== Character Relationships ==========
create policy "char_rels_select" on public.character_relationships for select
  using (exists (select 1 from public.characters c where c.id = character_id and has_project_access(c.project_id, 'viewer')));
create policy "char_rels_insert" on public.character_relationships for insert
  with check (exists (select 1 from public.characters c where c.id = character_id and has_project_access(c.project_id, 'editor')));
create policy "char_rels_update" on public.character_relationships for update
  using (exists (select 1 from public.characters c where c.id = character_id and has_project_access(c.project_id, 'editor')));
create policy "char_rels_delete" on public.character_relationships for delete
  using (exists (select 1 from public.characters c where c.id = character_id and has_project_access(c.project_id, 'editor')));

-- ========== Threads ==========
create policy "threads_select" on public.threads for select using (has_project_access(project_id, 'viewer'));
create policy "threads_insert" on public.threads for insert with check (has_project_access(project_id, 'editor'));
create policy "threads_update" on public.threads for update using (has_project_access(project_id, 'editor'));
create policy "threads_delete" on public.threads for delete using (has_project_access(project_id, 'editor'));

-- ========== Locations ==========
create policy "locations_select" on public.locations for select using (has_project_access(project_id, 'viewer'));
create policy "locations_insert" on public.locations for insert with check (has_project_access(project_id, 'editor'));
create policy "locations_update" on public.locations for update using (has_project_access(project_id, 'editor'));
create policy "locations_delete" on public.locations for delete using (has_project_access(project_id, 'editor'));

-- ========== Codex Entries ==========
create policy "codex_select" on public.codex_entries for select using (has_project_access(project_id, 'viewer'));
create policy "codex_insert" on public.codex_entries for insert with check (has_project_access(project_id, 'editor'));
create policy "codex_update" on public.codex_entries for update using (has_project_access(project_id, 'editor'));
create policy "codex_delete" on public.codex_entries for delete using (has_project_access(project_id, 'editor'));

-- ========== Comments (viewers CAN comment) ==========
create policy "comments_select" on public.comments for select
  using (has_project_access(project_id, 'viewer'));
create policy "comments_insert" on public.comments for insert
  with check (has_project_access(project_id, 'viewer') and author_id = auth.uid());
create policy "comments_update" on public.comments for update
  using (author_id = auth.uid());
create policy "comments_delete" on public.comments for delete
  using (author_id = auth.uid() or exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
  ));

-- ========== Comment Replies ==========
create policy "replies_select" on public.comment_replies for select
  using (exists (
    select 1 from public.comments c where c.id = comment_id and has_project_access(c.project_id, 'viewer')
  ));
create policy "replies_insert" on public.comment_replies for insert
  with check (author_id = auth.uid() and exists (
    select 1 from public.comments c where c.id = comment_id and has_project_access(c.project_id, 'viewer')
  ));
create policy "replies_delete" on public.comment_replies for delete
  using (author_id = auth.uid());

-- ========== Snapshots ==========
create policy "snapshots_select" on public.snapshots for select using (has_project_access(project_id, 'viewer'));
create policy "snapshots_insert" on public.snapshots for insert with check (has_project_access(project_id, 'editor'));

-- ========== Snapshot Chapters ==========
create policy "snap_ch_select" on public.snapshot_chapters for select
  using (exists (select 1 from public.snapshots s where s.id = snapshot_id and has_project_access(s.project_id, 'viewer')));
create policy "snap_ch_insert" on public.snapshot_chapters for insert
  with check (exists (select 1 from public.snapshots s where s.id = snapshot_id and has_project_access(s.project_id, 'editor')));

-- ========== Project Settings ==========
create policy "settings_select" on public.project_settings for select using (has_project_access(project_id, 'viewer'));
create policy "settings_insert" on public.project_settings for insert with check (has_project_access(project_id, 'editor'));
create policy "settings_update" on public.project_settings for update using (has_project_access(project_id, 'editor'));

-- ========== Export Configs ==========
create policy "export_select" on public.export_configs for select using (has_project_access(project_id, 'viewer'));
create policy "export_insert" on public.export_configs for insert with check (has_project_access(project_id, 'editor'));
create policy "export_update" on public.export_configs for update using (has_project_access(project_id, 'editor'));

-- ========== LLM Settings ==========
create policy "llm_select" on public.llm_settings for select using (has_project_access(project_id, 'editor'));
create policy "llm_insert" on public.llm_settings for insert with check (has_project_access(project_id, 'editor'));
create policy "llm_update" on public.llm_settings for update using (has_project_access(project_id, 'editor'));

-- ========== Inspiration Items ==========
create policy "insp_select" on public.inspiration_items for select using (has_project_access(project_id, 'viewer'));
create policy "insp_insert" on public.inspiration_items for insert with check (has_project_access(project_id, 'editor'));
create policy "insp_update" on public.inspiration_items for update using (has_project_access(project_id, 'editor'));
create policy "insp_delete" on public.inspiration_items for delete using (has_project_access(project_id, 'editor'));

-- ========== Storage Policies ==========
create policy "inspiration_storage_select" on storage.objects for select
  using (bucket_id = 'inspiration');
create policy "inspiration_storage_insert" on storage.objects for insert
  with check (bucket_id = 'inspiration');
create policy "inspiration_storage_delete" on storage.objects for delete
  using (bucket_id = 'inspiration');
