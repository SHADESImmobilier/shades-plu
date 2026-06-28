-- ============================================================================
-- 0004 · Flux "VTC" temps réel : demande → acceptation → suivi
-- ============================================================================

-- Les poseurs (disponibles) peuvent voir les demandes encore "pending" pour
-- pouvoir les accepter (politique permissive, OR'ée avec "requests involved read").
create policy "poseurs read pending requests" on tefillin_requests
  for select using (
    status = 'pending'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_poseur)
  );

-- Le demandeur peut annuler sa demande.
create policy "beneficiary cancels request" on tefillin_requests
  for update using (auth.uid() = beneficiary_id) with check (auth.uid() = beneficiary_id);

-- ---------------------------------------------------------------------------
-- RPC : un poseur accepte une demande (atomique, anti double-acceptation).
-- ---------------------------------------------------------------------------
create or replace function accept_request(req_id uuid)
returns table (id uuid, beneficiary_id uuid, lat double precision, lng double precision)
language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from profiles where id = v_user and is_poseur) then
    raise exception 'not_a_poseur';
  end if;

  return query
  update tefillin_requests r
     set poseur_id = v_user, status = 'accepted'
   where r.id = req_id and r.status = 'pending'
  returning r.id, r.beneficiary_id,
            st_y(r.location::geometry), st_x(r.location::geometry);

  if not found then raise exception 'request_unavailable'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : demandes "pending" à proximité d'un poseur (pour le fallback / liste).
-- ---------------------------------------------------------------------------
create or replace function nearby_requests(lat double precision, lng double precision, radius_m integer default 5000)
returns table (id uuid, distance_m double precision, lat_r double precision, lng_r double precision, note text, created_at timestamptz)
language sql stable as $$
  select r.id,
         st_distance(r.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_m,
         st_y(r.location::geometry), st_x(r.location::geometry),
         r.note, r.created_at
  from tefillin_requests r
  where r.status = 'pending'
    and r.expires_at > now()
    and st_dwithin(r.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_m)
  order by distance_m asc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Realtime : diffuser les changements de demandes et la position des poseurs.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table tefillin_requests;
alter publication supabase_realtime add table poseur_availability;
