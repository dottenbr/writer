-- One pending Bookkit sign-in code per account. Only the Worker (service
-- role) reads or writes this table: the code is stored as a hash, together
-- with the Supabase token it unlocks.
create table public.bookkit_sign_in_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  token_hash text not null,
  token_type text not null default 'magiclink' check (token_type in ('magiclink', 'invite')),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bookkit_sign_in_codes enable row level security;
revoke all on public.bookkit_sign_in_codes from anon, authenticated;
