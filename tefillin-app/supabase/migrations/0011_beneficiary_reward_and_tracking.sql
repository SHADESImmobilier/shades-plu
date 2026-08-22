-- ============================================================================
-- 0011 · Récompense du POSÉ + suivi de position du poseur
-- ----------------------------------------------------------------------------
-- - Le posé (bénéficiaire) reçoit lui aussi une récompense pour une mise validée
--   (plafonnée à 1×/jour par la reconnaissance faciale, comme la sienne).
-- - On généralise `rewards` avec un DESTINATAIRE explicite (poseur OU posé).
-- - On dénormalise la position du poseur (lat/lng) pour le suivi temps réel.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Récompenses génériques : destinataire + rôle.
-- ---------------------------------------------------------------------------
alter table rewards
  add column if not exists recipient_id uuid references profiles(id) on delete cascade,
  add column if not exists role         text not null default 'poseur'; -- 'poseur' | 'beneficiary'

-- Backfill : les récompenses existantes étaient toutes pour le poseur.
update rewards set recipient_id = poseur_id where recipient_id is null;
alter table rewards alter column recipient_id set not null;
create index if not exists rewards_recipient_idx on rewards (recipient_id);

-- poseur_id devient nullable : une récompense de posé n'est pas "au nom" d'un
-- poseur en tant que titulaire (le poseur reste identifié via la session).
alter table rewards alter column poseur_id drop not null;

-- Lecture "de soi" basée sur le DESTINATAIRE (le posé doit voir sa récompense).
drop policy if exists "rewards owner read" on rewards;
create policy "rewards owner read" on rewards for select using (auth.uid() = recipient_id);

-- ---------------------------------------------------------------------------
-- 2) Clearing : créditer le DESTINATAIRE (poseur ou posé). Même signature que
--    0002 -> CREATE OR REPLACE suffit (pas de changement de type de retour).
-- ---------------------------------------------------------------------------
create or replace function clear_due_rewards(min_age_hours integer default 24)
returns integer
language plpgsql security definer as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select rw.id, rw.recipient_id, rw.points, rw.session_id
    from rewards rw
    join mivtza_sessions s on s.id = rw.session_id
    where rw.status = 'pending'
      and rw.created_at < now() - make_interval(hours => min_age_hours)
      and s.status = 'confirmed'
      and coalesce(s.risk, 'low') = 'low'
  loop
    update rewards set status = 'cleared', cleared_at = now() where id = r.id;
    update mivtza_sessions set status = 'rewarded' where id = r.session_id;
    insert into reward_ledger (user_id, kind, points, reason, reward_id)
      values (r.recipient_id, 'credit', r.points, 'mivtza_cleared', r.id);
    update profiles set points_balance = points_balance + r.points
      where id = r.recipient_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Suivi temps réel : coordonnées dénormalisées du poseur.
--    (Realtime diffuse les colonnes en clair ; la geography arrive en WKB et
--    n'est pas exploitable côté client.)
-- ---------------------------------------------------------------------------
alter table poseur_availability
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

-- RPC : le poseur met à jour sa position (et sa disponibilité). Écrit à la fois
-- la geography (matching) et lat/lng (suivi temps réel).
create or replace function set_poseur_location(
  lat double precision,
  lng double precision,
  available boolean default true
)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into poseur_availability (poseur_id, is_available, location, location_lat, location_lng, updated_at)
  values (
    auth.uid(), available,
    st_setsrid(st_makepoint(lng, lat), 4326)::geography, lat, lng, now()
  )
  on conflict (poseur_id) do update set
    is_available = excluded.is_available,
    location     = excluded.location,
    location_lat = excluded.location_lat,
    location_lng = excluded.location_lng,
    updated_at   = now();
end;
$$;
