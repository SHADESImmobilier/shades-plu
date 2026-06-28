-- ============================================================================
-- Hineni — Tefillin Connect · Migration initiale
-- Postgres + PostGIS (Supabase)
-- ============================================================================
-- Couvre : profils, disponibilité poseurs (géo), demandes "VTC", sessions de
-- mise (Mivtza), preuves anti-fraude, récompenses (points) et partenaires.
-- La logique sensible (validation, score de risque, clearing, bons) doit vivre
-- dans des Edge Functions / RPC SECURITY DEFINER — jamais côté client.
-- ============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type trust_level   as enum ('probation', 'standard', 'certified', 'flagged');
create type request_status as enum ('pending', 'matched', 'accepted', 'completed', 'cancelled', 'expired');
create type session_status as enum (
  'created', 'awaiting_confirmation', 'confirmed',
  'under_review', 'validated', 'rewarded', 'rejected'
);
create type risk_level     as enum ('low', 'medium', 'high');
create type reward_status  as enum ('pending', 'cleared', 'redeemed', 'expired', 'revoked');
create type ledger_kind    as enum ('credit', 'debit');

-- ---------------------------------------------------------------------------
-- ORGANISATIONS (endossement — Beth Habad / Mosdot) — V2 mais modélisé tôt
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text,                       -- 'beth_habad' | 'mossad' | ...
  is_verified boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROFILS (extension de auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  phone_hash    text,                     -- hash du téléphone (anti-doublon, RGPD)
  city          text,
  is_poseur     boolean not null default false,
  trust         trust_level not null default 'probation',
  organization_id uuid references organizations(id),
  points_balance integer not null default 0,   -- miroir dénormalisé du ledger
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EMPREINTES D'APPAREILS (anti multi-comptes / collusion)
-- ---------------------------------------------------------------------------
create table devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  fingerprint   text not null,            -- empreinte appareil (hashée)
  platform      text,                     -- 'ios' | 'android'
  push_token    text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index devices_fingerprint_idx on devices (fingerprint);

-- ---------------------------------------------------------------------------
-- DISPONIBILITÉ DES POSEURS (matching géo temps réel)
-- ---------------------------------------------------------------------------
create table poseur_availability (
  poseur_id     uuid primary key references profiles(id) on delete cascade,
  is_available  boolean not null default false,
  location      geography(Point, 4326),
  updated_at    timestamptz not null default now()
);
create index poseur_availability_geo_idx on poseur_availability using gist (location);

-- ---------------------------------------------------------------------------
-- DEMANDES "VTC" (un demandeur appelle un poseur proche)
-- ---------------------------------------------------------------------------
create table tefillin_requests (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references profiles(id) on delete cascade,
  poseur_id      uuid references profiles(id),
  status         request_status not null default 'pending',
  location       geography(Point, 4326) not null,
  note           text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '15 minutes')
);
create index tefillin_requests_status_idx on tefillin_requests (status);
create index tefillin_requests_geo_idx on tefillin_requests using gist (location);

-- ---------------------------------------------------------------------------
-- SESSIONS DE MISE (Mivtza) — l'événement central
-- ---------------------------------------------------------------------------
create table mivtza_sessions (
  id                  uuid primary key default gen_random_uuid(),
  poseur_id           uuid not null references profiles(id) on delete cascade,
  request_id          uuid references tefillin_requests(id),     -- null si "mivtza de rue"
  beneficiary_id      uuid references profiles(id),              -- si le bénéficiaire a un compte
  beneficiary_phone_hash text,                                   -- sinon, hash du numéro vérifié
  status              session_status not null default 'created',

  -- preuves de co-présence
  poseur_location     geography(Point, 4326),
  beneficiary_location geography(Point, 4326),
  proximity_meters    double precision,                          -- distance calculée à la confirmation
  proximity_method    text,                                      -- 'qr_screen' | 'ble' | 'nfc'
  photo_path          text,                                      -- Storage (audit uniquement)

  -- horodatage du double consentement
  poseur_confirmed_at      timestamptz,
  beneficiary_confirmed_at timestamptz,

  -- anti-fraude
  risk                risk_level,
  risk_score          integer,
  reviewed_by         uuid references profiles(id),
  reviewed_at         timestamptz,

  created_at          timestamptz not null default now()
);
create index mivtza_sessions_poseur_idx on mivtza_sessions (poseur_id);
create index mivtza_sessions_status_idx on mivtza_sessions (status);

-- ---------------------------------------------------------------------------
-- TOKENS ÉPHÉMÈRES (QR / code 6 chiffres pour la double confirmation)
-- ---------------------------------------------------------------------------
create table session_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references mivtza_sessions(id) on delete cascade,
  token       text not null unique,        -- signé/aléatoire, encodé dans le QR
  code        text,                         -- alternative à 6 chiffres
  expires_at  timestamptz not null,         -- ex. now() + 60s
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index session_tokens_token_idx on session_tokens (token);

-- ---------------------------------------------------------------------------
-- BÉNÉFICIAIRES (anti-farming : suivi par hash + compteurs)
-- ---------------------------------------------------------------------------
create table beneficiaries (
  phone_hash       text primary key,
  first_seen_at    timestamptz not null default now(),
  last_rewarded_at timestamptz,
  reward_count     integer not null default 0,
  device_fingerprint text
);

-- ---------------------------------------------------------------------------
-- SIGNAUX DE FRAUDE (un par anomalie détectée sur une session)
-- ---------------------------------------------------------------------------
create table fraud_signals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references mivtza_sessions(id) on delete cascade,
  signal      text not null,               -- 'geo_velocity' | 'same_device' | 'cooldown' | ...
  weight      integer not null default 0,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index fraud_signals_session_idx on fraud_signals (session_id);

-- ---------------------------------------------------------------------------
-- RÉCOMPENSES (points) + GRAND LIVRE
-- ---------------------------------------------------------------------------
create table rewards (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references mivtza_sessions(id) on delete cascade,
  poseur_id   uuid not null references profiles(id) on delete cascade,
  points      integer not null,
  status      reward_status not null default 'pending',
  cleared_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index rewards_poseur_idx on rewards (poseur_id);
create index rewards_status_idx on rewards (status);

create table reward_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        ledger_kind not null,
  points      integer not null,
  reason      text,
  reward_id   uuid references rewards(id),
  created_at  timestamptz not null default now()
);
create index reward_ledger_user_idx on reward_ledger (user_id);

-- ---------------------------------------------------------------------------
-- PARTENAIRES & BONS
-- ---------------------------------------------------------------------------
create table partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                         -- 'epicerie' | 'librairie' | 'sofer' | ...
  city        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table partner_offers (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references partners(id) on delete cascade,
  title         text not null,
  description   text,
  cost_points   integer not null,           -- coût en points pour l'utilisateur
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table redemptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  offer_id    uuid not null references partner_offers(id),
  code        text not null unique,          -- bon généré (anti-rejeu)
  status      reward_status not null default 'cleared',
  redeemed_at timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles            enable row level security;
alter table devices             enable row level security;
alter table poseur_availability enable row level security;
alter table tefillin_requests   enable row level security;
alter table mivtza_sessions     enable row level security;
alter table rewards             enable row level security;
alter table reward_ledger       enable row level security;
alter table redemptions         enable row level security;

-- Profils : lecture publique limitée (carte), écriture de soi uniquement.
create policy "profiles self read"   on profiles for select using (true);
create policy "profiles self update" on profiles for update using (auth.uid() = id);
create policy "profiles self insert" on profiles for insert with check (auth.uid() = id);

-- Appareils : strictement privés.
create policy "devices owner" on devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Disponibilité : un poseur gère la sienne ; lecture publique pour la carte.
create policy "availability read"  on poseur_availability for select using (true);
create policy "availability write" on poseur_availability
  for all using (auth.uid() = poseur_id) with check (auth.uid() = poseur_id);

-- Demandes : visibles par le demandeur et le poseur concerné.
create policy "requests involved read" on tefillin_requests
  for select using (auth.uid() = beneficiary_id or auth.uid() = poseur_id);
create policy "requests beneficiary write" on tefillin_requests
  for insert with check (auth.uid() = beneficiary_id);

-- Sessions : visibles par les parties. La transition de statut / validation
-- passe par des RPC SECURITY DEFINER (pas d'UPDATE direct côté client).
create policy "sessions involved read" on mivtza_sessions
  for select using (auth.uid() = poseur_id or auth.uid() = beneficiary_id);

-- Récompenses & ledger : lecture de soi uniquement (écriture via fonctions).
create policy "rewards owner read" on rewards for select using (auth.uid() = poseur_id);
create policy "ledger owner read"  on reward_ledger for select using (auth.uid() = user_id);
create policy "redemptions owner"  on redemptions for select using (auth.uid() = user_id);

-- ============================================================================
-- RPC : poseurs disponibles à proximité (matching)
-- ============================================================================
create or replace function nearby_poseurs(lat double precision, lng double precision, radius_m integer default 3000)
returns table (poseur_id uuid, display_name text, trust trust_level, distance_m double precision)
language sql stable as $$
  select p.id, p.display_name, p.trust,
         st_distance(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m
  from poseur_availability a
  join profiles p on p.id = a.poseur_id
  where a.is_available
    and a.location is not null
    and st_dwithin(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  order by distance_m asc
  limit 50;
$$;

-- ============================================================================
-- TRIGGER : créer le profil à l'inscription
-- ============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
