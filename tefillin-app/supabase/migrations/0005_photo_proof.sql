-- ============================================================================
-- 0005 · Preuve par SELFIE LIVE + reconnaissance faciale (remplace le QR)
-- ============================================================================
-- On abandonne la double-confirmation par QR. La preuve d'une mise est une photo
-- prise en direct (poseur + posé, tefillin tête + bras), analysée côté serveur
-- (vision + empreinte faciale pour l'anti-farming).
-- ============================================================================

-- pgvector pour les empreintes faciales (dédup du posé).
create extension if not exists vector;

-- On retire l'ancien mécanisme de tokens QR.
drop table if exists session_tokens cascade;

-- Empreintes faciales des posés (anti-farming). On stocke l'embedding, pas la
-- photo, pour le matching. Donnée biométrique → consentement + conservation limitée.
create table if not exists beneficiary_faces (
  id               uuid primary key default gen_random_uuid(),
  embedding        vector(128),
  first_seen_at    timestamptz not null default now(),
  last_rewarded_at timestamptz,
  reward_count     integer not null default 0
);

-- Champs de preuve/analyse sur la session.
alter table mivtza_sessions
  add column if not exists consent_given       boolean not null default false,
  add column if not exists face_count          integer,
  add column if not exists tefillin_head        boolean,
  add column if not exists tefillin_arm         boolean,
  add column if not exists scene_ok            boolean,
  add column if not exists beneficiary_face_id  uuid references beneficiary_faces(id);

-- ---------------------------------------------------------------------------
-- RPC : le poseur ouvre une session (plus de token QR ; statut 'created').
-- ---------------------------------------------------------------------------
create or replace function create_session(
  lat double precision,
  lng double precision,
  request_id uuid default null
)
returns table (session_id uuid)
language plpgsql security definer as $$
declare v_session uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into mivtza_sessions (
    poseur_id, request_id, status,
    poseur_location, poseur_location_lat, poseur_location_lng, poseur_confirmed_at
  ) values (
    auth.uid(), request_id, 'created',
    st_setsrid(st_makepoint(lng, lat), 4326)::geography, lat, lng, now()
  ) returning id into v_session;
  return query select v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bucket de stockage des preuves (privé : lecture réservée au service role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mivtza-proofs', 'mivtza-proofs', false)
on conflict (id) do nothing;

-- Le poseur authentifié peut déposer sa preuve ; personne ne peut la relire
-- depuis le client (seul le back-office d'audit, via service role, y accède).
create policy "proofs upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'mivtza-proofs');

-- ---------------------------------------------------------------------------
-- RPC : retrouve un posé déjà vu par similarité d'empreinte faciale (dédup).
-- Similarité cosinus = 1 - distance ; on renvoie le meilleur match au-dessus
-- du seuil. Index ivfflat recommandé en prod.
-- ---------------------------------------------------------------------------
create or replace function match_beneficiary_face(query vector(128), threshold double precision)
returns table (id uuid, last_rewarded_at timestamptz, reward_count integer, similarity double precision)
language sql stable as $$
  select f.id, f.last_rewarded_at, f.reward_count,
         1 - (f.embedding <=> query) as similarity
  from beneficiary_faces f
  where f.embedding is not null
    and 1 - (f.embedding <=> query) >= threshold
  order by f.embedding <=> query asc
  limit 1;
$$;
