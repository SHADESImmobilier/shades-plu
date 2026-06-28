// ============================================================================
// Edge Function : submit_session
// ----------------------------------------------------------------------------
// Reçoit la preuve d'une mise (selfie live déjà uploadé dans Storage) et :
//   1. analyse la scène par vision (≥2 visages, tefillin tête + bras) ;
//   2. calcule l'empreinte faciale du posé et la dédoublonne (anti-farming) ;
//   3. calcule un score de risque ;
//   4. confirme (clearing différé), met en revue, ou rejette.
//
// La récompense reste TOUJOURS en `pending` jusqu'au clearing (jamais créditée
// directement). Cette logique ne tourne que côté serveur (service role).
//
// NB : analyzePhoto() / faceEmbedding() sont des points d'intégration pour un
// modèle de vision (API externe ou modèle hébergé). Stubs explicites ici.
//
// Déploiement : supabase functions deploy submit_session
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REWARD_POINTS = 100;
const COOLDOWN_DAYS = 30;
const FACE_MATCH_THRESHOLD = 0.85; // similarité cosinus -> même personne

type Body = {
  session_id: string;
  photo_path: string;
  lat: number;
  lng: number;
  poseur_device: string;
  consent: boolean;
};

Deno.serve(async (req) => {
  try {
    const body = (await req.json()) as Body;
    if (!body.consent) return json({ ok: false, reason: "consent_required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await admin
      .from("mivtza_sessions").select("*").eq("id", body.session_id).single();

    // 1) Vision : récupérer la photo et analyser la scène
    const { data: file } = await admin.storage.from("mivtza-proofs").download(body.photo_path);
    const scene = await analyzePhoto(file);

    const signals: { signal: string; weight: number; details?: unknown }[] = [];
    const sceneOk = scene.faceCount >= 2 && scene.tefillinHead && scene.tefillinArm;
    if (scene.faceCount < 2) signals.push({ signal: "scene_one_face", weight: 70 });
    if (!scene.tefillinHead) signals.push({ signal: "no_tefillin_head", weight: 50 });
    if (!scene.tefillinArm) signals.push({ signal: "no_tefillin_arm", weight: 50 });
    if (!scene.live) signals.push({ signal: "not_live", weight: 100 });

    // 2) Empreinte faciale du posé -> dédup anti-farming
    let faceId: string | null = null;
    if (scene.beneficiaryEmbedding) {
      const { data: match } = await admin.rpc("match_beneficiary_face", {
        query: scene.beneficiaryEmbedding, threshold: FACE_MATCH_THRESHOLD,
      });
      const existing = Array.isArray(match) ? match[0] : match;
      if (existing) {
        faceId = existing.id;
        if (existing.last_rewarded_at) {
          const days = (Date.now() - new Date(existing.last_rewarded_at).getTime()) / 86400000;
          if (days < COOLDOWN_DAYS) signals.push({ signal: "face_cooldown", weight: 60, details: { days } });
        }
      } else {
        const { data: created } = await admin
          .from("beneficiary_faces").insert({ embedding: scene.beneficiaryEmbedding }).select("id").single();
        faceId = created?.id ?? null;
      }
    }

    // 3) même appareil poseur/posé (collusion) — heuristique simple
    const { data: poseurDevices } = await admin
      .from("devices").select("fingerprint").eq("user_id", session.poseur_id);
    if (poseurDevices?.some((d) => d.fingerprint === body.poseur_device) === false) {
      // appareil inconnu du poseur : signal faible
      signals.push({ signal: "unknown_device", weight: 10 });
    }

    // 4) Score & décision
    const score = signals.reduce((s, x) => s + x.weight, 0);
    const risk = score >= 100 ? "high" : score >= 40 ? "medium" : "low";
    const rejected = !scene.live || (!sceneOk && score >= 100);
    const status = rejected ? "rejected" : risk === "low" && sceneOk ? "confirmed" : "under_review";

    if (signals.length) {
      await admin.from("fraud_signals").insert(signals.map((s) => ({ session_id: session.id, ...s })));
    }

    await admin.from("mivtza_sessions").update({
      status, consent_given: true, photo_path: body.photo_path,
      beneficiary_location_lat: body.lat, beneficiary_location_lng: body.lng,
      face_count: scene.faceCount, tefillin_head: scene.tefillinHead,
      tefillin_arm: scene.tefillinArm, scene_ok: sceneOk,
      beneficiary_face_id: faceId, risk, risk_score: score,
      beneficiary_confirmed_at: new Date().toISOString(),
    }).eq("id", session.id);

    // 5) Récompense en attente (jamais créditée directement)
    if (!rejected) {
      await admin.from("rewards").insert({
        session_id: session.id, poseur_id: session.poseur_id,
        points: REWARD_POINTS, status: "pending",
      });
      if (faceId) {
        await admin.from("beneficiary_faces")
          .update({ last_rewarded_at: new Date().toISOString(), reward_count: 1 })
          .eq("id", faceId);
      }
    }

    return json({ ok: !rejected, status, risk, score, scene_ok: sceneOk });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

// ---------------------------------------------------------------------------
// POINT D'INTÉGRATION VISION — à brancher sur un modèle réel (API externe type
// vision LLM, ou modèle hébergé : détection de visages + détection tefillin +
// embedding facial + liveness). Stub déterministe pour le scaffold.
// ---------------------------------------------------------------------------
async function analyzePhoto(_file: Blob | null): Promise<{
  faceCount: number; tefillinHead: boolean; tefillinArm: boolean;
  live: boolean; beneficiaryEmbedding: number[] | null;
}> {
  // TODO: appeler le service de vision et renvoyer les vrais résultats.
  return { faceCount: 2, tefillinHead: true, tefillinArm: true, live: true, beneficiaryEmbedding: null };
}
