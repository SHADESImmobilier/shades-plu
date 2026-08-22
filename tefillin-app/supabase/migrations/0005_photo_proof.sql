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

-- Donnée BIOMÉTRIQUE : accès réservé au service role uniquement. On active la RLS
-- SANS aucune policy client -> les rôles anon/authenticated ne peuvent ni lire ni
-- écrire (seul le service role, qui contourne la RLS, y accède via les Edge Functions).
alter table beneficiary_faces enable row level security;

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
-- Le nombre de colonnes de retour change vs 0002 (3 -> 1) : DROP explicite requis.
-- Si la session provient d'une demande "VTC", on recopie le beneficiary_id de la
-- demande sur la session : c'est ce qui permet de créditer aussi le POSÉ.
-- ---------------------------------------------------------------------------
drop function if exists create_session(double precision, double precision, uuid);
create or replace function create_session(
  lat double precision,
  lng double precision,
  request_id uuid default null
)
returns table (session_id uuid)
language plpgsql security definer as $$
declare
  v_session uuid;
  v_benef   uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if request_id is not null then
    select beneficiary_id into v_benef from tefillin_requests where id = request_id;
  end if;
  insert into mivtza_sessions (
    poseur_id, request_id, beneficiary_id, status,
    poseur_location, poseur_location_lat, poseur_location_lng, poseur_confirmed_at
  ) values (
    auth.uid(), request_id, v_benef, 'created',
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

-- Le poseur authentifié peut déposer sa preuve DANS SON PROPRE DOSSIER
-- (préfixe = son uid) ; personne ne peut la relire depuis le client
-- (seul le back-office d'audit, via service role, y accède).
-- Les chemins doivent donc être de la forme "<uid>/sessions/<id>.jpg" et
-- "<uid>/faces/<id>.jpg" (voir l'app mobile).
drop policy if exists "proofs upload" on storage.objects;
create policy "proofs upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mivtza-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
