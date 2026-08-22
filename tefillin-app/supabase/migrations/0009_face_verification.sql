-- ============================================================================
-- 0009 · Vérification faciale renforcée
-- ============================================================================
-- - Le poseur enrôle une photo de référence (empreinte faciale sur son profil).
--   À chaque mise, son visage sur la photo est comparé à cette référence.
-- - Le posé (bénéficiaire) ne peut être validé qu'UNE FOIS PAR JOUR
--   (les tefillin se mettent une seule fois par jour).
-- ============================================================================

-- Référence faciale du poseur (enrôlement).
alter table profiles
  add column if not exists face_embedding vector(128),
  add column if not exists face_enrolled  boolean not null default false;

-- Date de la dernière validation d'un posé (règle 1x/jour).
alter table beneficiary_faces
  add column if not exists last_reward_date date;

-- Redéfinition : le matching renvoie aussi la date de dernière récompense
-- (pour appliquer la règle "une fois par jour"). Le retour passe de 4 à 5
-- colonnes -> DROP explicite requis avant de recréer.
drop function if exists match_beneficiary_face(vector, double precision);
create or replace function match_beneficiary_face(query vector(128), threshold double precision)
returns table (id uuid, last_rewarded_at timestamptz, last_reward_date date, reward_count integer, similarity double precision)
language sql stable as $$
  select f.id, f.last_rewarded_at, f.last_reward_date, f.reward_count,
         1 - (f.embedding <=> query) as similarity
  from beneficiary_faces f
  where f.embedding is not null
    and 1 - (f.embedding <=> query) >= threshold
  order by f.embedding <=> query asc
  limit 1;
$$;

-- RPC : enrôler / mettre à jour la référence faciale du poseur.
-- (L'embedding est calculé par le service de vision côté serveur ; ici on stocke.)
create or replace function set_face_reference(embedding vector(128))
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update profiles set face_embedding = embedding, face_enrolled = true where id = auth.uid();
end;
$$;
