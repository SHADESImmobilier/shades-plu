-- ============================================================================
-- 0003 · Génération de bons partenaires (échange de points)
-- ============================================================================

-- RPC : échange des points contre un bon. Débit atomique + code anti-rejeu.
create or replace function issue_voucher(offer_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer as $$
declare
  v_user uuid := auth.uid();
  v_cost integer;
  v_balance integer;
  v_code text;
  v_exp timestamptz := now() + interval '90 days';
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select cost_points into v_cost from partner_offers
    where id = offer_id and is_active limit 1;
  if v_cost is null then raise exception 'offer_unavailable'; end if;

  -- verrouille la ligne profil pour éviter le double-dépense concurrent
  select points_balance into v_balance from profiles where id = v_user for update;
  if v_balance < v_cost then raise exception 'insufficient_points'; end if;

  v_code := upper(encode(gen_random_bytes(6), 'hex'));

  update profiles set points_balance = points_balance - v_cost where id = v_user;
  insert into reward_ledger (user_id, kind, points, reason)
    values (v_user, 'debit', v_cost, 'voucher_redeemed');
  insert into redemptions (user_id, offer_id, code, status, expires_at)
    values (v_user, offer_id, v_code, 'cleared', v_exp);

  return query select v_code, v_exp;
end;
$$;
