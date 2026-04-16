-- Add optimistic-locking version columns to bible entity tables.
-- Matches the existing pattern on `chapters.version`.

alter table public.characters
  add column version integer not null default 1;

alter table public.threads
  add column version integer not null default 1;

alter table public.locations
  add column version integer not null default 1;

alter table public.codex_entries
  add column version integer not null default 1;
