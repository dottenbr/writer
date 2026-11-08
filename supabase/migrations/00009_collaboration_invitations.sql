create or replace function public.has_project_access(p_project_id uuid, p_min_role public.project_role)
returns boolean language sql security definer stable set search_path = '' as $$
 select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
 or exists(select 1 from public.project_members m where m.project_id=p_project_id and m.user_id=auth.uid() and m.accepted_at is not null
 and (p_min_role='viewer' or (p_min_role in ('editor','coauthor') and m.role in ('editor','coauthor','owner')) or (p_min_role='owner' and m.role='owner')));
$$;

create function public.protect_project_ownership() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.owner_id is distinct from old.owner_id and auth.uid() is not null then
  raise exception 'Ownership transfers require administrative action';
 end if;
 if new.bookkit_slug is distinct from old.bookkit_slug and auth.uid() is not null then
  raise exception 'Book source identity cannot be changed';
 end if;
 return new;
end;
$$;
create trigger protect_project_ownership before update on public.projects for each row execute function public.protect_project_ownership();

create table public.project_invitations (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and position('@' in email)>1),
 role public.project_role not null check(role in ('editor','coauthor','viewer')),
 created_at timestamptz not null default now(),
 unique(project_id,email)
);
alter table public.project_invitations enable row level security;
create policy invitations_owner on public.project_invitations for all to authenticated
 using (exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()))
 with check (exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid()));

create function public.accept_project_invitations() returns integer language plpgsql security definer set search_path = '' as $$
declare accepted integer := 0; invitation record; verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return 0; end if;
 for invitation in select * from public.project_invitations where email=verified_email for update loop
  insert into public.project_members(project_id,user_id,role,accepted_at)
   values(invitation.project_id,auth.uid(),invitation.role,now())
   on conflict(project_id,user_id) do nothing;
  delete from public.project_invitations where id=invitation.id;
  accepted := accepted + 1;
 end loop;
 return accepted;
end;
$$;
revoke all on function public.accept_project_invitations() from public,anon;
grant execute on function public.accept_project_invitations() to authenticated;
