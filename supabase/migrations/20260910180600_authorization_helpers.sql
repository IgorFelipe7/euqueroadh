-- Migration 7 — the authorization predicate and the audit writer.

-- THE authorization check.  Every administrative routine calls this as its FIRST statement,
-- because SECURITY DEFINER bypasses RLS and therefore nothing else is protecting the body.
--
-- SECURITY DEFINER here so it can read admin_users without recursing through the very policy it
-- is used to evaluate.  (admin_users must therefore NOT have FORCE ROW LEVEL SECURITY.)
--
-- (select auth.uid()) is wrapped in a subselect deliberately: PostgreSQL then evaluates it once
-- per query as an initPlan rather than once per row, which matters inside an RLS policy scanning
-- hundreds of rows.
--
-- Returns false under service_role and anon, which have no auth.uid() — that is intentional and is
-- why no admin routine is granted to service_role (§ 8.5).
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_users a
     where a.user_id = (select auth.uid())
       and a.is_active
  );
$$;

revoke all on function public.is_active_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_active_admin() to authenticated;

-- Resolves the acting administrator and writes the audit row.  Called ONLY from inside other
-- SECURITY DEFINER RPCs, each of which has already run its own authorization check.
--
-- Two properties matter:
--   * metadata is constructed by the calling RPC and is never accepted from a client, so there is
--     no path by which a browser can forge an audit row or push participant PII into it;
--   * actor_label is snapshotted here, so the record stays legible after the administrator's
--     account is deleted and their admin_users row cascades away (§ 3.6).
create or replace function public.record_admin_action(
  p_action          text,
  p_event_id        uuid,
  p_registration_id uuid,
  p_metadata        jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_label text;
begin
  select coalesce(a.display_name, a.email) into v_label
    from public.admin_users a
   where a.user_id = v_uid;

  insert into public.admin_actions
    (actor_user_id, actor_label, action, event_id, registration_id, metadata)
  values
    (v_uid, coalesce(v_label, 'desconhecido'), p_action, p_event_id, p_registration_id,
     coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ACL (§ 8.5): granted to NO ROLE AT ALL, not even service_role.  It is reachable only from other
-- SECURITY DEFINER routines, which run as the owner and so satisfy the privilege check.
revoke all on function public.record_admin_action(text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
