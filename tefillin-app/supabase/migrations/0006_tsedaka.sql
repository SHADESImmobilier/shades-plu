-- ============================================================================
-- 0006 · Don du solde à la tsedaka (déductible du maasser)
-- ============================================================================
-- L'utilisateur peut reverser tout ou partie de son solde de points à une
-- association (tsedaka). Le don génère un reçu, et les points sont convertis en
-- valeur monétaire reversée à l'association partenaire.
-- ============================================================================

-- Associations bénéficiaires (tsedakot habilitées).
create table tsedakot (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- une asso reconnue d'intérêt général peut émettre un reçu fiscal (déduction)
  tax_receipt_eligible boolean not null default false,
  country     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Dons réalisés.
create table donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  tsedaka_id    uuid not null references tsedakot(id),
  points        integer not null,
  amount_eur    numeric(10,2) not null,        -- valeur convertie reversée
  is_maaser     boolean not null default false, -- l'utilisateur déclare un maasser
  receipt_code  text unique,                    -- reçu (pour déduction le cas échéant)
  created_at    timestamptz not null default now()
);
create index donations_user_idx on donations (user_id);

alter table donations enable row level security;
create policy "donations owner read" on donations for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPC : reverser des points à une tsedaka (débit atomique + reçu).
-- POINTS_TO_EUR : taux de conversion (à centraliser en config serveur).
-- ---------------------------------------------------------------------------
create or replace function donate_to_tsedaka(
  tsedaka_id uuid,
  points integer,
  is_maaser boolean default false
)
returns table (receipt_code text, amount_eur numeric)
language plpgsql security definer as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_rate numeric := 0.10;          -- 1 point = 0,10 € (exemple ; config serveur)
  v_amount numeric;
  v_code text;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if points <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from tsedakot where id = tsedaka_id and is_active) then
    raise exception 'tsedaka_unavailable';
  end if;

  select points_balance into v_balance from profiles where id = v_user for update;
  if v_balance < points then raise exception 'insufficient_points'; end if;

  v_amount := round(points * v_rate, 2);
  v_code := 'DON-' || upper(encode(gen_random_bytes(5), 'hex'));

  update profiles set points_balance = points_balance - points where id = v_user;
  insert into reward_ledger (user_id, kind, points, reason)
    values (v_user, 'debit', points, 'tsedaka_donation');
  insert into donations (user_id, tsedaka_id, points, amount_eur, is_maaser, receipt_code)
    values (v_user, tsedaka_id, points, v_amount, is_maaser, v_code);

  return query select v_code, v_amount;
end;
$$;
