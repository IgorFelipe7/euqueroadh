-- Migration 5 — administrator authorization and the audit trail.

-- THE SOLE SOURCE OF TRUTH FOR ADMINISTRATOR AUTHORIZATION.
-- Not auth.users.user_metadata (user-editable), not raw_app_meta_data, not a JWT custom claim,
-- not an environment allowlist.  A table lookup is used precisely so that setting
-- is_active = false revokes access on the administrator's very next request, which a claim baked
-- into a JWT could not do.
create table public.admin_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  is_active    boolean not null default true,
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.admin_actions (
  id              uuid primary key default gen_random_uuid(),

  -- NULLABLE ON PURPOSE.  ON DELETE SET NULL and NOT NULL are mutually exclusive: a NOT NULL
  -- column would make deleting an administrator either impossible or destructive to the audit
  -- history.  NULL here carries meaning — "a since-removed administrator" — and is never a sign
  -- of a broken write, because actor_label is NOT NULL and is captured in the same transaction.
  -- Consumers must LEFT JOIN admin_users and render null as "Organizador removido (<label>)".
  actor_user_id   uuid references auth.users(id) on delete set null,
  actor_label     text not null,

  action          text not null,
  event_id        uuid references public.events(id) on delete set null,
  -- Intentionally NOT a foreign key: the audit record of a permanent deletion or of an event-wide
  -- purge must outlive the rows it describes.
  registration_id uuid,
  -- NEVER participant personal data.  Permitted: counts, previous/new SETTING values, filter
  -- parameters, changed-field NAMES, ids.  Forbidden: names, ages, phone numbers, and the
  -- before/after values of full_name, age or notes.  Enforced by the RPCs, which build this
  -- object server-side and never accept it from a caller.
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  constraint admin_actions_known_action check (action in (
    'settings.updated',
    'registration.cancelled',
    'registration.promoted',
    'registration.edited',
    'registration.deleted',
    'registrations.exported',
    'registrations.purged',
    'admin.invited',
    'admin.deactivated',
    'admin.reactivated',
    'admin.removed'
  ))
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);
create index admin_actions_actor_idx   on public.admin_actions (actor_user_id, created_at desc);

comment on column public.admin_actions.actor_user_id is
  'NULL means the acting administrator has since been permanently removed. Valid, not corrupt: '
  'read the audit trail with a LEFT JOIN and render actor_label.';
comment on column public.admin_actions.metadata is
  'Never participant PII. Counts, setting values, changed-field names and ids only.';
