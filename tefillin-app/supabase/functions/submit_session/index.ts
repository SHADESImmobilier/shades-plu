// ============================================================================
// Edge Function : submit_session
// ----------------------------------------------------------------------------
// Reçoit la preuve d'une mise (selfie live déjà uploadé dans Storage) et vérifie :
//   1. Scène : les tefillin (tête + bras) sont portés par le POSÉ, et le POSEUR
//      est visible (≥ 2 visages).
//   2. Poseur authentifié : son visage sur la photo == sa photo de référence
//      enrôlée sur son profil (empreinte faciale).
//   3. Posé unique : un même visage de posé ne peut être validé qu'UNE FOIS PAR
//      JOUR (les tefillin se mettent une seule fois par jour).
//   4. Co-présence géo + score de risque → confirmé / revue / rejeté.
//
// La récompense reste TOUJOURS en `pending` jusqu'au clearing. Logique serveur
// uniquement (service role).
//
// Points d'intégration vision : analyzePhoto() (détection tefillin sur le posé,
// visages, embeddings, liveness). Stub explicite pour le scaffold.
//
// Déploiement : supabase functions deploy submit_session
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REWARD_POINTS = 100;
const FACE_MATCH_THRESHOLD = 0.85;   // similarité cosinus -> même personne
const POSEUR_MATCH_THRESHOLD = 0.82; // poseur vs sa référence de profil

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
    const { data: poseur } = await admin
      .from("profiles").select("id, face_embedding, face_enrolled, trust")
      .eq("id", session.poseur_id).single();

    // 1) Vision : récupérer la photo et analyser
    const { data: file } = await admin.storage.from("mivtza-proofs").download(body.photo_path);
    const scene = await analyzePhoto(file);

    const signals: { signal: string; weight: number; details?: unknown }[] = [];

    // --- Scène : tefillin SUR LE POSÉ + poseur visible -----------------------
    const sceneOk =
      scene.faceCount >= 2 &&
      scene.beneficiaryTefillinHead &&
      scene.beneficiaryTefillinArm;
    if (scene.faceCount < 2) signals.push({ signal: "poseur_not_visible", weight: 70 });
    if (!scene.beneficiaryTefillinHead) signals.push({ signal: "no_tefillin_head_on_beneficiary", weight: 60 });
    if (!scene.beneficiaryTefillinArm) signals.push({ signal: "no_tefillin_arm_on_beneficiary", weight: 60 });
    if (!scene.live) signals.push({ signal: "not_live", weight: 100 });

    // --- (a) Poseur authentifié vs référence de profil -----------------------
    let poseurVerified = false;
    if (!poseur?.face_enrolled || !poseur?.face_embedding) {
      signals.push({ signal: "poseur_not_enrolled", weight: 80 }); // doit enrôler son visage
    } else if (scene.poseurEmbedding) {
      const sim = cosine(scene.poseurEmbedding, parseVec(poseur.face_embedding));
      poseurVerified = sim >= POSEUR_MATCH_THRESHOLD;
      if (!poseurVerified) signals.push({ signal: "poseur_face_mismatch", weight: 100, details: { sim } });
    } else {
      signals.push({ signal: "poseur_face_not_found", weight: 70 });
    }

    // --- (b) Posé unique : une seule fois par jour ---------------------------
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    let faceId: string | null = null;
    let alreadyToday = false;
    if (scene.beneficiaryEmbedding) {
      const { data: match } = await admin.rpc("match_beneficiary_face", {
        query: scene.beneficiaryEmbedding, threshold: FACE_MATCH_THRESHOLD,
      });
      const existing = Array.isArray(match) ? match[0] : match;
      if (existing) {
        faceId = existing.id;
        if (existing.last_reward_date === today) {
          alreadyToday = true;
          signals.push({ signal: "beneficiary_already_today", weight: 100 });
        }
      } else {
        const { data: created } = await admin
          .from("beneficiary_faces").insert({ embedding: scene.beneficiaryEmbedding }).select("id").single();
        faceId = created?.id ?? null;
      }
    } else {
      signals.push({ signal: "beneficiary_face_not_found", weight: 60 });
    }

    // 2) Score & décision
    const score = signals.reduce((s, x) => s + x.weight, 0);
    const risk = score >= 100 ? "high" : score >= 40 ? "medium" : "low";
    // rejet ferme si : posé déjà fait aujourd'hui, poseur ne correspond pas, ou pas live
    const rejected = alreadyToday || !scene.live ||
      (poseur?.face_enrolled && scene.poseurEmbedding && !poseurVerified);
    const status = rejected ? "rejected"
      : (risk === "low" && sceneOk && poseurVerified) ? "confirmed"
      : "under_review";

    if (signals.length) {
      await admin.from("fraud_signals").insert(signals.map((s) => ({ session_id: session.id, ...s })));
    }

    await admin.from("mivtza_sessions").update({
      status, consent_given: true, photo_path: body.photo_path,
      beneficiary_location_lat: body.lat, beneficiary_location_lng: body.lng,
      face_count: scene.faceCount,
      tefillin_head: scene.beneficiaryTefillinHead, tefillin_arm: scene.beneficiaryTefillinArm,
      scene_ok: sceneOk, beneficiary_face_id: faceId,
      risk, risk_score: score, beneficiary_confirmed_at: new Date().toISOString(),
    }).eq("id", session.id);

    // 3) Récompense en attente (jamais créditée directement) + verrou 1x/jour
    if (!rejected) {
      await admin.from("rewards").insert({
        session_id: session.id, poseur_id: session.poseur_id,
        points: REWARD_POINTS, status: "pending",
      });
      if (faceId) {
        await admin.from("beneficiary_faces").update({
          last_rewarded_at: new Date().toISOString(),
          last_reward_date: today,
          reward_count: 1,
        }).eq("id", faceId);
      }
    }

    return json({
      ok: !rejected, status, risk, score,
      scene_ok: sceneOk, poseur_verified: poseurVerified, already_today: alreadyToday,
    });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
// pgvector renvoie l'embedding en texte "[...]" via l'API REST.
function parseVec(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  try { return JSON.parse(v as string); } catch { return []; }
}

// ---------------------------------------------------------------------------
// POINT D'INTÉGRATION VISION — à brancher sur un modèle réel :
//  - détection de visages (≥2) + attribution du poseur/posé ;
//  - détection des tefillin (tête + bras) PORTÉS PAR LE POSÉ ;
//  - embeddings faciaux (poseur + posé) ; liveness / anti-photo-d'écran.
// Stub déterministe pour le scaffold.
// ---------------------------------------------------------------------------
async function analyzePhoto(_file: Blob | null): Promise<{
  faceCount: number;
  beneficiaryTefillinHead: boolean;
  beneficiaryTefillinArm: boolean;
  live: boolean;
  poseurEmbedding: number[] | null;
  beneficiaryEmbedding: number[] | null;
}> {
  // TODO: remplacer par l'appel au service de vision.
  return {
    faceCount: 2, beneficiaryTefillinHead: true, beneficiaryTefillinArm: true,
    live: true, poseurEmbedding: null, beneficiaryEmbedding: null,
  };
}
