// ============================================================================
// Edge Function : clear_rewards (cron)
// ----------------------------------------------------------------------------
// Déclenche le clearing différé des récompenses "pending" éligibles.
// À planifier via pg_cron / Supabase Scheduled Functions (ex. toutes les heures).
// La logique métier vit dans le RPC clear_due_rewards (SQL, SECURITY DEFINER).
//
// Protégée par un secret partagé (en-tête x-cron-secret == CRON_SECRET) car
// l'endpoint est public (verify_jwt=false).
//
// Secrets requis : CRON_SECRET.
// Déploiement : supabase functions deploy clear_rewards --no-verify-jwt
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 });
  }
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
