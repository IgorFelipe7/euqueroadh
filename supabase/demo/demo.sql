-- The demonstration dataset (docs/DEMO.md).
--
-- RUN THIS ONLY ON THE DEMONSTRATION PROJECT, NEVER ON PRODUCTION. It is deliberately not a
-- migration: `supabase db push` and `supabase db reset` never see this directory.
--
-- It installs `demo.reset()`, which wipes the project and rebuilds one event with 138 fictitious
-- participants, a morning of registrations, cancellations, waitlist promotions, 70 check-ins and
-- one finished raffle — every write after the event row goes through the same RPCs the admin area
-- calls, so the counters, the waitlist order and the audit trail are the product's own. It then
-- schedules the function to run every day at 03:00 (America/Sao_Paulo) with pg_cron, so whatever a
-- visitor changes is gone by the next morning.
--
-- Two refusals make running it in the wrong place fail loudly instead of destroying data:
--   * it stops if any organizer or Auth user has an address outside @example.com;
--   * it stops if the demo organizer account does not exist yet (create it first, docs/DEMO.md).
--
-- Every name below is a combination of common Brazilian first names and surnames, and every phone
-- number is in the (19) 90000-xxxx range. None of it describes a real participant.

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated, service_role;

create or replace function demo.reset(p_admin_email text default 'organizador@example.com')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first constant text[] := array[
    'Ana', 'Beatriz', 'Bruno', 'Caio', 'Camila', 'Carla', 'Daniel', 'Davi', 'Eduarda', 'Enzo',
    'Felipe', 'Fernanda', 'Gabriel', 'Giovana', 'Guilherme', 'Heitor', 'Helena', 'Igor', 'Isabela',
    'João', 'Julia', 'Larissa', 'Laura', 'Leonardo', 'Letícia', 'Lucas', 'Luiza', 'Manuela',
    'Marcos', 'Maria', 'Mateus', 'Miguel', 'Nicolas', 'Pedro', 'Rafael', 'Rebeca', 'Samuel',
    'Sofia', 'Thiago', 'Valentina', 'Vinícius', 'Yasmin'];
  v_last constant text[] := array[
    'Almeida', 'Alves', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Costa', 'Dias', 'Fernandes',
    'Ferreira', 'Gomes', 'Lima', 'Lopes', 'Martins', 'Melo', 'Mendes', 'Moreira', 'Nascimento',
    'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Rodrigues', 'Santos', 'Silva', 'Soares', 'Souza',
    'Teixeira', 'Vieira'];

  c_people   constant integer := 138;
  c_capacity constant integer := 120;

  v_admin    uuid;
  v_event    uuid;
  v_version  bigint;
  v_id       uuid;
  v_raffle   uuid;
  v_draw     uuid;
  i          integer;
begin
  ---------------------------------------------------------------------------
  -- Refuse to run anywhere that could hold real people.
  ---------------------------------------------------------------------------
  if p_admin_email !~* '^[a-z0-9._%+-]+@example\.com$' then
    raise exception 'demo.reset(): the demo organizer must use an @example.com address';
  end if;

  if exists (select 1 from auth.users u where u.email !~* '@example\.com$')
     or exists (select 1 from public.admin_users a where a.email !~* '@example\.com$') then
    raise exception 'demo.reset() refused: this project has a non-demo account. '
                    'Run it only on the demonstration project (docs/DEMO.md).';
  end if;

  select u.id into v_admin from auth.users u where lower(u.email) = lower(p_admin_email);
  if v_admin is null then
    raise exception 'demo.reset(): create the Auth user % first (docs/DEMO.md)', p_admin_email;
  end if;

  ---------------------------------------------------------------------------
  -- Wipe, children first: deleting the event first would make the counter trigger update a row
  -- its own statement is deleting.
  ---------------------------------------------------------------------------
  delete from public.raffles;
  delete from public.check_in_sessions;
  delete from public.registrations;
  delete from public.admin_actions;
  delete from public.events;
  delete from public.admin_users;

  insert into public.admin_users (user_id, email, display_name)
  values (v_admin, lower(p_admin_email), 'Organizador da demonstração');

  -- Everything below runs as that organizer, so each RPC authorizes and audits it as it would a
  -- click in the admin area. Transaction-local: it disappears when this call returns.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  ---------------------------------------------------------------------------
  -- The event: the real one's public details (supabase/seed.sql), opened with a capacity.
  ---------------------------------------------------------------------------
  insert into public.events (
    slug, title, kicker, audience_label, starts_at, ends_at, timezone, venue_name,
    venue_address_line, venue_district, venue_city, venue_state, price_label, is_free,
    includes_label, min_age, is_active
  ) values (
    'educacao-financeira-para-jovens', 'Educação Financeira', 'Palestra', 'para jovens',
    '2026-09-19T19:00:00-03:00', '2026-09-19T21:00:00-03:00', 'America/Sao_Paulo',
    'Espaço Cezanne Eventos', 'R. José Possidonio Silva, 435', 'Jardim Adelaide', 'Hortolândia',
    'SP', 'Inscrições gratuitas', true, 'Coffee break incluso', 12, true
  )
  returning id, settings_version into v_event, v_version;

  select s.settings_version into v_version
    from public.update_event_settings(v_event, c_capacity, true, 'open', true, v_version) s;

  ---------------------------------------------------------------------------
  -- 138 people through the public registration routine: the first 120 are confirmed and the
  -- rest join the waitlist, exactly as the live form would place them.
  ---------------------------------------------------------------------------
  for i in 1..c_people loop
    perform public.register_for_event(
      v_event,
      v_first[1 + (i * 7) % array_length(v_first, 1)] || ' '
        || v_last[1 + (i * 11) % array_length(v_last, 1)],
      (12 + (i * 5) % 13)::smallint,
      '+5519900' || lpad(i::text, 6, '0')
    );
  end loop;

  -- Spread the arrivals over the three weeks before the event, oldest first, so the lists and the
  -- dashboard read like a real registration period instead of one second.
  update public.registrations r
     set created_at        = s.at,
         status_changed_at = s.at
    from (
      select x.id,
             timestamptz '2026-08-29 09:00:00-03' + (x.n - 1) * interval '3 hours 30 minutes'
               + ((x.n * 37) % 180) * interval '1 minute' as at
        -- The phone number encodes the loop counter, so it is the order the people registered in.
        from (select r2.id, row_number() over (order by r2.phone_e164) as n
                from public.registrations r2 where r2.event_id = v_event) x
    ) s
   where r.id = s.id;

  ---------------------------------------------------------------------------
  -- A normal week before an event: five cancellations, and the five oldest on the waitlist
  -- promoted into the freed seats.
  ---------------------------------------------------------------------------
  for v_id in
    select r.id from public.registrations r
     where r.event_id = v_event and r.status = 'confirmed'
     order by r.created_at desc limit 5 offset 10
  loop
    perform public.cancel_registration(v_id);
  end loop;

  for v_id in
    select r.id from public.registrations r
     where r.event_id = v_event and r.status = 'waitlisted'
     order by r.waitlist_rank limit 5
  loop
    perform public.promote_registration(v_id);
  end loop;

  ---------------------------------------------------------------------------
  -- The evening: 70 people checked in between 18:30 and 19:20.
  ---------------------------------------------------------------------------
  for v_id in
    select r.id from public.registrations r
     where r.event_id = v_event and r.status = 'confirmed'
     -- By phone, not by id: the same people are present after every reset, so the README can
     -- name one who can retrieve a certificate.
     order by md5(r.phone_e164) limit 70
  loop
    perform public.set_registration_attendance(v_id, true);
  end loop;

  update public.registrations r
     set attended_at = timestamptz '2026-09-19 18:30:00-03' + ((n * 13) % 50) * interval '1 minute'
    from (select r2.id, row_number() over (order by r2.id) as n
            from public.registrations r2
           where r2.event_id = v_event and r2.attended_at is not null) s
   where r.id = s.id;

  ---------------------------------------------------------------------------
  -- One finished raffle among those present, and one ready for a visitor to run on the stage.
  ---------------------------------------------------------------------------
  select c.raffle_id into v_raffle
    from public.create_raffle(v_event, 'Sorteio 1', 'Kit de educação financeira',
                              'attended', 3, true) c;

  for i in 1..3 loop
    select d.draw_id into v_draw from public.draw_raffle_winner(v_raffle) d;
    perform public.resolve_raffle_draw(v_draw, 'confirmed');
  end loop;

  perform public.create_raffle(v_event, 'Sorteio 2', 'Livro de finanças pessoais',
                               'attended', 2, true);

  ---------------------------------------------------------------------------
  -- Every write above happened "now". Move each one back to the moment it would have happened,
  -- so the audit trail and the registration history read as the weeks around the event.
  ---------------------------------------------------------------------------
  update public.registrations r
     set status_changed_at = timestamptz '2026-09-17 14:00:00-03' + s.n * interval '47 minutes'
    from (select r2.id, row_number() over (order by r2.phone_e164) as n
            from public.registrations r2
           where r2.event_id = v_event and r2.status_changed_at > timestamptz '2026-09-20 00:00:00-03') s
   where r.id = s.id;

  update public.admin_actions a
     set created_at = case
           when a.action = 'settings.updated'
             then timestamptz '2026-08-28 20:00:00-03'
           when a.action in ('registration.cancelled', 'registration.promoted')
             then timestamptz '2026-09-17 14:00:00-03' + s.n * interval '47 minutes'
           when a.action = 'registration.attendance_set'
             then timestamptz '2026-09-19 18:30:00-03' + ((s.n * 13) % 50) * interval '1 minute'
           when a.action = 'raffle.created'
             then timestamptz '2026-09-19 18:00:00-03' + s.n * interval '5 minutes'
           -- A draw, then its confirmation a minute later.
           else timestamptz '2026-09-19 20:30:00-03' + s.n * interval '2 minutes'
                + case when a.action = 'raffle.draw_resolved' then interval '1 minute'
                       else interval '0' end
         end
    from (select a2.id,
                 row_number() over (partition by
                                      case when a2.action in ('registration.cancelled',
                                                              'registration.promoted')
                                           then 'week' else a2.action end
                                    -- the cancellations first, then the promotions they freed
                                    order by a2.action, a2.id) as n
            from public.admin_actions a2) s
   where a.id = s.id;

  perform set_config('request.jwt.claims', '', true);
end;
$$;

revoke all on function demo.reset(text) from public, anon, authenticated, service_role;

-- Build the dataset now.
select demo.reset();

-- And rebuild it every day at 06:00 UTC (03:00 in São Paulo). Re-running this file replaces the job.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('demo-reset', '0 6 * * *', $job$select demo.reset()$job$);
