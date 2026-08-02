// ============================================================================
// Edge Function : submit_session
// ----------------------------------------------------------------------------
// Reçoit la preuve d'une mise (selfie live déjà uploadé dans Storage) et vérifie :
//   1. Scène (VISION) : deux personnes distinctes, le POSEUR est visible, et les
//      tefillin (tête + bras) sont bien portés par le POSÉ.
//   2. Poseur authentifié (VISION) : son visage sur la photo de mise correspond
//      à sa photo de référence enrôlée sur son profil (face_ref_path).
//   3. Posé unique : un même visage de posé ne peut être validé qu'UNE FOIS PAR
//      JOUR (les tefillin se mettent une seule fois par jour). Le dédoublonnage
//      inter-sessions repose sur des empreintes faciales (service dédié FACE_API).
//   4. Co-présence géo + score de risque → confirmé / revue / rejeté.
//
// La récompense reste TOUJOURS en `pending` jusqu'au clearing. Logique serveur
// uniquement (service role).
//
// Vision : modèle Claude (claude-opus-5) via le SDK Anthropic officiel. On lui
// passe DEUX images (référence du poseur + photo de la mise) et on lui demande
// une sortie structurée (JSON schema). Le dédoublonnage 1×/jour du posé reste
// confié à un service de reconnaissance faciale (FACE_API) ; s'il est absent, on
// route en revue manuelle plutôt que de créditer aveuglément.
//
// Env requis : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
// Env optionnel : FACE_API_URL, FACE_API_KEY (embeddings pour la règle 1×/jour).
//
// Déploiement : supabase functions deploy submit_session
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.70.0";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const REWARD_POINTS = 100;
const FACE_MATCH_THRESHOLD = 0.85;    // similarité cosinus -> même posé
const POSEUR_MATCH_MIN_CONFIDENCE = 0.7; // confiance mini du modèle vision
const VISION_MODEL = "claude-opus-5";

type Body = {
  session_id: string;
  photo_path: string;
  lat: number;
  lng: number;
  poseur_device: string;
  consent: boolean;
};

// Résultat structuré attendu du modèle de vision.
type Scene = {
  two_distinct_people: boolean;
  poseur_present: boolean;
  tefillin_head_on_beneficiary: boolean;
  tefillin_arm_on_beneficiary: boolean;
  poseur_matches_reference: boolean;
  poseur_match_confidence: number; // 0..1
  likely_live_photo: boolean;
  notes: string;
};

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    two_distinct_people: {
      type: "boolean",
      description: "Deux personnes DISTINCTES sont visibles sur la photo de la mise (pas un selfie solo, pas la même personne dupliquée).",
    },
    poseur_present: {
      type: "boolean",
      description: "Le poseur (la personne de la photo de RÉFÉRENCE) est bien présent sur la photo de la mise.",
    },
    tefillin_head_on_beneficiary: {
      type: "boolean",
      description: "Le tefillin de tête (boîtier noir sur le front/haut de la tête, avec lanières) est porté par le POSÉ — c.-à-d. l'autre personne, pas le poseur.",
    },
    tefillin_arm_on_beneficiary: {
      type: "boolean",
      description: "Le tefillin de bras (boîtier + lanières enroulées sur l'avant-bras/la main) est porté par le POSÉ.",
    },
    poseur_matches_reference: {
      type: "boolean",
      description: "Le visage du poseur sur la photo de la mise correspond à la personne de la photo de référence (Image 1).",
    },
    poseur_match_confidence: {
      type: "number",
      description: "Confiance de la correspondance faciale du poseur, de 0 (aucune) à 1 (certaine).",
    },
    likely_live_photo: {
      type: "boolean",
      description: "La photo semble prise en direct (scène réelle), et non une photo d'écran, un montage ou une capture d'une autre photo.",
    },
    notes: {
      type: "string",
      description: "Brève justification (1-2 phrases) de l'analyse.",
    },
  },
  required: [
    "two_distinct_people", "poseur_present",
    "tefillin_head_on_beneficiary", "tefillin_arm_on_beneficiary",
    "poseur_matches_reference", "poseur_match_confidence",
    "likely_live_photo", "notes",
  ],
} as const;

const VISION_INSTRUCTIONS = `Tu es le module anti-fraude de MitzvaNOW. Tu reçois deux images.

Image 1 = PHOTO DE RÉFÉRENCE du poseur (le bénévole qui pose les tefillin) : son visage enrôlé.
Image 2 = PHOTO DE LA MISE à vérifier : elle doit montrer le poseur ET le posé (le juif à qui on met les tefillin), avec les tefillin portés par le POSÉ.

Vérifie précisément et sans complaisance :
- deux personnes distinctes sur l'Image 2 ;
- le poseur (Image 1) est bien l'une d'elles ;
- le tefillin de TÊTE est sur le POSÉ (l'autre personne), pas sur le poseur ;
- le tefillin de BRAS est sur le POSÉ ;
- la correspondance faciale du poseur (Image 1 ↔ Image 2) avec un niveau de confiance ;
- si la scène paraît réelle et prise en direct (méfie-toi des photos d'écran, montages, captures).

Réponds UNIQUEMENT via le schéma structuré. En cas de doute, sois conservateur (mets false / une confiance basse).`;

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
      .from("profiles").select("id, face_ref_path, face_enrolled, trust")
      .eq("id", session.poseur_id).single();

    const signals: { signal: string; weight: number; details?: unknown }[] = [];

    // 1) Vision : récupérer la photo de la mise + la référence du poseur
    const { data: miseFile } = await admin.storage.from("mivtza-proofs").download(body.photo_path);
    let refFile: Blob | null = null;
    if (poseur?.face_ref_path) {
      const { data } = await admin.storage.from("mivtza-proofs").download(poseur.face_ref_path);
      refFile = data ?? null;
    }

    // Analyse par le modèle de vision (null si indisponible -> revue manuelle).
    let scene: Scene | null = null;
    let visionError: string | null = null;
    try {
      scene = await analyzeScene(miseFile, refFile);
    } catch (e) {
      visionError = String(e);
    }

    if (!poseur?.face_enrolled || !poseur?.face_ref_path) {
      signals.push({ signal: "poseur_not_enrolled", weight: 80 });
    }
    if (!scene) {
      signals.push({ signal: "vision_unavailable", weight: 50, details: { error: visionError } });
    }

    // --- Scène : deux personnes, poseur visible, tefillin SUR LE POSÉ ---------
    const sceneOk = !!scene &&
      scene.two_distinct_people &&
      scene.poseur_present &&
      scene.tefillin_head_on_beneficiary &&
      scene.tefillin_arm_on_beneficiary;

    if (scene) {
      if (!scene.two_distinct_people) signals.push({ signal: "poseur_not_visible", weight: 70 });
      else if (!scene.poseur_present) signals.push({ signal: "poseur_absent_from_photo", weight: 70 });
      if (!scene.tefillin_head_on_beneficiary) signals.push({ signal: "no_tefillin_head_on_beneficiary", weight: 60 });
      if (!scene.tefillin_arm_on_beneficiary) signals.push({ signal: "no_tefillin_arm_on_beneficiary", weight: 60 });
      if (!scene.likely_live_photo) signals.push({ signal: "not_live", weight: 100 });
    }

    // --- (a) Poseur authentifié vs référence de profil (VISION) --------------
    let poseurVerified = false;
    if (scene && poseur?.face_ref_path) {
      poseurVerified =
        scene.poseur_matches_reference &&
        scene.poseur_match_confidence >= POSEUR_MATCH_MIN_CONFIDENCE;
      if (!poseurVerified) {
        signals.push({
          signal: "poseur_face_mismatch", weight: 100,
          details: { matches: scene.poseur_matches_reference, confidence: scene.poseur_match_confidence },
        });
      }
    }

    // --- (b) Posé unique : une seule fois par jour (embeddings FACE_API) ------
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    let faceId: string | null = null;
    let alreadyToday = false;
    let dedupUnavailable = false;
    const benefEmbedding = await beneficiaryEmbedding(miseFile);
    if (benefEmbedding) {
      const { data: match } = await admin.rpc("match_beneficiary_face", {
        query: benefEmbedding, threshold: FACE_MATCH_THRESHOLD,
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
          .from("beneficiary_faces").insert({ embedding: benefEmbedding }).select("id").single();
        faceId = created?.id ?? null;
      }
    } else {
      // Dédoublonnage indisponible : on NE crédite JAMAIS aveuglément la règle
      // 1×/jour -> revue manuelle obligatoire.
      dedupUnavailable = true;
      signals.push({ signal: "beneficiary_dedup_unavailable", weight: 50 });
    }

    // 2) Score & décision
    const score = signals.reduce((s, x) => s + x.weight, 0);
    const risk = score >= 100 ? "high" : score >= 40 ? "medium" : "low";
    // Rejet ferme si : posé déjà fait aujourd'hui, pas live, ou poseur ≠ référence.
    const hardReject =
      alreadyToday ||
      (!!scene && !scene.likely_live_photo) ||
      (!!scene && !!poseur?.face_ref_path && !poseurVerified);
    const status = hardReject ? "rejected"
      : (risk === "low" && sceneOk && poseurVerified && !dedupUnavailable) ? "confirmed"
      : "under_review";

    if (signals.length) {
      await admin.from("fraud_signals").insert(signals.map((s) => ({ session_id: session.id, ...s })));
    }

    await admin.from("mivtza_sessions").update({
      status, consent_given: true, photo_path: body.photo_path,
      beneficiary_location_lat: body.lat, beneficiary_location_lng: body.lng,
      face_count: scene ? (scene.two_distinct_people ? 2 : 1) : null,
      tefillin_head: scene?.tefillin_head_on_beneficiary ?? null,
      tefillin_arm: scene?.tefillin_arm_on_beneficiary ?? null,
      scene_ok: sceneOk, beneficiary_face_id: faceId,
      risk, risk_score: score, beneficiary_confirmed_at: new Date().toISOString(),
    }).eq("id", session.id);

    // 3) Récompense en attente (jamais créditée directement) + verrou 1×/jour.
    // Seulement quand la mise est CONFIRMÉE (une revue manuelle créditera après coup).
    if (status === "confirmed") {
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
      ok: status !== "rejected", status, risk, score,
      scene_ok: sceneOk, poseur_verified: poseurVerified, already_today: alreadyToday,
    });
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

// ---------------------------------------------------------------------------
// VISION — modèle Claude (SDK Anthropic officiel). Deux images en base64
// (référence du poseur + photo de la mise) et sortie structurée (JSON schema).
// ---------------------------------------------------------------------------
async function analyzeScene(mise: Blob | null, reference: Blob | null): Promise<Scene> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant");
  if (!mise) throw new Error("photo de mise introuvable");
  if (!reference) throw new Error("photo de référence du poseur introuvable");

  const client = new Anthropic({ apiKey });
  const miseB64 = await blobToBase64(mise);
  const refB64 = await blobToBase64(reference);

  const msg = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: SCENE_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Image 1 — PHOTO DE RÉFÉRENCE du poseur (visage enrôlé) :" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: refB64 } },
        { type: "text", text: "Image 2 — PHOTO DE LA MISE à vérifier :" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: miseB64 } },
        { type: "text", text: VISION_INSTRUCTIONS },
      ],
    }],
  });

  const text = msg.content.find((b: { type: string }) => b.type === "text") as
    | { type: "text"; text: string } | undefined;
  if (!text?.text) throw new Error("réponse vision vide");
  return JSON.parse(text.text) as Scene;
}

async function blobToBase64(b: Blob): Promise<string> {
  return encodeBase64(new Uint8Array(await b.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Empreinte faciale du POSÉ pour la règle « 1×/jour » (dédoublonnage
// inter-sessions). Service de reconnaissance dédié, branché via FACE_API_URL.
// Renvoie null s'il n'est pas configuré -> la mise part en revue manuelle
// (jamais de crédit automatique sans ce garde-fou).
// ---------------------------------------------------------------------------
async function beneficiaryEmbedding(mise: Blob | null): Promise<number[] | null> {
  const url = Deno.env.get("FACE_API_URL");
  if (!url || !mise) return null;
  try {
    const b64 = await blobToBase64(mise);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(Deno.env.get("FACE_API_KEY") ? { authorization: `Bearer ${Deno.env.get("FACE_API_KEY")}` } : {}),
      },
      body: JSON.stringify({ image: b64, target: "beneficiary" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data.embedding ?? data.beneficiary_embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  }
}
