-- ============================================================================
-- 0002 · Flux de validation (création de session côté poseur) + clearing
-- ============================================================================

-- Colonnes lat/lng explicites lues par l'Edge Function validate_session
-- (en complément des colonnes geography utilisées pour le matching).
alter table mivtza_sessions
  add column if not exists poseur_location_lat double precision,
  add column if not exists poseur_location_lng double precision,
  add column if not exists beneficiary_location_lat double precision,
  add column if not exists beneficiary_location_lng double precision;

-- ---------------------------------------------------------------------------
-- Redéfinition de nearby_poseurs avec coordonnées (pour afficher les markers).
-- Le nombre de colonnes de retour change (4 -> 6) : Postgres exige un DROP
-- explicite avant de recréer (CREATE OR REPLACE ne peut pas changer le type
-- de retour).
-- ---------------------------------------------------------------------------
drop function if exists nearby_poseurs(double precision, double precision, integer);
create or replace function nearby_poseurs(lat double precision, lng double precision, radius_m integer default 3000)
returns table (poseur_id uuid, display_name text, trust trust_level, distance_m double precision, lat_p double precision, lng_p double precision)
language sql stable as $$
  select p.id, p.display_name, p.trust,
         st_distance(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m,
         st_y(a.location::geometry) as lat_p,
         st_x(a.location::geometry) as lng_p
  from poseur_availability a
  join profiles p on p.id = a.poseur_id
  where a.is_available
    and a.location is not null
    and st_dwithin(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  order by distance_m asc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- RPC : un poseur ouvre une session de mise et reçoit un token éphémère.
-- Le token (60 s) est encodé dans le QR que scanne le bénéficiaire.
-- Première moitié de la double confirmation (le poseur confirme à l'ouverture).
-- ---------------------------------------------------------------------------
create or replace function create_session(
  lat double precision,
  lng double precision,
  request_id uuid default null
)
returns table (session_id uuid, token text, expires_at timestamptz)
language plpgsql security definer as $$
declare
  v_session uuid;
  v_token   text;
  v_exp     timestamptz := now() + interval '60 seconds';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into mivtza_sessions (
    poseur_id, request_id, status,
    poseur_location, poseur_location_lat, poseur_location_lng,
    poseur_confirmed_at
  ) values (
    auth.uid(), request_id, 'awaiting_confirmation',
    st_setsrid(st_makepoint(lng, lat), 4326)::geography, lat, lng,
    now()
  )
  returning id into v_session;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into session_tokens (session_id, token, code, expires_at)
  values (
    v_session, v_token,
    lpad((floor(random() * 1000000))::int::text, 6, '0'),
    v_exp
  );

  return query select v_session, v_token, v_exp;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : clearing différé des récompenses (appelé par un cron / Edge Function).
-- Passe en "cleared" les récompenses "pending" assez anciennes, à faible risque,
-- et dont la session n'est pas en revue. Crédite le ledger + le solde miroir.
-- ---------------------------------------------------------------------------
create or replace function clear_due_rewards(min_age_hours integer default 24)
returns integer
language plpgsql security definer as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select rw.id, rw.poseur_id, rw.points
    from rewards rw
    join mivtza_sessions s on s.id = rw.session_id
    where rw.status = 'pending'
      and rw.created_at < now() - make_interval(hours => min_age_hours)
      and s.status = 'confirmed'
      and coalesce(s.risk, 'low') = 'low'
  loop
    update rewards set status = 'cleared', cleared_at = now() where id = r.id;
    update mivtza_sessions set status = 'rewarded'
      where id = (select session_id from rewards where id = r.id);
    insert into reward_ledger (user_id, kind, points, reason, reward_id)
      values (r.poseur_id, 'credit', r.points, 'mivtza_cleared', r.id);
    update profiles set points_balance = points_balance + r.points
      where id = r.poseur_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
