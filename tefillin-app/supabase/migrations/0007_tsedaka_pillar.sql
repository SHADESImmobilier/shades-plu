-- ============================================================================
-- 0007 · Pilier Tsedaka / Maasser (dons RÉELS + rappel quotidien)
-- ============================================================================
-- Étend le pilier tsedaka : dons en argent réel (Apple Pay/Google Pay via Stripe,
-- PayPal, HelloAsso), anonymat au choix, annuaire d'associations (dont MitzvaNOW),
-- suivi du maasser. Les fonds vont directement à l'association (Stripe Connect).
-- ============================================================================

-- --- Associations : champs pour recevoir des dons réels ---------------------
alter table tsedakot
  add column if not exists is_platform       boolean not null default false, -- "MitzvaNOW"
  add column if not exists accepts_donations boolean not null default true,
  add column if not exists category          text,   -- 'familles' | 'etude' | 'malades' | ...
  add column if not exists logo_url          text,
  add column if not exists stripe_account_id text,   -- compte Stripe Connect de l'asso
  add column if not exists hello_asso_slug   text;

-- --- Préférences de rappel quotidien (sur le profil) ------------------------
alter table profiles
  add column if not exists tsedaka_reminder_enabled boolean not null default false,
  add column if not exists tsedaka_reminder_hour     integer;   -- 0..23, heure locale

-- --- Dons en argent réel ----------------------------------------------------
create table money_donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  tsedaka_id    uuid not null references tsedakot(id),
  amount_cents  integer not null check (amount_cents > 0),
  currency      text not null default 'eur',
  is_anonymous  boolean not null default false,  -- masque le nom vis-à-vis de l'asso / mur de dons
  is_maaser     boolean not null default true,
  recurring     text,                             -- null | 'daily' | 'weekly' | 'pre_shabbat'
  provider      text not null,                    -- 'stripe' | 'paypal' | 'hello_asso'
  provider_ref  text,                             -- PaymentIntent id, etc.
  status        text not null default 'created',  -- 'created'|'succeeded'|'failed'|'refunded'
  receipt_code  text,                             -- réf. reçu (émis par l'association)
  created_at    timestamptz not null default now()
);
create index money_donations_user_idx on money_donations (user_id, created_at desc);
create index money_donations_tsedaka_idx on money_donations (tsedaka_id);

alter table money_donations enable row level security;
-- Le donateur lit ses propres dons ; l'écriture passe par l'Edge Function (service role).
create policy "money donations owner read" on money_donations
  for select using (auth.uid() = user_id);

-- Annuaire public des associations actives (lecture seule côté client).
alter table tsedakot enable row level security;
create policy "tsedakot public read" on tsedakot
  for select using (is_active);

-- ---------------------------------------------------------------------------
-- RPC : tableau de bord maasser (total donné par période, argent + points).
-- ---------------------------------------------------------------------------
create or replace function maaser_summary()
returns table (period text, amount_eur numeric)
language sql stable as $$
  with m as (
    select amount_cents from money_donations
    where user_id = auth.uid() and status = 'succeeded'
  ),
   month as (
    select coalesce(sum(amount_cents),0)/100.0 as v from money_donations
    where user_id = auth.uid() and status = 'succeeded'
      and created_at >= date_trunc('month', now())
  ),
  year as (
    select coalesce(sum(amount_cents),0)/100.0 as v from money_donations
    where user_id = auth.uid() and status = 'succeeded'
      and created_at >= date_trunc('year', now())
  )
  select 'month', (select v from month)
  union all select 'year', (select v from year);
$$;
