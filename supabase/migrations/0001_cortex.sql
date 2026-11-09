-- Cortex schema for a (self-hosted) Supabase instance.
-- Run once in Studio → SQL Editor. Safe to re-run (idempotent).
--
-- Every row and every stored file belongs to exactly one user; Row Level
-- Security restricts all access to the signed-in user's own data.

-- ---------------------------------------------------------------------------
-- Entity collections: one row per page / database / dashboard. `data` holds
-- the entity's JSON exactly as the app produces it, so the schema never has to
-- change when the app's shape does.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pages', 'databases', 'dashboards'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id    uuid        not null default auth.uid()
                               references auth.users (id) on delete cascade,
        id         text        not null,
        data       jsonb       not null,
        updated_at timestamptz not null default now(),
        primary key (user_id, id)
      );
      alter table public.%1$I enable row level security;

      drop policy if exists "%1$s_select_own" on public.%1$I;
      drop policy if exists "%1$s_insert_own" on public.%1$I;
      drop policy if exists "%1$s_update_own" on public.%1$I;
      drop policy if exists "%1$s_delete_own" on public.%1$I;
      create policy "%1$s_select_own" on public.%1$I for select to authenticated
        using (user_id = (select auth.uid()));
      create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
        with check (user_id = (select auth.uid()));
      create policy "%1$s_update_own" on public.%1$I for update to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()));
      create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
        using (user_id = (select auth.uid()));

      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;
    $f$, t);
  end loop;
end $$;

-- Keep updated_at current on every write.
create or replace function public.cortex_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pages', 'databases', 'dashboards'] loop
    execute format(
      'drop trigger if exists touch_updated_at on public.%1$I;
       create trigger touch_updated_at before update on public.%1$I
         for each row execute function public.cortex_touch_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- External API connections (dashboard widgets). The connection itself is
-- readable by its owner; the secret token lives in a separate table that has
-- RLS enabled and NO policies, so no client can ever read it. Tokens are
-- written through set_connection_token() and read only by the `proxy` Edge
-- Function using the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  user_id   uuid not null default auth.uid()
            references auth.users (id) on delete cascade,
  id        text not null,
  name      text not null,
  base_url  text not null,
  auth      text not null default 'none'
            check (auth in ('none', 'bearer', 'header', 'query')),
  auth_key  text not null default '',
  has_token boolean not null default false,
  primary key (user_id, id)
);
alter table public.connections enable row level security;

drop policy if exists "connections_select_own" on public.connections;
drop policy if exists "connections_insert_own" on public.connections;
drop policy if exists "connections_update_own" on public.connections;
drop policy if exists "connections_delete_own" on public.connections;
create policy "connections_select_own" on public.connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "connections_insert_own" on public.connections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "connections_update_own" on public.connections for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "connections_delete_own" on public.connections for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.connections from anon;
-- has_token is maintained by set_connection_token(); clients may not set it.
revoke all on public.connections from authenticated;
grant select, delete on public.connections to authenticated;
grant insert (id, name, base_url, auth, auth_key) on public.connections to authenticated;
-- (id is included only so PostgREST upserts, which SET every sent column, work.)
grant update (id, name, base_url, auth, auth_key) on public.connections to authenticated;

create table if not exists public.connection_secrets (
  user_id       uuid not null,
  connection_id text not null,
  token         text not null,
  primary key (user_id, connection_id),
  foreign key (user_id, connection_id)
    references public.connections (user_id, id) on delete cascade
);
alter table public.connection_secrets enable row level security;
-- Deliberately no policies, and no grants: clients cannot touch this table.
revoke all on public.connection_secrets from anon, authenticated;

-- Set (non-empty) or clear (empty string) the token of one of *your* connections.
create or replace function public.set_connection_token(conn_id text, new_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.connections c where c.user_id = uid and c.id = conn_id
  ) then
    raise exception 'unknown connection';
  end if;

  if coalesce(new_token, '') = '' then
    delete from public.connection_secrets
      where user_id = uid and connection_id = conn_id;
    update public.connections set has_token = false
      where user_id = uid and id = conn_id;
  else
    insert into public.connection_secrets (user_id, connection_id, token)
      values (uid, conn_id, new_token)
      on conflict (user_id, connection_id) do update set token = excluded.token;
    update public.connections set has_token = true
      where user_id = uid and id = conn_id;
  end if;
end;
$$;
revoke all on function public.set_connection_token(text, text) from public, anon;
grant execute on function public.set_connection_token(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- File storage: a private bucket; each user may only touch objects under a
-- top-level folder named after their user id (<uid>/<file>).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cortex-files', 'cortex-files', false, 10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cortex_files_select_own" on storage.objects;
drop policy if exists "cortex_files_insert_own" on storage.objects;
drop policy if exists "cortex_files_update_own" on storage.objects;
drop policy if exists "cortex_files_delete_own" on storage.objects;
create policy "cortex_files_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'cortex-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cortex_files_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'cortex-files'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cortex_files_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'cortex-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cortex-files'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cortex_files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'cortex-files'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
