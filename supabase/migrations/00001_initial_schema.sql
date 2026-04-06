-- ============================================================
-- Writer App: Initial Schema
-- ============================================================

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Brief fields (flattened for granular updates)
  brief_title text not null default '',
  brief_subtitle text not null default '',
  brief_genre text not null default '',
  brief_logline text not null default '',
  brief_themes text[] not null default '{}',
  brief_synopsis text not null default '',
  brief_target_word_count integer not null default 80000,
  brief_writing_style text not null default '',
  brief_audience text not null default '',
  brief_comparable_titles text not null default '',
  brief_notes text not null default '',
  general_notes text not null default ''
);

create index idx_projects_owner on public.projects(owner_id);

-- Project roles
create type public.project_role as enum ('owner', 'editor', 'viewer');

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'viewer',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(project_id, user_id)
);

create index idx_project_members_project on public.project_members(project_id);
create index idx_project_members_user on public.project_members(user_id);

-- Acts
create table public.acts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_acts_project on public.acts(project_id);

-- Chapters
create type public.section_type as enum (
  'chapter', 'prologue', 'epilogue', 'foreword', 'afterword', 'authors_note'
);
create type public.chapter_status as enum ('outline', 'draft', 'revision', 'polished');

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  act_id uuid references public.acts(id) on delete set null,
  sort_order integer not null default 0,
  section_type public.section_type not null default 'chapter',
  title text not null default '',
  summary text not null default '',
  content text not null default '',
  notes text not null default '',
  word_count integer not null default 0,
  status public.chapter_status not null default 'outline',
  -- Writing dials
  dial_words integer not null default 3000,
  dial_lyricism integer not null default 2,
  dial_dialogue integer not null default 2,
  dial_metaphor integer not null default 2,
  dial_pacing integer not null default 2,
  dial_humour integer not null default 1,
  dial_texture integer not null default 2,
  dial_clarity integer not null default 2,
  -- Optimistic locking
  version integer not null default 1,
  locked_by uuid references public.profiles(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_chapters_project on public.chapters(project_id);
create index idx_chapters_act on public.chapters(act_id);

-- Scenes
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  sort_order integer not null default 0,
  title text not null default '',
  summary text not null default '',
  pov text not null default '',
  location text not null default '',
  characters text[] not null default '{}',
  notes text not null default '',
  word_target integer not null default 1500,
  created_at timestamptz not null default now()
);

create index idx_scenes_chapter on public.scenes(chapter_id);

-- Bible: Characters
create type public.character_role as enum (
  'protagonist', 'antagonist', 'supporting', 'minor', 'mentioned'
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'New Character',
  also_known_as text[] not null default '{}',
  role public.character_role not null default 'supporting',
  age text not null default '',
  description text not null default '',
  backstory text not null default '',
  motivation text not null default '',
  arc text not null default '',
  personality text not null default '',
  strengths text not null default '',
  weaknesses text not null default '',
  internal_conflict text not null default '',
  physical_presence text not null default '',
  knows text not null default '',
  believes text not null default '',
  conceals text not null default '',
  blind_spots text not null default '',
  fears text not null default '',
  hopes text not null default '',
  drafting_note text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index idx_characters_project on public.characters(project_id);

-- Character relationships
create type public.relationship_type as enum (
  'family', 'friendship', 'romantic', 'professional', 'mentor', 'rivalry', 'conflict', 'other'
);

create table public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  with_character_id uuid not null references public.characters(id) on delete cascade,
  type public.relationship_type not null default 'other',
  description text not null default '',
  unique(character_id, with_character_id)
);

create index idx_char_rels_character on public.character_relationships(character_id);

-- Threads
create type public.thread_type as enum ('main', 'subplot', 'thematic', 'mystery', 'romance');

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'New Thread',
  also_known_as text[] not null default '{}',
  type public.thread_type not null default 'subplot',
  timeframe text not null default '',
  description text not null default '',
  chapters integer[] not null default '{}',
  historical_anchors text[] not null default '{}',
  continuity_checks text not null default '',
  sources text[] not null default '{}',
  resolution text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index idx_threads_project on public.threads(project_id);

-- Locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'New Location',
  also_known_as text[] not null default '{}',
  timeframe text not null default '',
  geo_context text not null default '',
  description text not null default '',
  historical_context text not null default '',
  significance text not null default '',
  sensory_details text not null default '',
  sources text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index idx_locations_project on public.locations(project_id);

-- Codex entries
create type public.codex_entry_type as enum (
  'event', 'institution', 'term', 'person', 'timeline', 'doctrine', 'constraint'
);

create table public.codex_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_type public.codex_entry_type not null default 'term',
  category text not null default 'General',
  name text not null default 'New Entry',
  also_known_as text[] not null default '{}',
  timeframe text not null default '',
  sources text[] not null default '{}',
  content text not null default '',
  created_at timestamptz not null default now()
);

create index idx_codex_project on public.codex_entries(project_id);

-- Comments
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  text text not null default '',
  quoted_text text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_comments_chapter on public.comments(chapter_id);
create index idx_comments_project on public.comments(project_id);

create table public.comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  text text not null default '',
  created_at timestamptz not null default now()
);

create index idx_comment_replies_comment on public.comment_replies(comment_id);

-- Snapshots (replacing git versioning)
create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  message text not null default '',
  word_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_snapshots_project on public.snapshots(project_id, created_at desc);

create table public.snapshot_chapters (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots(id) on delete cascade,
  chapter_id uuid not null,
  sort_order integer not null default 0,
  title text not null default '',
  section_type public.section_type not null default 'chapter',
  content text not null default '',
  word_count integer not null default 0,
  status public.chapter_status not null default 'outline'
);

create index idx_snapshot_chapters_snapshot on public.snapshot_chapters(snapshot_id);

-- Project settings
create table public.project_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  font_family text not null default 'Source Serif 4',
  font_size integer not null default 18,
  line_height real not null default 1.8,
  dark_mode boolean not null default false
);

-- Export configuration
create table public.export_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  act_headings boolean not null default false,
  chapter_headings boolean not null default true,
  scene_headings boolean not null default false,
  scene_separator text not null default '* * *',
  title_page boolean not null default true,
  author text not null default '',
  word_count_on_title boolean not null default true,
  font_family text not null default 'Times New Roman',
  font_size integer not null default 12,
  line_spacing real not null default 2.0,
  paragraph_style text not null default 'indent',
  page_format text not null default 'letter',
  exclude_non_chapters boolean not null default true,
  export_format text not null default 'pdf',
  preset text not null default 'manuscript'
);

-- LLM settings
create table public.llm_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  selected_provider text not null default 'anthropic',
  selected_model text not null default 'claude-sonnet-4',
  anthropic_key text,
  openai_key text
);

-- Inspiration items
create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  label text not null default '',
  tags text[] not null default '{}',
  notes text not null default '',
  added_at timestamptz not null default now()
);

create index idx_inspiration_project on public.inspiration_items(project_id);

-- Updated_at triggers
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create trigger set_chapters_updated_at before update on public.chapters
  for each row execute function public.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Storage bucket for inspiration files
insert into storage.buckets (id, name, public) values ('inspiration', 'inspiration', false);

-- Enable realtime for collaborative tables
alter publication supabase_realtime add table public.chapters;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.comment_replies;
