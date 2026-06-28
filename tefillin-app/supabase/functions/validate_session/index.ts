// ============================================================================
// Edge Function : validate_session
// ----------------------------------------------------------------------------
// Reçoit la seconde confirmation (token QR / code) d'une session de mise.
// Vérifie la co-présence, calcule un score de risque, puis fait passer la
// session en `confirmed` (clearing rapide) ou `under_review` (audit).
//
// Cette logique NE doit JAMAIS tourner côté client : seul le service role
// peut écrire le statut de session et créditer une récompense.
//
// Déploiement : supabase functions deploy validate_session
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REWARD_POINTS = 100;          // barème de base (à déplacer en config serveur)
const MAX_PROXIMITY_M = 80;         // co-présence GPS max
const CONFIRM_WINDOW_S = 120;       // fenêtre entre les deux confirmations
const COOLDOWN_DAYS = 30;           // anti-farming couple poseur↔bénéficiaire

type Body = {
  token: string;                    // token du QR scanné par le bénéficiaire
  beneficiary_lat: number;
  beneficiary_lng: number;
  device_fingerprint: string;
  beneficiary_phone_hash: string;
};

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as Body;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Résoudre le token éphémère (non expiré, non consommé) -> session
    const { data: tok } = await admin
      .from("session_tokens")
      .select("id, session_id, expires_at, consumed_at")
      .eq("token", body.token)
      .maybeSingle();

    if (!tok || tok.consumed_at || new Date(tok.expires_at) < new Date()) {
      return json({ ok: false, reason: "token_invalid_or_expired" }, 400);
    }

    const { data: session } = await admin
      .from("mivtza_sessions")
      .select("*")
      .eq("id", tok.session_id)
      .single();

    // 2) Calculs anti-fraude (signaux + poids)
    const signals: { signal: string; weight: number; details?: unknown }[] = [];

    // 2a) co-présence GPS
    const proximity = haversine(
      session.poseur_location_lat, session.poseur_location_lng,
      body.beneficiary_lat, body.beneficiary_lng,
    );
    if (proximity > MAX_PROXIMITY_M) {
      signals.push({ signal: "geo_far", weight: 60, details: { proximity } });
    }

    // 2b) fenêtre temporelle de double confirmation
    const dt = (Date.now() - new Date(session.poseur_confirmed_at).getTime()) / 1000;
    if (dt > CONFIRM_WINDOW_S) {
      signals.push({ signal: "confirm_window", weight: 40, details: { dt } });
    }

    // 2c) même appareil pour poseur et bénéficiaire = collusion évidente
    const { data: poseurDevices } = await admin
      .from("devices").select("fingerprint").eq("user_id", session.poseur_id);
    if (poseurDevices?.some((d) => d.fingerprint === body.device_fingerprint)) {
      signals.push({ signal: "same_device", weight: 100 });
    }

    // 2d) cooldown anti-farming sur le bénéficiaire
    const { data: ben } = await admin
      .from("beneficiaries").select("*")
      .eq("phone_hash", body.beneficiary_phone_hash).maybeSingle();
    if (ben?.last_rewarded_at) {
      const days = (Date.now() - new Date(ben.last_rewarded_at).getTime()) / 86400000;
      if (days < COOLDOWN_DAYS) {
        signals.push({ signal: "cooldown", weight: 50, details: { days } });
      }
    }

    // 3) Score & décision
    const score = signals.reduce((s, x) => s + x.weight, 0);
    const risk = score >= 100 ? "high" : score >= 40 ? "medium" : "low";
    const rejected = signals.some((s) => s.signal === "same_device") || proximity > MAX_PROXIMITY_M * 3;

    // persistance des signaux
    if (signals.length) {
      await admin.from("fraud_signals").insert(
        signals.map((s) => ({ session_id: session.id, ...s })),
      );
    }

    const newStatus = rejected ? "rejected" : risk === "low" ? "confirmed" : "under_review";

    await admin.from("mivtza_sessions").update({
      status: newStatus,
      beneficiary_confirmed_at: new Date().toISOString(),
      beneficiary_location_lat: body.beneficiary_lat,
      beneficiary_location_lng: body.beneficiary_lng,
      proximity_meters: proximity,
      risk, risk_score: score,
    }).eq("id", session.id);

    await admin.from("session_tokens").update({ consumed_at: new Date().toISOString() }).eq("id", tok.id);

    // 4) Récompense en attente (jamais créditée directement ; clearing différé)
    if (!rejected) {
      await admin.from("rewards").insert({
        session_id: session.id, poseur_id: session.poseur_id,
        points: REWARD_POINTS, status: "pending",
      });
      await admin.from("beneficiaries").upsert({
        phone_hash: body.beneficiary_phone_hash,
        last_rewarded_at: new Date().toISOString(),
        device_fingerprint: body.device_fingerprint,
      }, { onConflict: "phone_hash" });
    }

    return json({ ok: !rejected, status: newStatus, risk, score });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

// distance en mètres (Haversine)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
