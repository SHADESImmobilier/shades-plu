// ============================================================================
// Edge Function : clear_rewards (cron)
// ----------------------------------------------------------------------------
// Déclenche le clearing différé des récompenses "pending" éligibles.
// À planifier via pg_cron / Supabase Scheduled Functions (ex. toutes les heures).
// La logique métier vit dans le RPC clear_due_rewards (SQL, SECURITY DEFINER).
//
// Déploiement : supabase functions deploy clear_rewards
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("clear_due_rewards", { min_age_hours: 24 });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, cleared: data }), {
    headers: { "content-type": "application/json" },
  });
});
