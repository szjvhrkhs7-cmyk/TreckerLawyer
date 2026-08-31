-- TreckerLawyer: harden cloud storage isolation.
-- Apply through Supabase SQL editor / migration tooling with an owner-level connection.
-- Idempotent: safe to re-run.

begin;

-- RLS is the primary security boundary for the browser-facing publishable key.
alter table public.lawyer_store enable row level security;
alter table public.lawyer_store force row level security;

-- Do not rely on API filters supplied by the browser. Anonymous users get no table privileges.
revoke all on table public.lawyer_store from public;
revoke all on table public.lawyer_store from anon;

-- Signed-in users may perform only the operations the tracker needs. RLS still limits rows.
revoke all on table public.lawyer_store from authenticated;
grant select, insert, update, delete on table public.lawyer_store to authenticated;

-- Replace any policies with stable, explicit owner-only policies.
drop policy if exists lawyer_store_select_own on public.lawyer_store;
drop policy if exists lawyer_store_insert_own on public.lawyer_store;
drop policy if exists lawyer_store_update_own on public.lawyer_store;
drop policy if exists lawyer_store_delete_own on public.lawyer_store;

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

create policy lawyer_store_delete_own
on public.lawyer_store
for delete
to authenticated
using ((select auth.uid()) = user_id);

commit;
