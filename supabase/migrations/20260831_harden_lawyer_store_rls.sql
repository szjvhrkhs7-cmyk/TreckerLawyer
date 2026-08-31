-- TreckerLawyer: harden cloud storage isolation.
-- Apply through Supabase SQL editor / migration tooling with an owner-level connection.
-- This migration intentionally replaces ALL existing RLS policies on public.lawyer_store.
-- Idempotent: safe to re-run after the schema has been verified.

begin;

-- RLS is the primary security boundary for the browser-facing publishable key.
alter table public.lawyer_store enable row level security;
alter table public.lawyer_store force row level security;

-- Do not rely on API filters supplied by the browser. Anonymous users get no table privileges.
revoke all on table public.lawyer_store from public;
revoke all on table public.lawyer_store from anon;

-- The tracker only reads and upserts section rows. It does not need table-level DELETE.
revoke all on table public.lawyer_store from authenticated;
grant select, insert, update on table public.lawyer_store to authenticated;

-- PostgreSQL permissive RLS policies are OR-combined. Leaving an older broad policy in place
-- could defeat newly-added restrictive policies, so remove every existing policy first.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lawyer_store'
  loop
    execute format(
      'drop policy if exists %I on public.lawyer_store',
      policy_row.policyname
    );
  end loop;
end
$$;

create policy lawyer_store_select_own
on public.lawyer_store
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy lawyer_store_insert_own
on public.lawyer_store
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy lawyer_store_update_own
on public.lawyer_store
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

commit;
