-- A shelf's house style (spelling, serial comma, quotes…). Books with
-- `style.inherit: shelf` in book.yaml take it.
alter table public.shelves add column style jsonb not null default '{}'::jsonb;

create or replace function public.bookkit_libraries()
returns table (id uuid, slug text, name text, description text, role text, owner_name text, pending_owner text,
               shelves jsonb, members jsonb, invitations jsonb, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.id, l.slug, l.name, l.description,
         coalesce(public.library_role(l.id), 'reader'),
         coalesce(nullif(o.display_name, ''), o.email, l.owner_email),
         case when l.owner_id is null then l.owner_email end,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'position', s.position, 'style', s.style) order by s.position, s.created_at) from shelves s where s.library_id = l.id), '[]'::jsonb),
         case when public.library_role(l.id) is not null then
           coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'name', coalesce(nullif(p.display_name, ''), p.email), 'email', p.email) order by m.added_at)
                     from library_members m left join profiles p on p.id = m.user_id where m.library_id = l.id), '[]'::jsonb)
         else '[]'::jsonb end,
         case when public.library_role(l.id) = 'owner' then
           coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role) order by i.created_at) from library_invitations i where i.library_id = l.id), '[]'::jsonb)
         else '[]'::jsonb end,
         l.created_at
  from libraries l left join profiles o on o.id = l.owner_id
  order by (l.owner_id = auth.uid()) desc nulls last, l.name
$$;
