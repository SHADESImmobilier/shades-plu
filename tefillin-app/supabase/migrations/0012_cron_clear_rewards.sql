-- ============================================================================
-- 0012 · Planification du clearing des récompenses (pg_cron)
-- ----------------------------------------------------------------------------
-- Sans planification, les récompenses "pending" ne seraient jamais créditées.
-- On appelle directement le RPC clear_due_rewards() toutes les heures (le RPC
-- applique déjà le gate 24h / risque faible / session confirmée).
--
-- Nécessite l'extension pg_cron (disponible sur Supabase). Si votre projet ne
-- l'a pas activée, activez-la (Dashboard > Database > Extensions) avant d'appliquer.
-- ============================================================================
create extension if not exists pg_cron;

-- Idempotent : on ne (re)planifie que si le job n'existe pas déjà.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'mitzvanow-clear-rewards') then
    perform cron.schedule(
      'mitzvanow-clear-rewards',
      '0 * * * *',                       -- toutes les heures
      $cron$ select clear_due_rewards(24); $cron$
    );
  end if;
end $$;
