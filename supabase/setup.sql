-- Family tree: run this once in your Supabase project (SQL Editor > New query > paste > Run).
-- It is safe to run again.

-- ---- people -----------------------------------------------------------------
create table if not exists public.people (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  born text check (born is null or born ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  died text check (died is null or died ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  birthplace text,
  parents text[] not null default '{}',
  spouses text[] not null default '{}',
  bio text not null default '',
  thumb text,
  portrait text,
  gallery jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Anyone with the link to the site can read and edit the tree.
alter table public.people enable row level security;
grant select, insert, update, delete on public.people to anon, authenticated;

drop policy if exists "anyone can read" on public.people;
drop policy if exists "anyone can add" on public.people;
drop policy if exists "anyone can change" on public.people;
drop policy if exists "anyone can delete" on public.people;
create policy "anyone can read" on public.people for select using (true);
create policy "anyone can add" on public.people for insert with check (true);
create policy "anyone can change" on public.people for update using (true) with check (true);
create policy "anyone can delete" on public.people for delete using (true);

-- ---- history: every change and deletion keeps the previous version -------------
-- Visitors cannot read or change this table. You can, in the Supabase dashboard
-- (Table Editor > people_history), to see what was changed and put it back.
create table if not exists public.people_history (
  history_id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  action text not null,
  id text not null,
  previous jsonb not null
);
alter table public.people_history enable row level security;
revoke all on public.people_history from anon, authenticated;

create or replace function public.keep_people_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.people_history (action, id, previous) values (tg_op, old.id, to_jsonb(old));
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists people_history on public.people;
create trigger people_history before update or delete on public.people
  for each row execute function public.keep_people_history();

-- ---- photos -------------------------------------------------------------------
-- A public folder: anyone can add a picture (up to 5 MB), nobody can replace or delete one from the site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can add photos" on storage.objects;
create policy "anyone can add photos" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'photos');
